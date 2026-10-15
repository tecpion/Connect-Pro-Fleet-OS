// Connect Pro Fleet — Vehicle Vault Add Document menu (Build #45).
// Scan Receipt / Upload Document / Create Cash Expense Record / Create Bill of
// Sale / Create Internal Purchase Record / Add Other Document.

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  ScanLine,
  Upload,
  ReceiptText,
  FileSignature,
  FileText,
} from "lucide-react";

export type MenuAction =
  | "scan_receipt"
  | "upload_document"
  | "cash_expense"
  | "bill_of_sale"
  | "purchase_record"
  | "other_document";

export function AddDocumentMenu({
  onAction,
  disabled,
}: {
  onAction: (a: MenuAction) => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={disabled}>
          <Plus size={15} className="mr-1.5" /> Add Document
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={() => onAction("scan_receipt")}>
          <ScanLine size={15} className="mr-2" /> Scan Receipt
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("upload_document")}>
          <Upload size={15} className="mr-2" /> Upload Document
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("cash_expense")}>
          <ReceiptText size={15} className="mr-2" /> Create Cash Expense Record
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("bill_of_sale")}>
          <FileSignature size={15} className="mr-2" /> Create Bill of Sale
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction("purchase_record")}>
          <FileSignature size={15} className="mr-2" /> Create Purchase Record
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction("other_document")}>
          <FileText size={15} className="mr-2" /> Add Other Document
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
