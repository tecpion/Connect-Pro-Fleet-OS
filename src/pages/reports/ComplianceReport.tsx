// Connect Pro Fleet — Compliance report (Build #26).
// Derived compliance summary: required docs, compliant, missing, expired,
// expiring soon, pending review, blocked vehicles, customer compliance. No
// report-specific financial truth — all values come from the compliance store
// (requirements + documents + verification) via the compliance selectors.
// Sensitive document numbers are masked/omitted in export by default.

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { can } from "@/lib/permissions";
import {
  getExpiredDocuments,
  getDocumentsExpiringWithin,
} from "@/lib/complianceSelectors";
import { getEntityComplianceStatus } from "@/lib/complianceStatus";
import {
  legacyVehicleDocuments,
  legacyCustomerDocuments,
  mergeLegacyDocuments,
} from "@/lib/complianceLegacyFallback";
import {
  ReportShell,
  KpiTile,
  ReportTable,
  ExportButton,
  type Column,
} from "./ReportShared";
import { toCsv } from "@/lib/reportCsv";
import {
  COMPLIANCE_STATUS_LABELS,
  documentTypeLabel,
} from "@/lib/complianceTypes";
import type { ComplianceStatus } from "@/lib/complianceTypes";
import { fmtDate } from "@/lib/format";

const NOW = new Date("2026-09-02T12:00:00Z");

