// Connect Pro Fleet — Inspections page (Workspace enhancement).
//
// A vehicle-condition & handoff workspace: KPI summary, segmented type tabs,
// search/filter toolbar, table (desktop) / card (mobile) views, and an
// inspection detail drawer. No domain logic changes — pure UX composition
// over authoritative inspection records.
//
// Final UX polish:
//   - KPI row: Completed Today / In Progress / AI Review Needed / Damage
//     Flagged / Awaiting Photos / Needs Review (Missing Signature removed from
//     the permanent row; still tracked as a filter + attention reason).
//   - In Progress tab + AI Review Needed KPI filter.
//   - AI Review filter dropdown.
//   - Resume deep-link routing (unfinished → wizard at the right step).
//   - clickable operational states.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { PageHeader, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck,
  Search,
  LayoutGrid,
  Table as TableIcon,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  computeInspectionKpis,
  deriveInspectionStatus,
  deriveAiReviewState,
  searchInspections,
} from "@/lib/inspectionSelectors";
import {
  InspKpi,
  InspTab,
  inspTabLabel,
  InspectionTableBody,
  InspectionCardView,
  EmptyInspectionsIcon,
  type InspTabKey,
} from "./inspections/InspectionParts";
import { InspectionDetail } from "./inspections/InspectionDetail";

const NOW = new Date();

