import { useState } from "react";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import type { AgreementTemplate } from "@/lib/types";
import { Field, selectClass } from "./shared";

export function AgreementsSection() {
  const {
    agreementTemplates,
    agreementRules,
    addAgreementTemplate,
    uploadAgreementTemplateVersion,
    setDefaultAgreementTemplate,
    updateAgreementRules,
    logSettingsChange,
  } = useStore();
  const [open, setOpen] = useState(false);

  const blank: AgreementTemplate = {
    id: uid("tpl"),
    tenant_id: TENANT_ID,
    name: "",
    agreement_type: "standard",
    description: "",
    file_url: "",
    file_name: "",
    version: 1,
    effective_date: new Date().toISOString().slice(0, 10),
    status: "draft",
    is_default: false,
    created_at: new Date().toISOString(),
    created_by: null,
  };
  const [form, setForm] = useState<AgreementTemplate>(blank);
  const set = (patch: Partial<AgreementTemplate>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-6">
      <SectionCard title="Agreement rules">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default agreement template">
            <select
              value={agreementRules.default_template_id ?? ""}
              onChange={(e) => {
                updateAgreementRules({ default_template_id: e.target.value });
                logSettingsChange({
                  action: "Default agreement template set",
                  new_value:
                    agreementTemplates.find((t) => t.id === e.target.value)
                      ?.name ?? "",
                });
              }}
              className={selectClass}
            >
              <option value="">None</option>
              {agreementTemplates
                .filter((t) => t.status === "active")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (v{t.version})
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Master agreement duration (days)">
            <Input
              type="number"
              value={agreementRules.master_duration_days}
              onChange={(e) =>
                updateAgreementRules({
                  master_duration_days: Number(e.target.value),
                })
              }
              className="font-mono tabular"
            />
          </Field>
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Require new signature when
          </p>
          {(
            [
              ["require_resign_on_expiry", "Master agreement expires"],
              ["require_resign_on_vehicle_change", "Vehicle changes"],
              ["require_resign_on_rate_change", "Rental rate changes"],
              [
                "require_resign_on_terms_change",
                "Agreement terms version changes",
              ],
              ["require_manual_resign", "Company requires manual re-sign"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2.5"
            >
              <span className="text-sm text-foreground">{label}</span>
              <Switch
                checked={agreementRules[key]}
                onCheckedChange={(v) => {
                  updateAgreementRules({ [key]: v });
                  logSettingsChange({
                    action: "Agreement rule updated",
                    new_value: `${label}: ${v ? "on" : "off"}`,
                  });
                }}
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Previously signed agreements stay tied to the terms in effect when
          they were signed. Expired or superseded master agreements are never
          used to generate new instances silently.
        </p>
      </SectionCard>

      <SectionCard
        title="Agreement templates"
        right={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setForm(blank);
              setOpen(true);
            }}
          >
            <Plus size={14} className="mr-1" /> Add template
          </Button>
        }
      >
        {agreementTemplates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No templates yet. Add one to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {agreementTemplates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {t.name}
                    </p>
                    <span className="font-mono text-xs tabular text-muted-foreground">
                      v{t.version}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                        t.status === "active" &&
                          "bg-status-available/10 text-status-available",
                        t.status === "superseded" &&
                          "bg-muted text-muted-foreground",
                        t.status === "draft" &&
                          "bg-status-maintenance/10 text-status-maintenance",
                        t.status === "inactive" &&
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {t.status}
                    </span>
                    {t.is_default && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 font-mono text-xs tabular text-muted-foreground">
                    {t.file_name} · effective {fmtDate(t.effective_date)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {t.status === "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const newId = uploadAgreementTemplateVersion(t.id, {
                          name: t.file_name,
                          url: t.file_url,
                        });
                        logSettingsChange({
                          action: "Agreement template version uploaded",
                          new_value: `${t.name} v${(t.version ?? 1) + 1} (${newId})`,
                          old_value: `${t.name} v${t.version}`,
                        });
                        toast.success(
                          "New version uploaded. Previous version superseded.",
                        );
                      }}
                    >
                      <Upload size={14} className="mr-1" /> New version
                    </Button>
                  )}
                  {!t.is_default && t.status === "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDefaultAgreementTemplate(t.id);
                        logSettingsChange({
                          action: "Default template set",
                          new_value: t.name,
                        });
                      }}
                    >
                      Set default
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add agreement template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Template name">
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Agreement type">
              <Input
                value={form.agreement_type}
                onChange={(e) => set({ agreement_type: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            <Field label="File URL" hint="PDF or DOCX link.">
              <Input
                value={form.file_url}
                onChange={(e) => set({ file_url: e.target.value })}
                className="font-mono tabular"
              />
            </Field>
            <Field label="File name">
              <Input
                value={form.file_name}
                onChange={(e) => set({ file_name: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!form.name.trim()) {
                  toast.error("Enter a template name.");
                  return;
                }
                addAgreementTemplate(form);
                logSettingsChange({
                  action: "Agreement template uploaded",
                  new_value: form.name,
                });
                toast.success("Template added.");
                setOpen(false);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Add template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
