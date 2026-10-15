// Connect Pro Fleet — customer damage claims tab (Build #17).

import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { getDamageClaimEconomics } from "@/lib/damageClaimSelectors";
import { useStore } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { fmtMoney, fmtDate } from "@/lib/format";
import { DAMAGE_CLAIM_STATUS_LABELS } from "@/lib/damageClaimTypes";

export function CustomerDamageTab({ customerId }: { customerId: string }) {
  const dc = useDamageClaims();
  const store = useStore();
  const claims = dc.damageClaims.filter((c) => c.customer_id === customerId);

  return (
    <SectionCard title="Damage claims">
      {claims.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No damage claims for this customer.
        </p>
      ) : (
        <ul className="space-y-2">
          {claims.map((c) => {
            const eco = getDamageClaimEconomics(c, {
              transactions: store.transactions,
              expenses: store.expenses,
              recoveries: dc.damageRecoveries,
            });
            return (
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
                    {c.description} · {fmtDate(c.discovered_at)}
                  </p>
                </div>
                <div className="text-right">
                  {eco.outstanding_customer_damage_balance > 0 && (
                    <p className="font-mono text-sm tabular text-maintenance">
                      {fmtMoney(eco.outstanding_customer_damage_balance)} owed
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