export default function Inspections() {
  const { inspections, reservations, vehicles } = useStore();
  const navigate = useNavigate();

  const [tab, setTab] = useState<InspTabKey>("all");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [damageFilter, setDamageFilter] = useState<string>("all");
  const [signatureFilter, setSignatureFilter] = useState<string>("all");
  const [aiReviewFilter, setAiReviewFilter] = useState<string>("all");
  const [view, setView] = useState<"table" | "cards">("table");
  const [detailId, setDetailId] = useState<string | null>(null);

  const kpis = useMemo(
    () => computeInspectionKpis(inspections, NOW),
    [inspections],
  );

  const tabCounts = useMemo(() => {
    const c: Record<InspTabKey, number> = {
      all: inspections.length,
      in_progress: 0,
      checkout: 0,
      checkin: 0,
      needs_review: 0,
      damage: 0,
      completed: 0,
    };
    for (const i of inspections) {
      if (i.inspection_type === "checkout") c.checkout++;
      else c.checkin++;
      const s = deriveInspectionStatus(i);
      if (s === "in_progress" || s === "incomplete") c.in_progress++;
      if (s === "needs_review") c.needs_review++;
      if (s === "damage_flagged" || i.damage_detected) c.damage++;
      if (s === "clear" || s === "damage_flagged") c.completed++;
    }
    return c;
  }, [inspections]);

  const filtered = useMemo(() => {
    let list = searchInspections(inspections, reservations, vehicles, query);
    if (typeFilter !== "all")
      list = list.filter((i) => i.inspection_type === typeFilter);
    if (damageFilter === "damage") list = list.filter((i) => i.damage_detected);
    else if (damageFilter === "clear")
      list = list.filter((i) => !i.damage_detected);
    if (signatureFilter === "signed")
      list = list.filter((i) => i.inspector_signature_url !== null);
    else if (signatureFilter === "missing")
      list = list.filter((i) => i.inspector_signature_url === null);

    // AI review filter.
    if (aiReviewFilter !== "all") {
      list = list.filter((i) => {
        const s = deriveAiReviewState(i);
        switch (aiReviewFilter) {
          case "review_needed":
            return s === "review_needed";
          case "potential_damage":
            return s === "potential_damage";
          case "reviewed":
            return s === "reviewed";
          case "no_new_damage":
            return s === "no_new_damage";
          case "retake_needed":
            return s === "retake_needed";
          default:
            return true;
        }
      });
    }

    switch (tab) {
      case "in_progress":
        list = list.filter((i) => {
          const s = deriveInspectionStatus(i);
          return s === "in_progress" || s === "incomplete";
        });
        break;
      case "checkout":
        list = list.filter((i) => i.inspection_type === "checkout");
        break;
      case "checkin":
        list = list.filter((i) => i.inspection_type === "checkin");
        break;
      case "needs_review":
        list = list.filter((i) => deriveInspectionStatus(i) === "needs_review");
        break;
      case "damage":
        list = list.filter(
          (i) =>
            i.damage_detected || deriveInspectionStatus(i) === "damage_flagged",
        );
        break;
      case "completed":
        list = list.filter((i) => {
          const s = deriveInspectionStatus(i);
          return s === "clear" || s === "damage_flagged";
        });
        break;
    }
    return [...list].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }, [
    inspections,
    reservations,
    vehicles,
    query,
    typeFilter,
    damageFilter,
    signatureFilter,
    aiReviewFilter,
    tab,
  ]);

  const detail = detailId
    ? (inspections.find((i) => i.id === detailId) ?? null)
    : null;

  // KPI click → set the matching tab (and clear conflicting filters).
  const kpiToTab = (t: InspTabKey) => {
    setTab(t);
    setAiReviewFilter("all");
  };
  // AI Review Needed KPI → filter by review_needed state.
  const kpiToAiReview = () => {
    setTab("all");
    setAiReviewFilter("review_needed");
  };

  const clearAll = () => {
    setQuery("");
    setTypeFilter("all");
    setDamageFilter("all");
    setSignatureFilter("all");
    setAiReviewFilter("all");
    setTab("all");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inspections"
        subtitle="Document vehicle condition at checkout, return, and throughout the rental lifecycle."
        actions={
          <Link to="/inspections/new">
            <Button
              data-testid="new-inspection"
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              <ClipboardCheck size={16} className="mr-1.5" /> New Inspection
            </Button>
          </Link>
        }
      />

      {/* KPI row — Completed Today / In Progress / AI Review Needed / Damage
          Flagged / Awaiting Photos / Needs Review. Missing Signature removed
          from the permanent row (still tracked as filter + attention reason). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <InspKpi
          icon={<CheckCircle2 size={18} />}
          label="Completed Today"
          value={kpis.completedToday}
          tone="available"
          testId="kpi-completed-today"
        />
        <InspKpi
          icon={<Loader2 size={18} />}
          label="In Progress"
          value={kpis.inProgress}
          tone="rented"
          testId="kpi-in-progress"
          onClick={() => kpiToTab("in_progress")}
          active={tab === "in_progress"}
        />
        <InspKpi
          icon={<Sparkles size={18} />}
          label="AI Review Needed"
          value={kpis.aiReviewNeeded}
          tone="maintenance"
          testId="kpi-ai-review-needed"
          onClick={kpiToAiReview}
          active={aiReviewFilter === "review_needed"}
        />
        <InspKpi
          icon={<AlertTriangle size={18} />}
          label="Damage Flagged"
          value={kpis.damageFlagged}
          tone="out"
          testId="kpi-damage-flagged"
          onClick={() => kpiToTab("damage")}
          active={tab === "damage"}
        />
        <InspKpi
          icon={<Camera size={18} />}
          label="Awaiting Photos"
          value={kpis.awaitingPhotos}
          tone="maintenance"
          testId="kpi-awaiting-photos"
        />
        <InspKpi
          icon={<ClipboardCheck size={18} />}
          label="Needs Review"
          value={kpis.needsReview}
          tone="maintenance"
          testId="kpi-needs-review"
          onClick={() => kpiToTab("needs_review")}
          active={tab === "needs_review"}
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            "all",
            "in_progress",
            "checkout",
            "checkin",
            "needs_review",
            "damage",
            "completed",
          ] as InspTabKey[]
        ).map((t) => (
          <InspTab
            key={t}
            active={tab === t}
            onClick={() => setTab(t)}
            count={tabCounts[t]}
          >
            {inspTabLabel(t)}
          </InspTab>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vehicle, plate, customer…"
            className="pl-9"
            data-testid="insp-search"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px]" data-testid="insp-type-filter">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="checkout">Checkout</SelectItem>
              <SelectItem value="checkin">Check-in</SelectItem>
            </SelectContent>
          </Select>
          <Select value={aiReviewFilter} onValueChange={setAiReviewFilter}>
            <SelectTrigger className="w-[150px]" data-testid="insp-ai-filter">
              <SelectValue placeholder="AI Review" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any AI state</SelectItem>
              <SelectItem value="review_needed">Review Needed</SelectItem>
              <SelectItem value="potential_damage">Potential Damage</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="no_new_damage">No New Damage</SelectItem>
              <SelectItem value="retake_needed">Retake Needed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={damageFilter} onValueChange={setDamageFilter}>
            <SelectTrigger
              className="w-[140px]"
              data-testid="insp-damage-filter"
            >
              <SelectValue placeholder="Damage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any damage</SelectItem>
              <SelectItem value="damage">Damage only</SelectItem>
              <SelectItem value="clear">Clear only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={signatureFilter} onValueChange={setSignatureFilter}>
            <SelectTrigger className="w-[140px]" data-testid="insp-sig-filter">
              <SelectValue placeholder="Signature" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any signature</SelectItem>
              <SelectItem value="signed">Signed</SelectItem>
              <SelectItem value="missing">Missing</SelectItem>
            </SelectContent>
          </Select>
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-border bg-surface-2 p-0.5">
            <button
              onClick={() => setView("table")}
              data-testid="view-table"
              className={cn(
                "rounded-md p-1.5 transition-colors",
                view === "table"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Table view"
            >
              <TableIcon size={15} />
            </button>
            <button
              onClick={() => setView("cards")}
              data-testid="view-cards"
              className={cn(
                "rounded-md p-1.5 transition-colors",
                view === "cards"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Card view"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Result count */}
      <p className="text-sm text-muted-foreground" data-testid="insp-count">
        Showing {filtered.length} of {inspections.length} inspections
      </p>

      {/* Results */}
      {filtered.length === 0 ? (
        inspections.length === 0 ? (
          <EmptyState
            title="No inspections recorded"
            hint="Start a checkout or check-in from a reservation, or open the inspection wizard to begin."
            icon={<EmptyInspectionsIcon />}
            action={
              <Link to="/inspections/new">
                <Button variant="outline">New Inspection</Button>
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No inspections match these filters"
            hint="Try adjusting your search or filters."
            icon={<EmptyInspectionsIcon />}
            action={
              <Button variant="outline" onClick={clearAll}>
                Clear Filters
              </Button>
            }
          />
        )
      ) : view === "cards" ? (
        <InspectionCardView
          filtered={filtered}
          vehicles={vehicles}
          reservations={reservations}
          onOpen={setDetailId}
          onAction={(href) => navigate(href)}
        />
      ) : (
        <div className="hidden overflow-hidden rounded-xl border border-border bg-surface lg:block">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2/60 text-left">
              <tr className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">Inspection</th>
                <th className="px-4 py-2.5">Vehicle</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">AI Review</th>
                <th className="px-4 py-2.5">Photos</th>
                <th className="px-4 py-2.5">Damage</th>
                <th className="px-4 py-2.5">Signature</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <InspectionTableBody
              filtered={filtered}
              vehicles={vehicles}
              reservations={reservations}
              onOpen={setDetailId}
              onAction={(href) => navigate(href)}
            />
          </table>
        </div>
      )}

      {/* Mobile fallback: always show cards when table view is selected on small screens */}
      {view === "table" && filtered.length > 0 && (
        <div className="lg:hidden">
          <InspectionCardView
            filtered={filtered}
            vehicles={vehicles}
            reservations={reservations}
            onOpen={setDetailId}
            onAction={(href) => navigate(href)}
          />
        </div>
      )}

      <InspectionDetail
        inspection={detail}
        open={detailId !== null}
        onOpenChange={(v) => !v && setDetailId(null)}
      />
    </div>
  );
}
