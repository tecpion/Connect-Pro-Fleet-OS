// Connect Pro Fleet — Build #19 import history tab.

import { useStore } from "@/lib/store";
import { useMigration } from "@/lib/migrationStore";
import { can } from "@/lib/permissions";
import { IMPORT_TYPE_LABELS } from "@/lib/migrationTypes";
import { useState } from "react";

export function ImportHistoryTab() {
  const store = useStore();
  const mig = useMigration();
  const role = store.roles.find(
    (r) =>
      r.id === store.staff.find((s) => s.id === store.currentStaffId)?.role_id,
  );
  const overrides =
    store.staff.find((s) => s.id === store.currentStaffId)
      ?.permission_overrides ?? null;
  const canRollback = can(role, overrides, "migration.rollback");
  const [msg, setMsg] = useState<string | null>(null);

  function rollback(batchId: string) {
    setMsg(null);
    const res = mig.rollbackBatch(batchId);
    setMsg(res.ok ? "Batch rolled back." : (res.error ?? "Rollback failed."));
  }

  if (mig.migrationBatches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No import batches yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {msg && <p className="text-sm text-status-maintenance">{msg}</p>}
      <div className="rounded-lg border border-border bg-surface">
        <div className="divide-y divide-border">
          {mig.migrationBatches.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <div>
                <span className="font-medium text-foreground">
                  {IMPORT_TYPE_LABELS[b.import_type]}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {b.source_name}
                </span>
                {b.source_file_name && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({b.source_file_name})
                  </span>
                )}
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {b.success_count} created · {b.skipped_count} skipped ·{" "}
                {b.warning_count} warnings · {b.error_count} errors
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${b.rollback_status === "rolled_back" ? "bg-muted text-muted-foreground" : "bg-status-available/15 text-status-available"}`}
                >
                  {b.rollback_status}
                </span>
                {canRollback && b.rollback_status === "available" && (
                  <button
                    onClick={() => rollback(b.id)}
                    className="text-xs text-status-out hover:underline"
                  >
                    Roll back
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
