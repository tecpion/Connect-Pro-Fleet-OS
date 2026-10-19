import { calculateInvestorSettlement } from "./investorSettlementGeneration";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Investor,
  InvestorStore,
  InvestorVehicle,
  Settlement,
  VehicleOperatingCost,
  VehicleRepairCost,
} from "./investorTypes";
import type { FinancialTransaction } from "./chargeTypes";
import type {
  CompensationArrangement,
  OwnershipChangeRecord,
} from "./ownershipTypes";
import { TENANT_ID } from "./store";
import { useAuth } from "./supabase/authContext";
import {
  hydrateInvestor,
  persistInvestorInsert,
  persistInvestorVehicleInsert,
  persistSettlementInsert,
  persistSettlementUpdate,
  type InvestorSyncHandles,
} from "./supabase/phase5StoreSync";

// Investor / JV store — V1 staff-only module. Standalone context (mirrors the
// resource-center / incidents pattern) because the main fleet store module is
// at its size ceiling. Shares TENANT_ID / uid conventions and is shaped to fold
// into the main store once that module is split. All records are tenant-scoped.

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;
export { uid };

// ---------------------------------------------------------------------------
// Seed data — 2 investors with DIFFERENT splits to visibly demonstrate the
// per-pairing flexibility (one 60/40, one 50/50).
// ---------------------------------------------------------------------------

const seedInvestors: Investor[] = [
  {
    id: "inv_1",
    tenant_id: TENANT_ID,
    full_name: "Daniel Reyes",
    email: "daniel.reyes@example.com",
    phone: "+1 305 555 0210",
    relationship: "family",
    status: "active",
    joined_at: "2026-01-15",
    exited_at: null,
    exit_reason: null,
  },
  {
    id: "inv_2",
    tenant_id: TENANT_ID,
    full_name: "Mercy Capital LLC",
    email: "ops@mercycapital.example.com",
    phone: "+1 305 555 0211",
    relationship: "external",
    status: "active",
    joined_at: "2026-03-01",
    exited_at: null,
    exit_reason: null,
  },
];

// Investor 1 (Daniel Reyes, family) — 60/40 split on his vehicles.
// Investor 2 (Mercy Capital, external) — 50/50 split on its vehicle.
// Build #6: each pairing now carries a typed compensation arrangement while
// the legacy revenue_split_*_pct fields remain for backward compatibility.
const seedInvestorVehicles: InvestorVehicle[] = [
  {
    id: "iv_1",
    tenant_id: TENANT_ID,
    investor_id: "inv_1",
    vehicle_id: "veh_1", // Jeep Wrangler
    ownership_type: "owned",
    revenue_split_investor_pct: 60,
    revenue_split_operator_pct: 40,
    agreement_id: "agr_inv1_veh1",
    active: true,
    compensation: {
      type: "percentage",
      basis: "net",
      investor_percentage: 60,
      operator_percentage: 40,
      effective_date: "2026-01-15",
      end_date: null,
      notes: null,
    },
    effective_date: "2026-01-15",
  },
  {
    id: "iv_2",
    tenant_id: TENANT_ID,
    investor_id: "inv_1",
    vehicle_id: "veh_4", // Nissan Rogue
    ownership_type: "contributed",
    revenue_split_investor_pct: 60,
    revenue_split_operator_pct: 40,
    agreement_id: "agr_inv1_veh4",
    active: true,
    compensation: {
      type: "percentage",
      basis: "net",
      investor_percentage: 60,
      operator_percentage: 40,
      effective_date: "2026-01-15",
      end_date: null,
      notes: "Contributed vehicle",
    },
    effective_date: "2026-01-15",
  },
  {
    id: "iv_3",
    tenant_id: TENANT_ID,
    investor_id: "inv_2",
    vehicle_id: "veh_2", // Tesla Model 3
    ownership_type: "owned",
    revenue_split_investor_pct: 50,
    revenue_split_operator_pct: 50,
    agreement_id: "agr_inv2_veh2",
    active: true,
    compensation: {
      type: "percentage",
      basis: "net",
      investor_percentage: 50,
      operator_percentage: 50,
      effective_date: "2026-03-01",
      end_date: null,
      notes: null,
    },
    effective_date: "2026-03-01",
  },
];

