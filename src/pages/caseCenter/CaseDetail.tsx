// Connect Pro Fleet — Case Center detail (Build #54 / polish #55).
// Tabbed workspace: SUMMARY, TIMELINE, FINANCIALS, EVIDENCE, TASKS, OUTCOME.
// Links to authoritative records — never duplicates them.
//
// Founder UX polish: human-readable issue title is the primary heading (case #
// secondary), Summary tab has a derived "Next Action" section, and the Evidence
// tab is case-type aware (Required / Supporting, "Not applicable" instead of a
// wall of "Not on file"). Tab bodies live in CaseDetailTabs.tsx.

import { Link } from "@/lib/router-compat";
import { useState } from "react";
import { useCaseCenterSources } from "@/lib/useCaseCenterSources";
import { useCaseCenter } from "@/lib/store/caseCenterStore";
import {
  deriveCaseFinancialSummary,
  getCaseTimeline,
  casesForRental,
} from "@/lib/caseCenterSelectors";
import type { CaseRecord, CaseOutcome } from "@/lib/caseCenterTypes";
import { SectionCard, DataLabel, DataValue } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import { SYSTEM_ROLE_PERMISSIONS } from "@/lib/rolePermissions";
import {
  CaseStatusPill,
  CaseCategoryPill,
  CaseResponsibilityPill,
  CasePriorityPill,
} from "./shared";
import {
  TimelineTab,
  FinancialsTab,
  EvidenceTab,
  TasksTab,
  OutcomeTab,
} from "./CaseDetailTabs";

type CaseSrc = ReturnType<typeof useCaseCenterSources>;

