// Connect Pro Fleet — AI Damage Review wizard step.
//
// Runs the AI comparison (via the provider abstraction — dev/mock in V1),
// shows a professional processing state, then surfaces each potential finding
// with Before/After evidence, optional bounding highlight, and staff review
// actions (Confirm / Pre-existing / Not Damage / Needs Review / Edit).
//
// Guardrails (spec §33–§37): this step NEVER confirms damage automatically,
// creates claims, bills, determines liability, takes a vehicle out of service,
// or estimates repair cost. Every finding starts as `ai_flagged` / `pending`.
// PRODUCTION AI IS NOT CONNECTED.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ScanSearch,
  ImageIcon,
  XCircle,
  Clock,
} from "lucide-react";
import type { Inspection } from "@/lib/inspectionTypes";
import type {
  AiDamageFinding,
  AiDamageType,
  AiSeverity,
  StaffDecision,
  PhotoPair,
} from "@/lib/aiDamageTypes";
import {
  AI_DAMAGE_TYPES,
  AI_DAMAGE_TYPE_LABELS,
  AI_SEVERITY_LABELS,
  AI_CONFIDENCE_LABELS,
  STAFF_DECISION_LABELS,
  AI_REPORT_STATUS_LABELS,
} from "@/lib/aiDamageTypes";
import {
  runAiAnalysis,
  applyStaffDecision,
  editFinding,
  pendingFindings,
  confirmedFindings,
  deriveReportStatus,
  type AnalysisProgress,
} from "@/lib/aiDamageSelectors";
import { isProductionAiConnected } from "@/lib/aiDamageProvider";

const SEVERITIES: AiSeverity[] = ["minor", "moderate", "major"];

export interface AiReviewStepProps {
  checkin: Inspection;
  checkout: Inspection | null;
  rentalId: string | null;
  reviewerId: string | null;
  /** Called when findings change so the wizard can persist them on submit. */
  onFindingsChange: (findings: AiDamageFinding[]) => void;
  /** Called when analysis completes (with coverage + pairs) for the report. */
  onAnalysisComplete: (result: {
    pairs: PhotoPair[];
    coverage: {
      photos_compared: number;
      angles_analyzed: number;
      angles_not_analyzed: number;
    };
    providerConnected: boolean;
    outcome: "success" | "partial" | "failed";
    failedAngles: string[];
  }) => void;
  /** Initial findings (e.g. from "Analyze Later" offline state). */
  initialFindings?: AiDamageFinding[];
  initialPairs?: PhotoPair[];
  initialCoverage?: {
    photos_compared: number;
    angles_analyzed: number;
    angles_not_analyzed: number;
  };
  initialRun?: boolean;
}

