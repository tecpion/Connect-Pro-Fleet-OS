// Connect Pro Fleet — Settings > Rental Policies hub (Build #23).
//
// Single editable form backed by useCompanyPolicies, rendering every policy
// section + a human-readable summary. Warns on unsaved changes and confirms
// high-impact (financial) changes. Mobile-first cards.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { useStore } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { policySummary } from "@/lib/companyPolicy";
import { useCan } from "./useCan";
import {
  BusinessHoursSection,
  BillingPaymentSection,
  LateFeeSection,
  PaymentMethodsSection,
  DepositPolicySection,
} from "./CompanyPolicySections";
import { RentalModelSection, MileageFuelSection } from "./RentalModelSections";
import { DriverInsuranceSection } from "./DriverInsuranceSection";
import { OperationsPolicySection } from "./OperationsPolicySection";

export function RentalPoliciesSection() {
  const { companyPolicies, updateCompanyPolicies } = useCompanyPolicies();
  const { logSettingsChange } = useStore();
  const canManagePolicies = useCan("rental_policies.manage");
  const canManageBilling = useCan("billing_policies.manage");
  const canManageCompany = useCan("company_settings.manage");
  const canAnyManage =
    canManagePolicies || canManageBilling || canManageCompany;

  const [form, setForm] = useState(companyPolicies);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingPatch = useRef<Partial<typeof form> | null>(null);

  // Keep the form seeded from the store when policies change externally.
  useEffect(() => {
    setForm(companyPolicies);
  }, [companyPolicies]);

  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(companyPolicies),
    [form, companyPolicies],
  );

  // Detect high-impact financial changes (late fee amount/type, cutoff, deposit).
  const highImpact = useMemo(() => {
    const a = companyPolicies;
    const b = form;
    return (
      a.late_fee.fixed_amount !== b.late_fee.fixed_amount ||
      a.late_fee.percentage !== b.late_fee.percentage ||
      a.late_fee.type !== b.late_fee.type ||
      a.late_fee.enabled !== b.late_fee.enabled ||
      a.payment.payment_cutoff_time !== b.payment.payment_cutoff_time ||
      a.payment.grace_period_minutes !== b.payment.grace_period_minutes ||
      a.deposit.default_amount !== b.deposit.default_amount ||
      a.deposit.requirement !== b.deposit.requirement
    );
  }, [companyPolicies, form]);

  // Warn before navigating away with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const doSave = () => {
    updateCompanyPolicies(form);
    logSettingsChange({
      action: "Company rental policies updated",
      detail: "Rental/billing/deposit/late-fee policies saved.",
    });
    toast.success(
      "Company policies saved. New rentals will use the updated policy; existing rentals keep their frozen snapshot.",
    );
    setConfirmOpen(false);
    pendingPatch.current = null;
  };

  const onSave = () => {
    if (highImpact) {
      setConfirmOpen(true);
      return;
    }
    doSave();
  };

  const summary = policySummary(form);

  return (
    <div className="space-y-6">
      <SectionCard title="Policy summary">
        <ul className="space-y-1.5">
          {summary.map((line) => (
            <li key={line} className="text-sm text-foreground">
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Existing rentals retain their frozen policy snapshot; these settings
          apply to new rentals going forward.
        </p>
      </SectionCard>

      <BusinessHoursSection form={form} set={set} />
      <RentalModelSection form={form} set={set} />
      <BillingPaymentSection form={form} set={set} />
      <LateFeeSection form={form} set={set} />
      <PaymentMethodsSection form={form} set={set} />
      <DepositPolicySection form={form} set={set} />
      <MileageFuelSection form={form} set={set} />
      <DriverInsuranceSection form={form} set={set} />
      <OperationsPolicySection form={form} set={set} />

      {canAnyManage && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!dirty}
              onClick={() => setForm(companyPolicies)}
            >
              Discard
            </Button>
            <Button
              disabled={!dirty}
              onClick={onSave}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Save policies
            </Button>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-5">
            <h3 className="font-display text-base font-semibold text-foreground">
              Confirm high-impact policy change
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              You are changing financial policy (late fee, cutoff, grace, or
              deposit). This applies to <strong>new rentals</strong>. Existing
              rentals will retain their current frozen policy unless explicitly
              amended.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={doSave}
                className="bg-primary text-primary-foreground hover:bg-primary-press"
              >
                Confirm &amp; save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