const seedOperatingCosts: VehicleOperatingCost[] = [
  {
    id: "voc_1",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_1",
    cost_type: "insurance",
    monthly_amount: 180,
    responsibility: "operator_pays",
  },
  {
    id: "voc_2",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_1",
    cost_type: "gps_tracker",
    monthly_amount: 25,
    responsibility: "operator_pays",
  },
  {
    id: "voc_3",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_2",
    cost_type: "insurance",
    monthly_amount: 220,
    responsibility: "investor_pays",
  },
  {
    id: "voc_4",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_4",
    cost_type: "insurance",
    monthly_amount: 140,
    responsibility: "operator_pays",
  },
];

const seedRepairCosts: VehicleRepairCost[] = [
  {
    id: "vrc_1",
    tenant_id: TENANT_ID,
    vehicle_id: "veh_1",
    description: "Rear bumper scuff repair",
    amount: 125,
    incurred_date: "2026-08-29",
    responsibility: "operator_pays",
  },
];

const seedSettlements: Settlement[] = [];

// ---------------------------------------------------------------------------
// Settlement calculation
// ---------------------------------------------------------------------------
//
// For a given investor-vehicle pairing and period:
//   1. Gross revenue  = sum of posted rental charges for that vehicle's
//      rentals whose effective_date falls in [periodStart, periodEnd].
//   2. Operating costs = recurring monthly costs (pro-rated across the period)
//      + one-off repair costs incurred in the period, but ONLY the portion
//      whose responsibility is "operator_pays" (the operator's share of cost).
//      Investor-paid costs reduce the investor's payout directly instead.
//   3. Operator fee    = operator_fee_pct of gross revenue.
//   4. Investor payout = (gross_revenue - operator_costs - operator_fee)
//                        * investor_pct  -  investor_costs
//
// Costs are split by responsibility: operator-paid costs come off the top
// before the split; investor-paid costs come off the investor's share after.

function monthsBetween(start: string, end: string): number {
  const a = new Date(start);
  const b = new Date(end);
  return (
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
  );
}

const InvestorContext = createContext<InvestorStore | null>(null);

