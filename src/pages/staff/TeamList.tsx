// Connect Pro Fleet — Staff Team list + Add Staff dialog (Build #24).

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useStaffAssignments } from "@/lib/staffAssignmentStore";
import { useCan } from "@/pages/settings/useCan";
import {
  staffWorkloadSummary,
  type WorkloadInputs,
} from "@/lib/staffSelectors";
import {
  RESPONSIBILITY_LABELS,
  type ResponsibilityTag,
} from "@/lib/staffTypes";
import type { Staff, UserStatus } from "@/lib/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";

const STATUS_TONE: Record<UserStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-600",
  invited: "bg-blue-500/15 text-blue-600",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-amber-500/15 text-amber-600",
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TeamList({
  onSelectStaff,
  inputs,
}: {
  onSelectStaff: (id: string) => void;
  inputs: WorkloadInputs;
}) {
  const store = useStore();
  const assignments = useStaffAssignments();
  const canCreate = useCan("staff.create");
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return store.staff.filter((s) => {
      if (statusFilter !== "all" && (s.status ?? "active") !== statusFilter)
        return false;
      if (!query) return true;
      const role = store.roles.find((r) => r.id === s.role_id);
      return (
        s.full_name.toLowerCase().includes(query) ||
        s.email.toLowerCase().includes(query) ||
        (s.phone ?? "").toLowerCase().includes(query) ||
        (role?.name ?? s.role).toLowerCase().includes(query)
      );
    });
  }, [store.staff, store.roles, q, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, role…"
            className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as UserStatus | "all")
            }
            className="rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        {canCreate && (
          <Button onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add Staff
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => (
          <TeamCard
            key={s.id}
            staff={s}
            inputs={inputs}
            onSelect={() => onSelectStaff(s.id)}
            roleName={
              store.roles.find((r) => r.id === s.role_id)?.name ?? s.role
            }
            locationNames={
              (s.location_ids ?? [])
                .map((id) => store.locations.find((l) => l.id === id)?.name)
                .filter(Boolean) as string[]
            }
            openCount={assignments.openAssignmentCount(s.id)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No staff members match.
        </p>
      )}

      {addOpen && <AddStaffDialog open={addOpen} onOpenChange={setAddOpen} />}
    </div>
  );
}

function TeamCard({
  staff,
  inputs,
  onSelect,
  roleName,
  locationNames,
  openCount,
}: {
  staff: Staff;
  inputs: WorkloadInputs;
  onSelect: () => void;
  roleName: string;
  locationNames: string[];
  openCount: number;
}) {
  const wl = staffWorkloadSummary(inputs, staff.id);
  const status = staff.status ?? "active";
  const showOpen = wl.openTasks > 0;
  const showDueToday = wl.dueTodayTasks > 0;
  const showOverdue = wl.overdueTasks > 0;
  const showUrgent = wl.urgentTasks > 0;
  const hasWorkCounts = showOpen || showDueToday || showOverdue || showUrgent;
  return (
    <button
      onClick={onSelect}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {initials(staff.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">
            {staff.full_name}
          </p>
          <p className="truncate text-xs text-muted-foreground">{roleName}</p>
        </div>
        <Badge className={STATUS_TONE[status]} variant="secondary">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      </div>

      {/* Open work summary — only show non-zero metrics. */}
      {hasWorkCounts ? (
        <div className="flex flex-wrap gap-1.5">
          {showOpen && (
            <Badge variant="outline" className="text-[11px]">
              Open: {wl.openTasks}
            </Badge>
          )}
          {showDueToday && (
            <Badge
              variant="outline"
              className="border-status-maintenance/40 text-[11px] text-status-maintenance"
            >
              Due Today: {wl.dueTodayTasks}
            </Badge>
          )}
          {showOverdue && (
            <Badge
              variant="outline"
              className="border-status-out/40 text-[11px] text-status-out"
            >
              Overdue: {wl.overdueTasks}
            </Badge>
          )}
          {showUrgent && (
            <Badge
              variant="outline"
              className="border-status-out/40 text-[11px] text-status-out"
            >
              Urgent: {wl.urgentTasks}
            </Badge>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">No open work</span>
      )}

      {/* Work types breakdown. */}
      {wl.breakdown.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {wl.breakdown.map((b) => `${b.count} ${b.label}`).join(" · ")}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted-foreground">
        <span className="truncate">
          {locationNames.length ? locationNames.join(", ") : "All locations"}
        </span>
        <span>{openCount} active</span>
      </div>
    </button>
  );
}

function AddStaffDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const store = useStore();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState(
    store.roles.filter((r) => r.active && !r.is_protected)[0]?.id ??
      store.roles[0].id,
  );
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [responsibilities, setResponsibilities] = useState<ResponsibilityTag[]>(
    [],
  );
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<UserStatus>("invited");

  function save() {
    if (!first.trim() || !email.trim()) return;
    const id = `stf_${Date.now()}`;
    store.addStaff({
      id,
      tenant_id: store.tenant.id,
      full_name: `${first.trim()} ${last.trim()}`.trim(),
      email: email.trim(),
      role: "custom",
      permission_overrides: null,
      created_at: new Date().toISOString(),
      phone: phone.trim() || null,
      display_role: "custom",
      role_id: roleId,
      location_ids: locationIds,
      status,
      last_activity_at: null,
      theme: "system",
      // Persist responsibilities for work routing/suggestions. These NEVER
      // grant permissions — access is controlled by role + permission_overrides.
      responsibilities: responsibilities.length ? responsibilities : null,
    });
    store.logSettingsChange({
      action: "Staff added",
      new_value: `${first.trim()} ${last.trim()}`.trim(),
    });
    if (responsibilities.length || notes.trim()) {
      store.logActivity({
        id: `act_${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        label: `Staff added: ${first.trim()} ${last.trim()}`,
        tone: "available",
      });
    }
    onOpenChange(false);
    setFirst("");
    setLast("");
    setEmail("");
    setPhone("");
    setNotes("");
    setResponsibilities([]);
    setLocationIds([]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Staff Member</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              First name
            </label>
            <input
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Last name
            </label>
            <input
              value={last}
              onChange={(e) => setLast(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Phone (optional)
          </label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Role
          </label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {store.roles
              .filter((r) => r.active)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.is_system ? " (system)" : ""}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Locations
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              onClick={() => setLocationIds([])}
              className={`rounded-md border px-2 py-1 text-xs ${
                locationIds.length === 0
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border"
              }`}
            >
              All locations
            </button>
            {store.locations.map((l) => {
              const on = locationIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() =>
                    setLocationIds((prev) =>
                      on ? prev.filter((x) => x !== l.id) : [...prev, l.id],
                    )
                  }
                  className={`rounded-md border px-2 py-1 text-xs ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border"
                  }`}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Responsibilities
          </label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(Object.keys(RESPONSIBILITY_LABELS) as ResponsibilityTag[]).map(
              (tag) => {
                const on = responsibilities.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() =>
                      setResponsibilities((prev) =>
                        on ? prev.filter((x) => x !== tag) : [...prev, tag],
                      )
                    }
                    className={`rounded-md border px-2 py-1 text-xs ${
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border"
                    }`}
                  >
                    {RESPONSIBILITY_LABELS[tag]}
                  </button>
                );
              },
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Responsibilities help Connect Pro organize and suggest work
            assignments. Access is controlled separately by the staff member's
            role and permissions.
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as UserStatus)}
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="invited">Invited</option>
            <option value="active">Active</option>
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Invitation state is simulated in-memory. No real email is sent.
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!first.trim() || !email.trim()}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
