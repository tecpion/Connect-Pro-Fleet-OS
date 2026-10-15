// Connect Pro Fleet — damage claims section for RentalDetail (Build #17).

import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { DAMAGE_CLAIM_STATUS_LABELS } from "@/lib/damageClaimTypes";
import { SectionCard } from "@/components/ui-bits";

export function RentalDamageClaimsSection({ rentalId }: { rentalId: string }) {
  const dc = useDamageClaims();
  const claims = dc.damageClaims.filter((c) => c.rental_id === rentalId);
  return (
    <SectionCard title="Damage claims">
      {claims.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No damage claims for this rental.
        </p>
      ) : (
        <ul className="space-y-2">
          {claims.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border border-border p-2"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {c.claim_number} ·{" "}
                  {DAMAGE_CLAIM_STATUS_LABELS[c.claim_status]}
                </p>
                <p className="line-clamp-1 text-xs text-muted-foreground">
                  {c.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
