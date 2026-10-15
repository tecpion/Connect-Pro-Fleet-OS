// Connect Pro Fleet — Add Customer dialog with duplicate detection
// (Build #38 — Customers V1).
//
// Performs duplicate detection against existing customers by strong signals
// (phone/email/license) before final creation. Name-only matches never force a
// duplicate. When a possible match exists, the user can open the existing
// customer or continue creating new. Verification/document fields are shown only
// when relevant (verification enabled) — when Off, the form stays short.

import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { isVerificationEnabled } from "@/lib/verificationConfig";
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
import { toast } from "sonner";
import type { Customer } from "@/lib/types";
import { AlertTriangle, UserPlus } from "lucide-react";

function normPhone(s: string): string {
  return s.replace(/\D/g, "");
}

export function AddCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (customerId: string) => void;
}) {
  const { customers, addCustomer, logActivity } = useStore();
  const { companyPolicies } = useCompanyPolicies();
  const verificationOn = isVerificationEnabled(companyPolicies);

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dl, setDl] = useState("");
  const [dlState, setDlState] = useState("");
  const [dlExpiry, setDlExpiry] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [duplicate, setDuplicate] = useState<Customer | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  const reset = () => {
    setFirst("");
    setLast("");
    setPhone("");
    setEmail("");
    setDl("");
    setDlState("");
    setDlExpiry("");
    setAddress("");
    setNotes("");
    setDuplicate(null);
    setConfirmNew(false);
  };

  const duplicateCheck = useMemo(() => {
    const np = phone.trim() ? normPhone(phone) : "";
    if (np) {
      const m = customers.find((c) => c.phone && normPhone(c.phone) === np);
      if (m) return m;
    }
    if (email.trim()) {
      const e = email.trim().toLowerCase();
      const m = customers.find((c) => c.email && c.email.toLowerCase() === e);
      if (m) return m;
    }
    if (dl.trim()) {
      const d = dl.trim().toLowerCase();
      const m = customers.find(
        (c) =>
          c.drivers_license_number &&
          c.drivers_license_number.toLowerCase() === d,
      );
      if (m) return m;
    }
    return null;
  }, [phone, email, dl, customers]);

  const handleCreate = () => {
    if (!first.trim() || !last.trim()) {
      toast.error("First and last name are required.");
      return;
    }
    if (duplicateCheck && !confirmNew) {
      setDuplicate(duplicateCheck);
      return;
    }
    const now = new Date().toISOString();
    const customer: Customer = {
      id: uid("cus"),
      tenant_id: TENANT_ID,
      first_name: first.trim(),
      last_name: last.trim(),
      phone: phone.trim(),
      email: email.trim(),
      date_of_birth: null,
      address: address.trim() || null,
      city: null,
      state: null,
      zip: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      customer_status: "good_standing",
      customer_source: "staff",
      notes: notes.trim(),
      drivers_license_number: dl.trim() || null,
      drivers_license_state: dlState.trim() || null,
      drivers_license_expiry: dlExpiry || null,
      drivers_license_front_url: null,
      drivers_license_back_url: null,
      insurance_company: null,
      insurance_policy_number: null,
      insurance_expiry: null,
      insurance_document_url: null,
      created_at: now,
      updated_at: now,
    };
    addCustomer(customer);
    logActivity({
      id: uid("act"),
      at: now,
      label: `Customer created — ${first} ${last}`,
      tone: "available",
    });
    toast.success(`Customer created — ${first} ${last}`);
    const newId = customer.id;
    reset();
    onOpenChange(false);
    onCreated?.(newId);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus size={18} /> Add Customer
          </DialogTitle>
          <DialogDescription>
            Create a new customer record. Duplicate detection runs automatically
            on phone, email, and license.
          </DialogDescription>
        </DialogHeader>

        {duplicate && (
          <div className="rounded-lg border border-status-maintenance/40 bg-status-maintenance/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle
                size={16}
                className="mt-0.5 text-status-maintenance"
              />
              <div className="flex-1 text-sm">
                <p className="font-medium text-foreground">
                  Possible Existing Customer
                </p>
                <p className="text-muted-foreground">
                  {duplicate.first_name} {duplicate.last_name} ·{" "}
                  {duplicate.phone || "no phone"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link to={`/customers/${duplicate.id}`}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                    >
                      Open Existing Customer
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmNew(true)}
                  >
                    Continue Creating New
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>First name *</Label>
            <Input
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Last name *</Label>
            <Input
              value={last}
              onChange={(e) => setLast(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          {verificationOn && (
            <>
              <div>
                <Label>Driver's license #</Label>
                <Input
                  value={dl}
                  onChange={(e) => setDl(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>License state</Label>
                <Input
                  value={dlState}
                  onChange={(e) => setDlState(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>License expiry</Label>
                <Input
                  type="date"
                  value={dlExpiry}
                  onChange={(e) => setDlExpiry(e.target.value)}
                  className="mt-1"
                />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary-press"
            onClick={handleCreate}
          >
            Create customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
