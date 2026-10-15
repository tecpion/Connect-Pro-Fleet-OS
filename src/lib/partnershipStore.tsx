// Connect Pro Fleet — partnership store (Build #7).
//
// A standalone context (mirrors the investorStore / incidentsStore pattern)
// that owns the new lightweight collections — contributions, expense rules,
// and partnership records — and provides the ONE authoritative atomic
// orchestration method the wizard uses: createInvestorPartnership.
//
// It does NOT duplicate investor/ownership/compensation state. It composes onto
// the existing Build #6 entities by calling useInvestors() + useStore() methods.
// All records are tenant-scoped and shaped to fold into the main store later.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useInvestors } from "./investorStore";
import { useStore } from "./store";
import { TENANT_ID } from "./store/ids";
import type { Investor, InvestorVehicle } from "./investorTypes";
import type {
  Partnership,
  PartnershipExpenseRule,
  PartnerContribution,
  PartnershipInput,
} from "./partnershipTypes";
import type { CompensationArrangement } from "./ownershipTypes";
import { validatePartnershipInput } from "./partnership";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

export interface PartnershipStore {
  contributions: PartnerContribution[];
  expenseRules: PartnershipExpenseRule[];
  partnerships: Partnership[];
  // Atomic creation — the wizard's single submit path. Returns the created
  // partnership or throws a validation error array. Idempotent: a stable
  // requestKey prevents double-submit duplicates.
  createInvestorPartnership: (
    input: PartnershipInput,
    requestKey: string,
  ) => { partnership: Partnership; investorId: string } | { errors: string[] };
  contributionsForInvestor: (investorId: string) => PartnerContribution[];
  expenseRulesForPairing: (pairingId: string) => PartnershipExpenseRule[];
  partnershipForPairing: (pairingId: string) => Partnership | null;
}

const PartnershipContext = createContext<PartnershipStore | null>(null);

