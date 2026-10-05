import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const GROK_HOME = join(homedir(), ".grok");
const SESSIONS_DIR = join(GROK_HOME, "sessions");
// Undocumented endpoint the Grok CLI uses for its own usage screen, so it can change without notice.
const BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
const GROK_BINARIES = [join(homedir(), ".local/bin/grok"), "/opt/homebrew/bin/grok", "/usr/local/bin/grok"];
const USD_TICKS_PER_DOLLAR = 1e10;
const RECENT_SESSION_COUNT = 5;

export class GrokError extends Error {}

export type CreditUsage = {
  period: string;
  usedPercent: number;
  resetsAt: Date;
  products: { name: string; usedPercent: number }[];
  onDemandPercent?: number;
};

export type BuildTotals = { tokens: number; costUsd: number; sessions: number };

export type BuildSession = {
  id: string;
  title: string;
  cwd: string;
  lastActive: Date;
  tokens: number;
  costUsd: number;
};

export type BuildActivity = { today: BuildTotals; week: BuildTotals; recent: BuildSession[] };

type BillingResponse = {
  config?: {
    currentPeriod?: { type?: string; end?: string };
    billingPeriodEnd?: string;
    creditUsagePercent?: number;
    productUsage?: { product: string; usagePercent?: number }[];
    onDemandCap?: { val?: number };
    onDemandUsed?: { val?: number };
  };
};

type UsageCounts = { totalTokens?: number; costUsdTicks?: number };
type SessionUsage = { updatedAt?: string; session?: UsageCounts; turns?: (UsageCounts & { endedAt?: string })[] };

const SIGN_IN_MESSAGE = "Sign in to the Grok CLI first: run `grok login` in a terminal.";

async function readLogin(): Promise<{ token: string; expiresAt: number }> {
  let accounts: Record<string, { key?: string; expires_at?: string }>;
  try {
    accounts = JSON.parse(await readFile(join(GROK_HOME, "auth.json"), "utf8"));
  } catch {
    throw new GrokError(SIGN_IN_MESSAGE);
  }
  const account = Object.values(accounts).find((entry) => entry.key);
  if (!account?.key) throw new GrokError(SIGN_IN_MESSAGE);
  return { token: account.key, expiresAt: Date.parse(account.expires_at ?? "") || Infinity };
}

// Any authenticated CLI call renews the token, and `grok models` is the cheapest one. Letting the CLI
// do it keeps it the only writer of auth.json, so we never invalidate its refresh token.
async function renewLogin() {
  const grok = GROK_BINARIES.find((path) => existsSync(path));
  if (!grok) throw new GrokError("Your Grok login expired. Run `grok` in a terminal to renew it.");
  try {
    await promisify(execFile)(grok, ["models"], { timeout: 30_000 });
  } catch {
    throw new GrokError("Your Grok login expired and couldn't be renewed. Run `grok login` in a terminal.");
  }
}

function requestBilling(token: string) {
  return fetch(BILLING_URL, {
    headers: { Authorization: `Bearer ${token}`, "x-xai-token-auth": "xai-grok-cli", Accept: "application/json" },
  });
}

export async function fetchCreditUsage(): Promise<CreditUsage> {
  let login = await readLogin();
  if (login.expiresAt - Date.now() < 60_000) {
    await renewLogin();
    login = await readLogin();
  }

  let response = await requestBilling(login.token);
  if (response.status === 401) {
    await renewLogin();
    response = await requestBilling((await readLogin()).token);
  }
  if (response.status === 401 || response.status === 403) {
    throw new GrokError("Grok rejected your login. Run `grok login` in a terminal.");
  }
  if (!response.ok) throw new GrokError(`Grok usage request failed (HTTP ${response.status}).`);

  return parseCreditUsage((await response.json()) as BillingResponse);
}

