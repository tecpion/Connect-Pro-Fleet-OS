// Connect Pro Fleet — combined Incidents & Violations workspace shell.
//
// One workspace, two authoritative domains:
//   • Incidents tab      → authoritative Incidents model (incidentsStore)
//   • Traffic Violations → authoritative rich Violation store (violationStoreProvider)
//
// The simple incidents-store TrafficViolation model is NOT used as the primary
// violation source. Domains are never merged. A shared analytics header reacts
// to the selected date range using existing pure selectors; list-specific
// filters do not redefine the global analytics. No authoritative domain logic
// is changed.

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useIncidents } from "@/lib/incidentsStore";
import { useViolations } from "@/lib/violationStoreProvider";
import { can } from "@/lib/permissions";
import { toast } from "sonner";
import { Plus, Upload } from "lucide-react";
import { PageHeader } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";

import {
  workspaceSummary,
  buildTrend,
  incidentTypeBreakdown,
  violationTypeBreakdown,
  topVehiclesByFrequency,
  resolveAnalyticsRange,
  comparisonIndicator,
  type AnalyticsRange,
  type TrendGranularity,
} from "@/lib/incidentsViolationsAnalytics";
import {
  incidentAttention,
  incidentVehicleImpact,
} from "@/lib/incidentAttention";
import {
  getOpenViolations,
  getOverdueViolations,
} from "@/lib/violationSelectors";
import {
  matchStatus,
  billingStatus,
  dueState,
} from "@/lib/violationWorkspaceAttention";

import { IncidentDetail } from "../IncidentDetail";
import { AddIncidentDialog } from "../AddIncidentDialog";
import { titleCase } from "../shared";
import { CreateViolationDialog } from "../../violations/CreateViolationDialog";
import { ViolationDetail } from "../../violations/ViolationDetail";
import { ImportViolationsDialog } from "../../violations/ImportViolationsDialog";

import {
  SharedAnalytics,
  TrendCard,
  BreakdownCards,
} from "./WorkspaceAnalytics";
import { IncidentsTab } from "./IncidentsTab";
import { ViolationsTab } from "./ViolationsTab";

type Tab = "incidents" | "violations";

// Fixed tenant reference clock (deterministic; matches the test baseline).
// Production would derive this from the tenant timezone; the selector layer
// already accepts a tenant-local Date so business dates are respected.
const NOW = new Date("2026-09-10T12:00:00");

