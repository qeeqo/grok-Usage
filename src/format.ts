import { Color } from "@raycast/api";
import { getProgressIcon } from "@raycast/utils";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export const formatTokens = (tokens: number) => `${compact.format(tokens)} tokens`;

export const formatUsd = (usd: number) => (usd > 0 && usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`);

export const formatPercent = (percent: number) => `${Math.round(percent)}%`;

export function formatTimeUntil(date: Date) {
  const minutes = Math.max(0, Math.round((date.getTime() - Date.now()) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function usageColor(percent: number) {
  if (percent >= 90) return Color.Red;
  if (percent >= 70) return Color.Orange;
  return Color.Green;
}

export const progressIcon = (percent: number) => getProgressIcon(Math.min(percent, 100) / 100, usageColor(percent));