function parseCreditUsage({ config }: BillingResponse): CreditUsage {
  const end = config?.currentPeriod?.end ?? config?.billingPeriodEnd;
  if (!config || !end) throw new GrokError("Grok returned usage data in an unexpected format.");

  const periodType = config.currentPeriod?.type?.replace("USAGE_PERIOD_TYPE_", "") ?? "";
  const onDemandCap = config.onDemandCap?.val ?? 0;
  return {
    period: periodType ? periodType[0] + periodType.slice(1).toLowerCase() : "Current",
    // Grok leaves percentages out entirely until something has been used.
    usedPercent: config.creditUsagePercent ?? 0,
    resetsAt: new Date(end),
    products: (config.productUsage ?? []).map((entry) => ({
      name: entry.product.replace(/([a-z])([A-Z])/g, "$1 $2"),
      usedPercent: entry.usagePercent ?? 0,
    })),
    onDemandPercent: onDemandCap > 0 ? ((config.onDemandUsed?.val ?? 0) / onDemandCap) * 100 : undefined,
  };
}

async function listSessionDirs(): Promise<{ dir: string; id: string; cwd: string }[]> {
  if (!existsSync(SESSIONS_DIR)) return [];
  const projects = await readdir(SESSIONS_DIR, { withFileTypes: true });
  const nested = await Promise.all(
    projects
      .filter((project) => project.isDirectory())
      .map(async (project) => {
        const sessions = await readdir(join(SESSIONS_DIR, project.name), { withFileTypes: true });
        return sessions
          .filter((session) => session.isDirectory())
          .map((session) => ({
            dir: join(SESSIONS_DIR, project.name, session.name),
            id: session.name,
            cwd: decodeURIComponent(project.name),
          }));
      }),
  );
  return nested.flat();
}

async function readSessionTitle(dir: string, cwd: string) {
  try {
    const summary = JSON.parse(await readFile(join(dir, "summary.json"), "utf8"));
    if (summary.session_summary) return summary.session_summary as string;
  } catch {
    // fall through to the folder name
  }
  return basename(cwd);
}

export async function readBuildActivity(): Promise<BuildActivity> {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const today: BuildTotals = { tokens: 0, costUsd: 0, sessions: 0 };
  const week: BuildTotals = { tokens: 0, costUsd: 0, sessions: 0 };
  const sessions: { dir: string; session: Omit<BuildSession, "title"> }[] = [];

  for (const { dir, id, cwd } of await listSessionDirs()) {
    const usagePath = join(dir, "usage.json");
    const modified = await stat(usagePath).then(
      (info) => info.mtimeMs,
      () => 0,
    );
    if (modified < weekAgo) continue;

    let usage: SessionUsage;
    try {
      usage = JSON.parse(await readFile(usagePath, "utf8"));
    } catch {
      continue; // the CLI may be mid-write on an active session; it'll parse on the next refresh
    }

    let activeToday = false;
    let activeThisWeek = false;
    for (const turn of usage.turns ?? []) {
      const endedAt = Date.parse(turn.endedAt ?? "");
      const tokens = turn.totalTokens ?? 0;
      const costUsd = (turn.costUsdTicks ?? 0) / USD_TICKS_PER_DOLLAR;
      if (endedAt >= weekAgo) {
        week.tokens += tokens;
        week.costUsd += costUsd;
        activeThisWeek = true;
      }
      if (endedAt >= startOfToday) {
        today.tokens += tokens;
        today.costUsd += costUsd;
        activeToday = true;
      }
    }
    if (activeThisWeek) week.sessions += 1;
    if (activeToday) today.sessions += 1;

    sessions.push({
      dir,
      session: {
        id,
        cwd,
        lastActive: new Date(usage.updatedAt ?? modified),
        tokens: usage.session?.totalTokens ?? 0,
        costUsd: (usage.session?.costUsdTicks ?? 0) / USD_TICKS_PER_DOLLAR,
      },
    });
  }

  const recent = sessions
    .sort((a, b) => b.session.lastActive.getTime() - a.session.lastActive.getTime())
    .slice(0, RECENT_SESSION_COUNT);
  return {
    today,
    week,
    recent: await Promise.all(
      recent.map(async ({ dir, session }) => ({ ...session, title: await readSessionTitle(dir, session.cwd) })),
    ),
  };
}
