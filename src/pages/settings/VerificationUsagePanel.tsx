// Connect Pro Fleet — Verification Usage panel.
//
// Surfaces MOCK verification usage (estimated charges per paid service) so a
// company owner can reach usage insight from Customer Verification settings
// without a new sidebar destination. Values are MOCK estimates only — no real
// pricing or billing is connected. Derives from the authoritative verification
// store usage charges; nothing is seeded here.

import { useMemo } from "react";
import { useVerificationOptional } from "@/lib/store/verificationStore";
import { deriveVerificationUsageSummary } from "@/lib/verificationSelectors";
import { fmtMoney, fmtDate } from "@/lib/format";
import { SectionCard, DataLabel, DataValue } from "@/components/ui-bits";
import { Receipt } from "lucide-react";

export function VerificationUsagePanel() {
  const v = useVerificationOptional();
  const summary = useMemo(
    () =>
      v ? deriveVerificationUsageSummary(v.usageCharges, undefined) : null,
    [v],
  );

  if (!v) {
    return (
      <SectionCard title="Verification Usage">
        <p className="text-sm text-muted-foreground">
          Verification tracking is not enabled, so no usage is recorded.
        </p>
      </SectionCard>
    );
  }

  if (!summary || summary.count === 0) {
    return (
      <SectionCard title="Verification Usage">
        <p className="text-sm text-muted-foreground">
          No paid verification checks have been run yet. Usage estimates appear
          here once a paid check (e.g. MVR, background screening) is requested.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Verification Usage"
      icon={<Receipt size={15} className="text-primary" />}
      data-testid="verification-usage-panel"
    >
      <p className="text-xs text-muted-foreground">
        Mock usage estimates only — no real pricing or billing connected. Paid
        checks require staff confirmation before they run.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <DataLabel>Total estimated usage</DataLabel>
          <DataValue mono>{fmtMoney(summary.totalEstimated)}</DataValue>
        </div>
        <div>
          <DataLabel>Paid checks run</DataLabel>
          <DataValue mono>{String(summary.count)}</DataValue>
        </div>
        <div>
          <DataLabel>Latest check</DataLabel>
          <DataValue mono>
            {summary.latestAt ? fmtDate(summary.latestAt) : "—"}
          </DataValue>
        </div>
      </div>
      {summary.byService.length > 0 && (
        <div className="mt-4">
          <DataLabel>By service</DataLabel>
          <ul className="mt-2 space-y-1 text-sm">
            {summary.byService.map((s) => (
              <li
                key={s.service_type}
                className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-1.5"
              >
                <span className="text-foreground">{s.label}</span>
                <span className="font-mono tabular text-muted-foreground">
                  {s.count} · {fmtMoney(s.estimated)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
