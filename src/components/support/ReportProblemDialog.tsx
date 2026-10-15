// Connect Pro Fleet — Report a Problem dialog (Build #31).
//
// Reusable, globally accessible dialog for reporting a problem, bug, or
// feature request. Auto-captures safe context (route, product area) when
// opened from a page. Diagnostics are sanitized BEFORE storage — no tokens,
// API keys, or sensitive document values. Creates a support ticket via the
// SupportProvider.

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore } from "@/lib/store";
import { useSupport } from "@/lib/supportStore";
import { buildDiagnosticsSnapshot } from "@/lib/supportDiagnostics";
import { TENANT_ID } from "@/lib/store/ids";
import type {
  SupportTicketType,
  SupportCategory,
  SupportPriority,
  BugSeverity,
  ReportProblemInput,
} from "@/lib/supportTypes";
import { toast } from "sonner";

const TICKET_TYPES: { value: SupportTicketType; label: string }[] = [
  { value: "question", label: "Question" },
  { value: "problem", label: "Problem" },
  { value: "bug_report", label: "Bug Report" },
  { value: "feature_request", label: "Feature Request" },
  { value: "account_help", label: "Account Help" },
  { value: "data_issue", label: "Data Issue" },
  { value: "integration_issue", label: "Integration Issue" },
  { value: "other", label: "Other" },
];

const CATEGORIES: { value: SupportCategory; label: string }[] = [
  { value: "customers", label: "Customers" },
  { value: "rentals", label: "Rentals" },
  { value: "reservations", label: "Reservations" },
  { value: "vehicles", label: "Vehicles" },
  { value: "payments", label: "Payments" },
  { value: "billing", label: "Billing" },
  { value: "maintenance", label: "Maintenance" },
  { value: "damage", label: "Damage" },
  { value: "violations", label: "Violations" },
  { value: "compliance", label: "Compliance" },
  { value: "documents", label: "Documents" },
  { value: "reports", label: "Reports" },
  { value: "dashboard", label: "Dashboard" },
  { value: "copilot", label: "Copilot" },
  { value: "staff_permissions", label: "Staff & Permissions" },
  { value: "settings", label: "Settings" },
  { value: "integrations", label: "Integrations" },
  { value: "login_access", label: "Login / Access" },
  { value: "performance", label: "Performance" },
  { value: "other", label: "Other" },
];

const PRIORITIES: { value: SupportPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const SEVERITIES: { value: BugSeverity; label: string }[] = [
  { value: "minor", label: "Minor — visual issue" },
  { value: "major", label: "Major — workflow impaired" },
  { value: "blocking", label: "Blocking — cannot complete critical operation" },
];

export interface ReportProblemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Route the dialog was opened from (auto-captured). */
  routeContext?: string | null;
  /** Product area hint. */
  productArea?: string;
  /** Pre-filled subject (e.g. from a failed search). */
  initialSubject?: string;
  /** Entity context if opened from an entity page. */
  entityContext?: {
    entity_type: string;
    entity_id: string;
    human_label: string;
    deep_link: string;
  } | null;
}

export function ReportProblemDialog({
  open,
  onOpenChange,
  routeContext,
  productArea = "other",
  initialSubject = "",
  entityContext = null,
}: ReportProblemDialogProps) {
  const store = useStore();
  const support = useSupport();
  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);

  const [subject, setSubject] = useState(initialSubject);
  const [whatHappened, setWhatHappened] = useState("");
  const [whatTryingToDo, setWhatTryingToDo] = useState("");
  const [ticketType, setTicketType] = useState<SupportTicketType>("problem");
  const [category, setCategory] = useState<SupportCategory>("other");
  const [priority, setPriority] = useState<SupportPriority>("normal");
  const [bugSeverity, setBugSeverity] = useState<BugSeverity | "">("");
  const [reproducible, setReproducible] = useState<boolean | null>(null);
  const [reproSteps, setReproSteps] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);

  function reset() {
    setSubject("");
    setWhatHappened("");
    setWhatTryingToDo("");
    setTicketType("problem");
    setCategory("other");
    setPriority("normal");
    setBugSeverity("");
    setReproducible(null);
    setReproSteps("");
    setIncludeDiagnostics(true);
  }

  function handleSubmit() {
    if (!subject.trim() || !whatHappened.trim()) {
      toast.error("Please add a subject and describe what happened.");
      return;
    }
    let diagnosticsId: string | null = null;
    if (includeDiagnostics) {
      const snap = buildDiagnosticsSnapshot({
        tenantId: TENANT_ID,
        userId: store.currentStaffId,
        route: routeContext ?? null,
        selectedLocationId: null,
      });
      support.storeDiagnostics(snap);
      diagnosticsId = snap.id;
    }
    const report: ReportProblemInput = {
      subject: subject.trim(),
      description: whatHappened.trim(),
      what_happened: whatHappened.trim(),
      what_trying_to_do: whatTryingToDo.trim(),
      ticket_type: ticketType,
      category,
      product_area: productArea,
      priority,
      bug_severity: bugSeverity || null,
      reproducible,
      repro_steps: reproSteps.trim() || null,
      screenshot_ref: null,
      contact_preference: null,
      include_diagnostics: includeDiagnostics,
      entity_context: entityContext,
      route_context: routeContext ?? null,
    };
    const ticket = support.createTicketFromReport(
      TENANT_ID,
      store.currentStaffId,
      currentStaff?.full_name ?? "Unknown",
      report,
      diagnosticsId,
    );
    toast.success(`Support request ${ticket.ticket_number} created.`);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>
            Tell us what happened. Safe diagnostics (route, version, browser)
            can be included — no tokens or sensitive data are ever captured.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rp-subject">Subject</Label>
            <Input
              id="rp-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of the issue"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={ticketType}
                onValueChange={(v) => setTicketType(v as SupportTicketType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as SupportCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rp-what-happened">What happened?</Label>
            <Textarea
              id="rp-what-happened"
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              placeholder="Describe the issue you encountered."
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rp-trying">What were you trying to do?</Label>
            <Textarea
              id="rp-trying"
              value={whatTryingToDo}
              onChange={(e) => setWhatTryingToDo(e.target.value)}
              placeholder="What was your goal when this happened?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as SupportPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ticketType === "bug_report" && (
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select
                  value={bugSeverity}
                  onValueChange={(v) => setBugSeverity(v as BugSeverity)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {ticketType === "bug_report" && (
            <>
              <div className="space-y-1.5">
                <Label>Can you reproduce it?</Label>
                <Select
                  value={
                    reproducible === null ? "" : reproducible ? "yes" : "no"
                  }
                  onValueChange={(v) =>
                    setReproducible(
                      v === "yes" ? true : v === "no" ? false : null,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rp-steps">Steps to reproduce</Label>
                <Textarea
                  id="rp-steps"
                  value={reproSteps}
                  onChange={(e) => setReproSteps(e.target.value)}
                  placeholder="1. Go to... 2. Click..."
                  rows={2}
                />
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={includeDiagnostics}
              onCheckedChange={(v) => setIncludeDiagnostics(v === true)}
            />
            Include safe diagnostics (route, version, browser)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
