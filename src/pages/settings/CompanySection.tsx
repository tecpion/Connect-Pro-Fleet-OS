// Connect Pro Fleet — Settings → Company (Settings Consolidation pass).
//
// Restructured into three clear sections:
//   1. Legal Business Information — name, tax ID, registration, address
//   2. Customer-Facing Information — DBA, phones, emails, website, logo
//   3. Business Defaults — timezone, currency, language
//
// Sensitive legal fields (Tax ID / EIN) are permission-aware and masked for
// ordinary staff. The logo is uploaded/replaced via a file picker (the
// underlying storage still uses a url reference). No raw storage details are
// exposed to normal users.

import { useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, Eye, EyeOff, X } from "lucide-react";
import type { CompanyInfo } from "@/lib/types";
import { Field } from "./shared";
import { useCan } from "./useCan";

/** Mask a Tax ID / EIN, showing only the last 4 characters. */
export function maskTaxId(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "••••";
  return `•••••${digits.slice(-4)}`;
}

export function CompanySection() {
  const { companyInfo, updateCompanyInfo, logSettingsChange } = useStore();
  const [form, setForm] = useState<CompanyInfo>(companyInfo);
  const [revealTaxId, setRevealTaxId] = useState(false);
  const canViewSensitive = useCan("company_settings.manage");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<CompanyInfo>) =>
    setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    updateCompanyInfo(form);
    logSettingsChange({ action: "Company information updated" });
    toast.success("Company information saved.");
  };

  const onLogoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    const url = URL.createObjectURL(file);
    set({ logo_url: url });
    toast.success("Logo uploaded. Save to confirm.");
  };

  return (
    <div className="space-y-6">
      {/* 1 — Legal Business Information */}
      <SectionCard title="Legal Business Information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Legal name">
            <Input
              value={form.legal_name}
              onChange={(e) => set({ legal_name: e.target.value })}
            />
          </Field>
          <Field
            label="Tax ID / EIN"
            hint={
              canViewSensitive
                ? "Sensitive — visible only to authorized admins."
                : "Sensitive — masked for your role."
            }
          >
            {canViewSensitive ? (
              <div className="flex items-center gap-2">
                <Input
                  value={
                    revealTaxId ? (form.tax_id ?? "") : maskTaxId(form.tax_id)
                  }
                  onChange={(e) => set({ tax_id: e.target.value || null })}
                  className="font-mono tabular"
                  placeholder="00-0000000"
                  type={revealTaxId ? "text" : "password"}
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setRevealTaxId((v) => !v)}
                  aria-label={revealTaxId ? "Hide Tax ID" : "Reveal Tax ID"}
                >
                  {revealTaxId ? <EyeOff size={15} /> : <Eye size={15} />}
                </Button>
              </div>
            ) : (
              <Input
                value={maskTaxId(form.tax_id)}
                readOnly
                className="font-mono tabular text-muted-foreground"
              />
            )}
          </Field>
          <Field label="Registration number">
            <Input
              value={form.registration_number ?? ""}
              onChange={(e) =>
                set({ registration_number: e.target.value || null })
              }
              className="font-mono tabular"
            />
          </Field>
          <Field label="Street address">
            <Input
              value={form.street}
              onChange={(e) => set({ street: e.target.value })}
            />
          </Field>
          <Field label="Address line 2">
            <Input
              value={form.street2}
              onChange={(e) => set({ street2: e.target.value })}
            />
          </Field>
          <Field label="City">
            <Input
              value={form.city}
              onChange={(e) => set({ city: e.target.value })}
            />
          </Field>
          <Field label="State">
            <Input
              value={form.state}
              onChange={(e) => set({ state: e.target.value })}
            />
          </Field>
          <Field label="ZIP / Postal code">
            <Input
              value={form.zip}
              onChange={(e) => set({ zip: e.target.value })}
              className="font-mono tabular"
            />
          </Field>
          <Field label="Country">
            <Input
              value={form.country}
              onChange={(e) => set({ country: e.target.value })}
            />
          </Field>
        </div>
      </SectionCard>

      {/* 2 — Customer-Facing Information */}
      <SectionCard title="Customer-Facing Information">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="DBA / Display name">
            <Input
              value={form.dba}
              onChange={(e) => set({ dba: e.target.value })}
            />
          </Field>
          <Field label="Business phone">
            <Input
              value={form.business_phone}
              onChange={(e) => set({ business_phone: e.target.value })}
              className="font-mono tabular"
            />
          </Field>
          <Field label="Business email">
            <Input
              value={form.business_email}
              onChange={(e) => set({ business_email: e.target.value })}
              className="font-mono tabular"
            />
          </Field>
          <Field label="Support phone">
            <Input
              value={form.support_phone ?? ""}
              onChange={(e) => set({ support_phone: e.target.value || null })}
              className="font-mono tabular"
            />
          </Field>
          <Field label="Support email">
            <Input
              value={form.support_email ?? ""}
              onChange={(e) => set({ support_email: e.target.value || null })}
              className="font-mono tabular"
            />
          </Field>
          <Field label="Website">
            <Input
              value={form.website}
              onChange={(e) => set({ website: e.target.value })}
              className="font-mono tabular"
            />
          </Field>
          <Field label="Company logo" className="sm:col-span-2">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Company logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">No logo</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={14} className="mr-1.5" /> Upload logo
                </Button>
                {form.logo_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => {
                      set({ logo_url: null });
                      toast.info("Logo removed. Save to confirm.");
                    }}
                  >
                    <X size={14} className="mr-1.5" /> Remove
                  </Button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onLogoPick}
                />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Used on rental agreements, receipts, deposit receipts, and
              investor statements.
            </p>
          </Field>
        </div>
      </SectionCard>

      {/* 3 — Business Defaults */}
      <SectionCard title="Business Defaults">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Default timezone">
            <Input
              value={form.timezone}
              onChange={(e) => set({ timezone: e.target.value })}
            />
          </Field>
          <Field label="Default currency">
            <Input
              value={form.currency}
              onChange={(e) => set({ currency: e.target.value })}
              className="font-mono tabular"
            />
          </Field>
          <Field label="Default language">
            <Input
              value={form.language}
              onChange={(e) => set({ language: e.target.value })}
            />
          </Field>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          onClick={save}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          Save company information
        </Button>
      </div>
    </div>
  );
}
