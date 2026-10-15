// Connect Pro Fleet — wizard step 6: review (Build #7).

import { OWNERSHIP_TYPE_LABELS } from "@/lib/ownershipTypes";
import type { PartnershipInput } from "@/lib/partnershipTypes";
import { StepShell } from "./StepShell";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export function ReviewStep({
  input,
  vehicles,
  investors,
}: {
  input: PartnershipInput;
  vehicles: {
    id: string;
    year: number;
    make: string;
    model: string;
    vin: string;
  }[];
  investors: { id: string; full_name: string }[];
}) {
  const v = vehicles.find((x) => x.id === input.vehicle.vehicle_id);
  const partnerName =
    input.partner.mode === "existing"
      ? (investors.find((i) => i.id === input.partner.existingId)?.full_name ??
        "—")
      : (input.partner.new?.full_name ?? "—");

  const comp = input.compensation;
  const compText =
    comp.type === "percentage"
      ? `${comp.investor_percentage}% investor / ${comp.operator_percentage}% operator · ${comp.basis === "gross" ? "Before expenses" : "After expenses"}`
      : comp.type === "fixed"
        ? `$${comp.fixed_amount} ${comp.fixed_frequency}`
        : "Custom agreement";

  const contrib =
    input.contribution == null
      ? "None"
      : input.contribution.contribution_type === "cash"
        ? `$${input.contribution.cash_amount?.toLocaleString()} cash`
        : input.contribution.contribution_type === "vehicle"
          ? "Vehicle provided by partner"
          : input.contribution.contribution_type === "vehicle_and_cash"
            ? `Vehicle + $${input.contribution.cash_amount?.toLocaleString()} cash`
            : (input.contribution.description ?? "Other");

  return (
    <StepShell heading="Review partnership">
      <div className="divide-y divide-border rounded-md border border-border px-4 py-2">
        <Row label="Partner" value={partnerName} />
        <Row label="Contribution" value={contrib} />
        <Row
          label="Vehicle"
          value={
            v ? `${v.year} ${v.make} ${v.model} · VIN …${v.vin.slice(-4)}` : "—"
          }
        />
        <Row
          label="Ownership"
          value={OWNERSHIP_TYPE_LABELS[input.vehicle.ownership_type]}
        />
        <Row label="Compensation" value={compText} />
        <Row
          label="Expenses deducted before split"
          value={
            input.expense_rules
              .filter((r) => r.treatment === "deduct_before_split")
              .map((r) => r.category)
              .join(", ") || "None"
          }
        />
        <Row label="Effective" value={comp.effective_date} />
      </div>
    </StepShell>
  );
}
