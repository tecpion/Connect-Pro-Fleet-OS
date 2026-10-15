// Connect Pro Fleet — Incidents tab for the combined workspace.
// Authoritative source: the Incidents model (incidentsStore). Pure presentation
// over existing selectors; no domain logic changes.

import { EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/Status";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Plus, Siren } from "lucide-react";
import type { Incident } from "@/lib/incidents";
import {
  incidentAttention,
  incidentVehicleImpact,
} from "@/lib/incidentAttention";
import {
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  RESPONSIBLE_PARTIES,
  titleCase,
  toneClass,
  incidentStatusTone,
} from "../shared";
import { TabKpi, FilterSelect, AttentionReasons } from "./WorkspacePrimitives";

const NOW = new Date("2026-09-10T12:00:00");

export function IncidentsTab({
  incidents,
  totalCount,
  vehiclesDown,
  amountPending,
  attentionCount,
  search,
  setSearch,
  status,
  setStatus,
  type,
  setType,
  resp,
  setResp,
  vehicleLabel,
  vehiclePlate,
  staffName,
  onOpen,
  onLog,
}: {
  incidents: Incident[];
  totalCount: number;
  vehiclesDown: number;
  amountPending: number;
  attentionCount: number;
  search: string;
  setSearch: (s: string) => void;
  status: string;
  setStatus: (s: string) => void;
  type: string;
  setType: (s: string) => void;
  resp: string;
  setResp: (s: string) => void;
  vehicleLabel: (id: string) => string;
  vehiclePlate: (id: string) => string;
  staffName: (id: string | null) => string;
  onOpen: (id: string) => void;
  onLog: () => void;
}) {
  const open = incidents.filter((i) => i.status === "open").length;
  const inReview = incidents.filter((i) => i.status === "in_review").length;
  const damageRelated = incidents.filter(
    (i) =>
      i.incident_type === "damage_dispute" || i.incident_type === "accident",
  ).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <TabKpi label="Open" value={String(open)} tone="out" />
        <TabKpi label="In Review" value={String(inReview)} tone="maintenance" />
        <TabKpi label="Damage Related" value={String(damageRelated)} />
        <TabKpi label="Vehicles Down" value={String(vehiclesDown)} tone="out" />
        <TabKpi label="Amount Pending" value={fmtMoney(amountPending)} />
        <TabKpi
          label="Needs Attention"
          value={String(attentionCount)}
          tone="maintenance"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search incidents…"
          className="max-w-xs"
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          allLabel="All statuses"
        >
          {INCIDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={type} onChange={setType} allLabel="All types">
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {titleCase(t)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={resp}
          onChange={setResp}
          allLabel="All responsibility"
        >
          {RESPONSIBLE_PARTIES.map((p) => (
            <option key={p} value={p}>
              {titleCase(p)}
            </option>
          ))}
        </FilterSelect>
      </div>

      {incidents.length === 0 ? (
        <EmptyState
          icon={<Siren size={28} />}
          title="No incidents recorded"
          hint="Log an accident, theft, damage dispute, or breakdown to track it here."
          action={
            <Button
              onClick={onLog}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              <Plus size={16} /> Log Incident
            </Button>
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {incidents.map((i) => (
              <IncidentMobileCard
                key={i.id}
                incident={i}
                vehicleLabel={vehicleLabel}
                vehiclePlate={vehiclePlate}
                staffName={staffName}
                onOpen={() => onOpen(i.id)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Incident</th>
                  <th className="py-2 pr-3">Vehicle</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Customer / Rental</th>
                  <th className="py-2 pr-3">Occurred</th>
                  <th className="py-2 pr-3">Responsible</th>
                  <th className="py-2 pr-3">Assigned</th>
                  <th className="py-2 pr-3">Charge</th>
                  <th className="py-2 pr-3">Impact</th>
                  <th className="py-2 pr-3">Attention</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => {
                  const att = incidentAttention(i, NOW);
                  const impact = incidentVehicleImpact(i);
                  return (
                    <tr
                      key={i.id}
                      onClick={() => onOpen(i.id)}
                      className={cn(
                        "cursor-pointer border-b border-border hover:bg-surface-2",
                        toneClass[incidentStatusTone[i.status]],
                      )}
                    >
                      <td className="py-2 pr-3 font-mono text-xs">{i.id}</td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-foreground">
                          {vehicleLabel(i.vehicle_id)}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {vehiclePlate(i.vehicle_id)}
                        </p>
                      </td>
                      <td className="py-2 pr-3">
                        {titleCase(i.incident_type)}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusPill tone={incidentStatusTone[i.status]}>
                          {titleCase(i.status)}
                        </StatusPill>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {i.reservation_id ? "Linked rental" : "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {fmtDate(i.occurred_at)}
                      </td>
                      <td className="py-2 pr-3">
                        {titleCase(i.responsible_party)}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {staffName(i.assigned_staff_id)}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular">
                        {i.payment_amount > 0
                          ? fmtMoney(i.payment_amount)
                          : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {impact === "out_of_service" ? (
                          <StatusPill tone="out">Down</StatusPill>
                        ) : impact === "needs_review" ? (
                          <StatusPill tone="maintenance">Review</StatusPill>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
        Showing {incidents.length} of {totalCount} incidents
      </p>
    </div>
  );
}

function IncidentMobileCard({
  incident: i,
  vehicleLabel,
  vehiclePlate,
  staffName,
  onOpen,
}: {
  incident: Incident;
  vehicleLabel: (id: string) => string;
  vehiclePlate: (id: string) => string;
  staffName: (id: string | null) => string;
  onOpen: () => void;
}) {
  const att = incidentAttention(i, NOW);
  return (
    <button
      onClick={onOpen}
      className={cn(
        "w-full rounded-lg border border-border bg-surface p-3 text-left",
        toneClass[incidentStatusTone[i.status]],
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-semibold text-foreground">
          {titleCase(i.incident_type)}
        </span>
        <StatusPill tone={incidentStatusTone[i.status]}>
          {titleCase(i.status)}
        </StatusPill>
      </div>
      <p className="mt-1 text-sm text-foreground">
        {vehicleLabel(i.vehicle_id)} ·{" "}
        <span className="font-mono text-xs">{vehiclePlate(i.vehicle_id)}</span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {fmtDate(i.occurred_at)} · {titleCase(i.responsible_party)}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {staffName(i.assigned_staff_id)}
        </span>
        {i.payment_amount > 0 && (
          <span className="font-mono text-sm">
            {fmtMoney(i.payment_amount)}
          </span>
        )}
      </div>
      <div className="mt-2">
        <AttentionReasons level={att.level} reasons={att.reasons} />
      </div>
    </button>
  );
}
