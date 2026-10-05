import { Action, ActionPanel, Color, Icon, Keyboard, List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { formatPercent, formatTimeUntil, formatTokens, formatUsd, progressIcon } from "./format";
import { BuildTotals, fetchCreditUsage, readBuildActivity } from "./grok";

export default function Command() {
  const credits = useCachedPromise(fetchCreditUsage);
  const activity = useCachedPromise(readBuildActivity);
  const usage = credits.data;

  const refresh = () => {
    credits.revalidate();
    activity.revalidate();
  };
  const commonActions = (
    <>
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={Keyboard.Shortcut.Common.Refresh}
        onAction={refresh}
      />
      <Action.OpenInBrowser title="Open Grok" url="https://grok.com" />
    </>
  );
  const actions = <ActionPanel>{commonActions}</ActionPanel>;

  const totalsItem = (title: string, totals: BuildTotals) => (
    <List.Item
      icon={Icon.Calendar}
      title={title}
      subtitle={`${totals.sessions} ${totals.sessions === 1 ? "session" : "sessions"}`}
      accessories={[{ text: formatTokens(totals.tokens) }, { tag: formatUsd(totals.costUsd) }]}
      actions={actions}
    />
  );

  return (
    <List isLoading={credits.isLoading || activity.isLoading}>
      {usage ? (
        <List.Section title={`${usage.period} Credits`} subtitle={`Resets in ${formatTimeUntil(usage.resetsAt)}`}>
          <List.Item
            icon={progressIcon(usage.usedPercent)}
            title="All Products"
            accessories={[{ date: usage.resetsAt, tooltip: "Resets" }, { tag: formatPercent(usage.usedPercent) }]}
            actions={actions}
          />
          {usage.products.map((product) => (
            <List.Item
              key={product.name}
              icon={progressIcon(product.usedPercent)}
              title={product.name}
              accessories={[{ text: formatPercent(product.usedPercent) }]}
              actions={actions}
            />
          ))}
          {usage.onDemandPercent !== undefined && (
            <List.Item
              icon={progressIcon(usage.onDemandPercent)}
              title="On-Demand Spend"
              subtitle="of your cap"
              accessories={[{ text: formatPercent(usage.onDemandPercent) }]}
              actions={actions}
            />
          )}
        </List.Section>
      ) : (
        credits.error && (
          <List.Section title="Credits">
            <List.Item
              icon={{ source: Icon.Warning, tintColor: Color.Orange }}
              title="Couldn't load Grok usage"
              subtitle={credits.error.message}
              actions={actions}
            />
          </List.Section>
        )
      )}

      {activity.data && (
        <List.Section title="Grok Build on This Mac" subtitle="API-equivalent cost">
          {totalsItem("Today", activity.data.today)}
          {totalsItem("Last 7 Days", activity.data.week)}
        </List.Section>
      )}

      {activity.data && activity.data.recent.length > 0 && (
        <List.Section title="Recent Sessions">
          {activity.data.recent.map((session) => (
            <List.Item
              key={session.id}
              icon={Icon.Terminal}
              title={session.title}
              subtitle={session.cwd.split("/").pop()}
              accessories={[
                { text: formatTokens(session.tokens) },
                { tag: formatUsd(session.costUsd) },
                { date: session.lastActive },
              ]}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard
                    title="Copy Resume Command"
                    content={`cd ${JSON.stringify(session.cwd)} && grok --resume ${session.id}`}
                  />
                  {commonActions}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
