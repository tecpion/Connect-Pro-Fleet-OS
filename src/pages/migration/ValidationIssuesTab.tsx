// Connect Pro Fleet — Build #19 cleanup: validation issues tab.
//
// Lists all MigrationIssue records (info/warning/error/blocking) with their
// resolution state. Issues are created by the dry-run validators and the
// commit helpers. This tab surfaces them for manual resolution.

import { useStore } from "@/lib/store";
import { useMigration } from "@/lib/migrationStore";
import { can } from "@/lib/permissions";
import { IMPORT_TYPE_LABELS } from "@/lib/migrationTypes";

export function ValidationIssuesTab() {
  const store = useStore();
  const mig = useMigration();
  const role = store.roles.find(
    (r) =>
      r.id === store.staff.find((s) => s.id === store.currentStaffId)?.role_id,
  );
  const overrides =
    store.staff.find((s) => s.id === store.currentStaffId)
      ?.permission_overrides ?? null;
  const canView = can(role, overrides, "migration.view");

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground">
        You don't have permission to view validation issues.
      </p>
    );
  }

  const issues = mig.migrationIssues;

  if (issues.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No validation issues. Run a dry run during import to surface duplicates,
        missing fields, and mapping problems.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Validation issues ({issues.length})
        </h3>
      </div>
      <div className="divide-y divide-border">
        {issues.map((i) => (
          <div key={i.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                  i.severity === "error" || i.severity === "blocking"
                    ? "bg-status-out/15 text-status-out"
                    : i.severity === "warning"
                      ? "bg-status-maintenance/15 text-status-maintenance"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i.severity}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {IMPORT_TYPE_LABELS[i.entity_type]}
              </span>
              {i.row_number != null && (
                <span className="font-mono text-xs text-muted-foreground">
                  row {i.row_number}
                </span>
              )}
              <span className="font-mono text-xs text-muted-foreground">
                {i.code}
              </span>
            </div>
            <p className="mt-1 text-foreground">{i.message}</p>
            {i.resolution && (
              <p className="mt-1 text-xs text-muted-foreground">
                Resolution: {i.resolution}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
