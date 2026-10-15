import { useState } from "react";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Copy, Pencil } from "lucide-react";
import {
  PERMISSION_MODULES,
  permissionsForModule,
  SYSTEM_ROLE_PERMISSIONS,
} from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { Field } from "./shared";

export function RolesSection() {
  const {
    roles,
    staff,
    addRole,
    updateRole,
    duplicateRole,
    logSettingsChange,
  } = useStore();
  const [editRole, setEditRole] = useState<Role | null>(null);

  const userCount = (roleId: string) =>
    staff.filter((s) => s.role_id === roleId).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            const r: Role = {
              id: uid("role"),
              tenant_id: TENANT_ID,
              name: "New Role",
              description: "",
              is_system: false,
              is_protected: false,
              active: true,
              permissions: { ...SYSTEM_ROLE_PERMISSIONS.user },
              created_at: new Date().toISOString(),
            };
            addRole(r);
            logSettingsChange({ action: "Role created", new_value: r.name });
            setEditRole(r);
            toast.success("Role created. Configure its permissions below.");
          }}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          <Plus size={16} className="mr-1.5" /> Create role
        </Button>
      </div>

      <div className="space-y-3">
        {roles.map((role) => (
          <div
            key={role.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-display text-sm font-semibold text-foreground">
                  {role.name}
                </p>
                {role.is_system && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted-foreground">
                    System
                  </span>
                )}
                {role.is_protected && (
                  <span className="rounded-full bg-status-maintenance/10 px-2 py-0.5 text-xs text-status-maintenance">
                    Protected
                  </span>
                )}
                {!role.active && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Inactive
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {role.description || "No description."}
              </p>
              <p className="mt-1 font-mono text-xs tabular text-muted-foreground">
                {userCount(role.id)} user{userCount(role.id) === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const newId = duplicateRole(role.id);
                  if (newId) {
                    logSettingsChange({
                      action: "Role duplicated",
                      new_value: role.name,
                    });
                    toast.success("Role duplicated.");
                  }
                }}
              >
                <Copy size={14} />
              </Button>
              {!role.is_protected && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    updateRole(role.id, { active: !role.active });
                    logSettingsChange({
                      action: role.active
                        ? "Role deactivated"
                        : "Role activated",
                      new_value: role.name,
                    });
                    toast.success(
                      role.active ? "Role deactivated." : "Role activated.",
                    );
                  }}
                >
                  {role.active ? "Deactivate" : "Activate"}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditRole(role)}
              >
                <Pencil size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editRole} onOpenChange={(o) => !o && setEditRole(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit role — {editRole?.name}</DialogTitle>
          </DialogHeader>
          {editRole && (
            <RoleEditor
              role={editRole}
              onChange={setEditRole}
              onSave={() => {
                if (editRole) {
                  updateRole(editRole.id, editRole);
                  logSettingsChange({
                    action: "Role updated",
                    new_value: editRole.name,
                  });
                  toast.success("Role saved.");
                  setEditRole(null);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoleEditor({
  role,
  onChange,
  onSave,
}: {
  role: Role;
  onChange: (r: Role) => void;
  onSave: () => void;
}) {
  const setPerm = (key: string, value: boolean) =>
    onChange({
      ...role,
      permissions: { ...role.permissions, [key]: value },
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role name">
          <Input
            value={role.name}
            onChange={(e) => onChange({ ...role, name: e.target.value })}
            disabled={role.is_protected}
          />
        </Field>
        <Field label="Description">
          <Input
            value={role.description}
            onChange={(e) => onChange({ ...role, description: e.target.value })}
          />
        </Field>
      </div>

      <div className="rounded-md border border-border">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Permissions
          </p>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {PERMISSION_MODULES.map((mod) => (
            <div key={mod} className="border-b border-border last:border-0">
              <p className="bg-surface-2 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {mod}
              </p>
              <div className="divide-y divide-border">
                {permissionsForModule(mod).map((perm) => (
                  <label
                    key={perm.key}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <span className="text-sm text-foreground">
                      {perm.label}
                    </span>
                    <Switch
                      checked={!!role.permissions[perm.key]}
                      onCheckedChange={(v) => setPerm(perm.key, v)}
                      disabled={role.is_protected}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={onSave}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          Save role
        </Button>
      </DialogFooter>
    </div>
  );
}
