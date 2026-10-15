// Connect Pro Fleet — Bill of Sale / Internal Purchase Record dialog (Build #45).
// Documents a private-seller vehicle purchase. The Internal Purchase Record is
// clearly labelled as internal (NOT seller-signed). Purchase-price conflicts
// against the authoritative vehicle acquisition are surfaced without overwrite.

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
import { TENDER_METHODS, TENDER_METHOD_LABELS } from "@/lib/paymentMethodTypes";
import { fmtMoneyExact } from "@/lib/format";
import { purchaseAmountConflict } from "@/lib/vaultSelectors";
import { openPurchasePdf } from "@/lib/vaultPurchasePdf";

export function BillOfSaleDialog({
  vehicle,
  open,
  onOpenChange,
  isInternal,
}: {
  vehicle: Vehicle;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isInternal: boolean;
}) {
  const vault = useVault();
  const store = useStore();
  const [sellerName, setSellerName] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [purchasePrice, setPurchasePrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [odometer, setOdometer] = useState("");
  const [sourcePlatform, setSourcePlatform] = useState("");
  const [terms, setTerms] = useState("Vehicle sold as-is.");
  const [asIs, setAsIs] = useState(true);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canGenerate = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.generate_purchase",
  );
  const canSign = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.sign",
  );
  const canViewSensitive = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.view_sensitive",
  );

  function reset() {
    setSellerName("");
    setSellerAddress("");
    setSellerPhone("");
    setPurchasePrice("");
    setOdometer("");
    setSourcePlatform("");
    setCreatedId(null);
  }

  function handleCreate() {
    if (!sellerName || !purchasePrice || !purchaseDate) return;
    const base = {
      vehicle_id: vehicle.id,
      seller_name: sellerName,
      seller_address: sellerAddress || null,
      seller_phone: sellerPhone || null,
      purchase_date: purchaseDate,
      purchase_price: Number(purchasePrice),
      purchase_payment_method: paymentMethod,
      odometer: odometer ? Number(odometer) : null,
      terms: terms || null,
      as_is: asIs,
      source_platform: sourcePlatform || null,
    };
    const id = isInternal
      ? vault.createPurchaseRecord({ ...base, is_internal: true })
      : vault.createBillOfSale({ ...base, is_internal: false });
    setCreatedId(id);
  }

  function handleSign() {
    if (!createdId) return;
    const staff = store.staff.find((s) => s.id === store.currentStaffId);
    // Buyer/recorder signs first.
    vault.signDocument(createdId, {
      role: isInternal ? "recorder" : "buyer",
      signer_name: staff?.full_name ?? "Staff",
      signature_data: `typed:${staff?.full_name ?? "Staff"}`,
    });
    if (!isInternal) {
      // Seller signature captured as typed attestation.
      vault.signDocument(createdId, {
        role: "seller",
        signer_name: sellerName,
        signature_data: `typed:${sellerName}`,
      });
    }
    onOpenChange(false);
    reset();
  }

  const created = createdId ? vault.generatedDocById(createdId) : null;
  const conflict = created
    ? purchaseAmountConflict(created, vehicle.purchase_price)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isInternal
              ? "Create Internal Purchase Record"
              : "Create Bill of Sale"}
          </DialogTitle>
          <DialogDescription>
            {isInternal
              ? "Internal company documentation when the seller will not sign. Not seller-signed."
              : "Documents a private-seller vehicle purchase. May include buyer + seller signatures."}
          </DialogDescription>
        </DialogHeader>

        {!created ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Seller full name</Label>
                <Input
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  placeholder="Carlos Mendez"
                />
              </div>
              <div>
                <Label>Seller phone</Label>
                <Input
                  value={sellerPhone}
                  onChange={(e) => setSellerPhone(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Seller address</Label>
              <Input
                value={sellerAddress}
                onChange={(e) => setSellerAddress(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Purchase date</Label>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>
              <div>
                <Label>Purchase price</Label>
                <Input
                  type="number"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="4500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TENDER_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {TENDER_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Odometer</Label>
                <Input
                  type="number"
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  placeholder="98000"
                />
              </div>
            </div>
            <div>
              <Label>Source / platform (optional)</Label>
              <Input
                value={sourcePlatform}
                onChange={(e) => setSourcePlatform(e.target.value)}
                placeholder="Facebook Marketplace"
              />
            </div>
            <div>
              <Label>Terms</Label>
              <Input value={terms} onChange={(e) => setTerms(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={asIs}
                onChange={(e) => setAsIs(e.target.checked)}
              />
              AS-IS acknowledgement
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-surface-2 p-3">
              <p className="text-sm font-medium text-foreground">
                {created.document_number}
              </p>
              <p className="text-xs text-muted-foreground">
                {sellerName} · {fmtMoneyExact(Number(purchasePrice))}
              </p>
            </div>
            {conflict && (
              <p className="text-xs text-status-out">
                Purchase amount conflict: record{" "}
                {fmtMoneyExact(conflict.generated)} vs vehicle acquisition{" "}
                {fmtMoneyExact(conflict.authoritative)}. Neither value was
                overwritten — review required.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                created &&
                openPurchasePdf({
                  doc: created,
                  vehicle,
                  company: store.companyInfo,
                  showFullVin: canViewSensitive,
                })
              }
            >
              Preview PDF
            </Button>
          </div>
        )}

        <DialogFooter>
          {!created ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!canGenerate || !sellerName || !purchasePrice}
              >
                Create Record
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Save without signing
              </Button>
              <Button onClick={handleSign} disabled={!canSign}>
                {isInternal ? "Sign (Recorder)" : "Sign (Buyer + Seller)"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
