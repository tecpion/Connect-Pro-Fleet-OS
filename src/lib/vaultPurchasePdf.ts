// Connect Pro Fleet — Vehicle Vault Bill of Sale / Purchase Record PDF (Build #45).
//
// Generates a professional Bill of Sale or Internal Purchase Record PDF. The
// Internal Purchase Record is clearly labelled as internal company
// documentation (NOT seller-signed) when is_internal is true (spec §24, §25,
// §62). Neutral legal copy — no ownership/title-transfer guarantees (spec §23).

import type { VaultDocument } from "./vaultTypes";
import type { Vehicle } from "./types";
import type { CompanyInfo } from "./settingsTypes";
import { fmtMoneyExact, fmtDate } from "./format";
import { maskVin } from "./vaultSelectors";
import { VAULT_PDF_STYLES } from "./vaultPdf";

function openPrintWindow(html: string): void {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

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

/** Render the Bill of Sale or Internal Purchase Record PDF (spec §22, §25). */
export function openPurchasePdf(opts: {
  doc: VaultDocument;
  vehicle: Vehicle;
  company: CompanyInfo;
  showFullVin: boolean;
}): void {
  const { doc, vehicle, company, showFullVin } = opts;
  const isInternal = doc.is_internal;
  const title = isInternal
    ? "Internal Purchase Record"
    : "Bill of Sale / Vehicle Purchase Record";
  const disclaimer = isInternal
    ? "This is an internal company record of the vehicle purchase. The seller did not execute this document. " +
      "It does not replace a title, guarantee legal ownership, or satisfy all DMV/state requirements. " +
      "Additional title, registration, tax, notarization, or state-specific requirements may apply."
    : "This document records the vehicle purchase transaction. It does not replace a title, guarantee legal " +
      "ownership, or satisfy all DMV/state requirements. Additional title, registration, tax, notarization, " +
      "or state-specific requirements may apply.";

  const buyerSig = doc.signatures.find(
    (s) => s.role === "buyer" || s.role === "recorder",
  );
  const sellerSig = doc.signatures.find((s) => s.role === "seller");

  const sigRow = isInternal
    ? `<div class="sig-row">
         <div class="sig-box">${buyerSig ? `<div class="name">${buyerSig.signer_name}</div>Recorder · signed ${fmtDate(buyerSig.signed_at)}` : "Recorder signature"}</div>
         <div class="sig-box"><div class="muted">Seller did not sign (internal record)</div></div>
       </div>`
    : `<div class="sig-row">
         <div class="sig-box">${buyerSig ? `<div class="name">${buyerSig.signer_name}</div>Buyer · signed ${fmtDate(buyerSig.signed_at)}` : "Buyer signature"}</div>
         <div class="sig-box">${sellerSig ? `<div class="name">${sellerSig.signer_name}</div>Seller · signed ${fmtDate(sellerSig.signed_at)}` : "Seller signature"}</div>
       </div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} · ${doc.document_number}</title>
<style>${VAULT_PDF_STYLES}</style>
</head>
<body>
<div class="sheet">
  ${brandHeader(company, title)}
  <h1 class="display">${title}</h1>
  <p class="muted mono" style="margin:0;">${doc.document_number} · v${doc.version}${isInternal ? " · INTERNAL" : ""}</p>
  <div class="route">
    <svg viewBox="0 0 600 24" preserveAspectRatio="none" style="width:100%;height:14px;">
      <path d="M4 12 C 80 12, 80 4, 160 4 S 240 20, 320 12 S 400 4, 480 12 S 560 20, 596 12" fill="none" stroke="#2251EA" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  </div>

  <h2>Buyer</h2>
  <dl class="grid">
    <div><dt>Company</dt><dd>${company.legal_name}</dd></div>
    <div><dt>Address</dt><dd>${company.street}, ${company.city}, ${company.state} ${company.zip}</dd></div>
  </dl>

  <h2>Seller</h2>
  <dl class="grid">
    <div><dt>Name</dt><dd>${doc.seller_name ?? "—"}</dd></div>
    <div><dt>Phone</dt><dd>${doc.seller_phone ?? "—"}</dd></div>
    <div><dt>Address</dt><dd>${doc.seller_address ?? "—"}</dd></div>
    ${doc.source_platform ? `<div><dt>Source / Platform</dt><dd>${doc.source_platform}</dd></div>` : ""}
  </dl>

  <h2>Vehicle</h2>
  <dl class="grid">
    <div><dt>Year / Make / Model</dt><dd>${vehicle.year} ${vehicle.make} ${vehicle.model}</dd></div>
    <div><dt>VIN</dt><dd class="mono">${maskVin(vehicle.vin, showFullVin)}</dd></div>
    <div><dt>Plate</dt><dd class="mono">${vehicle.license_plate}</dd></div>
    <div><dt>Odometer</dt><dd class="mono">${doc.odometer != null ? doc.odometer + " mi" : "—"}</dd></div>
  </dl>

  <h2>Transaction</h2>
  <dl class="grid">
    <div><dt>Purchase Date</dt><dd>${doc.purchase_date ? fmtDate(doc.purchase_date) : "—"}</dd></div>
    <div><dt>Purchase Price</dt><dd class="num">${doc.purchase_price != null ? fmtMoneyExact(doc.purchase_price) : "—"}</dd></div>
    <div><dt>Payment Method</dt><dd>${doc.purchase_payment_method ?? "—"}</dd></div>
    <div><dt>Terms</dt><dd>${doc.terms ?? "—"}</dd></div>
  </dl>
  ${doc.as_is ? `<p style="font-size:13px;">Vehicle sold <strong>AS-IS</strong>, with no warranties expressed or implied.</p>` : ""}

  ${sigRow}
  <p class="disclaimer">${disclaimer}</p>
  <div class="footer">
    ${company.legal_name} · ${company.street}, ${company.city}, ${company.state} ${company.zip}<br/>
    ${company.business_phone} · ${company.business_email}<br/>
    Generated ${fmtDate(new Date().toISOString())}.<br/>
    Generated with Connect Pro Fleet.
  </div>
</div>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;
  openPrintWindow(html);
}

/** Dispatch to the correct PDF renderer based on doc kind. */
export function openGeneratedDocPdf(opts: {
  doc: VaultDocument;
  vehicle: Vehicle;
  company: CompanyInfo;
  showFullVin: boolean;
}): void {
  if (opts.doc.kind === "cash_expense_record") {
    // Lazy import avoided — vaultPdf exports openCashExpensePdf.
    import("./vaultPdf").then((m) => m.openCashExpensePdf(opts));
  } else {
    openPurchasePdf(opts);
  }
}
