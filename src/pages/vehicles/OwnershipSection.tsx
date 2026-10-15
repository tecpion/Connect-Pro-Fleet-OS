// Connect Pro Fleet — vehicle ownership form section (Build #6).
//
// Extracted from VehicleForm to keep that file under the line limit. Renders the
// ownership type selector + investor link, adapting fields based on the chosen
// ownership category. Compensation is NOT set here — it lives per pairing on
// the investor record.

import type { Vehicle } from "@/lib/types";
import type { VehicleOwnershipType } from "@/lib/ownershipTypes";
import { OWNERSHIP_TYPE_LABELS } from "@/lib/ownershipTypes";
import { useInvestors } from "@/lib/investorStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const OWNERSHIP_OPTIONS: VehicleOwnershipType[] = [
  "company_owned",
  "external_owner",
  "business_partner_owned",
  "jointly_owned",
  "other",
];

const selectCls =
  "mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function OwnershipSection({
  form,
  set,
}: {
  form: Vehicle;
  set: (patch: Partial<Vehicle>) => void;
}) {
  const { investors } = useInvestors();
  const t =
    (form.ownership_type as VehicleOwnershipType | undefined) ??
    "company_owned";
  const showOwner =
    t === "external_owner" ||
    t === "business_partner_owned" ||
    t === "jointly_owned";

  return (
    <div className="rounded-md border border-border bg-surface-2 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Ownership
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Ownership type</Label>
          <select
            value={form.ownership_type ?? "company_owned"}
            onChange={(e) => {
              const next = e.target.value as VehicleOwnershipType;
              const needsOwner =
                next === "external_owner" ||
                next === "business_partner_owned" ||
                next === "jointly_owned";
              set({
                ownership_type: next,
                owner_entity_id: needsOwner ? form.owner_entity_id : null,
                owner_display_name: needsOwner ? form.owner_display_name : null,
              });
            }}
            className={selectCls}
          >
            {OWNERSHIP_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {OWNERSHIP_TYPE_LABELS[o]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Who owns this vehicle. Compensation is set per pairing on the
            investor record.
          </p>
        </div>
        {showOwner && (
          <>
            <div className="col-span-2">
              <Label>Investor / owner</Label>
              <select
                value={form.owner_entity_id ?? ""}
                onChange={(e) => {
                  const invId = e.target.value || null;
                  const inv = investors.find((i) => i.id === invId);
                  set({
                    owner_entity_id: invId,
                    owner_display_name: inv?.full_name ?? null,
                  });
                }}
                className={selectCls}
              >
                <option value="">— Select an owner —</option>
                {investors
                  .filter((i) => i.status === "active")
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.full_name}
                    </option>
                  ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Reuses existing investor records — no separate owner contact
                table.
              </p>
            </div>
            <div className="col-span-2">
              <Label>Ownership notes</Label>
              <Input
                value={form.ownership_notes ?? ""}
                onChange={(e) =>
                  set({ ownership_notes: e.target.value || null })
                }
                className="mt-1"
                placeholder={
                  t === "jointly_owned"
                    ? "e.g. Company and John Smith jointly own vehicle."
                    : "Optional"
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
