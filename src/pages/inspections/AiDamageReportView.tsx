// Connect Pro Fleet — AI Damage Report (printable) + completion integration.
//
// Renders the Vehicle Damage Comparison Report (spec §27): vehicle, rental,
// analysis coverage, AI findings, staff decisions, final confirmed damage,
// evidence, AI-vs-human distinction (spec §29), and handoff actions
// (Create Damage Claim / Create Maintenance Work Order) — all explicit, never
// automatic. Includes a printable report view (spec §55).
//
// Guardrails: no liability, no billing, no auto out-of-service, no repair
// pricing. Vehicle availability is only a *recommendation* (spec §33).

import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui-bits";
import { cn } from "@/lib/utils";
import { fmtDateTime } from "@/lib/format";
import type { AiDamageReport, AiDamageFinding } from "@/lib/aiDamageTypes";
import {
  AI_DAMAGE_TYPE_LABELS,
  AI_SEVERITY_LABELS,
  AI_CONFIDENCE_LABELS,
  AI_REPORT_STATUS_LABELS,
  AI_FINDING_STATUS_LABELS,
  STAFF_DECISION_LABELS,
} from "@/lib/aiDamageTypes";
import {
  confirmedFindings,
  preExistingFindings,
  rejectedFindings,
  pendingFindings,
} from "@/lib/aiDamageSelectors";
import {
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Car,
  FileText,
  Printer,
  ShieldAlert,
  XCircle,
} from "lucide-react";

export interface AiDamageReportViewProps {
  report: AiDamageReport;
  vehicle: {
    id: string;
    year: number;
    make: string;
    model: string;
    license_plate: string;
  };
  reservation: { id: string; renter_name: string } | null;
  onCreateClaim: () => void;
  onCreateWorkOrder: () => void;
  onDone: () => void;
  claimCreated?: boolean;
  workOrderCreated?: boolean;
}

