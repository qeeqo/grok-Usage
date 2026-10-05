import { Icon, Keyboard, launchCommand, LaunchType, MenuBarExtra } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { formatPercent, formatTimeUntil, formatTokens, formatUsd, progressIcon } from "./format";
import { fetchCreditUsage, readBuildActivity } from "./grok";

const openUsage = () => launchCommand({ name: "usage", type: LaunchType.UserInitiated });

export default function Command() {
  const credits = useCachedPromise(fetchCreditUsage);
  const activity = useCachedPromise(readBuildActivity);
  const usage = credits.data;
  const today = activity.data?.today;

  return (
    <MenuBarExtra
      isLoading={credits.isLoading || activity.isLoading}
      icon={usage ? progressIcon(usage.usedPercent) : Icon.Warning}
      title={usage ? formatPercent(usage.usedPercent) : undefined}
      tooltip={usage ? `Grok ${usage.period.toLowerCase()} credits` : "Grok usage unavailable"}
    >
      {usage ? (
        <MenuBarExtra.Section title={`${usage.period} credits · resets in ${formatTimeUntil(usage.resetsAt)}`}>
          {usage.products.map((product) => (
            <MenuBarExtra.Item
              key={product.name}
              icon={progressIcon(product.usedPercent)}
              title={product.name}
              subtitle={formatPercent(product.usedPercent)}
              onAction={openUsage}
            />
          ))}
          {usage.onDemandPercent !== undefined && (
            <MenuBarExtra.Item
              icon={progressIcon(usage.onDemandPercent)}
              title="On-demand spend"
              subtitle={formatPercent(usage.onDemandPercent)}
              onAction={openUsage}
            />
          )}
        </MenuBarExtra.Section>
      ) : (
        credits.error && <MenuBarExtra.Item title="Couldn't load Grok usage" subtitle={credits.error.message} />
      )}

      {today && (
        <MenuBarExtra.Section title="Grok Build today">
          <MenuBarExtra.Item
            icon={Icon.Terminal}
            title={formatTokens(today.tokens)}
            subtitle={`${formatUsd(today.costUsd)} API-equivalent`}
            onAction={openUsage}
          />
        </MenuBarExtra.Section>
      )}

      <MenuBarExtra.Section>
        <MenuBarExtra.Item title="Open Grok Usage" icon={Icon.BarChart} onAction={openUsage} />
        <MenuBarExtra.Item
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={() => {
            credits.revalidate();
            activity.revalidate();
          }}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