export function CaseDetail({ caseId }: { caseId: string }) {
  const src = useCaseCenterSources();
  const cc = useCaseCenter();
  const [, setResolving] = useState(false);
  const caseRecord = src.cases.find((c) => c.id === caseId) ?? null;

  // Permission resolution (reuses authoritative permissions — case perms never
  // bypass finance perms). Resolved from the seeded staff role so the demo
  // reflects real role gating; production wires the same can() helper.
  const currentStaff = src.staff.find((s) => s.id === "stf_1") ?? null;
  const staffRole = currentStaff?.role ?? "user";
  const rolePerms =
    SYSTEM_ROLE_PERMISSIONS[staffRole] ?? SYSTEM_ROLE_PERMISSIONS.user;
  const overrides =
    (currentStaff?.permission_overrides as Record<string, unknown> | null) ??
    null;
  const perms = overrides
    ? {
        ...rolePerms,
        ...Object.fromEntries(
          Object.entries(overrides).filter(([, v]) => typeof v === "boolean"),
        ),
      }
    : rolePerms;
  const canEdit = !!perms["case.edit"];
  const canResolve = !!perms["case.resolve"];

  const handleResolve = () => {
    if (!caseRecord || !canResolve) return;
    setResolving(true);
    const outcome: CaseOutcome = {
      outcome: "Resolved",
      responsibility: caseRecord.responsibility,
      amount_recovered: 0,
      unrecovered_amount: caseRecord.amount_at_issue,
      final_notes: "Resolved via Case Center — linked records preserved.",
      resolved_by: "stf_1",
      resolved_at: new Date().toISOString(),
    };
    cc.resolveCase(caseRecord.id, outcome, "stf_1");
    setResolving(false);
  };

  if (!caseRecord) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Case not found.{" "}
        <Link to="/case-center" className="text-primary underline">
          Back to Case Center
        </Link>
      </div>
    );
  }

  const customer = caseRecord.customer_id
    ? src.customers.find((c) => c.id === caseRecord.customer_id)
    : null;
  const vehicle = caseRecord.vehicle_id
    ? src.vehicles.find((v) => v.id === caseRecord.vehicle_id)
    : null;
  const rental = caseRecord.rental_id
    ? src.rentals.find((r) => r.id === caseRecord.rental_id)
    : null;
  const assignedStaff = caseRecord.assigned_staff_id
    ? src.staff.find((s) => s.id === caseRecord.assigned_staff_id)
    : null;
  const timeline = getCaseTimeline(caseId, src.caseEvents);
  const fin = deriveCaseFinancialSummary(caseRecord, src);
  void fin;
  const relatedCases = caseRecord.rental_id
    ? casesForRental(caseRecord.rental_id, src.cases).filter(
        (c) => c.id !== caseId,
      )
    : [];
  const caseTasks = src.tasks.filter((t) => caseTaskMatches(t, caseRecord));

  const customerName = customer
    ? `${customer.first_name} ${customer.last_name}`
    : null;
  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/case-center"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Case Center
        </Link>
      </div>

      {/* Header — issue title primary, case # + context secondary */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {caseRecord.title}
            </h1>
            <CaseStatusPill status={caseRecord.status} />
            <CasePriorityPill priority={caseRecord.priority} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {caseRecord.case_number} · {customerName ?? "Unknown customer"} ·{" "}
            {vehicleLabel ?? "Unknown vehicle"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {caseRecord.rental_id && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/rentals/${caseRecord.rental_id}`}>
                View Rental Record
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="outcome">Outcome</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 space-y-4">
          <NextActionSection
            caseRecord={caseRecord}
            assignedStaffName={assignedStaff?.full_name ?? null}
            caseTasks={caseTasks}
          />
          <SummaryTab
            caseRecord={caseRecord}
            customerName={customerName}
            vehicleLabel={vehicleLabel}
            rentalNumber={rental?.agreement_number ?? null}
            assignedStaffName={assignedStaff?.full_name ?? null}
            relatedCases={relatedCases}
          />
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <TimelineTab timeline={timeline} />
        </TabsContent>

        <TabsContent value="financials" className="mt-4">
          <FinancialsTab caseRecord={caseRecord} src={src} />
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          <EvidenceTab caseRecord={caseRecord} src={src} />
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <TasksTab caseTasks={caseTasks} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="outcome" className="mt-4">
          <OutcomeTab
            caseRecord={caseRecord}
            src={src}
            caseTasks={caseTasks}
            canResolve={canResolve}
            onResolve={handleResolve}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Derive whether an authoritative Task relates to this case. Tasks link by
 *  entity (rental/customer/violation/incident/damage_claim) — matched against
 *  the case's linked entities. Reuses the authoritative Task system.
 *
 *  Build #57: vehicle-only tasks are NOT surfaced on a case unless they are
 *  explicitly case-tagged — otherwise unrelated operational tasks (e.g.
 *  "Prepare vehicle for pickup") would appear on every case sharing that
 *  vehicle. A task tagged "case" is treated as case-related. */
function caseTaskMatches(
  task: {
    entity_type: string | null;
    entity_id: string | null;
    tags?: string[];
  },
  c: CaseRecord,
): boolean {
  const et = task.entity_type;
  const eid = task.entity_id;
  if (!et || !eid) return false;
  if (et === "rental" && eid === c.rental_id) return true;
  if (et === "customer" && eid === c.customer_id) return true;
  if (et === "violation" && eid === c.evidence_links.violation_id) return true;
  if (et === "incident" && eid === c.evidence_links.incident_id) return true;
  if (et === "damage_claim" && eid === c.evidence_links.damage_claim_id)
    return true;
  // Vehicle tasks are only case-related when explicitly tagged "case".
  if (et === "vehicle" && eid === c.vehicle_id) {
    return (task.tags ?? []).includes("case");
  }
  return false;
}

/** Derive the next action from case state + linked authoritative tasks. Does
 *  NOT create a second task system — reads existing case state + Task store. */
function deriveNextAction(
  c: CaseRecord,
  caseTasks: { status: string; title: string; due_date: string | null }[],
): { action: string; due: string | null; taskTitle: string | null } | null {
  const openTask = caseTasks.find(
    (t) => t.status === "open" || t.status === "in_progress",
  );
  if (openTask) {
    return {
      action: openTask.title,
      due: openTask.due_date,
      taskTitle: openTask.title,
    };
  }
  const statusAction: Partial<Record<string, string>> = {
    new: "Review case details and assign responsibility",
    needs_review: "Review evidence and determine responsibility",
    awaiting_documentation: "Request or locate missing documentation",
    awaiting_customer: "Follow up with the customer",
    action_required: "Take required action to move the case forward",
    recovery_pending: "Track outstanding recovery against linked charges",
    disputed: "Review the dispute and respond to the customer",
  };
  const action = statusAction[c.status];
  if (action) return { action, due: c.due_date, taskTitle: null };
  return null;
}

function NextActionSection({
  caseRecord,
  assignedStaffName,
  caseTasks,
}: {
  caseRecord: CaseRecord;
  assignedStaffName: string | null;
  caseTasks: { status: string; title: string; due_date: string | null }[];
}) {
  const next = deriveNextAction(caseRecord, caseTasks);
  if (!next) {
    return (
      <SectionCard title="Next Action">
        <p className="text-sm text-muted-foreground">
          No outstanding action. This case is{" "}
          {caseRecord.status === "resolved" || caseRecord.status === "closed"
            ? `${caseRecord.status}.`
            : "up to date."}
        </p>
      </SectionCard>
    );
  }
  return (
    <SectionCard
      title="Next Action"
      right={
        <span className="text-xs text-muted-foreground">
          Derived from case state + linked tasks
        </span>
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <div className="col-span-2">
          <DataLabel>Action Required</DataLabel>
          <DataValue className="font-medium">{next.action}</DataValue>
        </div>
        <div>
          <DataLabel>Assigned To</DataLabel>
          <DataValue>{assignedStaffName ?? "Unassigned"}</DataValue>
        </div>
        <div>
          <DataLabel>Due Date</DataLabel>
          <DataValue>{next.due ? fmtDate(next.due) : "—"}</DataValue>
        </div>
        {next.taskTitle && (
          <div className="col-span-2 sm:col-span-4">
            <DataLabel>Related Task</DataLabel>
            <DataValue className="text-muted-foreground">
              {next.taskTitle} · linked via authoritative Task system
            </DataValue>
          </div>
        )}
      </dl>
    </SectionCard>
  );
}

function SummaryTab({
  caseRecord,
  customerName,
  vehicleLabel,
  rentalNumber,
  assignedStaffName,
  relatedCases,
}: {
  caseRecord: CaseRecord;
  customerName: string | null;
  vehicleLabel: string | null;
  rentalNumber: string | null;
  assignedStaffName: string | null;
  relatedCases: CaseRecord[];
}) {
  return (
    <SectionCard title="Case Summary">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <div>
          <DataLabel>Case Number</DataLabel>
          <DataValue mono>{caseRecord.case_number}</DataValue>
        </div>
        <div>
          <DataLabel>Category</DataLabel>
          <DataValue>
            <CaseCategoryPill category={caseRecord.category} />
          </DataValue>
        </div>
        <div>
          <DataLabel>Status</DataLabel>
          <DataValue>
            <CaseStatusPill status={caseRecord.status} />
          </DataValue>
        </div>
        <div>
          <DataLabel>Customer</DataLabel>
          <DataValue>
            {caseRecord.customer_id ? (
              <Link
                to={`/customers/${caseRecord.customer_id}`}
                className="text-primary underline"
              >
                {customerName ?? "Unknown"}
              </Link>
            ) : (
              "—"
            )}
          </DataValue>
        </div>
        <div>
          <DataLabel>Vehicle</DataLabel>
          <DataValue>{vehicleLabel ?? "—"}</DataValue>
        </div>
        <div>
          <DataLabel>Rental</DataLabel>
          <DataValue>
            {caseRecord.rental_id ? (
              <Link
                to={`/rentals/${caseRecord.rental_id}`}
                className="text-primary underline"
              >
                {rentalNumber ?? caseRecord.rental_id}
              </Link>
            ) : (
              "—"
            )}
          </DataValue>
        </div>
        <div>
          <DataLabel>Event Date</DataLabel>
          <DataValue>
            {caseRecord.event_date ? fmtDateTime(caseRecord.event_date) : "—"}
          </DataValue>
        </div>
        <div>
          <DataLabel>Amount at Issue</DataLabel>
          <DataValue>{fmtMoney(caseRecord.amount_at_issue)}</DataValue>
        </div>
        <div>
          <DataLabel>Responsibility</DataLabel>
          <DataValue>
            <CaseResponsibilityPill
              responsibility={caseRecord.responsibility.determination}
            />
          </DataValue>
        </div>
        <div>
          <DataLabel>Assigned To</DataLabel>
          <DataValue>{assignedStaffName ?? "Unassigned"}</DataValue>
        </div>
        <div>
          <DataLabel>Due Date</DataLabel>
          <DataValue>
            {caseRecord.due_date ? fmtDate(caseRecord.due_date) : "—"}
          </DataValue>
        </div>
        <div>
          <DataLabel>Last Activity</DataLabel>
          <DataValue>{fmtDateTime(caseRecord.last_activity_at)}</DataValue>
        </div>
      </dl>
      {caseRecord.description && (
        <div className="mt-6 border-t border-border/80 pt-4">
          <DataLabel>Description</DataLabel>
          <DataValue>{caseRecord.description}</DataValue>
        </div>
      )}
      {relatedCases.length > 0 && (
        <div className="mt-6 border-t border-border/80 pt-4">
          <DataLabel>Related Cases</DataLabel>
          <div className="mt-2 space-y-1">
            {relatedCases.map((c) => (
              <Link
                key={c.id}
                to={`/case-center/${c.id}`}
                className="block text-sm text-primary underline"
              >
                {c.case_number} — {c.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
