// Connect Pro Fleet — Settings > Compliance Rules (workspace).
//
// Surfaces the structured ComplianceRequirement records as editable rules on
// top of the company CompliancePolicyConfig toggles (which remain the single
// source of truth for the policy-derived baseline). Custom rules
// (source="custom") can be added/deactivated here; policy-derived rules are
// shown read-only with a pointer back to the policy toggles. This does NOT
// create a second compliance engine — it manages the requirement list the
// existing evaluator already consumes.

import { useState } from "react";
import { useCompliance } from "@/lib/complianceStoreProvider";
import { useComplianceCan } from "@/lib/compliancePermissionHooks";
import { SectionCard } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "./shared";
import { ToggleRow } from "./policyBits";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  VEHICLE_DOCUMENT_LABELS,
  CUSTOMER_DOCUMENT_LABELS,
  RENTAL_DOCUMENT_LABELS,
  COMPANY_DOCUMENT_LABELS,
} from "@/lib/complianceTypes";
import type {
  DocumentEntityType,
  DocumentType,
  ComplianceBlockBehavior,
} from "@/lib/complianceTypes";
import {
  documentTypeLabel,
  entityTypeForDocumentType,
} from "@/lib/complianceTypes";
import {
  BLOCK_BEHAVIOR_OPTIONS,
  BLOCK_BEHAVIOR_LABELS,
  type BlockBehavior,
} from "@/lib/complianceWorkspace";

const ENTITY_OPTIONS: { value: DocumentEntityType; label: string }[] = [
  { value: "vehicle", label: "Vehicle" },
  { value: "customer", label: "Customer" },
  { value: "rental", label: "Rental" },
  { value: "company", label: "Company" },
];

function docOptionsForEntity(et: DocumentEntityType): DocumentType[] {
  const labels =
    et === "vehicle"
      ? VEHICLE_DOCUMENT_LABELS
      : et === "customer"
        ? CUSTOMER_DOCUMENT_LABELS
        : et === "rental"
          ? RENTAL_DOCUMENT_LABELS
          : COMPANY_DOCUMENT_LABELS;
  return Object.keys(labels) as DocumentType[];
}

export function ComplianceRulesSection() {
  const comp = useCompliance();
  const { canManage } = useComplianceCan();
  const [addOpen, setAddOpen] = useState(false);

  const custom = comp.requirements.filter((r) => r.source === "custom");
  const policy = comp.requirements.filter((r) => r.source === "policy");

  return (
    <SectionCard title="Compliance Rules">
      <p className="text-sm text-muted-foreground">
        Configure which documents are required, their warning window, and what
        each requirement blocks. Rules are configured by your organization and
        do not constitute legal advice. Policy-derived rules mirror the
        Compliance &amp; Documents policy toggles above.
      </p>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Policy-derived rules (from the policy above)
        </p>
        {policy.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No policy rules active. Enable requirements in the policy section.
          </p>
        ) : (
          policy.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {documentTypeLabel(r.document_type)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ENTITY_OPTIONS.find((e) => e.value === r.entity_type)?.label}{" "}
                  · warning {r.warning_days}d
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone={r.active ? "available" : "neutral"}>
                  {r.active ? "Active" : "Inactive"}
                </StatusPill>
                <span className="text-xs text-muted-foreground">
                  {
                    BLOCK_BEHAVIOR_LABELS[
                      (r.block_behavior as BlockBehavior) ??
                        (r.entity_type === "vehicle"
                          ? "blocks_assignment"
                          : r.entity_type === "customer"
                            ? "blocks_checkout"
                            : r.entity_type === "rental"
                              ? "blocks_start"
                              : "warning_only")
                    ]
                  }
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Custom rules
          </p>
          {canManage && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              Add rule
            </Button>
          )}
        </div>
        {custom.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No custom rules. Add a rule for a document type beyond the policy
            baseline.
          </p>
        ) : (
          custom.map((r) => <RuleRow key={r.id} id={r.id} />)
        )}
      </div>

      <AddRuleDialog open={addOpen} onOpenChange={setAddOpen} />
    </SectionCard>
  );
}