export function InvestorProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const activeOrgId = session.activeOrganizationId;
  const [investorState, setInvestors] = useState(seedInvestors);
  const [ivState, setIvs] = useState(seedInvestorVehicles);
  const [vocState, setVocs] = useState(seedOperatingCosts);
  const [vrcState, setVrcs] = useState(seedRepairCosts);
  const [settlementState, setSettlements] = useState(seedSettlements);
  const pendingPeriods = useRef(new Map<string, Settlement>());
  const [ownershipChangeState, setOwnershipChanges] = useState<
    OwnershipChangeRecord[]
  >([]);

  // Phase 5: hydrate investor/JV state from Cloud on auth/org change.
  // In memory mode hydrateInvestor is a no-op and seeded demo data stays.
  useEffect(() => {
    pendingPeriods.current.clear();
    if (!activeOrgId) return;
    let active = true;
    const handles: InvestorSyncHandles = {
      setInvestors: setInvestors,
      setInvestorVehicles: setIvs,
      setSettlements: setSettlements,
    };
    void hydrateInvestor(activeOrgId, handles)
      .then((ran) => {
        if (!ran || !active) return;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  const store = useMemo<InvestorStore>(
    () => ({
      investors: investorState,
      investorVehicles: ivState,
      vehicleOperatingCosts: vocState,
      vehicleRepairCosts: vrcState,
      settlements: settlementState,
      ownershipChanges: ownershipChangeState,

      addInvestor: (i) => {
        setInvestors((is) => [...is, i]);
        persistInvestorInsert(i);
      },
      updateInvestor: (id, patch) =>
        setInvestors((is) =>
          is.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        ),

      addInvestorVehicle: (iv) => {
        setIvs((ivs) => [...ivs, iv]);
        persistInvestorVehicleInsert(iv);
      },
      updateInvestorVehicle: (id, patch) =>
        setIvs((ivs) => ivs.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      removeInvestorVehicle: (id) =>
        setIvs((ivs) => ivs.filter((x) => x.id !== id)),
      // Build #6 — update compensation on a pairing. Keeps legacy split fields
      // in sync for backward compatibility. Historical settlements untouched.
      // Records an audit entry capturing old → new terms so agreement changes
      // are never silent.
      updatePairingCompensation: (
        pairingId: string,
        compensation: CompensationArrangement,
      ) => {
        const existing = ivState.find((x) => x.id === pairingId) ?? null;
        setIvs((ivs) =>
          ivs.map((x) => {
            if (x.id !== pairingId) return x;
            const patch: Partial<InvestorVehicle> = {
              compensation,
              effective_date: compensation.effective_date,
            };
            if (compensation.type === "percentage") {
              patch.revenue_split_investor_pct =
                compensation.investor_percentage;
              patch.revenue_split_operator_pct =
                compensation.operator_percentage;
            }
            return { ...x, ...patch };
          }),
        );
        if (existing) {
          const record: OwnershipChangeRecord = {
            id: uid("own"),
            tenant_id: TENANT_ID,
            vehicle_id: existing.vehicle_id,
            investor_id: existing.investor_id,
            old_ownership_type: null,
            new_ownership_type: "external_owner",
            old_owner_entity_id: null,
            new_owner_entity_id: null,
            effective_date: compensation.effective_date,
            reason:
              compensation.type === "percentage"
                ? `Agreement changed — ${compensation.investor_percentage}%/${compensation.operator_percentage}% (${compensation.basis})`
                : compensation.type === "fixed"
                  ? `Agreement changed — fixed ${compensation.fixed_amount} ${compensation.fixed_frequency}`
                  : "Agreement changed — custom arrangement",
            changed_by: null,
            changed_at: new Date().toISOString(),
          };
          setOwnershipChanges((ocs) => [record, ...ocs]);
        }
      },
      logOwnershipChange: (record: OwnershipChangeRecord) =>
        setOwnershipChanges((ocs) => [record, ...ocs]),

      addVehicleOperatingCost: (c) => setVocs((cs) => [...cs, c]),
      updateVehicleOperatingCost: (id, patch) =>
        setVocs((cs) => cs.map((x) => (x.id === id ? { ...x, ...patch } : x))),
      removeVehicleOperatingCost: (id) =>
        setVocs((cs) => cs.filter((x) => x.id !== id)),

      addVehicleRepairCost: (c) => setVrcs((cs) => [c, ...cs]),
      removeVehicleRepairCost: (id) =>
        setVrcs((cs) => cs.filter((x) => x.id !== id)),

      generateSettlement: ({
        investorId,
        vehicleId,
        periodStart,
        periodEnd,
        operatorFeePct,
        transactions,
      }: {
        investorId: string;
        vehicleId: string;
        periodStart: string;
        periodEnd: string;
        operatorFeePct: number;
        // Posted ledger transactions (passed from the main store by the caller
        // to avoid a circular import). Used to derive gross revenue for the
        // vehicle within the settlement period.
        transactions: FinancialTransaction[];
      }) => {
        const periodKey = JSON.stringify([
          activeOrgId,
          investorId,
          vehicleId,
          periodStart,
          periodEnd,
        ]);
        const existing = settlementState.find(
          (s) =>
            s.investor_id === investorId &&
            s.vehicle_id === vehicleId &&
            s.period_start === periodStart &&
            s.period_end === periodEnd,
        );
        if (existing) return existing;
        const pending = pendingPeriods.current.get(periodKey);
        if (pending) return pending;
        const pairing = ivState.find(
          (iv) =>
            iv.investor_id === investorId &&
            iv.vehicle_id === vehicleId &&
            iv.active,
        );
        if (!pairing) return null;

        const settlement = calculateInvestorSettlement({
          pairing,
          investorId,
          vehicleId,
          periodStart,
          periodEnd,
          operatorFeePct,
          transactions,
          operatingCosts: vocState,
          repairCosts: vrcState,
        });
        pendingPeriods.current.set(periodKey, settlement);
        setSettlements((ss) => [settlement, ...ss]);
        persistSettlementInsert(settlement);
        return settlement;
      },

      markSettlementPaid: (id, payoutDate) =>
        setSettlements((ss) =>
          ss.map<Settlement>((s) => {
            if (s.id !== id) return s;
            const next: Settlement = {
              ...s,
              payout_status: "paid",
              payout_date: payoutDate,
            };
            persistSettlementUpdate(s.tenant_id, id, "paid", payoutDate);
            return next;
          }),
        ),
    }),
    [
      investorState,
      ivState,
      vocState,
      vrcState,
      settlementState,
      ownershipChangeState,
      activeOrgId,
    ],
  );

  return (
    <InvestorContext.Provider value={store}>
      {children}
    </InvestorContext.Provider>
  );
}

export function useInvestors() {
  const ctx = useContext(InvestorContext);
  if (!ctx)
    throw new Error("useInvestors must be used within InvestorProvider");
  return ctx;
}
