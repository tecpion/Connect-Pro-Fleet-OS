// Connect Pro Fleet — Staff Profile > Activity section (Build #24 enhancement).
// Staff-filtered view of the team activity feed. Reuses the existing store
// activity log — does NOT duplicate domain history. Shows actor, action,
// related record, timestamp, and source where derivable from the label.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { activityMetaFromLabel } from "./activityMeta";

export function ProfileActivity({ staffId }: { staffId: string }) {
  const store = useStore();
  const staff = store.staff.find((s) => s.id === staffId);
  const name = staff?.full_name ?? "";

  const filtered = useMemo(() => {
    const q = name.toLowerCase();
    return store.activityLog.filter((e) => e.label.toLowerCase().includes(q));
  }, [store.activityLog, name]);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Recent Activity
      </p>
      {filtered.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No recent activity for this staff member.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {filtered.slice(0, 20).map((e) => {
            const meta = activityMetaFromLabel(e.label);
            return (
              <li
                key={e.id}
                className="flex items-start gap-3 border-l-2 border-border pl-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{meta.action}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {meta.actor}
                    {meta.related ? ` · ${meta.related}` : ""}
                    {" · "}
                    {new Date(e.at).toLocaleString()}
                  </p>
                </div>
                {meta.category && meta.category !== "Other" && (
                  <Badge variant="outline" className="text-[10px]">
                    {meta.category}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