export function PartnershipProvider({ children }: { children: ReactNode }) {
  const inv = useInvestors();
  const store = useStore();

  const [contributions, setContributions] = useState<PartnerContribution[]>([]);
  const [expenseRules, setExpenseRules] = useState<PartnershipExpenseRule[]>(
    [],
  );
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  // Idempotency: track consumed request keys so a double submit can't create
  // duplicate investors/pairings/contributions/audits.
  const [usedKeys, setUsedKeys] = useState<Set<string>>(new Set());

  const createInvestorPartnership = useCallback(
    (
      input: PartnershipInput,
      requestKey: string,
    ):
      | { partnership: Partnership; investorId: string }
      | { errors: string[] } => {
      // Idempotency guard — a repeated submit with the same key is a no-op.
      if (usedKeys.has(requestKey)) {
        // Return the existing partnership for this key if findable.
        const existing = partnerships.find((p) => p.id === requestKey);
        if (existing)
          return { partnership: existing, investorId: existing.investor_id };
        return { errors: ["This partnership was already created."] };
      }

      const errors = validatePartnershipInput(input, {
        vehicles: store.vehicles,
        pairings: inv.investorVehicles,
      });
      if (errors.length > 0) return { errors };

      // --- Step 1: resolve / create the investor ---
      let investorId: string;
      let investor: Investor;
      if (input.partner.mode === "existing" && input.partner.existingId) {
        investorId = input.partner.existingId;
        const found = inv.investors.find((i) => i.id === investorId);
        if (!found) return { errors: ["Selected partner not found."] };
        investor = found;
      } else {
        const n = input.partner.new!;
        investorId = uid("inv");
        investor = {
          id: investorId,
          tenant_id: TENANT_ID,
          full_name: n.full_name.trim(),
          email: n.email.trim(),
          phone: n.phone.trim(),
          relationship: n.relationship,
          status: "active",
          joined_at: n.joined_at,
          exited_at: null,
          exit_reason: null,
        };
        inv.addInvestor(investor);
      }

      // --- Step 2: record contribution (metadata only) ---
      let contributionId: string | null = null;
      if (input.contribution) {
        contributionId = uid("pc");
        const c = input.contribution;
        const contribution: PartnerContribution = {
          id: contributionId,
          tenant_id: TENANT_ID,
          investor_id: investorId,
          vehicle_id: input.vehicle.vehicle_id,
          contribution_type: c.contribution_type,
          cash_amount: c.cash_amount,
          vehicle_contribution: c.vehicle_contribution,
          description: c.description,
          contribution_date: c.contribution_date,
          notes: c.notes,
          created_at: new Date().toISOString(),
          created_by: store.currentStaffId,
        };
        setContributions((cs) => [contribution, ...cs]);
      }

      // --- Step 3: set / transfer vehicle ownership (audited) ---
      // If an existing active pairing exists and transfer_existing is true,
      // deactivate it first (preserves history) before assigning the new one.
      if (input.vehicle.transfer_existing) {
        const existingPairing = inv.investorVehicles.find(
          (iv) => iv.vehicle_id === input.vehicle.vehicle_id && iv.active,
        );
        if (existingPairing) {
          inv.updateInvestorVehicle(existingPairing.id, { active: false });
        }
      }

      const ownerDisplayName =
        input.vehicle.ownership_type === "company_owned"
          ? null
          : investor.full_name;
      store.setVehicleOwnership(
        input.vehicle.vehicle_id,
        {
          ownership_type: input.vehicle.ownership_type,
          owner_entity_id:
            input.vehicle.ownership_type === "company_owned"
              ? null
              : investorId,
          owner_display_name: ownerDisplayName,
          ownership_notes: input.vehicle.ownership_notes,
          effective_date: input.compensation.effective_date,
          reason: "Partnership created via setup wizard",
        },
        store.currentStaffId,
      );

      // --- Step 4: create the InvestorVehicle pairing + compensation ---
      const pairingId = uid("iv");
      const compensation: CompensationArrangement = input.compensation;
      const pairing: InvestorVehicle = {
        id: pairingId,
        tenant_id: TENANT_ID,
        investor_id: investorId,
        vehicle_id: input.vehicle.vehicle_id,
        ownership_type:
          (input.contribution?.vehicle_contribution ?? false)
            ? "contributed"
            : "owned",
        revenue_split_investor_pct:
          compensation.type === "percentage"
            ? compensation.investor_percentage
            : 0,
        revenue_split_operator_pct:
          compensation.type === "percentage"
            ? compensation.operator_percentage
            : 0,
        agreement_id: null,
        active: true,
        compensation,
        effective_date: compensation.effective_date,
      };
      inv.addInvestorVehicle(pairing);

      // --- Step 5: store expense rules ---
      const rules: PartnershipExpenseRule[] = input.expense_rules.map((r) => ({
        ...r,
        id: uid("per"),
        tenant_id: TENANT_ID,
        pairing_id: pairingId,
      }));
      if (rules.length > 0) setExpenseRules((rs) => [...rs, ...rules]);

      // --- Compose the partnership record ---
      const partnership: Partnership = {
        id: requestKey,
        tenant_id: TENANT_ID,
        investor_id: investorId,
        vehicle_id: input.vehicle.vehicle_id,
        pairing_id: pairingId,
        contribution_id: contributionId,
        ownership_type: input.vehicle.ownership_type,
        compensation,
        expense_rules: rules,
        structured: true,
        created_at: new Date().toISOString(),
        created_by: store.currentStaffId,
      };
      setPartnerships((ps) => [partnership, ...ps]);
      setUsedKeys((ks) => new Set(ks).add(requestKey));

      // --- Audit / activity (one structured event, not five noisy ones) ---
      const vehicle = store.vehicles.find(
        (v) => v.id === input.vehicle.vehicle_id,
      );
      const vLabel = vehicle ? `${vehicle.make} ${vehicle.model}` : "vehicle";
      store.logActivity({
        id: uid("act"),
        at: new Date().toISOString(),
        label: `Partnership created — ${investor.full_name} · ${vLabel}`,
        tone: "available",
      });

      return { partnership, investorId };
    },
    [usedKeys, partnerships, inv, store],
  );

  const contributionsForInvestor = useCallback(
    (id: string) => contributions.filter((c) => c.investor_id === id),
    [contributions],
  );

  const expenseRulesForPairing = useCallback(
    (id: string) => expenseRules.filter((r) => r.pairing_id === id),
    [expenseRules],
  );

  const partnershipForPairing = useCallback(
    (id: string) => partnerships.find((p) => p.pairing_id === id) ?? null,
    [partnerships],
  );

  const value = useMemo<PartnershipStore>(
    () => ({
      contributions,
      expenseRules,
      partnerships,
      createInvestorPartnership,
      contributionsForInvestor,
      expenseRulesForPairing,
      partnershipForPairing,
    }),
    [
      contributions,
      expenseRules,
      partnerships,
      createInvestorPartnership,
      contributionsForInvestor,
      expenseRulesForPairing,
      partnershipForPairing,
    ],
  );

  return (
    <PartnershipContext.Provider value={value}>
      {children}
    </PartnershipContext.Provider>
  );
}

export function usePartnerships() {
  const ctx = useContext(PartnershipContext);
  if (!ctx)
    throw new Error("usePartnerships must be used within PartnershipProvider");
  return ctx;
}