export function AiDamageReportView({
  report,
  vehicle,
  reservation,
  onCreateClaim,
  onCreateWorkOrder,
  onDone,
  claimCreated,
  workOrderCreated,
}: AiDamageReportViewProps) {
  const [printMode, setPrintMode] = useState(false);
  const confirmed = confirmedFindings(report.findings);
  const preExisting = preExistingFindings(report.findings);
  const rejected = rejectedFindings(report.findings);
  const pending = pendingFindings(report.findings);
  const hasConfirmed = confirmed.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="ai-report">
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border px-6 py-8 text-center",
          hasConfirmed
            ? "border-status-out/30 bg-status-out/5"
            : "border-status-available/30 bg-status-available/5",
        )}
      >
        {hasConfirmed ? (
          <AlertTriangle size={44} className="text-status-out" />
        ) : (
          <CheckCircle2 size={44} className="text-status-available" />
        )}
        <h1 className="mt-3 font-display text-2xl font-semibold text-foreground">
          Vehicle Damage Comparison Report
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {vehicle.year} {vehicle.make} {vehicle.model} ·{" "}
          {vehicle.license_plate}
        </p>
        <span className="mt-2 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-foreground">
          {AI_REPORT_STATUS_LABELS[report.status]}
        </span>
      </div>

      <SectionCard
        title="Report details"
        className={printMode ? "print:block" : ""}
      >
        <dl className="space-y-1.5 text-sm">
          <ReportRow label="Report ID">
            <span className="font-mono tabular">{report.report_id}</span>
          </ReportRow>
          <ReportRow label="Inspection">
            <span className="font-mono tabular">{report.inspection_id}</span>
          </ReportRow>
          {report.checkout_inspection_id && (
            <ReportRow label="Checkout baseline">
              <span className="font-mono tabular">
                {report.checkout_inspection_id}
              </span>
            </ReportRow>
          )}
          <ReportRow label="Vehicle">
            <Link
              to={`/vehicles/${vehicle.id}`}
              className="font-medium text-primary hover:underline"
            >
              {vehicle.year} {vehicle.make} {vehicle.model}
            </Link>
          </ReportRow>
          <ReportRow label="Customer">
            {reservation?.renter_name ?? "—"}
          </ReportRow>
          <ReportRow label="Generated">
            {fmtDateTime(report.generated_at)}
          </ReportRow>
          <ReportRow label="Reviewer">{report.reviewer_name ?? "—"}</ReportRow>
          <ReportRow label="AI provider">
            <span className="font-mono tabular">{report.provider}</span>
            {!report.provider_connected && (
              <span className="ml-1 text-xs text-status-maintenance">
                (dev/mock — production AI not connected)
              </span>
            )}
          </ReportRow>
        </dl>
      </SectionCard>

      {/* Analysis coverage */}
      <SectionCard title="Analysis coverage">
        <dl className="space-y-1.5 text-sm">
          <ReportRow label="Photos compared">
            <span className="font-mono tabular">
              {report.coverage.photos_compared}
            </span>
          </ReportRow>
          <ReportRow label="Angles analyzed">
            <span className="font-mono tabular">
              {report.coverage.angles_analyzed}
            </span>
          </ReportRow>
          <ReportRow label="Angles not analyzed">
            <span className="font-mono tabular">
              {report.coverage.angles_not_analyzed}
            </span>
          </ReportRow>
        </dl>
      </SectionCard>

      {/* AI Findings with AI-vs-human distinction */}
      {report.findings.length > 0 && (
        <SectionCard title={`AI findings (${report.findings.length})`}>
          <div className="space-y-3">
            {report.findings.map((f) => (
              <FindingReportRow key={f.finding_id} finding={f} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Staff decisions summary */}
      <SectionCard title="Staff decisions">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DecisionStat
            label="Confirmed"
            value={report.staff_summary.confirmed}
            tone="out"
          />
          <DecisionStat
            label="Pre-existing"
            value={report.staff_summary.pre_existing}
            tone="blue"
          />
          <DecisionStat
            label="Rejected"
            value={report.staff_summary.rejected}
            tone="available"
          />
          <DecisionStat
            label="Needs review"
            value={report.staff_summary.needs_review}
            tone="maintenance"
          />
        </div>
      </SectionCard>

      {/* Final confirmed damage */}
      <SectionCard title="Final confirmed damage">
        {confirmed.length > 0 ? (
          <ul className="space-y-2">
            {confirmed.map((f) => (
              <li
                key={f.finding_id}
                className="rounded-md border border-status-out/30 bg-status-out/5 p-2"
              >
                <p className="text-sm font-medium text-foreground">
                  {f.approximate_location} ·{" "}
                  {AI_DAMAGE_TYPE_LABELS[f.damage_type]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {AI_SEVERITY_LABELS[f.severity]} severity · {f.description}
                </p>
                {f.staff_notes && (
                  <p className="mt-1 text-xs text-foreground">
                    Staff: {f.staff_notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="inline-flex items-center gap-1 text-sm text-status-available">
            <CheckCircle2 size={14} /> No human-confirmed new damage.
          </p>
        )}
      </SectionCard>

      {/* Vehicle availability recommendation (NOT an action) */}
      {hasConfirmed && (
        <div
          className="rounded-lg border border-status-maintenance/30 bg-status-maintenance/5 p-3"
          data-testid="ai-availability-rec"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-status-maintenance">
            <ShieldAlert size={15} /> Vehicle Availability Review Recommended
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Visible damage may require maintenance review. AI does not determine
            operational status — choose vehicle availability explicitly.
          </p>
        </div>
      )}

      {/* Handoff actions */}
      <div className="flex flex-wrap gap-2">
        {hasConfirmed && !claimCreated && (
          <Button
            onClick={onCreateClaim}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
            data-testid="report-create-claim"
          >
            <AlertTriangle size={15} className="mr-1.5" /> Create Damage Claim
          </Button>
        )}
        {claimCreated && (
          <span className="inline-flex items-center gap-1 rounded-md bg-status-available/10 px-3 py-1.5 text-sm text-status-available">
            <CheckCircle2 size={14} /> Damage claim created
          </span>
        )}
        {hasConfirmed && !workOrderCreated && (
          <Button
            variant="outline"
            onClick={onCreateWorkOrder}
            data-testid="report-create-wo"
          >
            <Wrench size={15} className="mr-1.5" /> Create Maintenance Work
            Order
          </Button>
        )}
        {workOrderCreated && (
          <span className="inline-flex items-center gap-1 rounded-md bg-status-available/10 px-3 py-1.5 text-sm text-status-available">
            <CheckCircle2 size={14} /> Work order created
          </span>
        )}
        <Button
          variant="outline"
          onClick={() => setPrintMode((p) => !p)}
          data-testid="report-print"
        >
          <Printer size={15} className="mr-1.5" /> Printable view
        </Button>
        <Link to={`/vehicles/${vehicle.id}`}>
          <Button variant="outline">
            <Car size={15} className="mr-1.5" /> View Vehicle
          </Button>
        </Link>
        {reservation && (
          <Link to={`/reservations/${reservation.id}`}>
            <Button variant="ghost">
              <FileText size={15} className="mr-1.5" /> View Reservation
            </Button>
          </Link>
        )}
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>

      <p
        className="text-[11px] text-muted-foreground"
        data-testid="report-disclaimer"
      >
        AI Damage Detection assists with visual comparison only. It does not
        determine liability, assess fees, estimate repair cost, or declare a
        vehicle safe. Final decisions are made by authorized staff.
      </p>
    </div>
  );
}

function FindingReportRow({ finding }: { finding: AiDamageFinding }) {
  return (
    <div
      className="rounded-md border border-border bg-surface-2/40 p-2"
      data-testid={`report-finding-${finding.finding_id}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {finding.approximate_location}
        </span>
        <span className="text-xs text-muted-foreground">{finding.angle}</span>
      </div>
      <div className="mt-1 space-y-0.5 text-xs">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">AI Finding:</span>{" "}
          {AI_DAMAGE_TYPE_LABELS[finding.damage_type]} ·{" "}
          {AI_SEVERITY_LABELS[finding.severity]} (AI-estimated) ·{" "}
          {AI_CONFIDENCE_LABELS[finding.confidence]}
        </p>
        <p className="text-muted-foreground">{finding.description}</p>
        <p className="text-foreground">
          <span className="font-medium text-muted-foreground">
            Staff Decision:
          </span>{" "}
          {STAFF_DECISION_LABELS[finding.staff_decision]} ·{" "}
          {AI_FINDING_STATUS_LABELS[finding.ai_status]}
        </p>
        {finding.staff_notes && (
          <p className="text-foreground">Staff note: {finding.staff_notes}</p>
        )}
      </div>
    </div>
  );
}

function ReportRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{children}</dd>
    </div>
  );
}

function DecisionStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "out" | "available" | "maintenance" | "blue";
}) {
  const tones: Record<string, string> = {
    out: "text-status-out",
    available: "text-status-available",
    maintenance: "text-status-maintenance",
    blue: "text-kpi-blue",
  };
  return (
    <div className="rounded-md border border-border bg-surface-2/40 p-2 text-center">
      <p className={cn("text-xl font-bold tabular", tones[tone])}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