export function ComplianceReport() {
  const store = useStore();
  const comp = useCompliance();

  const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
  const roleObj = store.roles.find((r) => r.id === currentStaff?.role_id);
  const canViewSensitive = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "documents.view_sensitive",
  );

  // Merge legacy-derived virtual documents so the report reflects the same
  // compliance truth as the Compliance Center (no dual-truth drift).
  const mergedDocs = useMemo(() => {
    const virtual = [
      ...store.vehicles.flatMap(legacyVehicleDocuments),
      ...store.customers.flatMap(legacyCustomerDocuments),
    ];
    return mergeLegacyDocuments(comp.documents, virtual);
  }, [comp.documents, store.vehicles, store.customers]);

  const expired = getExpiredDocuments(mergedDocs, NOW);
  const expiring = getDocumentsExpiringWithin(mergedDocs, NOW, 30);
  const pendingReview = mergedDocs.filter(
    (d) =>
      d.verification_status === "pending" ||
      d.verification_status === "not_reviewed",
  );

  // Per-vehicle compliance.
  const vehicleRows = useMemo(() => {
    return store.vehicles.map((v) => {
      const label = `${v.year} ${v.make} ${v.model} (${v.license_plate})`;
      const r = getEntityComplianceStatus(
        "vehicle",
        v.id,
        label,
        comp.requirements,
        mergedDocs,
        comp.overrides,
        NOW,
      );
      return {
        vehicle: label,
        status: r.status,
        blocking: r.blockingReasons.length,
        issues: r.issues.length,
      };
    });
  }, [store.vehicles, comp.requirements, mergedDocs, comp.overrides]);

  // Per-customer compliance (sensitive number masked).
  const customerRows = useMemo(() => {
    return store.customers.map((c) => {
      const label = `${c.first_name} ${c.last_name}`;
      const r = getEntityComplianceStatus(
        "customer",
        c.id,
        label,
        comp.requirements,
        mergedDocs,
        comp.overrides,
        NOW,
      );
      return {
        customer: label,
        status: r.status,
        issues: r.issues.length,
      };
    });
  }, [store.customers, comp.requirements, mergedDocs, comp.overrides]);

  const blockedVehicles = vehicleRows.filter((r) => r.status === "blocked");
  const nonCompliantCustomers = customerRows.filter(
    (r) => r.status === "non_compliant" || r.status === "blocked",
  );

  // Missing required = issues with reason "missing_required" across entities.
  const allIssues = useMemo(() => {
    const issues = [];
    for (const v of store.vehicles) {
      const label = `${v.year} ${v.make} ${v.model} (${v.license_plate})`;
      issues.push(
        ...getEntityComplianceStatus(
          "vehicle",
          v.id,
          label,
          comp.requirements,
          mergedDocs,
          comp.overrides,
          NOW,
        ).issues,
      );
    }
    for (const c of store.customers) {
      issues.push(
        ...getEntityComplianceStatus(
          "customer",
          c.id,
          `${c.first_name} ${c.last_name}`,
          comp.requirements,
          mergedDocs,
          comp.overrides,
          NOW,
        ).issues,
      );
    }
    return issues;
  }, [
    store.vehicles,
    store.customers,
    comp.requirements,
    mergedDocs,
    comp.overrides,
  ]);

  const missingRequired = allIssues.filter(
    (i) => i.reason === "missing_required",
  ).length;

  const vehicleCols: Column<(typeof vehicleRows)[number]>[] = [
    { key: "vehicle", header: "Vehicle", render: (x) => x.vehicle },
    {
      key: "status",
      header: "Status",
      render: (x) => COMPLIANCE_STATUS_LABELS[x.status as ComplianceStatus],
    },
    {
      key: "blocking",
      header: "Blocking reasons",
      render: (x) => String(x.blocking),
      mono: true,
    },
    {
      key: "issues",
      header: "Open issues",
      render: (x) => String(x.issues),
      mono: true,
    },
  ];

  const customerCols: Column<(typeof customerRows)[number]>[] = [
    { key: "customer", header: "Customer", render: (x) => x.customer },
    {
      key: "status",
      header: "Status",
      render: (x) => COMPLIANCE_STATUS_LABELS[x.status as ComplianceStatus],
    },
    {
      key: "issues",
      header: "Open issues",
      render: (x) => String(x.issues),
      mono: true,
    },
  ];

  // Export: omit sensitive document numbers by default; mask when permitted.
  const exportRows = useMemo(() => {
    return mergedDocs.map((d) => ({
      type: documentTypeLabel(d.document_type),
      entity: d.entity_label,
      status: d.status,
      verification: d.verification_status,
      expires: d.expiration_date ? fmtDate(d.expiration_date) : "",
      // Sensitive numbers masked/omitted unless explicitly permitted.
      number:
        d.document_number && canViewSensitive
          ? d.document_number
          : d.document_number
            ? "••••"
            : "",
    }));
  }, [mergedDocs, canViewSensitive]);

  return (
    <ReportShell
      title="Compliance Report"
      subtitle="Document compliance, expirations, blocked vehicles, and customer credential status."
      generatedAt={new Date()}
      actions={
        <ExportButton
          onClick={() => {
            const csv = toCsv(exportRows, [
              "type",
              "entity",
              "status",
              "verification",
              "expires",
              "number",
            ]);
            const blob = new Blob([csv], {
              type: "text/csv;charset=utf-8;",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "compliance-report.csv";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiTile
          label="Blocked vehicles"
          value={String(blockedVehicles.length)}
          tone={blockedVehicles.length > 0 ? "danger" : "default"}
        />
        <KpiTile
          label="Expired"
          value={String(expired.length)}
          tone={expired.length > 0 ? "danger" : "default"}
        />
        <KpiTile
          label="Expiring soon"
          value={String(expiring.length)}
          tone={expiring.length > 0 ? "warning" : "default"}
        />
        <KpiTile
          label="Missing required"
          value={String(missingRequired)}
          tone={missingRequired > 0 ? "danger" : "default"}
        />
        <KpiTile
          label="Pending review"
          value={String(pendingReview.length)}
          tone={pendingReview.length > 0 ? "warning" : "default"}
        />
        <KpiTile
          label="Non-compliant customers"
          value={String(nonCompliantCustomers.length)}
          tone={nonCompliantCustomers.length > 0 ? "danger" : "default"}
        />
      </div>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Vehicle Compliance
        </h2>
        <ReportTable
          columns={vehicleCols}
          rows={vehicleRows}
          emptyMessage="No vehicles."
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Customer Compliance
        </h2>
        <ReportTable
          columns={customerCols}
          rows={customerRows}
          emptyMessage="No customers."
        />
      </section>

      <p className="text-xs text-muted-foreground">
        Compliance status is derived from company-configured requirements plus
        document verification state — never stored as a boolean. Sensitive
        document numbers (driver license, policy #) are masked in exports unless
        the viewer has{" "}
        <span className="font-mono">documents.view_sensitive</span>. Compliance
        requirements are configured by your company and do not constitute legal
        advice.
      </p>
    </ReportShell>
  );
}
