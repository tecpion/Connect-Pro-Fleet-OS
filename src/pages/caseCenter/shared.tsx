// Connect Pro Fleet — Case Center shared primitives (Build #54).
// Status/category/responsibility pills + label maps for the Case Center UI.

import { StatusPill } from "@/components/Status";
import {
  CASE_CATEGORY_LABELS,
  CASE_CATEGORY_TONE,
  CASE_STATUS_LABELS,
  CASE_STATUS_TONE,
  CASE_RESPONSIBILITY_LABELS,
  CASE_RESPONSIBILITY_TONE,
  CASE_PRIORITY_LABELS,
  type CaseCategory,
  type CaseStatus,
  type CaseResponsibility,
  type CasePriority,
} from "@/lib/caseCenterTypes";

export function CaseStatusPill({ status }: { status: CaseStatus }) {
  return (
    <StatusPill tone={CASE_STATUS_TONE[status]}>
      {CASE_STATUS_LABELS[status]}
    </StatusPill>
  );
}

export function CaseCategoryPill({ category }: { category: CaseCategory }) {
  return (
    <StatusPill tone={CASE_CATEGORY_TONE[category]}>
      {CASE_CATEGORY_LABELS[category]}
    </StatusPill>
  );
}

export function CaseResponsibilityPill({
  responsibility,
}: {
  responsibility: CaseResponsibility;
}) {
  return (
    <StatusPill tone={CASE_RESPONSIBILITY_TONE[responsibility]}>
      {CASE_RESPONSIBILITY_LABELS[responsibility]}
    </StatusPill>
  );
}

export function CasePriorityPill({ priority }: { priority: CasePriority }) {
  const tone =
    priority === "urgent"
      ? "out"
      : priority === "high"
        ? "maintenance"
        : priority === "low"
          ? "neutral"
          : "rented";
  return <StatusPill tone={tone}>{CASE_PRIORITY_LABELS[priority]}</StatusPill>;
}

export {
  CASE_CATEGORY_LABELS,
  CASE_STATUS_LABELS,
  CASE_RESPONSIBILITY_LABELS,
  CASE_PRIORITY_LABELS,
};
