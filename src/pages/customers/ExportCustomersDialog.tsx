// Connect Pro Fleet — Export Customers dialog (Build #38 — Customers V1).
//
// Export All / Export Current View / Export Selected. CSV only for V1.
// Respects active filters + search (current view). Sensitive fields (driver
// license number, financial balances) are included only when the viewer has
// the matching permission.

import { useStore } from "@/lib/store";
import { useCan } from "@/pages/settings/useCan";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  buildExportRows,
  exportRowsToCsv,
  type CustomerWorkspaceRow,
  type ExportPermissions,
} from "@/lib/customerWorkspaceSelectors";
import type { Customer } from "@/lib/types";

export type ExportMode = "all" | "view" | "selected";

export function ExportCustomersDialog({
  open,
  onOpenChange,
  mode,
  rows,
  selectedIds,
  verificationEnabled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: ExportMode;
  rows: CustomerWorkspaceRow[];
  selectedIds: string[];
  verificationEnabled: boolean;
}) {
  const { customers } = useStore();
  const canLicense = useCan("customers.view_license");
  const canInsurance = useCan("customers.view_insurance");
  const canFinancials = useCan("payments.view_revenue");

  const perms: ExportPermissions = {
    viewLicense: canLicense,
    viewInsurance: canInsurance,
    viewFinancials: canFinancials,
    viewVerification: verificationEnabled,
  };

  const handleExport = () => {
    let exportRows = rows;
    if (mode === "selected") {
      exportRows = rows.filter((r) => selectedIds.includes(r.id));
    }
    // mode === "all" uses the full rows passed (caller passes all rows);
    // mode === "view" uses the filtered rows passed.
    const built = buildExportRows(
      exportRows,
      customers as Customer[],
      perms,
      verificationEnabled,
    );
    const csv = exportRowsToCsv(built, perms);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const suffix =
      mode === "all" ? "all" : mode === "selected" ? "selected" : "view";
    a.href = url;
    a.download = `customers-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(
      `Exported ${built.length} customer${built.length === 1 ? "" : "s"}.`,
    );
    onOpenChange(false);
  };

  const count =
    mode === "selected"
      ? rows.filter((r) => selectedIds.includes(r.id)).length
      : rows.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Export customers —{" "}
            {mode === "all"
              ? "All"
              : mode === "selected"
                ? "Selected"
                : "Current View"}
          </DialogTitle>
          <DialogDescription>
            Exports {count} customer{count === 1 ? "" : "s"} to CSV. Sensitive
            fields (driver license, balances) are included only when you have
            permission.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Included fields:</p>
          <ul className="mt-1 space-y-0.5">
            <li>Name, phone, email, lifecycle, standing, tags</li>
            <li>Active renter, current vehicle, rental count, last rental</li>
            <li>
              Outstanding balance{" "}
              {perms.viewFinancials ? "✓" : "— (no permission)"}
            </li>
            <li>
              Driver license number{" "}
              {perms.viewLicense ? "✓" : "— (no permission)"}
            </li>
            <li>
              Verification state{" "}
              {verificationEnabled ? "✓" : "— (verification off)"}
            </li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary-press"
            onClick={handleExport}
          >
            Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
