// Connect Pro Fleet — Staff Profile shell (Build #24 enhancement).
//
// Structured profile with four sections: Overview, Work, Access, Activity.
// - Overview: identity, contact, role, status, locations, responsibilities, notes.
// - Work: authoritative assigned work (tasks, rentals, WOs, claims).
// - Access: role permission summary + location scope (Role = Access).
// - Activity: staff-specific events (filtered team activity feed).
//
// Responsibilities are shown clearly and labeled as work-routing only — they
// NEVER grant permissions. Deactivation preserves historical attribution.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useStaffAssignments } from "@/lib/staffAssignmentStore";
import { useCan } from "@/pages/settings/useCan";
import {
  staffWorkloadSummary,
  type WorkloadInputs,
} from "@/lib/staffSelectors";
import type { Staff } from "@/lib/types";
import type { UserStatus } from "@/lib/staffTypes";
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
import { ArrowLeft, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProfileOverview } from "./ProfileOverview";
import { ProfileWork } from "./ProfileWork";
import { ProfileAccess } from "./ProfileAccess";
import { ProfileActivity } from "./ProfileActivity";
import {
  STATUS_TONE,
  initials,
  locationNamesFor,
  responsibilitiesFor,
  type ProfileSection,
} from "./profileHelpers";

const SECTIONS: { id: ProfileSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "work", label: "Work" },
  { id: "access", label: "Access" },
  { id: "activity", label: "Activity" },
];

export function StaffProfile({
  staffId,
  inputs,
  onBack,
}: {
  staffId: string;
  inputs: WorkloadInputs;
  onBack: () => void;
}) {
  const store = useStore();
  const assignments = useStaffAssignments();
  const canEdit = useCan("staff.edit");
  const [section, setSection] = useState<ProfileSection>("overview");
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const staff = store.staff.find((s) => s.id === staffId);
  if (!staff) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Staff member not found.
      </div>
    );
  }

  const role = store.roles.find((r) => r.id === staff.role_id);
  const wl = staffWorkloadSummary(inputs, staff.id);
  const status = staff.status ?? "active";
  const isOwner = role?.name === "Owner";
  const activeOwnerCount = store.staff.filter((s) => {
    const r = store.roles.find((x) => x.id === s.role_id);
    return r?.name === "Owner" && (s.status ?? "active") === "active";
  }).length;
  const isLastOwner = isOwner && activeOwnerCount <= 1;

  const staffAssignments = assignments.assignmentsForStaff(staff.id);
  const activeAssignments = staffAssignments.filter(
    (a) => a.status === "active",
  );
  const notes = assignments.staffNotesFor(staff.id);
  const locationNames = locationNamesFor(staff, store.locations);
  const responsibilities = responsibilitiesFor(staff);

  function changeStatus(newStatus: UserStatus) {
    if (
      isLastOwner &&
      (newStatus === "inactive" || newStatus === "suspended")
    ) {
      return;
    }
    store.updateStaff(staff!.id, { status: newStatus });
    store.logSettingsChange({
      action: "Staff status changed",
      detail: `${staff!.full_name}: ${status} → ${newStatus}`,
      old_value: status,
      new_value: newStatus,
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Back to team
        </button>
        {canEdit && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md p-2 text-muted-foreground hover:bg-surface-2"
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-border bg-surface py-1 shadow-lg">
                {status === "active" && (
                  <>
                    <MenuBtn
                      onClick={() => {
                        changeStatus("suspended");
                        setMenuOpen(false);
                      }}
                    >
                      Suspend
                    </MenuBtn>
                    <MenuBtn
                      danger
                      onClick={() => {
                        setDeactivateOpen(true);
                        setMenuOpen(false);
                      }}
                    >
                      Deactivate…
                    </MenuBtn>
                  </>
                )}
                {(status === "suspended" || status === "inactive") && (
                  <MenuBtn
                    onClick={() => {
                      changeStatus("active");
                      setMenuOpen(false);
                    }}
                  >
                    Activate
                  </MenuBtn>
                )}
                {status === "invited" && (
                  <MenuBtn
                    onClick={() => {
                      changeStatus("active");
                      setMenuOpen(false);
                    }}
                  >
                    Activate (accept invite)
                  </MenuBtn>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Identity */}
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
            {initials(staff.full_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">
            {staff.full_name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {role?.name ?? staff.role}
          </p>
          <Badge
            className={cn("mt-1", STATUS_TONE[status])}
            variant="secondary"
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-px">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              section === s.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "overview" && (
        <ProfileOverview
          staff={staff}
          role={role}
          locationNames={locationNames}
          responsibilities={responsibilities}
          notes={notes}
        />
      )}
      {section === "work" && (
        <ProfileWork wl={wl} activeAssignments={activeAssignments} />
      )}
      {section === "access" && (
        <ProfileAccess
          staff={staff}
          role={role}
          locationNames={locationNames}
          responsibilities={responsibilities}
        />
      )}
      {section === "activity" && <ProfileActivity staffId={staff.id} />}

      {deactivateOpen && (
        <DeactivateDialog
          staff={staff}
          activeAssignments={activeAssignments}
          assignableStaff={store.staff.filter(
            (s) => s.id !== staff.id && (s.status ?? "active") === "active",
          )}
          isLastOwner={isLastOwner}
          onClose={() => setDeactivateOpen(false)}
          onConfirm={(transferTo) => {
            if (transferTo) {
              for (const a of activeAssignments) {
                assignments.reassign({
                  assignment_id: a.id,
                  new_staff_id: transferTo,
                });
              }
            }
            changeStatus("inactive");
            setDeactivateOpen(false);
          }}
        />
      )}
    </div>
  );
}

function MenuBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "block w-full px-3 py-2 text-left text-sm hover:bg-surface-2",
        danger ? "text-status-out" : "",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Deactivate dialog (preserves historical attribution; transfers open work)
// ---------------------------------------------------------------------------

function DeactivateDialog({
  staff,
  activeAssignments,
  assignableStaff,
  isLastOwner,
  onClose,
  onConfirm,
}: {
  staff: Staff;
  activeAssignments: {
    id: string;
    assignment_type: string;
    entity_label: string | null;
    entity_id: string;
  }[];
  assignableStaff: Staff[];
  isLastOwner: boolean;
  onClose: () => void;
  onConfirm: (transferTo: string | null) => void;
}) {
  const [transferTo, setTransferTo] = useState<string>("");

  if (isLastOwner) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cannot deactivate</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {staff.full_name} is the last active Owner. Assign another Owner
            before deactivating to avoid locking the company out.
          </p>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate {staff.full_name}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {staff.full_name} has {activeAssignments.length} active assignment
          {activeAssignments.length === 1 ? "" : "s"}. Historical references and
          actor history are preserved.
        </p>
        {activeAssignments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Transfer open assignments to:
            </p>
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Leave historical (no transfer)</option>
              {assignableStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(transferTo || null)}
          >
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