function RuleRow({ id }: { id: string }) {
  const comp = useCompliance();
  const { canManage } = useComplianceCan();
  const r = comp.requirements.find((x) => x.id === id);
  if (!r) return null;
  const behavior =
    (r.block_behavior as BlockBehavior) ??
    (r.entity_type === "vehicle"
      ? "blocks_assignment"
      : r.entity_type === "customer"
        ? "blocks_checkout"
        : r.entity_type === "rental"
          ? "blocks_start"
          : "warning_only");
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {documentTypeLabel(r.document_type)}
          </p>
          <p className="text-xs text-muted-foreground">
            {ENTITY_OPTIONS.find((e) => e.value === r.entity_type)?.label} ·
            warning {r.warning_days}d · {BLOCK_BEHAVIOR_LABELS[behavior]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={r.active ? "available" : "neutral"}>
            {r.active ? "Active" : "Inactive"}
          </StatusPill>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => comp.updateRequirement(id, { active: !r.active })}
            >
              {r.active ? "Deactivate" : "Activate"}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-2">
        <ToggleRow
          label="Required"
          checked={r.required}
          disabled={!canManage}
          onChange={(v) => comp.updateRequirement(id, { required: v })}
        />
      </div>
    </div>
  );
}

function AddRuleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const comp = useCompliance();
  const [entityType, setEntityType] = useState<DocumentEntityType>("vehicle");
  const [documentType, setDocumentType] =
    useState<DocumentType>("registration");
  const [required, setRequired] = useState(true);
  const [blocksMissing, setBlocksMissing] = useState(true);
  const [blocksExpired, setBlocksExpired] = useState(true);
  const [requiresVerification, setRequiresVerification] = useState(true);
  const [warningDays, setWarningDays] = useState(30);
  const [blockBehavior, setBlockBehavior] =
    useState<ComplianceBlockBehavior>("blocks_assignment");
  const [managerOverride, setManagerOverride] = useState(true);

  const reset = () => {
    setEntityType("vehicle");
    setDocumentType("registration");
    setRequired(true);
    setBlocksMissing(true);
    setBlocksExpired(true);
    setRequiresVerification(true);
    setWarningDays(30);
    setBlockBehavior("blocks_assignment");
    setManagerOverride(true);
  };

  const submit = () => {
    comp.addRequirement({
      entity_type: entityType,
      document_type: documentType,
      required,
      blocks_operation_if_missing: blocksMissing,
      blocks_operation_if_expired: blocksExpired,
      requires_verification: requiresVerification,
      warning_days: warningDays,
      block_behavior: blockBehavior,
      manager_override_allowed: managerOverride,
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add compliance rule</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Applies to">
              <select
                value={entityType}
                onChange={(e) => {
                  const et = e.target.value as DocumentEntityType;
                  setEntityType(et);
                  const opts = docOptionsForEntity(et);
                  setDocumentType(opts[0]);
                }}
                className={selectClass}
              >
                {ENTITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Document type">
              <select
                value={documentType}
                onChange={(e) =>
                  setDocumentType(e.target.value as DocumentType)
                }
                className={selectClass}
              >
                {docOptionsForEntity(entityType).map((t) => (
                  <option key={t} value={t}>
                    {documentTypeLabel(t)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Blocking behavior">
            <select
              value={blockBehavior}
              onChange={(e) =>
                setBlockBehavior(e.target.value as ComplianceBlockBehavior)
              }
              className={selectClass}
            >
              {BLOCK_BEHAVIOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Warning window (days)">
            <Input
              type="number"
              min={1}
              value={warningDays}
              onChange={(e) => setWarningDays(Number(e.target.value))}
              className="font-mono tabular"
            />
          </Field>
          <div className="space-y-2">
            <ToggleRow
              label="Required"
              checked={required}
              onChange={setRequired}
            />
            <ToggleRow
              label="Block if missing"
              checked={blocksMissing}
              onChange={setBlocksMissing}
            />
            <ToggleRow
              label="Block if expired"
              checked={blocksExpired}
              onChange={setBlocksExpired}
            />
            <ToggleRow
              label="Review required (upload ≠ verified)"
              checked={requiresVerification}
              onChange={setRequiresVerification}
            />
            <ToggleRow
              label="Manager override allowed"
              checked={managerOverride}
              onChange={setManagerOverride}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Add rule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
