// Connect Pro Fleet — Vehicle Vault PDF generation (Build #45).
//
// Generates clean, tenant-branded, printable PDFs for Cash Expense Records and
// Bills of Sale / Purchase Records via the browser's native print-to-PDF (same
// approach as investorSettlementPdf). Generated records are clearly labelled as
// generated business documentation — never as vendor receipts, and never with
// legal/tax guarantee language (spec §62, §63, §23).
//
// This module holds the shared HTML shell + the Cash Expense Record renderer.
// The Bill of Sale / Purchase Record renderer lives in vaultPurchasePdf.ts.

import type { VaultDocument } from "./vaultTypes";
import type { Vehicle } from "./types";
import type { CompanyInfo } from "./settingsTypes";
import { fmtMoneyExact, fmtDate } from "./format";
import { maskVin } from "./vaultSelectors";
import { TENDER_METHOD_LABELS } from "./paymentMethodTypes";

function brandHeader(company: CompanyInfo, docTitle: string): string {
  return `
  <div class="brand">
    <div class="brand-mark">
      <svg viewBox="0 0 120 12" preserveAspectRatio="none"><path d="M2 6 C 20 6, 20 2, 40 2 S 60 10, 80 6 S 100 2, 118 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>
    </div>
    <div>
      <div class="brand-name">${company.dba || company.legal_name}</div>
      <div class="brand-sub">${docTitle.toLowerCase()}</div>
    </div>
  </div>`;
}

function footer(company: CompanyInfo, extra: string): string {
  return `
  <div class="footer">
    ${company.legal_name} · ${company.street}, ${company.city}, ${company.state} ${company.zip}<br/>
    ${company.business_phone} · ${company.business_email}<br/>
    ${extra}
    <br/>Generated with Connect Pro Fleet.
  </div>`;
}

/** Shared <style> block for vault PDFs. */
export const VAULT_PDF_STYLES = `
  @page { margin: 1.5cm 2cm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1B2430; margin: 0; padding: 32px; background: #F2F4F3; }
  .display { font-family: 'Space Grotesk', 'Inter', sans-serif; }
  .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .num { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; text-align: right; }
  .sheet { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 40px 44px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-mark { width: 30px; height: 30px; border-radius: 7px; background: #2251EA; display: flex; align-items: center; justify-content: center; }
  .brand-mark svg { width: 18px; height: 18px; }
  .brand-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 15px; }
  .brand-sub { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #6b7280; }
  h1 { font-family: 'Space Grotesk', sans-serif; font-size: 22px; margin: 24px 0 4px; }
  h2 { font-family: 'Space Grotesk', sans-serif; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 22px 0 6px; }
  .muted { color: #6b7280; }
  .route { margin: 18px 0 22px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 32px; margin: 14px 0; }
  .grid dt { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
  .grid dd { margin: 2px 0 0; font-size: 14px; }
  .cert { margin-top: 24px; padding: 14px 16px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 12px; color: #374151; background: #F9FAFB; }
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 28px; }
  .sig-box { border-top: 1px solid #1B2430; padding-top: 6px; font-size: 11px; color: #6b7280; }
  .sig-box .name { font-size: 13px; color: #1B2430; font-weight: 500; }
  .disclaimer { margin-top: 18px; font-size: 10px; color: #9ca3af; font-style: italic; }
  .footer { margin-top: 28px; font-size: 11px; color: #9ca3af; border-top: 1px solid #f1f3f2; padding-top: 12px; }
  @media print { body { padding: 0; background: #fff; } .sheet { border: none; max-width: none; padding: 0; } }
`;

function openPrintWindow(html: string): void {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** Render the Cash Expense Record PDF (spec §12). */
export function openCashExpensePdf(opts: {
  doc: VaultDocument;
  vehicle: Vehicle;
  company: CompanyInfo;
  showFullVin: boolean;
}): void {
  const { doc, vehicle, company, showFullVin } = opts;
  const cert =
    "I certify that the information above accurately reflects the business expense recorded.";
  const disclaimer =
    "This is a generated Cash Expense Record — a business documentation tool. It is not a vendor receipt. " +
    "It does not guarantee tax deductibility or satisfy any specific IRS or regulatory requirement.";

  const sigBlock = doc.signatures.length
    ? `<div class="sig-row">${doc.signatures
        .map(
          (s) =>
            `<div class="sig-box"><div class="name">${s.signer_name}</div>${s.role} · signed ${fmtDate(s.signed_at)}</div>`,
        )
        .join("")}</div>`
    : `<div class="sig-row"><div class="sig-box">Recorder signature</div><div class="sig-box">Date</div></div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Cash Expense Record · ${doc.document_number}</title>
<style>${VAULT_PDF_STYLES}</style>
</head>
<body>
<div class="sheet">
  ${brandHeader(company, "Cash Expense Record")}
  <h1 class="display">Cash Expense Record</h1>
  <p class="muted mono" style="margin:0;">${doc.document_number} · v${doc.version}</p>
  <div class="route">
    <svg viewBox="0 0 600 24" preserveAspectRatio="none" style="width:100%;height:14px;">
      <path d="M4 12 C 80 12, 80 4, 160 4 S 240 20, 320 12 S 400 4, 480 12 S 560 20, 596 12" fill="none" stroke="#2251EA" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  </div>
  <dl class="grid">
    <div><dt>Vehicle</dt><dd>${vehicle.year} ${vehicle.make} ${vehicle.model}</dd></div>
    <div><dt>VIN</dt><dd class="mono">${maskVin(vehicle.vin, showFullVin)}</dd></div>
    <div><dt>Paid To</dt><dd>${doc.vendor_name ?? "—"}</dd></div>
    <div><dt>Date</dt><dd>${doc.expense_date ? fmtDate(doc.expense_date) : "—"}</dd></div>
    <div><dt>Amount</dt><dd class="num">${doc.amount != null ? fmtMoneyExact(doc.amount) : "—"}</dd></div>
    <div><dt>Payment Method</dt><dd>${doc.payment_method ? TENDER_METHOD_LABELS[doc.payment_method] : "—"}</dd></div>
    <div><dt>Expense Category</dt><dd>${doc.expense_category_id ?? "—"}</dd></div>
    <div><dt>Recorded By</dt><dd>${doc.created_by ?? "—"}</dd></div>
  </dl>
  <h2>Description / Business Purpose</h2>
  <p style="font-size:14px;">${doc.description ?? "—"}</p>
  ${doc.notes ? `<h2>Notes</h2><p style="font-size:13px;" class="muted">${doc.notes}</p>` : ""}
  <div class="cert">${cert}</div>
  ${sigBlock}
  <p class="disclaimer">${disclaimer}</p>
  ${footer(company, `Generated ${fmtDate(new Date().toISOString())}.`)}
</div>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;
  openPrintWindow(html);
}
