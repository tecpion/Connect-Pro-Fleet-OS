// Connect Pro Fleet — Maintenance Vendors section (Build #13).
// Vendor directory: add, edit, deactivate, search, filter by type. Shows
// work-order history per vendor. Vendors are operational service providers — no
// payables, no bills, no ACH. Inactive vendors retain history.

import { useState } from "react";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { fmtMoneyExact, fmtDate } from "@/lib/format";
import { VENDOR_TYPE_LABELS } from "@/lib/maintenanceTypes";
import type { VendorType, MaintenanceVendor } from "@/lib/maintenanceTypes";
import { getWorkOrdersForVendor } from "@/lib/maintenanceSelectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/Status";
import { toast } from "sonner";
import { Plus, Pencil, Phone, Mail, MapPin } from "lucide-react";

const TYPES = Object.keys(VENDOR_TYPE_LABELS) as VendorType[];

export function VendorsSection() {
  const {
    maintenanceVendors,
    workOrders,
    staff,
    roles,
    currentStaffId,
    addVendor,
    updateVendor,
    deactivateVendor,
  } = useStore();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaintenanceVendor | null>(null);

  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const role = currentStaff
    ? (roles.find((r) => r.id === currentStaff.role_id) ??
      roles.find((r) => r.name === currentStaff.role))
    : undefined;
  const canManage = can(
    role,
    currentStaff?.permission_overrides ?? null,
    "maintenance.manage_vendors",
  );

  const filtered = maintenanceVendors
    .filter((v) => {
      if (typeFilter !== "all" && v.vendor_type !== typeFilter) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        (v.contact_name ?? "").toLowerCase().includes(q) ||
        (v.phone ?? "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Search vendors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {VENDOR_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            <Plus size={16} className="mr-1.5" /> Add vendor
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p className="font-display text-base font-semibold text-foreground">
            No maintenance vendors added yet.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a repair shop, tire shop, or other service provider.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const woForVendor = getWorkOrdersForVendor(workOrders, v.id);
            const completed = woForVendor.filter(
              (w) => w.status === "completed",
            );
            const totalCost = completed.reduce((sum, w) => {
              const c =
                w.actual_cost ??
                (w.labor_cost ?? 0) +
                  (w.parts_cost ?? 0) +
                  (w.tax_cost ?? 0) +
                  (w.other_cost ?? 0);
              return sum + c;
            }, 0);
            return (
              <div
                key={v.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-sm font-semibold text-foreground">
                      {v.name}
                    </p>
                    {v.vendor_type && (
                      <p className="text-xs text-muted-foreground">
                        {VENDOR_TYPE_LABELS[v.vendor_type]}
                      </p>
                    )}
                  </div>
                  {!v.active && (
                    <StatusPill tone="neutral">Inactive</StatusPill>
                  )}
                </div>
                {v.contact_name && (
                  <p className="mt-2 text-sm text-foreground">
                    {v.contact_name}
                  </p>
                )}
                {v.phone && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone size={12} /> {v.phone}
                  </p>
                )}
                {v.email && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail size={12} /> {v.email}
                  </p>
                )}
                {v.address && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin size={12} /> {v.address}
                  </p>
                )}
                <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
                  <p>
                    {woForVendor.length} work orders · {completed.length}{" "}
                    completed
                  </p>
                  {totalCost > 0 && (
                    <p className="font-mono tabular text-foreground">
                      {fmtMoneyExact(totalCost)} total cost
                    </p>
                  )}
                </div>
                {canManage && v.active && (
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(v);
                        setShowForm(true);
                      }}
                    >
                      <Pencil size={13} /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        deactivateVendor(v.id);
                        toast.success("Vendor deactivated.");
                      }}
                    >
                      Deactivate
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <VendorForm
        open={showForm}
        onOpenChange={setShowForm}
        editing={editing}
        onSubmit={(data) => {
          if (editing) {
            updateVendor(editing.id, data);
            toast.success("Vendor updated.");
          } else {
            addVendor(data);
            toast.success("Vendor added.");
          }
          setShowForm(false);
        }}
      />
    </div>
  );
}

function VendorForm({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: MaintenanceVendor | null;
  onSubmit: (data: {
    name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postal: string | null;
    vendor_type: VendorType | null;
    notes: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [postal, setPostal] = useState("");
  const [vendorType, setVendorType] = useState("__none__");
  const [notes, setNotes] = useState("");

  // Sync when dialog opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setName(editing?.name ?? "");
    setContactName(editing?.contact_name ?? "");
    setPhone(editing?.phone ?? "");
    setEmail(editing?.email ?? "");
    setAddress(editing?.address ?? "");
    setCity(editing?.city ?? "");
    setStateVal(editing?.state ?? "");
    setPostal(editing?.postal ?? "");
    setVendorType(editing?.vendor_type ?? "__none__");
    setNotes(editing?.notes ?? "");
  }
  if (!open && wasOpen) setWasOpen(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit vendor" : "Add vendor"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Vendor name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact name</Label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>City</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>State</Label>
              <Input
                value={stateVal}
                onChange={(e) => setStateVal(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Postal</Label>
              <Input
                value={postal}
                onChange={(e) => setPostal(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
          <div>
            <Label>Vendor type</Label>
            <Select value={vendorType} onValueChange={setVendorType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No type</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {VENDOR_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                contact_name: contactName.trim() || null,
                phone: phone.trim() || null,
                email: email.trim() || null,
                address: address.trim() || null,
                city: city.trim() || null,
                state: stateVal.trim() || null,
                postal: postal.trim() || null,
                vendor_type:
                  vendorType === "__none__" ? null : (vendorType as VendorType),
                notes: notes.trim() || null,
              })
            }
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            {editing ? "Save" : "Add vendor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
