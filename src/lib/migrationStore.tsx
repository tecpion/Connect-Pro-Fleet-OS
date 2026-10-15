// Connect Pro Fleet — Build #19 migration store provider.
//
// Owns: import batches, migration issues, historical financial periods,
// and the import/rollback methods. Active-rental import delegates to
// migrationActiveRental (coordinates with the main store). Historical
// summaries are reporting-continuity records only — they never create
// ledger/invoice/expense/bank transactions.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type {
  HistoricalFinancialPeriod,
  HistoricalGranularity,
  HistoricalSource,
  ImportType,
  MigrationEvent,
  MigrationImportBatch,
  MigrationIssue,
  ImportedActiveRentalInput,
} from "./migrationTypes";
import type { MigrationStore } from "./migrationContext";
import { useStore } from "./store";
import { useInvestors } from "./investorStore";
import { TENANT_ID, uid } from "./store/ids";
import { importActiveRental } from "./migrationActiveRental";
import { commitVehicleImport, commitCustomerImport } from "./migrationCommit";
import { commitInvestorImport } from "./migrationInvestorCommit";

const MigrationContext = createContext<MigrationStore | null>(null);

export function MigrationProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const investors = useInvestors();
  const [batches, setBatches] = useState<MigrationImportBatch[]>([]);
  const [issues, setIssues] = useState<MigrationIssue[]>([]);
  const [events, setEvents] = useState<MigrationEvent[]>([]);
  const [historical, setHistorical] = useState<HistoricalFinancialPeriod[]>([]);
  const importedAgreements = useRef<Set<string>>(new Set());
  const importedVehicles = useRef<Set<string>>(new Set());
  const importedCustomers = useRef<Set<string>>(new Set());
  const importedInvestors = useRef<Set<string>>(new Set());

  function logEvent(
    batchId: string | null,
    type: MigrationEvent["event_type"],
    label: string,
    metadata: Record<string, unknown> | null = null,
  ) {
    setEvents((es) => [
      {
        id: uid("mev"),
        tenant_id: TENANT_ID,
        batch_id: batchId,
        event_type: type,
        label,
        actor_user_id: store.currentStaffId,
        at: new Date().toISOString(),
        metadata,
      },
      ...es,
    ]);
  }

  const value = useMemo<MigrationStore>(
    () => ({
      migrationBatches: batches,
      migrationIssues: issues,
      migrationEvents: events,
      historicalPeriods: historical,

      createBatch: (input) => {
        const batch: MigrationImportBatch = {
          id: uid("mib"),
          tenant_id: TENANT_ID,
          import_type: input.import_type,
          source_name: input.source_name,
          source_file_name: input.source_file_name ?? null,
          imported_by_user_id: store.currentStaffId,
          imported_at: new Date().toISOString(),
          row_count: input.row_count,
          success_count: 0,
          skipped_count: 0,
          warning_count: 0,
          error_count: 0,
          rollback_status: "available",
          created_record_ids: [],
          metadata: input.metadata ?? null,
        };
        setBatches((bs) => [batch, ...bs]);
        logEvent(
          batch.id,
          "batch_created",
          `Import batch created — ${input.source_name}`,
        );
        return batch;
      },

      finalizeBatch: (batchId, counts) => {
        setBatches((bs) =>
          bs.map((b) =>
            b.id === batchId
              ? {
                  ...b,
                  success_count: counts.success_count,
                  skipped_count: counts.skipped_count,
                  warning_count: counts.warning_count,
                  error_count: counts.error_count,
                  created_record_ids:
                    counts.created_record_ids ?? b.created_record_ids,
                }
              : b,
          ),
        );
        logEvent(
          batchId,
          "imported",
          `Import completed — ${counts.success_count} created, ${counts.skipped_count} skipped`,
        );
      },

      addIssue: (input) => {
        const issue: MigrationIssue = {
          id: uid("mis"),
          tenant_id: TENANT_ID,
          batch_id: input.batch_id ?? null,
          row_number: input.row_number ?? null,
          entity_type: input.entity_type,
          severity: input.severity,
          code: input.code,
          message: input.message,
          resolution: input.resolution ?? null,
          resolved_at: null,
          created_at: new Date().toISOString(),
        };
        setIssues((is) => [issue, ...is]);
      },

      rollbackBatch: (batchId) => {
        const batch = batches.find((b) => b.id === batchId);
        if (!batch) return { ok: false, error: "Batch not found." };
        if (batch.rollback_status === "rolled_back")
          return { ok: false, error: "Batch already rolled back." };
        for (const rid of batch.created_record_ids) {
          const rental = store.rentals.find((r) => r.id === rid);
          if (rental) {
            const hasPayments = store.transactions.some(
              (t) =>
                t.rental_id === rid &&
                t.category === "payment" &&
                t.status === "posted",
            );
            if (hasPayments)
              return {
                ok: false,
                error: `Rental ${rental.agreement_number} has native payments — cannot roll back.`,
              };
          }
        }
        const createdRentals = batch.created_record_ids.filter((id) =>
          store.rentals.some((r) => r.id === id),
        );
        for (const rid of createdRentals) {
          const rental = store.rentals.find((r) => r.id === rid);
          if (rental)
            store.updateVehicle(rental.vehicle_id, { status: "available" });
          store.purgeImportedRental(rid);
        }
        setBatches((bs) =>
          bs.map((b) =>
            b.id === batchId ? { ...b, rollback_status: "rolled_back" } : b,
          ),
        );
        logEvent(
          batchId,
          "rolled_back",
          `Batch rolled back — ${createdRentals.length} rentals removed`,
        );
        return { ok: true };
      },

      addHistoricalPeriod: (input) => {
        const overlap = historical.some(
          (p) =>
            p.granularity === input.granularity &&
            input.period_start <= p.period_end &&
            input.period_end >= p.period_start,
        );
        if (overlap) {
          return {
            ok: false,
            error:
              "An overlapping historical period already exists for this granularity. Remove it or adjust the dates.",
          };
        }
        const period: HistoricalFinancialPeriod = {
          id: uid("hfp"),
          tenant_id: TENANT_ID,
          period_start: input.period_start,
          period_end: input.period_end,
          granularity: input.granularity,
          source_system: input.source_system,
          revenue: input.revenue,
          collections: input.collections ?? null,
          expenses: input.expenses ?? null,
          net_profit: input.net_profit ?? null,
          rental_count: input.rental_count ?? null,
          vehicle_count: input.vehicle_count ?? null,
          notes: input.notes ?? null,
          import_batch_id: input.batch_id ?? null,
          created_at: new Date().toISOString(),
        };
        setHistorical((hs) => [...hs, period]);
        logEvent(
          input.batch_id ?? null,
          "historical_summary_added",
          `Historical ${input.granularity} summary added — revenue $${input.revenue}`,
        );
        return { ok: true, period };
      },

      deleteHistoricalPeriod: (id) =>
        setHistorical((hs) => hs.filter((p) => p.id !== id)),

      importActiveRental: (input: ImportedActiveRentalInput) =>
        importActiveRental(
          store,
          input,
          importedAgreements.current,
          (b, t, label) => logEvent(b, t, label),
        ),

      importVehicle: (input, mode) => {
        const res = commitVehicleImport(
          store,
          input,
          mode,
          importedVehicles.current,
        );
        if (res.ok && res.action === "created" && res.vehicle_id) {
          logEvent(
            null,
            "imported",
            `Vehicle imported — ${input.make} ${input.model} (${res.vehicle_id})`,
          );
        }
        if (!res.ok && res.action === "skipped") {
          setIssues((is) => [
            {
              id: uid("mis"),
              tenant_id: TENANT_ID,
              batch_id: null,
              row_number: null,
              entity_type: "vehicles",
              severity: "warning",
              code: "duplicate_vehicle",
              message: res.error ?? "Vehicle skipped.",
              resolution: null,
              resolved_at: null,
              created_at: new Date().toISOString(),
            },
            ...is,
          ]);
        }
        return res;
      },

      importCustomer: (input, mode) => {
        const res = commitCustomerImport(
          store,
          input,
          mode,
          importedCustomers.current,
        );
        if (res.ok && res.action === "created" && res.customer_id) {
          logEvent(
            null,
            "imported",
            `Customer imported — ${input.first_name} ${input.last_name} (${res.customer_id})`,
          );
        }
        if (!res.ok && res.action === "skipped") {
          setIssues((is) => [
            {
              id: uid("mis"),
              tenant_id: TENANT_ID,
              batch_id: null,
              row_number: null,
              entity_type: "customers",
              severity: "warning",
              code: "duplicate_customer",
              message: res.error ?? "Customer skipped.",
              resolution: null,
              resolved_at: null,
              created_at: new Date().toISOString(),
            },
            ...is,
          ]);
        }
        return res;
      },

      importInvestor: (input, mode) => {
        const res = commitInvestorImport(
          investors,
          store,
          input,
          mode,
          importedInvestors.current,
        );
        if (res.ok && res.investor_id) {
          logEvent(
            null,
            "imported",
            `Investor imported — ${input.full_name} (${res.investor_id})`,
          );
        }
        if (!res.ok && res.action === "skipped") {
          setIssues((is) => [
            {
              id: uid("mis"),
              tenant_id: TENANT_ID,
              batch_id: null,
              row_number: null,
              entity_type: "investors",
              severity: "warning",
              code: "duplicate_investor",
              message: res.error ?? "Investor skipped.",
              resolution: null,
              resolved_at: null,
              created_at: new Date().toISOString(),
            },
            ...is,
          ]);
        }
        return res;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batches, issues, events, historical, store, investors],
  );

  return (
    <MigrationContext.Provider value={value}>
      {children}
    </MigrationContext.Provider>
  );
}

export function useMigration() {
  const ctx = useContext(MigrationContext);
  if (!ctx)
    throw new Error("useMigration must be used within MigrationProvider");
  return ctx;
}
