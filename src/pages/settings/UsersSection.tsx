import { useState } from "react";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Staff } from "@/lib/types";
import { Field, selectClass } from "./shared";
import { UserForm, UserDetail } from "./UserForm";

export function UsersSection() {
  const {
    staff,
    roles,
    locations,
    addStaff,
    setUserPermissionOverride,
    clearUserPermissionOverride,
    logSettingsChange,
  } = useStore();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<Staff | null>(null);

  const filtered = staff.filter((s) => {
    if (query) {
      const q = query.toLowerCase();
      if (
        !s.full_name.toLowerCase().includes(q) &&
        !s.email.toLowerCase().includes(q)
      )
        return false;
    }
    if (roleFilter !== "all" && s.display_role !== roleFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    return true;
  });

  const roleFor = (s: Staff) => roles.find((r) => r.id === s.role_id);
  const locNames = (s: Staff) => {
    if (!s.location_ids || s.location_ids.length === 0) return "All locations";
    return s.location_ids
      .map((id) => locations.find((l) => l.id === id)?.name ?? "")
      .filter(Boolean)
      .join(", ");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users…"
            className="w-48"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={selectClass}
          >
            <option value="all">All roles</option>
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="user">User</option>
            <option value="partner">Partner</option>
            <option value="custom">Custom</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={selectClass}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          <Plus size={16} className="mr-1.5" /> Add user
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No users found"
          hint="Add your first user to get started."
          icon={<Users size={28} />}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Locations</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="cursor-pointer hover:bg-surface-2"
                  onClick={() => setDetailUser(s)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{s.full_name}</p>
                    <p className="font-mono text-xs tabular text-muted-foreground">
                      {s.email}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {roleFor(s)?.name ?? s.display_role}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {locNames(s)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs capitalize",
                        s.status === "active" &&
                          "bg-status-available/10 text-status-available",
                        s.status === "invited" &&
                          "bg-status-maintenance/10 text-status-maintenance",
                        s.status === "inactive" &&
                          "bg-muted text-muted-foreground",
                        s.status === "suspended" &&
                          "bg-status-out/10 text-status-out",
                      )}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular text-muted-foreground">
                    {s.last_activity_at
                      ? fmtDateShort(s.last_activity_at)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
          </DialogHeader>
          <UserForm
            onSubmit={(s) => {
              addStaff(s);
              logSettingsChange({
                action: "User invited",
                new_value: s.full_name,
              });
              toast.success(`${s.full_name} invited.`);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!detailUser}
        onOpenChange={(o) => !o && setDetailUser(null)}
      >
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailUser?.full_name}</DialogTitle>
          </DialogHeader>
          {detailUser && (
            <UserDetail
              user={detailUser}
              onOverride={(key, value) => {
                setUserPermissionOverride(detailUser.id, key, value);
                setDetailUser({
                  ...detailUser,
                  permission_overrides: {
                    ...((detailUser.permission_overrides as Record<
                      string,
                      boolean
                    >) ?? {}),
                    [key]: value,
                  },
                });
                logSettingsChange({
                  action: "Permission override set",
                  detail: `${detailUser.full_name}: ${key} = ${value ? "on" : "off"}`,
                });
              }}
              onClear={(key) => {
                clearUserPermissionOverride(detailUser.id, key);
                const next = {
                  ...((detailUser.permission_overrides as Record<
                    string,
                    boolean
                  >) ?? {}),
                };
                delete next[key];
                setDetailUser({
                  ...detailUser,
                  permission_overrides: next,
                });
                logSettingsChange({
                  action: "Permission override cleared",
                  detail: `${detailUser.full_name}: ${key}`,
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