export function AiReviewStep({
  checkin,
  checkout,
  rentalId,
  reviewerId,
  onFindingsChange,
  onAnalysisComplete,
  initialFindings = [],
  initialPairs = [],
  initialCoverage,
  initialRun = false,
}: AiReviewStepProps) {
  const [findings, setFindings] = useState<AiDamageFinding[]>(initialFindings);
  const [pairs, setPairs] = useState<PhotoPair[]>(initialPairs);
  const [coverage, setCoverage] = useState(initialCoverage ?? null);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState(initialRun);
  const [outcome, setOutcome] = useState<
    "success" | "partial" | "failed" | null
  >(null);
  const [failedAngles, setFailedAngles] = useState<string[]>([]);
  const [providerConnected] = useState(isProductionAiConnected());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);

  // Notify parent whenever findings change.
  useEffect(() => {
    onFindingsChange(findings);
  }, [findings, onFindingsChange]);

  const runAnalysis = async () => {
    setRunning(true);
    setRan(true);
    setOfflineSaved(false);
    setProgress({ phase: "matching", message: "Matching photo angles…" });
    try {
      const result = await runAiAnalysis(checkin, checkout, {
        rental_id: rentalId,
        onProgress: setProgress,
      });
      setPairs(result.pairs);
      setFindings(result.findings);
      setCoverage(result.coverage);
      setOutcome(result.outcome);
      setFailedAngles(result.failedAngles);
      onAnalysisComplete({
        pairs: result.pairs,
        coverage: result.coverage,
        providerConnected: result.providerConnected,
        outcome: result.outcome,
        failedAngles: result.failedAngles,
      });
    } catch {
      // Provider failure (spec §44) — inspection remains usable.
      setOutcome("failed");
      setPairs([]);
      setFindings([]);
      setCoverage({
        photos_compared: 0,
        angles_analyzed: 0,
        angles_not_analyzed: 0,
      });
      onAnalysisComplete({
        pairs: [],
        coverage: {
          photos_compared: 0,
          angles_analyzed: 0,
          angles_not_analyzed: 0,
        },
        providerConnected,
        outcome: "failed",
        failedAngles: [],
      });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const setDecision = (id: string, decision: StaffDecision) => {
    setFindings((fs) =>
      fs.map((f) =>
        f.finding_id === id ? applyStaffDecision(f, decision, reviewerId) : f,
      ),
    );
  };

  const saveEdit = (
    id: string,
    patch: Partial<
      Pick<
        AiDamageFinding,
        "damage_type" | "severity" | "description" | "staff_notes"
      >
    >,
  ) => {
    setFindings((fs) =>
      fs.map((f) =>
        f.finding_id === id ? editFinding(f, patch, reviewerId) : f,
      ),
    );
    setEditingId(null);
  };

  const saveForLater = () => {
    // Offline / poor connection (spec §43) — mark analysis pending.
    setOfflineSaved(true);
  };

  const pending = pendingFindings(findings);
  const confirmed = confirmedFindings(findings);
  const status = coverage
    ? deriveReportStatus(findings, coverage, ran)
    : "analysis_pending";

  // --- Not yet run / offline state ---
  if (!ran && !offlineSaved) {
    return (
      <div className="space-y-4" data-testid="ai-review-initial">
        <div className="rounded-lg border border-border bg-surface-2/40 p-4 text-center">
          <ScanSearch size={32} className="mx-auto text-primary" />
          <p className="mt-2 font-display text-sm font-semibold text-foreground">
            AI Damage Review
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Compare return photos against the checkout baseline to identify
            possible new visible damage. Every finding requires staff review.
          </p>
          {!checkout ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-status-maintenance/10 px-3 py-1.5 text-xs text-status-maintenance">
              <AlertTriangle size={14} /> No checkout baseline — comparison
              can't run. Capture condition as-is.
            </p>
          ) : (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-status-available/10 px-3 py-1.5 text-xs text-status-available">
              <CheckCircle2 size={14} /> Checkout baseline found — ready to
              compare {checkin.photos?.length ?? 0} return photo(s).
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={runAnalysis}
            disabled={!checkout || running}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
            data-testid="ai-run-analysis"
          >
            <ScanSearch size={15} className="mr-1.5" /> Run AI Comparison
          </Button>
          <Button
            variant="outline"
            onClick={saveForLater}
            data-testid="ai-save-later"
          >
            <Clock size={15} className="mr-1.5" /> Save / Analyze Later
          </Button>
        </div>
        <AiDisclaimer />
      </div>
    );
  }

  // --- Offline saved state ---
  if (offlineSaved && !ran) {
    return (
      <div className="space-y-4" data-testid="ai-review-offline">
        <div className="rounded-lg border border-status-maintenance/30 bg-status-maintenance/5 p-4 text-center">
          <Clock size={32} className="mx-auto text-status-maintenance" />
          <p className="mt-2 font-display text-sm font-semibold text-foreground">
            AI Analysis Pending
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Photos are saved. You can complete the inspection now and run AI
            comparison later when connectivity is available.
          </p>
        </div>
        <Button
          onClick={runAnalysis}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
          data-testid="ai-run-analysis"
        >
          <ScanSearch size={15} className="mr-1.5" /> Run AI Comparison Now
        </Button>
        <AiDisclaimer />
      </div>
    );
  }

  // --- Running state ---
  if (running) {
    return (
      <div className="space-y-4" data-testid="ai-review-running">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-6 text-center">
          <Loader2 size={32} className="mx-auto animate-spin text-primary" />
          <p className="mt-2 font-display text-sm font-semibold text-foreground">
            Reviewing vehicle condition…
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {progress?.message ?? "Comparing Checkout and Check-In photos."}
          </p>
        </div>
        <AiDisclaimer />
      </div>
    );
  }

  // --- Provider failure ---
  if (outcome === "failed") {
    return (
      <div className="space-y-4" data-testid="ai-review-failed">
        <div className="rounded-lg border border-status-out/30 bg-status-out/5 p-4 text-center">
          <AlertTriangle size={32} className="mx-auto text-status-out" />
          <p className="mt-2 font-display text-sm font-semibold text-foreground">
            AI comparison unavailable
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your photos are saved. You can continue with manual inspection or
            try analysis again.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={runAnalysis}
            variant="outline"
            data-testid="ai-retry"
          >
            <RefreshCw size={15} className="mr-1.5" /> Retry
          </Button>
          <span className="inline-flex items-center text-xs text-muted-foreground">
            Continue with manual review below.
          </span>
        </div>
        <AiDisclaimer />
      </div>
    );
  }

  // --- Results ---
  return (
    <div className="space-y-4" data-testid="ai-review-results">
      {/* Coverage + status header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/40 p-3">
        <div>
          <p className="font-display text-sm font-semibold text-foreground">
            {AI_REPORT_STATUS_LABELS[status]}
          </p>
          <p className="text-xs text-muted-foreground">
            {coverage
              ? `${coverage.angles_analyzed} of ${coverage.angles_analyzed + coverage.angles_not_analyzed} angles analyzed`
              : ""}
            {outcome === "partial" && failedAngles.length > 0
              ? ` · ${failedAngles.length} require manual review`
              : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={runAnalysis}
          data-testid="ai-rerun"
        >
          <RefreshCw size={14} className="mr-1" /> Re-run
        </Button>
      </div>

      {/* Partial results notice */}
      {outcome === "partial" && failedAngles.length > 0 && (
        <p className="flex items-center gap-1.5 rounded-md bg-status-maintenance/10 px-3 py-2 text-xs text-status-maintenance">
          <AlertTriangle size={14} /> Partial analysis:{" "}
          {failedAngles.join(", ")} require manual review.
        </p>
      )}

      {/* No potential new damage */}
      {findings.length === 0 && (
        <div
          className="rounded-lg border border-status-available/30 bg-status-available/5 p-4 text-center"
          data-testid="ai-no-damage"
        >
          <CheckCircle2 size={32} className="mx-auto text-status-available" />
          <p className="mt-2 font-display text-sm font-semibold text-foreground">
            No Potential New Damage Detected
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI comparison did not identify a meaningful visible change between
            the available Checkout and Check-In photos.
          </p>
          <p className="mt-2 text-xs font-medium text-muted-foreground">
            Staff should still review the vehicle before completing the
            inspection.
          </p>
        </div>
      )}

      {/* Findings list */}
      {findings.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Potential Findings ({findings.length})
          </p>
          {findings.map((f) => (
            <FindingCard
              key={f.finding_id}
              finding={f}
              pairs={pairs}
              onDecision={setDecision}
              editing={editingId === f.finding_id}
              onEdit={() => setEditingId(f.finding_id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(patch) => saveEdit(f.finding_id, patch)}
            />
          ))}
        </div>
      )}

      {/* Review progress */}
      {findings.length > 0 && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="ai-review-progress"
        >
          {confirmed.length} confirmed · {pending.length} awaiting review ·{" "}
          {findings.length - confirmed.length - pending.length} resolved
        </p>
      )}

      <AiDisclaimer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finding card — Before/After evidence + staff decisions + highlight
// ---------------------------------------------------------------------------

function FindingCard({
  finding,
  pairs,
  onDecision,
  editing,
  onEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  finding: AiDamageFinding;
  pairs: PhotoPair[];
  onDecision: (id: string, decision: StaffDecision) => void;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (
    patch: Partial<
      Pick<
        AiDamageFinding,
        "damage_type" | "severity" | "description" | "staff_notes"
      >
    >,
  ) => void;
}) {
  const pair = pairs.find((p) => p.angle === finding.angle);
  const [type, setType] = useState<AiDamageType>(finding.damage_type);
  const [severity, setSeverity] = useState<AiSeverity>(finding.severity);
  const [desc, setDesc] = useState(finding.description);
  const [notes, setNotes] = useState(finding.staff_notes);

  const decision = finding.staff_decision;
  const decisionTone: Record<StaffDecision, string> = {
    pending: "bg-status-maintenance/15 text-status-maintenance",
    confirmed: "bg-status-out/15 text-status-out",
    pre_existing: "bg-kpi-blue/10 text-kpi-blue",
    not_damage: "bg-status-available/15 text-status-available",
    needs_review: "bg-status-maintenance/15 text-status-maintenance",
  };

  return (
    <div
      className="rounded-lg border border-border bg-surface p-3"
      data-testid={`ai-finding-${finding.finding_id}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {finding.approximate_location}
          </p>
          <p className="text-xs text-muted-foreground">
            {finding.angle} · {AI_DAMAGE_TYPE_LABELS[finding.damage_type]}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            decisionTone[decision],
          )}
        >
          {STAFF_DECISION_LABELS[decision]}
        </span>
      </div>

      {/* Before / After evidence */}
      <div
        className="mt-2 grid grid-cols-2 gap-2"
        data-testid={`ai-evidence-${finding.finding_id}`}
      >
        <EvidenceTile
          label="Before (Checkout)"
          photoId={finding.checkout_photo_id}
          region={finding.bounding_region}
        />
        <EvidenceTile
          label="After (Check-In)"
          photoId={finding.checkin_photo_id}
          region={finding.bounding_region}
          highlight
        />
      </div>

      {/* AI description */}
      {!editing && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-foreground">{finding.description}</p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Confidence: {AI_CONFIDENCE_LABELS[finding.confidence]}</span>
            <span>·</span>
            <span>
              AI-estimated severity: {AI_SEVERITY_LABELS[finding.severity]}
            </span>
            {finding.pre_existing_note && (
              <>
                <span>·</span>
                <span className="text-kpi-blue">
                  {finding.pre_existing_note}
                </span>
              </>
            )}
          </div>
          {finding.staff_notes && (
            <p className="mt-1 rounded bg-surface-2/60 px-2 py-1 text-xs text-foreground">
              Staff note: {finding.staff_notes}
            </p>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div
          className="mt-2 space-y-2 rounded-md border border-border bg-surface-2/40 p-2"
          data-testid={`ai-edit-${finding.finding_id}`}
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Damage type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as AiDamageType)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_DAMAGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {AI_DAMAGE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as AiSeverity)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {AI_SEVERITY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description…"
            className="h-8 text-xs"
          />
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Staff note…"
            className="h-8 text-xs"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() =>
                onSaveEdit({
                  damage_type: type,
                  severity,
                  description: desc,
                  staff_notes: notes,
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Staff review actions */}
      {!editing && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ReviewBtn
            active={decision === "confirmed"}
            onClick={() => onDecision(finding.finding_id, "confirmed")}
            testId={`ai-confirm-${finding.finding_id}`}
            tone="out"
          >
            <CheckCircle2 size={13} /> Confirm Damage
          </ReviewBtn>
          <ReviewBtn
            active={decision === "pre_existing"}
            onClick={() => onDecision(finding.finding_id, "pre_existing")}
            testId={`ai-preexisting-${finding.finding_id}`}
            tone="blue"
          >
            Pre-existing
          </ReviewBtn>
          <ReviewBtn
            active={decision === "not_damage"}
            onClick={() => onDecision(finding.finding_id, "not_damage")}
            testId={`ai-reject-${finding.finding_id}`}
            tone="available"
          >
            <XCircle size={13} /> Not Damage
          </ReviewBtn>
          <ReviewBtn
            active={decision === "needs_review"}
            onClick={() => onDecision(finding.finding_id, "needs_review")}
            testId={`ai-needsreview-${finding.finding_id}`}
            tone="maintenance"
          >
            Needs Review
          </ReviewBtn>
          <button
            onClick={onEdit}
            data-testid={`ai-editbtn-${finding.finding_id}`}
            className="rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:border-primary/40"
          >
            Edit
          </button>
        </div>
      )}
      {pair && pair.quality && !pair.quality.reliable && (
        <p className="mt-1 text-xs text-status-maintenance">
          {pair.quality.message}
        </p>
      )}
    </div>
  );
}

function EvidenceTile({
  label,
  photoId,
  region,
  highlight,
}: {
  label: string;
  photoId: string | null;
  region: { x: number; y: number; w: number; h: number } | null;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-surface-2/60">
        {photoId ? (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon size={20} className="text-muted-foreground" />
            <span className="ml-1 font-mono text-[10px] text-muted-foreground">
              {photoId}
            </span>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
            No photo
          </div>
        )}
        {highlight && region && (
          <div
            className="absolute border-2 border-status-out bg-status-out/20"
            style={{
              left: `${region.x * 100}%`,
              top: `${region.y * 100}%`,
              width: `${region.w * 100}%`,
              height: `${region.h * 100}%`,
            }}
            data-testid="ai-bounding-highlight"
          />
        )}
      </div>
    </div>
  );
}

function ReviewBtn({
  active,
  onClick,
  children,
  testId,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
  tone: "out" | "available" | "maintenance" | "blue";
}) {
  const tones: Record<string, string> = {
    out: "border-status-out bg-status-out/10 text-status-out",
    available:
      "border-status-available bg-status-available/10 text-status-available",
    maintenance:
      "border-status-maintenance bg-status-maintenance/10 text-status-maintenance",
    blue: "border-kpi-blue bg-kpi-blue/10 text-kpi-blue",
  };
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
        active
          ? tones[tone]
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AiDisclaimer() {
  return (
    <p
      className="rounded-md bg-surface-2/40 px-3 py-2 text-[11px] text-muted-foreground"
      data-testid="ai-disclaimer"
    >
      AI Damage Detection assists with visual comparison and may miss or
      incorrectly flag damage. Final inspection decisions must be reviewed by
      staff.{" "}
      {isProductionAiConnected()
        ? ""
        : "Production AI provider not yet connected."}
    </p>
  );
}
