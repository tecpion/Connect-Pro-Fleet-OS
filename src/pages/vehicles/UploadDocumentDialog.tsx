// Connect Pro Fleet — Upload Document dialog (Build #45).
// Upload a file as a vault document (receipt, title, maintenance doc, etc.).
// Detects duplicate uploads by file_name (warns, does not reject).

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useVault } from "@/lib/vaultStoreProvider";
import { can } from "@/lib/permissions";
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
import type { Vehicle } from "@/lib/types";
import type { VaultDocCategory } from "@/lib/vaultTypes";
import { findDuplicateUpload } from "@/lib/vaultSelectors";

const CATEGORIES: { value: VaultDocCategory; label: string }[] = [
  { value: "receipt", label: "Receipt" },
  { value: "invoice", label: "Invoice" },
  { value: "title", label: "Title" },
  { value: "payment_proof", label: "Payment Proof" },
  { value: "maintenance_doc", label: "Maintenance Document" },
  { value: "damage_doc", label: "Damage Document" },
  { value: "violation_doc", label: "Violation Document" },
  { value: "compliance_doc", label: "Compliance Document" },
  { value: "other", label: "Other Vehicle Document" },
];

export function UploadDocumentDialog({
  vehicle,
  open,
  onOpenChange,
  presetCategory,
}: {
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetCategory?: VaultDocCategory;
}) {
  const store = useStore();
  const vault = useVault();
  const [fileName, setFileName] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<VaultDocCategory>(
    presetCategory ?? "other",
  );
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canUpload = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.upload",
  );

  const duplicate = fileName
    ? findDuplicateUpload(vault.vaultDocs, vehicle.id, fileName)
    : null;

  function handleSave() {
    if (!fileName) return;
    vault.createUploadedDoc({
      vehicle_id: vehicle.id,
      category,
      title: title || fileName,
      file_name: fileName,
      file_url: fileName,
      vendor_name: vendor || undefined,
      amount: amount ? Number(amount) : undefined,
      source: "uploaded",
    });
    setFileName("");
    setTitle("");
    setVendor("");
    setAmount("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Add a file to this vehicle's permanent document vault.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>File name / reference</Label>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="registration_2026.pdf"
            />
          </div>
          {duplicate && (
            <p className="text-xs text-status-maintenance">
              A document with this file name already exists (
              {duplicate.document_number}). Saving will create an additional
              record — confirm this is not a duplicate.
            </p>
          )}
          <div>
            <Label>Title (optional)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Vehicle registration"
            />
          </div>
          <div>
            <Label>Document type</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as VaultDocCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Vendor (optional)</Label>
              <Input
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </div>
            <div>
              <Label>Amount (optional)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canUpload || !fileName}>
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
