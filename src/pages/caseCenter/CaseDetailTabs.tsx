// Connect Pro Fleet — Case Center detail tab components (Build #55 / #57).
// Split from CaseDetail.tsx to keep files focused. These render the TIMELINE,
// FINANCIALS, EVIDENCE, TASKS, and OUTCOME tabs. All link to authoritative
// records — none duplicate them.
//
// Build #57 polish: Financials tab is case-aware (only relevant authoritative
// lines, no misleading $0 fields), Tasks tab shows rich rows + Add/View Task
// (reuses authoritative Task system), and the Outcome tab shows Resolution
// Readiness with exact blockers before allowing resolution.

import { Link } from "@/lib/router-compat";
import {
  deriveCaseFinancialLines,
  deriveResolutionReadiness,
  getCaseTimeline,
  type CaseFinancialLine,
} from "@/lib/caseCenterSelectors";
import {
  CASE_RESPONSIBILITY_LABELS,
  type CaseRecord,
  type CaseOutcome,
} from "@/lib/caseCenterTypes";
import {
  CASE_EVIDENCE_REQUIREMENTS,
  EVIDENCE_STATUS_LABELS,
  resolveEvidenceStatus,
  type EvidenceKey,
  type EvidenceResolutionInputs,
  type EvidenceStatus,
  type EvidenceTier,
} from "@/lib/caseCenterEvidence";
import { SectionCard, DataLabel, DataValue } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  type Task,
} from "@/lib/taskTypes";

import type { CaseCenterSources } from "@/lib/caseCenterTypes";

type CaseSrc = Pick<
  CaseCenterSources,
  "violations" | "incidents" | "damageClaims" | "tasks"
>;

