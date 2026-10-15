// Connect Pro Fleet — Traffic Violations tab for the combined workspace.
// Authoritative source: the rich Violation store (violationStoreProvider). The
// simple incidents-store TrafficViolation model is NOT used here. Match Status,
// Responsibility, Billing Status, and Due State are kept separate. No domain
// logic changes — pure presentation over existing selectors.

import { useMemo } from "react";
import { useNavigate } from "@/lib/router-compat";
import { EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/Status";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtDate } from "@/lib/format";
import { AlertTriangle, Plus } from "lucide-react";
import type { Violation } from "@/lib/violationTypes";
import {
  VIOLATION_TYPE_LABELS,
  VIOLATION_STATUS_TONE,
  RESPONSIBILITY_LABELS,
  RESPONSIBILITY_TONE,
} from "@/lib/violationTypes";
import {
  matchStatus,
  billingStatus,
  dueState,
  violationAttention,
  autoMatchExplanation,
} from "@/lib/violationWorkspaceAttention";
import {
  getOpenViolations,
  getOverdueViolations,
  getViolationsDueSoon,
  getNeedsReview,
  daysOverdue,
} from "@/lib/violationSelectors";
import {
  toneClass,
  statusLabel as vioStatusLabel,
  typeLabel as vioTypeLabel,
  responsibilityLabel as vioRespLabel,
} from "../../violations/shared";
import {
  TabKpi,
  FilterSelect,
  MatchPill,
  BillingPill,
  DuePill,
  AttentionReasons,
} from "./WorkspacePrimitives";

const NOW = new Date("2026-09-10T12:00:00");

export function ViolationsTab({
  violations,
  totalCount,
  search,
  setSearch,
  match,
  setMatch,
  billing,
  setBilling,
  resp,
  setResp,
  type,
  setType,
  due,
  setDue,
  assigned,
  setAssigned,
  staff,
  vehicleLabel,
  vehiclePlate,
  customerName,
  rentalLabel,
  staffName,
  canViewFinancials,
  onOpen,
  onAdd,
}: {
  violations: Violation[];
  totalCount: number;
  search: string;
  setSearch: (s: string) => void;
  match: string;
  setMatch: (s: string) => void;
  billing: string;
  setBilling: (s: string) => void;
  resp: string;
  setResp: (s: string) => void;
  type: string;
  setType: (s: string) => void;
  due: string;
  setDue: (s: string) => void;
  assigned: string;
  setAssigned: (s: string) => void;
  staff: { id: string; full_name: string }[];
  vehicleLabel: (id: string) => string;
  vehiclePlate: (id: string) => string;
  customerName: (id: string | null) => string;
  rentalLabel: (id: string | null) => string;
  staffName: (id: string | null) => string;
  canViewFinancials: boolean;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const navigate = useNavigate();

  const openVios = useMemo(() => getOpenViolations(violations), [violations]);
  const overdue = useMemo(
    () => getOverdueViolations(violations, NOW),
    [violations],
  );
  const dueSoon = useMemo(
    () => getViolationsDueSoon(violations, NOW, 7),
    [violations],
  );
  const needsReview = useMemo(
    () => getNeedsReview(violations, {}, NOW, false),
    [violations],
  );
  const pendingMatch = useMemo(
    () =>
      violations.filter((v) => {
        if (!getOpenViolations([v]).length) return false;
        return matchStatus(v) !== "confirmed";
      }),
    [violations],
  );

  // Amount outstanding: unresolved fine/charge still requiring payment or
  // recovery. Distinct from fine amount and renter-billed amount.
  const amountOutstanding = useMemo(
    () =>
      openVios.reduce((s, v) => {
        const bs = billingStatus(v);
        // Outstanding = fine minus what's been collected from the customer.
        if (bs === "paid" || bs === "waived") return s;
        if (bs === "partially_paid") return s + Math.max(0, v.total_amount / 2);
        return s + v.total_amount;
      }, 0),
    [openVios],
  );

  // Customer charges pending: renter responsibility confirmed but not yet
  // billed for the eligible amount.
  const customerChargesPending = useMemo(
    () =>
      violations.filter(
        (v) =>
          getOpenViolations([v]).length > 0 &&
          (v.responsibility === "customer" || v.responsibility === "shared") &&
          billingStatus(v) === "not_billed" &&
          v.customer_charge_status !== "reversed",
      ).length,
    [violations],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <TabKpi
          label="Open"
          value={String(openVios.length)}
          tone="maintenance"
        />
        <TabKpi
          label="Pending Match"
          value={String(pendingMatch.length)}
          tone="out"
        />
        <TabKpi
          label="Needs Review"
          value={String(needsReview.length)}
          tone="out"
        />
        <TabKpi
          label="Due Soon"
          value={String(dueSoon.length)}
          tone="maintenance"
        />
        <TabKpi label="Overdue" value={String(overdue.length)} tone="out" />
        <TabKpi
          label="Amount Outstanding"
          value={canViewFinancials ? fmtMoney(amountOutstanding) : "—"}
          tone="maintenance"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <TabKpi
          label="Charges Pending"
          value={String(customerChargesPending)}
          tone="out"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search citation, plate, vehicle, customer…"
          className="max-w-xs"
        />
        <FilterSelect value={match} onChange={setMatch} allLabel="All match">
          <option value="unmatched">Unmatched</option>
          <option value="suggested">Suggested</option>
          <option value="confirmed">Confirmed</option>
        </FilterSelect>
        <FilterSelect
          value={billing}
          onChange={setBilling}
          allLabel="All billing"
        >
          <option value="not_billed">Not Billed</option>
          <option value="billed">Billed</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="paid">Paid</option>
          <option value="waived">Waived</option>
        </FilterSelect>
        <FilterSelect
          value={resp}
          onChange={setResp}
          allLabel="All responsibility"
        >
          {Object.entries(RESPONSIBILITY_LABELS).map(([k, lbl]) => (
            <option key={k} value={k}>
              {lbl}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={type} onChange={setType} allLabel="All types">
          {Object.entries(VIOLATION_TYPE_LABELS).map(([k, lbl]) => (
            <option key={k} value={k}>
              {lbl}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={due} onChange={setDue} allLabel="All due">
          <option value="due_soon">Due Soon</option>
          <option value="due_today">Due Today</option>
          <option value="overdue">Overdue</option>
          <option value="none">No Due Date</option>
        </FilterSelect>
        <FilterSelect
          value={assigned}
          onChange={setAssigned}
          allLabel="All staff"
        >
          <option value="unassigned">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </FilterSelect>
      </div>

      {violations.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="No violations yet"
          hint="Track tolls, tickets, citations, and customer responsibility here."
          action={
            <Button
              onClick={onAdd}
              className="bg-primary text-primary-foreground"
            >
              <Plus size={16} /> Add Violation
            </Button>
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {violations.map((v) => (
              <ViolationMobileCard
                key={v.id}
                v={v}
                vehicleLabel={vehicleLabel}
                customerName={customerName}
                rentalLabel={rentalLabel}
                canViewFinancials={canViewFinancials}
                onOpen={() => onOpen(v.id)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Violation</th>
                  <th className="py-2 pr-3">Vehicle</th>
                  <th className="py-2 pr-3">Customer / Rental</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Occurred</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3">Fine</th>
                  <th className="py-2 pr-3">Match</th>
                  <th className="py-2 pr-3">Responsibility</th>
                  <th className="py-2 pr-3">Billing</th>
                  <th className="py-2 pr-3">Assigned</th>
                  <th className="py-2 pr-3">Attention</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => {
                  const ms = matchStatus(v);
                  const bs = billingStatus(v);
                  const ds = dueState(v, NOW);
                  const att = violationAttention(v, NOW);
                  return (
                    <tr
                      key={v.id}
                      onClick={() => onOpen(v.id)}
                      className={cn(
                        "cursor-pointer border-b border-border hover:bg-surface-2",
                        toneClass[VIOLATION_STATUS_TONE[v.status]],
                      )}
                    >
                      <td className="py-2 pr-3">
                        <p className="font-mono text-xs font-medium text-foreground">
                          {v.violation_number}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {v.citation_number ?? v.issuing_authority ?? "—"}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/vehicles/${v.vehicle_id}`);
                          }}
                          className="text-left hover:text-primary"
                        >
                          <p className="text-sm text-foreground">
                            {vehicleLabel(v.vehicle_id)}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {vehiclePlate(v.vehicle_id)}
                          </p>
                        </button>
                      </td>
                      <td className="py-2 pr-3">
                        {v.customer_id || v.rental_id ? (
                          <div>
                            <p className="text-sm text-foreground">
                              {customerName(v.customer_id)}
                            </p>
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {rentalLabel(v.rental_id)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-status-out">
                            No rental match
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {vioTypeLabel(v.violation_type)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {fmtDate(v.occurred_at)}
                      </td>
                      <td className="py-2 pr-3">
                        <DuePill state={ds} />
                      </td>
                      <td className="py-2 pr-3 font-mono tabular">
                        {canViewFinancials ? fmtMoney(v.total_amount) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <MatchPill status={ms} />
                      </td>
                      <td className="py-2 pr-3">
                        <StatusPill
                          tone={RESPONSIBILITY_TONE[v.responsibility]}
                        >
                          {vioRespLabel(v.responsibility)}
                        </StatusPill>
                      </td>
                      <td className="py-2 pr-3">
                        <BillingPill status={bs} />
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {staffName(v.assigned_staff_id)}
                      </td>
                      <td className="py-2 pr-3">
                        <AttentionReasons
                          level={att.level}
                          reasons={att.reasons}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Showing {violations.length} of {totalCount} violations ·{" "}
        {openVios.length} open · {overdue.length} overdue
      </p>
    </div>
  );
}

function ViolationMobileCard({
  v,
  vehicleLabel,
  customerName,
  rentalLabel,
  canViewFinancials,
  onOpen,
}: {
  v: Violation;
  vehicleLabel: (id: string) => string;
  customerName: (id: string | null) => string;
  rentalLabel: (id: string | null) => string;
  canViewFinancials: boolean;
  onOpen: () => void;
}) {
  const att = violationAttention(v, NOW);
  const ms = matchStatus(v);
  const bs = billingStatus(v);
  const ds = dueState(v, NOW);
  return (
    <button
      onClick={onOpen}
      className={cn(
        "w-full rounded-md border border-border bg-surface p-3 text-left",
        toneClass[VIOLATION_STATUS_TONE[v.status]],
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-medium text-foreground">
          {v.violation_number}
        </span>
        {canViewFinancials && (
          <span className="font-mono text-sm">{fmtMoney(v.total_amount)}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-foreground">
        {vioTypeLabel(v.violation_type)}
        {v.citation_number ? ` · ${v.citation_number}` : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        {vehicleLabel(v.vehicle_id)} · {fmtDate(v.occurred_at)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {v.customer_id || v.rental_id
          ? `${customerName(v.customer_id)} · ${rentalLabel(v.rental_id)}`
          : "No rental match"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <DuePill state={ds} />
        <MatchPill status={ms} />
        <BillingPill status={bs} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <StatusPill tone={RESPONSIBILITY_TONE[v.responsibility]}>
          {vioRespLabel(v.responsibility)}
        </StatusPill>
        <StatusPill tone={VIOLATION_STATUS_TONE[v.status]}>
          {vioStatusLabel(v.status)}
        </StatusPill>
      </div>
      <div className="mt-2">
        <AttentionReasons level={att.level} reasons={att.reasons} />
      </div>
    </button>
  );
}
