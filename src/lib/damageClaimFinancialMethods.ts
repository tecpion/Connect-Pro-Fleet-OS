// Connect Pro Fleet — damage claim financial methods (Build #17).
// Customer charge (via authoritative rental ledger), deposit application
// (via existing deposit action), insurance/third-party recovery, reversals.
// Non-hook functions taking the helpers + state. Coordinated with the main
// store so no competing financial truth is created.

import type {
  DamageClaim,
  DamageRecovery,
  RecoveryType,
} from "./damageClaimTypes";
import {
  TENANT_ID,
  uid,
  fmtMoney,
  type ClaimHelpers,
} from "./damageClaimHelpers";
import { getIntegrationEmitter } from "./integrationEmitterRef";

export function makeFinancialMethods(
  h: ClaimHelpers,
  claims: DamageClaim[],
  getClaims: () => DamageClaim[],
  setRecoveries: React.Dispatch<React.SetStateAction<DamageRecovery[]>>,
  claimKeys: React.MutableRefObject<Set<string>>,
) {
  // Always read the latest claims for money-moving checks (idempotency, existing
  // charge) so rapid synchronous actions within one batched act() see the
  // authoritative state rather than the stale closure snapshot.
  const latest = () => getClaims();
  return {
    chargeCustomer: (
      claimId: string,
      input: { amount: number; description?: string; notes?: string },
      requestKey: string,
    ): { ok: boolean; error?: string; transactionId?: string } => {
      const claim = latest().find((c) => c.id === claimId);
      if (!claim) return { ok: false, error: "Claim not found." };
      if (!claim.rental_id)
        return { ok: false, error: "Claim has no linked rental to charge." };
      if (input.amount <= 0)
        return { ok: false, error: "Amount must be positive." };
      if (claim.customer_charge_transaction_id)
        return {
          ok: false,
          error: "Customer has already been charged for this claim.",
        };
      if (claimKeys.current.has(requestKey))
        return {
          ok: true,
          transactionId: claim.customer_charge_transaction_id ?? undefined,
        };
      claimKeys.current.add(requestKey);
      const txnId = h.store.postCharge(claim.rental_id, {
        type: "damage_charge",
        amount: input.amount,
        description:
          input.description ?? `Damage charge — ${claim.claim_number}`,
        notes: input.notes ?? `Damage claim ${claim.claim_number}`,
      });
      h.store.tagTransactionMetadata(txnId, { damage_claim_id: claimId });
      h.patchClaim(claimId, { customer_charge_transaction_id: txnId });
      h.logEvent(
        claimId,
        "customer_charged",
        `Customer charged — ${fmtMoney(input.amount)}`,
        { newValue: txnId },
      );
      h.logAct(
        `Damage charge posted — ${fmtMoney(input.amount)} · ${claim.claim_number}`,
        "maintenance",
      );
      // Build #21 — emit DAMAGE_CHARGE_POSTED + BALANCE_CHANGED so Connect Pro
      // can request payment. Damage charge is separate from base rental revenue.
      const emitter = getIntegrationEmitter();
      if (emitter.enabled && claim.rental_id) {
        const newBalance = h.store.rentalFinancials(claim.rental_id).balance;
        emitter.enqueueOutbound({
          event_type: "damage_charge.posted",
          entity_type: "damage_claim",
          entity_id: claimId,
          payload: {
            kind: "damage_charge_posted",
            customer_id: claim.customer_id ?? "",
            rental_id: claim.rental_id,
            damage_claim_id: claimId,
            amount: input.amount,
          },
          event_key: `outbound_damage_charge:${txnId}`,
          origin_system: "fleet",
        });
        emitter.enqueueOutbound({
          event_type: "balance.changed",
          entity_type: "rental",
          entity_id: claim.rental_id,
          payload: {
            kind: "balance_changed",
            customer_id: claim.customer_id ?? "",
            rental_id: claim.rental_id,
            prior_balance: null,
            new_balance: newBalance,
            reason: "damage_charge_posted",
            related_transaction_id: txnId,
            is_paid_in_full: newBalance <= 0,
            is_late: newBalance > 0,
          },
          event_key: `outbound_balance_changed:damage:${txnId}`,
          origin_system: "fleet",
        });
      }
      return { ok: true, transactionId: txnId };
    },

    reverseCustomerCharge: (claimId: string, reason: string) => {
      const claim = latest().find((c) => c.id === claimId);
      if (!claim || !claim.customer_charge_transaction_id) return;
      h.store.voidTransaction(claim.customer_charge_transaction_id, reason);
      h.patchClaim(claimId, { customer_charge_transaction_id: null });
      h.logEvent(claimId, "charge_reversed", `Charge reversed — ${reason}`);
    },

    applyDeposit: (
      claimId: string,
      input: { amount: number; notes?: string },
      requestKey: string,
    ): { ok: boolean; error?: string } => {
      const claim = latest().find((c) => c.id === claimId);
      if (!claim) return { ok: false, error: "Claim not found." };
      if (!claim.rental_id)
        return { ok: false, error: "Claim has no linked rental." };
      if (input.amount <= 0)
        return { ok: false, error: "Amount must be positive." };
      const deposit = h.store.depositForRental(claim.rental_id);
      if (!deposit) return { ok: false, error: "No security deposit held." };
      const res = h.store.applyDeposit(
        deposit.id,
        {
          amount: input.amount,
          notes: input.notes ?? `Damage claim ${claim.claim_number}`,
        },
        requestKey,
      );
      if (!res.ok) return res;
      const now = new Date().toISOString();
      setRecoveries((rs) => [
        {
          id: uid("drc"),
          tenant_id: TENANT_ID,
          damage_claim_id: claimId,
          recovery_type: "security_deposit_application",
          amount: input.amount,
          date: now.slice(0, 10),
          source_reference: `Deposit ${deposit.id}`,
          ledger_transaction_id: null,
          deposit_transaction_id: deposit.id,
          insurance_claim_id: null,
          notes: input.notes ?? null,
          created_at: now,
          reversed_at: null,
        },
        ...rs,
      ]);
      h.logEvent(
        claimId,
        "deposit_applied",
        `Deposit applied — ${fmtMoney(input.amount)}`,
        { newValue: deposit.id },
      );
      return { ok: true };
    },

    recordRecovery: (
      claimId: string,
      input: {
        recovery_type: RecoveryType;
        amount: number;
        date: string;
        source_reference?: string | null;
        insurance_claim_id?: string | null;
        notes?: string | null;
      },
      requestKey: string,
    ): { ok: boolean; error?: string; recoveryId?: string } => {
      const claim = latest().find((c) => c.id === claimId);
      if (!claim) return { ok: false, error: "Claim not found." };
      if (input.amount <= 0)
        return { ok: false, error: "Amount must be positive." };
      if (claimKeys.current.has(requestKey)) return { ok: true };
      claimKeys.current.add(requestKey);
      const now = new Date().toISOString();
      const recovery: DamageRecovery = {
        id: uid("drc"),
        tenant_id: TENANT_ID,
        damage_claim_id: claimId,
        recovery_type: input.recovery_type,
        amount: input.amount,
        date: input.date,
        source_reference: input.source_reference ?? null,
        ledger_transaction_id: null,
        deposit_transaction_id: null,
        insurance_claim_id: input.insurance_claim_id ?? null,
        notes: input.notes ?? null,
        created_at: now,
        reversed_at: null,
      };
      setRecoveries((rs) => [recovery, ...rs]);
      const label =
        input.recovery_type === "insurance"
          ? "Insurance recovery recorded"
          : input.recovery_type === "third_party"
            ? "Third-party recovery recorded"
            : "Recovery recorded";
      h.logEvent(
        claimId,
        input.recovery_type === "insurance"
          ? "insurance_recovery_recorded"
          : "note_added",
        `${label} — ${fmtMoney(input.amount)}`,
      );
      return { ok: true, recoveryId: recovery.id };
    },

    reverseRecovery: (
      recoveryId: string,
      reason: string,
      recoveries: DamageRecovery[],
      setRecoveries: React.Dispatch<React.SetStateAction<DamageRecovery[]>>,
    ) => {
      const r = recoveries.find((x) => x.id === recoveryId);
      if (!r || r.reversed_at) return;
      setRecoveries((rs) =>
        rs.map((x) =>
          x.id === recoveryId
            ? { ...x, reversed_at: new Date().toISOString() }
            : x,
        ),
      );
      h.logEvent(
        r.damage_claim_id,
        "note_added",
        `Recovery reversed — ${fmtMoney(r.amount)} (${reason})`,
      );
    },
  };
}