export function TimelineTab({
  timeline,
}: {
  timeline: ReturnType<typeof getCaseTimeline>;
}) {
  if (timeline.length === 0) {
    return (
      <SectionCard title="Timeline">
        <p className="text-sm text-muted-foreground">No events recorded.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Case Timeline">
      <ol className="space-y-3">
        {timeline.map((e) => (
          <li key={e.id} className="flex gap-3">
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
            <div>
              <p className="text-sm font-medium text-foreground">{e.label}</p>
              <p className="text-xs text-muted-foreground">
                {fmtDateTime(e.at)}
                {e.actor_id ? ` · by ${e.actor_id}` : " · system"}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

export function FinancialsTab({
  caseRecord,
  src,
}: {
  caseRecord: CaseRecord;
  src: CaseCenterSources;
}) {
  const lines = deriveCaseFinancialLines(caseRecord, src);
  return (
    <SectionCard
      title="Financial Summary"
      right={
        <span className="text-xs text-muted-foreground">
          Derived from authoritative ledger links
        </span>
      }
    >
      <p className="mb-4 text-xs text-muted-foreground">
        Case Center is not a second ledger. Only the authoritative records
        relevant to this case type are shown — irrelevant figures are omitted,
        never displayed as misleading $0.
      </p>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No financial activity is linked to this case yet. Authoritative
          charges, payments, deposits, expenses, and refunds created in their
          normal modules will appear here automatically once linked.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          {lines.map((l) => (
            <FinancialLine key={l.key} line={l} />
          ))}
        </dl>
      )}
    </SectionCard>
  );
}

function FinancialLine({ line }: { line: CaseFinancialLine }) {
  return (
    <div>
      <DataLabel>{line.label}</DataLabel>
      <DataValue
        className={cn(
          "font-medium",
          line.emphasis && "font-semibold text-primary",
        )}
      >
        {fmtMoney(line.amount)}
      </DataValue>
      {line.hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
          {line.hint}
        </p>
      )}
    </div>
  );
}

export function EvidenceTab({
  caseRecord,
  src,
}: {
  caseRecord: CaseRecord;
  src: CaseSrc;
}) {
  const requirements = CASE_EVIDENCE_REQUIREMENTS[caseRecord.category] ?? [];
  const links = caseRecord.evidence_links;
  const fl = caseRecord.financial_links;
  const violation = links.violation_id
    ? src.violations.find((v) => v.id === links.violation_id)
    : null;
  const incident = links.incident_id
    ? src.incidents.find((i) => i.id === links.incident_id)
    : null;
  const damageClaim = links.damage_claim_id
    ? src.damageClaims.find((d) => d.id === links.damage_claim_id)
    : null;

  const inputs: EvidenceResolutionInputs = {
    rental_id: caseRecord.rental_id,
    customer_charge_ids: fl.customer_charge_ids,
    payment_ids: fl.payment_ids,
    deposit_application_ids: fl.deposit_application_ids,
    refund_ids: fl.refund_ids,
    expense_ids: fl.expense_ids,
    insurance_claim_refs: fl.insurance_claim_refs,
    violation_present: !!violation,
    violation_number: violation?.violation_number ?? null,
    incident_present: !!incident,
    damage_claim_present: !!damageClaim,
    damage_claim_number: damageClaim?.claim_number ?? null,
    inspection_ids: links.inspection_ids,
    vault_doc_refs: links.vault_doc_refs,
    uploaded_file_refs: links.uploaded_file_refs,
    possession_match: caseRecord.toll_detail?.possession_match ?? null,
    maintenance_work_order_id:
      caseRecord.roadside_detail?.maintenance_work_order_id ?? null,
  };

  const required = requirements.filter((r) => r.tier === "required");
  const supporting = requirements.filter((r) => r.tier === "supporting");

  return (
    <SectionCard
      title="Evidence"
      right={
        <span className="text-xs text-muted-foreground">
          Linked authoritative records · case-type aware
        </span>
      }
    >
      <div className="space-y-6">
        <EvidenceGroup
          title="Required Evidence"
          items={required}
          inputs={inputs}
        />
        <EvidenceGroup
          title="Supporting Evidence"
          items={supporting}
          inputs={inputs}
        />
      </div>
    </SectionCard>
  );
}

function EvidenceGroup({
  title,
  items,
  inputs,
}: {
  title: string;
  items: { key: EvidenceKey; label: string; tier: EvidenceTier }[];
  inputs: EvidenceResolutionInputs;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-1">
        {items.map((req) => {
          const r = resolveEvidenceStatus(req.key, inputs);
          return (
            <EvidenceRow
              key={req.key}
              label={req.label}
              status={r.status}
              value={r.value}
              link={r.link}
            />
          );
        })}
      </div>
    </div>
  );
}

function EvidenceRow({
  label,
  status,
  value,
  link,
}: {
  label: string;
  status: EvidenceStatus;
  value: string;
  link: string | null;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-xs font-medium",
            status === "on_file" && "text-foreground",
            status === "missing" && "text-destructive",
            status === "not_applicable" && "text-muted-foreground/70",
          )}
        >
          {EVIDENCE_STATUS_LABELS[status]}
        </span>
        {link && status === "on_file" ? (
          <Link to={link} className="text-sm text-primary underline">
            {value}
          </Link>
        ) : (
          <span className="text-sm font-medium text-foreground">{value}</span>
        )}
      </div>
    </div>
  );
}

export function TasksTab({
  caseTasks,
  canEdit,
}: {
  caseTasks: Task[];
  canEdit: boolean;
}) {
  return (
    <SectionCard
      title="Case Tasks"
      count={caseTasks.length}
      right={
        <span className="text-xs text-muted-foreground">
          Reuses authoritative Task system
        </span>
      }
    >
      {caseTasks.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No open tasks for this case. Tasks are created in the Tasks module
            and linked here — Case Center does not maintain separate tasks.
          </p>
          {canEdit && (
            <Button asChild variant="outline" size="sm">
              <Link to="/tasks">Add Task</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {caseTasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
          {canEdit && (
            <div className="pt-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/tasks">Add Task</Link>
              </Button>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {task.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {task.entity_label ?? "—"}
          {task.due_date ? ` · Due ${fmtDate(task.due_date)}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs">
        <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
          {TASK_STATUS_LABELS[task.status]}
        </span>
        <span className="rounded-full bg-muted/60 px-2 py-0.5 text-muted-foreground">
          {TASK_PRIORITY_LABELS[task.priority]}
        </span>
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Link to="/tasks">View Task</Link>
        </Button>
      </div>
    </div>
  );
}

export function OutcomeTab({
  caseRecord,
  src,
  caseTasks,
  canResolve,
  onResolve,
}: {
  caseRecord: CaseRecord;
  src: CaseCenterSources;
  caseTasks: Task[];
  canResolve: boolean;
  onResolve: () => void;
}) {
  const outcome = caseRecord.outcome;
  const isResolved =
    caseRecord.status === "resolved" || caseRecord.status === "closed";

  return (
    <SectionCard title="Outcome">
      {isResolved && outcome ? (
        <ResolvedOutcome outcome={outcome} caseRecord={caseRecord} />
      ) : (
        <ResolutionReadinessSection
          caseRecord={caseRecord}
          src={src}
          caseTasks={caseTasks}
          canResolve={canResolve}
          onResolve={onResolve}
        />
      )}
    </SectionCard>
  );
}

function ResolvedOutcome({
  outcome,
  caseRecord,
}: {
  outcome: CaseOutcome;
  caseRecord: CaseRecord;
}) {
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        This case is resolved. Linked balances and financial records are
        preserved — closing a case does NOT erase them.
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <div>
          <DataLabel>Outcome</DataLabel>
          <DataValue>{outcome.outcome ?? "—"}</DataValue>
        </div>
        <div>
          <DataLabel>Responsibility</DataLabel>
          <DataValue>
            {outcome.responsibility
              ? CASE_RESPONSIBILITY_LABELS[outcome.responsibility.determination]
              : "—"}
          </DataValue>
        </div>
        <div>
          <DataLabel>Amount Recovered</DataLabel>
          <DataValue>{fmtMoney(outcome.amount_recovered)}</DataValue>
        </div>
        <div>
          <DataLabel>Unrecovered</DataLabel>
          <DataValue>{fmtMoney(outcome.unrecovered_amount)}</DataValue>
        </div>
        <div>
          <DataLabel>Resolved By</DataLabel>
          <DataValue>{outcome.resolved_by ?? "—"}</DataValue>
        </div>
        <div>
          <DataLabel>Resolved At</DataLabel>
          <DataValue>
            {outcome.resolved_at ? fmtDateTime(outcome.resolved_at) : "—"}
          </DataValue>
        </div>
        {outcome.final_notes && (
          <div className="col-span-full">
            <DataLabel>Final Notes</DataLabel>
            <DataValue>{outcome.final_notes}</DataValue>
          </div>
        )}
      </dl>
      {caseRecord.resolved_at && (
        <p className="text-xs text-muted-foreground">
          Resolved {fmtDateTime(caseRecord.resolved_at)} — linked financial
          records remain on file in their authoritative ledgers.
        </p>
      )}
    </div>
  );
}

function ResolutionReadinessSection({
  caseRecord,
  src,
  caseTasks,
  canResolve,
  onResolve,
}: {
  caseRecord: CaseRecord;
  src: CaseCenterSources;
  caseTasks: Task[];
  canResolve: boolean;
  onResolve: () => void;
}) {
  const readiness = deriveResolutionReadiness(caseRecord, src, caseTasks);
  return (
    <div className="space-y-4">
      <div>
        <DataLabel>Current Status</DataLabel>
        <DataValue className="mt-1">
          {caseRecord.status.replace(/_/g, " ")}
        </DataValue>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Resolution Readiness
        </p>
        <ul className="space-y-1.5">
          {readiness.items.map((item) => (
            <li
              key={item.key}
              className="flex items-start justify-between gap-3 border-b border-border/60 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">{item.label}</p>
                {!item.ready && item.blocker && (
                  <p className="mt-0.5 text-xs text-destructive">
                    {item.blocker}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  "shrink-0 text-xs font-medium",
                  item.ready ? "text-status-available" : "text-destructive",
                )}
              >
                {item.ready ? "Ready" : "Blocking"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {readiness.eligible ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            All resolution requirements are complete. Resolving records the
            outcome but does NOT erase linked balances or financial records.
          </p>
          {canResolve ? (
            <Button onClick={onResolve} size="sm">
              Resolve Case
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              You do not have permission to resolve this case.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <p className="text-xs font-medium text-destructive">
            Cannot resolve yet — {readiness.blockers.length} blocking{" "}
            {readiness.blockers.length === 1 ? "item" : "items"}:
          </p>
          <ul className="mt-1.5 space-y-1">
            {readiness.blockers.map((b, i) => (
              <li key={i} className="text-xs text-destructive/90">
                • {b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
