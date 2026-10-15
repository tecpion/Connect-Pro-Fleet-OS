// Connect Pro Fleet — Customer bulk action dialogs (Build #38 — Customers V1).
//
// Confirmation-gated bulk actions: Add Tag, Remove Tag, Change Standing, and
// Create Task for selected customers. Do Not Rent changes require explicit
// confirmation with a count. No unsafe bulk financial mutations are exposed.

import { useState } from "react";
import { useStore, uid } from "@/lib/store";
import { useCustomerTags } from "@/lib/customerTagStore";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { CustomerStatus } from "@/lib/types";
import {
  STANDING_LABELS,
  type CustomerStanding,
} from "@/lib/customerWorkspaceSelectors";

const STANDINGS: CustomerStanding[] = [
  "good_standing",
  "pending_verification",
  "watchlist",
  "do_not_rent",
  "vip",
];

const STANDING_TO_STATUS: Record<CustomerStanding, CustomerStatus> = {
  good_standing: "good_standing",
  pending_verification: "pending_verification",
  watchlist: "watchlist",
  do_not_rent: "do_not_rent",
  vip: "vip",
};

export function BulkTagDialog({
  open,
  onOpenChange,
  selectedIds,
  mode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
  mode: "add" | "remove";
}) {
  const tags = useCustomerTags();
  const [label, setLabel] = useState("");

  const handle = () => {
    const clean = label.trim();
    if (!clean) {
      toast.error("Enter a tag label.");
      return;
    }
    const n =
      mode === "add"
        ? tags.bulkAddTag(selectedIds, clean)
        : tags.bulkRemoveTag(selectedIds, clean);
    toast.success(
      mode === "add"
        ? `Tag added to ${n} customer${n === 1 ? "" : "s"}.`
        : `Tag removed from ${n} customer${n === 1 ? "" : "s"}.`,
    );
    setLabel("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add tag" : "Remove tag"} — {selectedIds.length}{" "}
            customer{selectedIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Apply a tag to all selected customers. Tags are operational labels, not eligibility states."
              : "Remove a tag from all selected customers."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Tag label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Corporate"
            list="customer-tag-catalog"
          />
          <datalist id="customer-tag-catalog">
            {tags.catalog.map((t) => (
              <option key={t.label} value={t.label} />
            ))}
          </datalist>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary-press"
            onClick={handle}
          >
            {mode === "add" ? "Add tag" : "Remove tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkStandingDialog({
  open,
  onOpenChange,
  selectedIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
}) {
  const { updateCustomer, logActivity } = useStore();
  const [standing, setStanding] = useState<CustomerStanding>("good_standing");
  const [confirming, setConfirming] = useState(false);

  const isDnr = standing === "do_not_rent";

  const handle = () => {
    if (isDnr && !confirming) {
      setConfirming(true);
      return;
    }
    const status = STANDING_TO_STATUS[standing];
    for (const id of selectedIds) {
      updateCustomer(id, { customer_status: status });
    }
    logActivity({
      id: uid("act"),
      at: new Date().toISOString(),
      label: `Bulk standing change — ${STANDING_LABELS[standing]} (${selectedIds.length} customers)`,
      tone: isDnr ? "out" : "neutral",
    });
    toast.success(
      `Standing updated for ${selectedIds.length} customer${selectedIds.length === 1 ? "" : "s"}.`,
    );
    setConfirming(false);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setConfirming(false);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Change standing — {selectedIds.length} customer
            {selectedIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Update the standing/flag for all selected customers.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Standing</Label>
          <Select
            value={standing}
            onValueChange={(v) => setStanding(v as CustomerStanding)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STANDINGS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STANDING_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isDnr && confirming && (
          <p className="rounded-lg border border-status-out/40 bg-status-out/10 p-3 text-sm text-status-out">
            You are about to mark {selectedIds.length} customer
            {selectedIds.length === 1 ? "" : "s"} as Do Not Rent. This will
            block them from renting. Confirm to proceed.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary-press"
            onClick={handle}
          >
            {isDnr && !confirming ? "Review count" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkTaskDialog({
  open,
  onOpenChange,
  selectedIds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
}) {
  const { customers, createTask } = useStore();
  const [title, setTitle] = useState("");

  const handle = () => {
    if (!title.trim()) {
      toast.error("Enter a task title.");
      return;
    }
    let created = 0;
    for (const id of selectedIds) {
      const c = customers.find((x) => x.id === id);
      if (!c) continue;
      createTask({
        title: title.trim(),
        entityType: "customer",
        entityId: id,
        entityLabel: `${c.first_name} ${c.last_name}`,
        category: "customer_follow_up",
      });
      created++;
    }
    toast.success(`Created ${created} task${created === 1 ? "" : "s"}.`);
    setTitle("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Create task — {selectedIds.length} customer
            {selectedIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Creates one task per selected customer. Does not create duplicates
            silently.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Task title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Follow up on documents"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary-press"
            onClick={handle}
          >
            Create tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
