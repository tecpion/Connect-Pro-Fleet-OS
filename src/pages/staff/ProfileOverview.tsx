// Connect Pro Fleet — Staff Profile > Overview section (Build #24 enhancement).
// Identity, contact, role, status, locations, responsibilities (routing only),
// and notes. Responsibilities are clearly labeled as work-routing only and
// NEVER grant permissions.

import type { Staff } from "@/lib/types";
import type { Role } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  RESPONSIBILITY_LABELS,
  type ResponsibilityTag,
  type StaffNote,
} from "@/lib/staffTypes";

export function ProfileOverview({
  staff,
  role,
  locationNames,
  responsibilities,
  notes,
}: {
  staff: Staff;
  role: Role | undefined;
  locationNames: string[];
  responsibilities: ResponsibilityTag[];
  notes: StaffNote[];
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card title="Contact">
          <p className="text-sm text-foreground">{staff.email}</p>
          {staff.phone && (
            <p className="text-sm text-muted-foreground">{staff.phone}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Joined {new Date(staff.created_at).toLocaleDateString()}
          </p>
        </Card>
        <Card title="Role & Locations">
          <p className="text-sm font-medium text-foreground">
            {role?.name ?? staff.role}
            {role?.is_system ? " (system)" : ""}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {locationNames.length ? locationNames.join(", ") : "All locations"}
          </p>
        </Card>
      </div>

      <Card title="Responsibilities">
        {responsibilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No responsibilities assigned.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {responsibilities.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[11px]">
                {RESPONSIBILITY_LABELS[tag]}
              </Badge>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Responsibilities help Connect Pro organize and suggest work
          assignments. Access is controlled separately by the staff member's
          role and permissions.
        </p>
      </Card>

      <Card title="Notes">
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {notes.map((n) => (
              <li key={n.id} className="border-l-2 border-border pl-2">
                <p className="text-foreground">{n.text}</p>
                <p className="text-[11px] text-muted-foreground">
                  {n.visibility === "manager_only" ? "Manager only · " : ""}
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
