// Connect Pro Fleet — Work Order detail helper components (Build #13/#17).
// Extracted from WorkOrderDetail to keep it under the line limit.

import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmtMoneyExact } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import type { WorkOrderStatus } from "@/lib/maintenanceTypes";

export function Section({
  title,
  icon,
  children,
  right,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-foreground">
          {icon}
          {title}
        </h3>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Tile({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface-2 p-3",
        highlight && "border-status-out/40",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
      {sub && (
        <p className="font-mono text-xs tabular text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

export function CostTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface-2 p-3",
        highlight && "border-primary/30",
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-sm font-semibold tabular",
          highlight ? "text-primary" : "text-foreground",
        )}
      >
        {value != null ? fmtMoneyExact(value) : "—"}
      </p>
    </div>
  );
}

export function Field({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-foreground">{value || "—"}</p>
    </div>
  );
}

// --- Lifecycle indicator (only steps the work order has reached) ------------

const LIFECYCLE: {
  status: WorkOrderStatus;
  label: string;
  date: (w: {
    actual_start_at: string | null;
    completed_at: string | null;
    opened_at: string;
  }) => string | null;
}[] = [
  { status: "open", label: "Created", date: (w) => w.opened_at },
  { status: "scheduled", label: "Scheduled", date: () => null },
  {
    status: "in_progress",
    label: "In Progress",
    date: (w) => w.actual_start_at,
  },
  { status: "completed", label: "Completed", date: (w) => w.completed_at },
];

export function LifecycleBar({
  wo,
}: {
  wo: {
    status: WorkOrderStatus;
    actual_start_at: string | null;
    completed_at: string | null;
    opened_at: string;
  };
}) {
  const reachedIdx = LIFECYCLE.findIndex(
    (s) =>
      s.status === wo.status ||
      (wo.status === "waiting_for_parts" && s.status === "in_progress"),
  );
  const currentIdx = reachedIdx === -1 ? 0 : reachedIdx;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {LIFECYCLE.map((step, i) => {
        const reached = i <= currentIdx && step.date(wo) !== null;
        const isCurrent = i === currentIdx;
        return (
          <div key={step.status} className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                reached
                  ? "bg-status-available/10 text-status-available"
                  : isCurrent
                    ? "bg-primary/10 text-primary"
                    : "bg-surface-2 text-muted-foreground",
              )}
            >
              {reached && <CheckCircle2 size={12} />}
              {step.label}
            </div>
            {i < LIFECYCLE.length - 1 && <div className="h-px w-4 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

// --- Editable field (reported issue / diagnosis / work performed) -----------

export function EditableField({
  label,
  field,
  value,
  canEdit,
  onEdit,
  onSave,
}: {
  label: string;
  field: "reported_issue" | "diagnosis" | "work_performed";
  value: string | null;
  canEdit: boolean;
  onEdit: (field: string, current: string) => void;
  onSave: (
    field: "reported_issue" | "diagnosis" | "work_performed",
    value: string,
  ) => void;
}) {
  const [val, setVal] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          rows={2}
          autoFocus
          className="text-sm"
        />
        <div className="mt-1.5 flex gap-1.5">
          <Button
            size="sm"
            onClick={() => {
              onSave(field, val);
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setVal(value ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setVal(value ?? "");
              onEdit(field, value ?? "");
              setEditing(true);
            }}
            data-testid={`edit-${field}`}
            className="text-xs text-primary hover:underline"
          >
            Edit
          </button>
        )}
      </div>
      <p className="mt-0.5 text-foreground">
        {value || <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}