export default function IncidentsViolationsWorkspace() {
  const store = useStore();
  const inc = useIncidents();
  const vio = useViolations();

  // Active tab from URL query (?tab=violations) so direct links and refreshes
  // land on the correct workflow. Falls back to "incidents".
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab =
    searchParams.get("tab") === "violations" ? "violations" : "incidents";
  const [tab, setTab] = useState<Tab>(initialTab);

  // Keep the URL in sync with the active tab (shareable / bookmarkable).
  useEffect(() => {
    const next = tab === "violations" ? "violations" : "incidents";
    if (searchParams.get("tab") !== next) {
      const sp = new URLSearchParams(searchParams);
      sp.set("tab", next);
      setSearchParams(sp, { replace: true });
    }
  }, [tab, searchParams, setSearchParams]);
  const [range, setRange] = useState<AnalyticsRange>("this_month");
  const [custom, setCustom] = useState({
    start: "2026-09-01",
    end: "2026-09-10",
  });
  const [granularity, setGranularity] = useState<TrendGranularity>("monthly");

  // Incidents list filters
  const [incSearch, setIncSearch] = useState("");
  const [incStatus, setIncStatus] = useState("all");
  const [incType, setIncType] = useState("all");
  const [incResp, setIncResp] = useState("all");

  // Violations list filters
  const [vioSearch, setVioSearch] = useState("");
  const [vioMatch, setVioMatch] = useState("all");
  const [vioBilling, setVioBilling] = useState("all");
  const [vioResp, setVioResp] = useState("all");
  const [vioType, setVioType] = useState("all");
  const [vioDue, setVioDue] = useState("all");
  const [vioAssigned, setVioAssigned] = useState("all");

  const [incDetailId, setIncDetailId] = useState<string | null>(null);
  const [vioDetailId, setVioDetailId] = useState<string | null>(null);
  const [addIncOpen, setAddIncOpen] = useState(false);
  const [createVioOpen, setCreateVioOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Permissions
  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const role =
    store.roles.find((r) => r.id === currentStaff?.role_id) ??
    store.roles.find((r) => r.name === currentStaff?.role);
  const overrides = currentStaff?.permission_overrides as Record<
    string,
    unknown
  > | null;
  const canViewViolations = can(role, overrides, "violations.view");
  const canCreateViolation = can(role, overrides, "violations.create");
  const canImportViolation = can(role, overrides, "violations.import");
  const canViewVioFinancials = can(
    role,
    overrides,
    "violations.view_financials",
  );

  const vehicleLabel = (id: string) => {
    const v = store.vehicles.find((x) => x.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : "—";
  };
  const vehiclePlate = (id: string) =>
    store.vehicles.find((x) => x.id === id)?.license_plate ?? "—";
  const staffName = (id: string | null) =>
    id
      ? (store.staff.find((s) => s.id === id)?.full_name ?? "—")
      : "Unassigned";
  const customerName = (id: string | null) =>
    id ? store.customerName(id) || "—" : "—";
  const rentalLabel = (id: string | null) => {
    if (!id) return "—";
    const r = store.rentals.find((x) => x.id === id);
    return r?.agreement_number ?? "—";
  };

  // ---- Shared analytics (react to range, NOT list filters) -----------------
  const summary = useMemo(
    () => workspaceSummary(inc.incidents, vio.violations, range, NOW, custom),
    [inc.incidents, vio.violations, range, custom],
  );
  const window = useMemo(
    () => resolveAnalyticsRange(range, NOW, custom),
    [range, custom],
  );
  const trend = useMemo(
    () =>
      buildTrend(
        inc.incidents,
        vio.violations,
        granularity,
        NOW,
        granularity === "monthly" ? 12 : 3,
      ),
    [inc.incidents, vio.violations, granularity],
  );
  const incBreakdown = useMemo(
    () => incidentTypeBreakdown(inc.incidents, window),
    [inc.incidents, window],
  );
  const vioBreakdown = useMemo(
    () => violationTypeBreakdown(vio.violations, window),
    [vio.violations, window],
  );
  const topVehicles = useMemo(
    () => topVehiclesByFrequency(inc.incidents, vio.violations, window, 5),
    [inc.incidents, vio.violations, window],
  );
  const incComparison = comparisonIndicator(
    summary.incidentsThisPeriod,
    summary.incidentsPrior,
    summary.priorLabel ?? "",
  );
  const vioComparison = comparisonIndicator(
    summary.violationsThisPeriod,
    summary.violationsPrior,
    summary.priorLabel ?? "",
  );

  // ---- Incidents KPIs + filtered list --------------------------------------
  const incAttentionCount = useMemo(
    () =>
      inc.incidents.filter((i) => incidentAttention(i, NOW).level !== "none")
        .length,
    [inc.incidents],
  );
  const vehiclesDown = useMemo(
    () =>
      inc.incidents.filter((i) => incidentVehicleImpact(i) === "out_of_service")
        .length,
    [inc.incidents],
  );
  const amountPending = useMemo(
    () =>
      inc.incidents
        .filter((i) => i.payment_status === "pending")
        .reduce((s, i) => s + i.payment_amount, 0),
    [inc.incidents],
  );

  const filteredIncidents = useMemo(() => {
    const q = incSearch.trim().toLowerCase();
    return inc.incidents
      .filter((i) => (incStatus === "all" ? true : i.status === incStatus))
      .filter((i) => (incType === "all" ? true : i.incident_type === incType))
      .filter((i) =>
        incResp === "all" ? true : i.responsible_party === incResp,
      )
      .filter((i) =>
        q
          ? i.description.toLowerCase().includes(q) ||
            vehicleLabel(i.vehicle_id).toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => (a.reported_at < b.reported_at ? 1 : -1));
  }, [inc.incidents, incSearch, incStatus, incType, incResp, store.vehicles]);

  // ---- Violations KPIs + filtered list -------------------------------------
  const pendingMatchCount = useMemo(
    () =>
      vio.violations.filter((v) => {
        if (!getOpenViolations([v]).length) return false;
        return matchStatus(v) !== "confirmed";
      }).length,
    [vio.violations],
  );
  const overdueCount = useMemo(
    () => getOverdueViolations(vio.violations, NOW).length,
    [vio.violations],
  );

  const filteredViolations = useMemo(() => {
    const q = vioSearch.trim().toLowerCase();
    return vio.violations
      .filter((v) => (vioMatch === "all" ? true : matchStatus(v) === vioMatch))
      .filter((v) =>
        vioBilling === "all" ? true : billingStatus(v) === vioBilling,
      )
      .filter((v) => (vioResp === "all" ? true : v.responsibility === vioResp))
      .filter((v) => (vioType === "all" ? true : v.violation_type === vioType))
      .filter((v) => (vioDue === "all" ? true : dueState(v, NOW) === vioDue))
      .filter((v) => {
        if (vioAssigned === "all") return true;
        if (vioAssigned === "unassigned") return !v.assigned_staff_id;
        return v.assigned_staff_id === vioAssigned;
      })
      .filter((v) => {
        if (!q) return true;
        const hay = [
          v.violation_number,
          v.citation_number,
          v.plate_number_snapshot,
          vehicleLabel(v.vehicle_id),
          v.customer_id ? store.customerName(v.customer_id) : "",
          v.issuing_authority,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  }, [
    vio.violations,
    vioSearch,
    vioMatch,
    vioBilling,
    vioResp,
    vioType,
    vioDue,
    vioAssigned,
    store.vehicles,
    store,
  ]);

  const activeIncident =
    inc.incidents.find((i) => i.id === incDetailId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incidents & Violations"
        subtitle="Track accidents, damage disputes, breakdowns, tickets, renter responsibility, and related costs across your fleet."
        actions={
          tab === "incidents" ? (
            <Button
              onClick={() => setAddIncOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              <Plus size={16} /> Log Incident
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              {canImportViolation && (
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload size={16} /> Import CSV
                </Button>
              )}
              {canCreateViolation && (
                <Button
                  className="bg-primary text-primary-foreground"
                  onClick={() => setCreateVioOpen(true)}
                >
                  <Plus size={16} /> Add Violation
                </Button>
              )}
            </div>
          )
        }
      />

      <SharedAnalytics
        range={range}
        setRange={setRange}
        custom={custom}
        setCustom={setCustom}
        summary={summary}
        incComparison={incComparison}
        vioComparison={vioComparison}
        canViewVioFinancials={canViewVioFinancials}
        needsAttention={incAttentionCount + pendingMatchCount + overdueCount}
        overdueCritical={overdueCount + vehiclesDown}
      />

      <TrendCard
        trend={trend}
        granularity={granularity}
        setGranularity={setGranularity}
      />

      <BreakdownCards
        incBreakdown={incBreakdown}
        vioBreakdown={vioBreakdown}
        topVehicles={topVehicles}
        vehicleLabel={vehicleLabel}
      />

      {/* Primary tabs */}
      <div className="flex gap-1 border-b border-border">
        {(
          [
            {
              key: "incidents",
              label: `Incidents (${inc.incidents.length})`,
            },
            {
              key: "violations",
              label: `Traffic Violations (${vio.violations.length})`,
            },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setIncDetailId(null);
              setVioDetailId(null);
            }}
            className={
              tab === t.key
                ? "border-b-2 border-primary px-3 py-2 text-sm font-medium text-primary"
                : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "incidents" ? (
        <IncidentsTab
          incidents={filteredIncidents}
          totalCount={inc.incidents.length}
          vehiclesDown={vehiclesDown}
          amountPending={amountPending}
          attentionCount={incAttentionCount}
          search={incSearch}
          setSearch={setIncSearch}
          status={incStatus}
          setStatus={setIncStatus}
          type={incType}
          setType={setIncType}
          resp={incResp}
          setResp={setIncResp}
          vehicleLabel={vehicleLabel}
          vehiclePlate={vehiclePlate}
          staffName={staffName}
          onOpen={(id) => setIncDetailId(id)}
          onLog={() => setAddIncOpen(true)}
        />
      ) : canViewViolations ? (
        <ViolationsTab
          violations={filteredViolations}
          totalCount={vio.violations.length}
          search={vioSearch}
          setSearch={setVioSearch}
          match={vioMatch}
          setMatch={setVioMatch}
          billing={vioBilling}
          setBilling={setVioBilling}
          resp={vioResp}
          setResp={setVioResp}
          type={vioType}
          setType={setVioType}
          due={vioDue}
          setDue={setVioDue}
          assigned={vioAssigned}
          setAssigned={setVioAssigned}
          staff={store.staff}
          vehicleLabel={vehicleLabel}
          vehiclePlate={vehiclePlate}
          customerName={customerName}
          rentalLabel={rentalLabel}
          staffName={staffName}
          canViewFinancials={canViewVioFinancials}
          onOpen={(id) => setVioDetailId(id)}
          onAdd={() => setCreateVioOpen(true)}
        />
      ) : (
        <div className="py-10 text-sm text-muted-foreground">
          You don't have permission to view violations.
        </div>
      )}

      {/* Incident detail */}
      {activeIncident && (
        <IncidentDetail
          incident={activeIncident}
          onClose={() => setIncDetailId(null)}
          onUpdate={(patch) => {
            inc.updateIncident(activeIncident.id, patch);
            toast.success("Incident updated.");
          }}
          onStatus={(s) => {
            inc.setIncidentStatus(activeIncident.id, s);
            toast.success(`Incident marked ${titleCase(s)}.`);
          }}
          onAssignStaff={(id) => {
            inc.assignIncidentStaff(activeIncident.id, id);
            toast.success("Staff assigned.");
          }}
          vehicleLabel={vehicleLabel}
          vehiclePlate={vehiclePlate}
          staffName={staffName}
          staff={store.staff}
          reservations={store.reservations}
        />
      )}

      {/* Violation detail */}
      {vioDetailId && (
        <ViolationDetail
          violationId={vioDetailId}
          onClose={() => setVioDetailId(null)}
        />
      )}

      {/* Dialogs */}
      {addIncOpen && (
        <AddIncidentDialog
          vehicles={store.vehicles}
          reservations={store.reservations}
          staff={store.staff}
          onClose={() => setAddIncOpen(false)}
          onSave={(i) => {
            inc.addIncident(i);
            toast.success("Incident logged.");
            setAddIncOpen(false);
          }}
        />
      )}
      {createVioOpen && (
        <CreateViolationDialog
          vehicles={store.vehicles}
          staff={store.staff}
          onClose={() => setCreateVioOpen(false)}
          onCreated={(id) => {
            setCreateVioOpen(false);
            setVioDetailId(id);
            toast.success("Violation added.");
          }}
        />
      )}
      {importOpen && (
        <ImportViolationsDialog
          open={importOpen}
          onOpenChange={setImportOpen}
        />
      )}
    </div>
  );
}
