// Connect Pro Fleet — Compliance Needs Attention workspace component.
// Renders the operational Needs Attention list: each row/card shows entity,
// requirement, status, impact (explicit block label), timing (countdown),
// owner (assigned staff), and the recommended next action. Includes a filter
// drawer and bulk actions (assign, create task). Pure presentation over the
// derived ComplianceItem model — it never alters authoritative compliance truth.

import { useState } from "react";
import { Link, useInRouterContext } from "@/lib/router-compat";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/Status";
import { EmptyState } from "@/components/ui-bits";
import { FilePlus, Filter, Ban, ShieldCheck } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { Staff } from "@/lib/types";
import type { UploadContext } from "./DocumentUploadDialog";
import type { OverrideContext } from "./OverrideDialog";
import { severityTone, severityLabel, entityTypeLabel } from "./shared";
import { documentTypeLabel } from "@/lib/complianceTypes";
import {
  PRIORITY_LABELS,
  NEXT_ACTION_LABELS,
  DEFAULT_FILTERS,
  type ComplianceFilters,
  type ComplianceItem,
} from "@/lib/complianceWorkspace";

// The integration test renders <Compliance/> without a Router. react-router's
// <Link> throws outside a Router context, so guard with useInRouterContext and
// fall back to a plain anchor. The live app always has a Router, so links are
// fully functional there.
function SafeLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={to} className={className}>
      {children}
    </a>
  );
}

export function NeedsAttentionWorkspace({
  items,
  allItemsCount,
  filters,
  setFilters,
  staff,
  onUpload,
  onOverride,
  onCreateTask,
  canOverride,
  staffName,
  entityLink,
  selected,
  toggleSelect,
  selectAll,
  clearAll,
  bulkAssign,
  bulkTask,
}: {
  items: ComplianceItem[];
  allItemsCount: number;
  filters: ComplianceFilters;
  setFilters: (f: ComplianceFilters) => void;
  staff: Staff[];
  onUpload: (ctx: UploadContext) => void;
  onOverride: (ctx: OverrideContext) => void;
  onCreateTask: (it: ComplianceItem) => void;
  canOverride: boolean;
  staffName: (id: string | null) => string;
  entityLink: (type: string, id: string) => string;
  selected: Set<string>;
  toggleSelect: (key: string) => void;
  selectAll: () => void;
  clearAll: () => void;
  bulkAssign: (staffId: string) => void;
  bulkTask: () => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [bulkStaff, setBulkStaff] = useState("");

  const activeFilterCount =
    (filters.entityType !== "all" ? 1 : 0) +
    (filters.status !== "all" ? 1 : 0) +
    (filters.priority !== "all" ? 1 : 0) +
    (filters.blocking !== "all" ? 1 : 0) +
    (filters.assignedStaffId !== "all" ? 1 : 0);

  if (allItemsCount === 0) {
    return (
      <EmptyState
        title="Nothing needs attention"
        hint="All required documents are present, valid, and verified."
        icon={<ShieldCheck size={28} />}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilterOpen(true)}
          >
            <Filter size={14} className="mr-1.5" /> Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear filters
            </Button>
          )}
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selected.size} selected
            </span>
            <select
              value={bulkStaff}
              onChange={(e) => setBulkStaff(e.target.value)}
              className="rounded-md border border-input bg-surface px-2 py-1 text-xs"
            >
              <option value="">Assign to…</option>
              <option value="">Unassigned</option>
              {staff
                .filter((s) => s.status === "active")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkAssign(bulkStaff)}
            >
              Assign
            </Button>
            <Button size="sm" variant="outline" onClick={bulkTask}>
              Create task
            </Button>
            <Button size="sm" variant="ghost" onClick={clearAll}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No items match the current filters"
          hint="Adjust the filters to see compliance issues."
          icon={<Filter size={28} />}
        />
      ) : (
        <>
          <div className="space-y-3 lg:hidden">
            <button
              onClick={selectAll}
              className="text-xs text-muted-foreground underline"
            >
              Select all visible
            </button>
            {items.map((it, idx) => {
              const key = `${it.entity_type}-${it.entity_id}-${it.document_type}`;
              return (
                <NeedsAttentionCard
                  key={`${key}-${idx}`}
                  item={it}
                  selected={selected.has(key)}
                  onToggle={() => toggleSelect(key)}
                  onUpload={() =>
                    onUpload({
                      entity_type: it.entity_type,
                      entity_id: it.entity_id,
                      entity_label: it.entity_label,
                      document_type: it.document_type,
                    })
                  }
                  onOverride={() =>
                    onOverride({
                      entity_type: it.entity_type,
                      entity_id: it.entity_id,
                      entity_label: it.entity_label,
                      document_type: it.document_type,
                    })
                  }
                  onCreateTask={() => onCreateTask(it)}
                  canOverride={canOverride}
                  staffName={staffName}
                  link={entityLink(it.entity_type, it.entity_id)}
                />
              );
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      onChange={(e) =>
                        e.target.checked ? selectAll() : clearAll()
                      }
                      checked={
                        selected.size > 0 && selected.size >= items.length
                      }
                    />
                  </th>
                  <th className="px-3 py-2">Entity</th>
                  <th className="px-3 py-2">Requirement</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Impact</th>
                  <th className="px-3 py-2">Timing</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Next action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const key = `${it.entity_type}-${it.entity_id}-${it.document_type}`;
                  return (
                    <tr
                      key={`${key}-${idx}`}
                      className="border-t border-border align-top"
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={() => toggleSelect(key)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <SafeLink
                          to={entityLink(it.entity_type, it.entity_id)}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {it.entity_label}
                        </SafeLink>
                        <p className="text-xs text-muted-foreground">
                          {entityTypeLabel(it.entity_type)}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        {documentTypeLabel(it.document_type)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <StatusPill tone={severityTone(it.severity)}>
                            {severityLabel(it.severity)}
                          </StatusPill>
                          {it.overridden && (
                            <StatusPill tone="neutral">Overridden</StatusPill>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {it.blocking ? (
                          <StatusPill tone="out">{it.block_label}</StatusPill>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Warning only
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {it.countdown}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {staffName(it.assigned_staff_id)}
                      </td>
                      <td className="px-3 py-2">
                        <NeedsAttentionActions
                          item={it}
                          onUpload={() =>
                            onUpload({
                              entity_type: it.entity_type,
                              entity_id: it.entity_id,
                              entity_label: it.entity_label,
                              document_type: it.document_type,
                            })
                          }
                          onOverride={() =>
                            onOverride({
                              entity_type: it.entity_type,
                              entity_id: it.entity_id,
                              entity_label: it.entity_label,
                              document_type: it.document_type,
                            })
                          }
                          onCreateTask={() => onCreateTask(it)}
                          canOverride={canOverride}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Drawer open={filterOpen} onOpenChange={setFilterOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Filter compliance</DrawerTitle>
          </DrawerHeader>
          <FilterPanel
            filters={filters}
            setFilters={setFilters}
            staff={staff}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function NeedsAttentionCard({
  item,
  selected,
  onToggle,
  onUpload,
  onOverride,
  onCreateTask,
  canOverride,
  staffName,
  link,
}: {
  item: ComplianceItem;
  selected: boolean;
  onToggle: () => void;
  onUpload: () => void;
  onOverride: () => void;
  onCreateTask: () => void;
  canOverride: boolean;
  staffName: (id: string | null) => string;
  link: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggle}
              className="mt-0.5"
            />
            <SafeLink
              to={link}
              className="font-medium text-foreground hover:text-primary"
            >
              {item.entity_label}
            </SafeLink>
            <span className="text-xs text-muted-foreground">
              {entityTypeLabel(item.entity_type)}
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground">
            {documentTypeLabel(item.document_type)}
          </p>
        </div>
        <StatusPill tone={severityTone(item.severity)}>
          {severityLabel(item.severity)}
        </StatusPill>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Impact</dt>
        <dd className="text-foreground">
          {item.blocking ? item.block_label : "Warning only"}
        </dd>
        <dt className="text-muted-foreground">Timing</dt>
        <dd className="text-foreground">{item.countdown}</dd>
        <dt className="text-muted-foreground">Owner</dt>
        <dd className="text-foreground">{staffName(item.assigned_staff_id)}</dd>
        <dt className="text-muted-foreground">Priority</dt>
        <dd className="text-foreground">{PRIORITY_LABELS[item.priority]}</dd>
      </dl>
      <div className="mt-2 flex flex-wrap gap-2">
        <NeedsAttentionActions
          item={item}
          onUpload={onUpload}
          onOverride={onOverride}
          onCreateTask={onCreateTask}
          canOverride={canOverride}
        />
      </div>
    </div>
  );
}

function NeedsAttentionActions({
  item,
  onUpload,
  onOverride,
  onCreateTask,
  canOverride,
}: {
  item: ComplianceItem;
  onUpload: () => void;
  onOverride: () => void;
  onCreateTask: () => void;
  canOverride: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(item.next_action === "upload" ||
        item.next_action === "upload_replacement") && (
        <Button size="sm" variant="outline" onClick={onUpload}>
          <FilePlus size={12} className="mr-1" />
          {NEXT_ACTION_LABELS[item.next_action]}
        </Button>
      )}
      {item.next_action === "review" && (
        <span className="text-xs text-muted-foreground">Awaiting review</span>
      )}
      <Button size="sm" variant="ghost" onClick={onCreateTask}>
        Create task
      </Button>
      {canOverride && item.blocking && !item.overridden && (
        <Button size="sm" variant="outline" onClick={onOverride}>
          <Ban size={12} className="mr-1" /> Override
        </Button>
      )}
    </div>
  );
}

function FilterPanel({
  filters,
  setFilters,
  staff,
}: {
  filters: ComplianceFilters;
  setFilters: (f: ComplianceFilters) => void;
  staff: Staff[];
}) {
  const set = (patch: Partial<ComplianceFilters>) =>
    setFilters({ ...filters, ...patch });
  return (
    <div className="space-y-4 p-4">
      <FilterSelect
        label="Entity type"
        value={filters.entityType}
        onChange={(v) => set({ entityType: v as never })}
        options={[
          { value: "all", label: "All" },
          { value: "vehicle", label: "Vehicle" },
          { value: "customer", label: "Customer" },
          { value: "rental", label: "Rental" },
          { value: "company", label: "Company" },
        ]}
      />
      <FilterSelect
        label="Status"
        value={filters.status}
        onChange={(v) => set({ status: v as never })}
        options={[
          { value: "all", label: "All" },
          { value: "blocked", label: "Blocked" },
          { value: "expired", label: "Expired" },
          { value: "expiring", label: "Expiring soon" },
          { value: "missing", label: "Missing" },
          { value: "pending_review", label: "Pending review" },
          { value: "rejected", label: "Rejected" },
        ]}
      />
      <FilterSelect
        label="Priority"
        value={filters.priority}
        onChange={(v) => set({ priority: v as never })}
        options={[
          { value: "all", label: "All" },
          { value: "critical", label: "Critical" },
          { value: "high", label: "High" },
          { value: "medium", label: "Medium" },
          { value: "informational", label: "Informational" },
        ]}
      />
      <FilterSelect
        label="Blocking"
        value={filters.blocking}
        onChange={(v) => set({ blocking: v as never })}
        options={[
          { value: "all", label: "All" },
          { value: "blocking", label: "Blocking only" },
          { value: "warning", label: "Warnings only" },
        ]}
      />
      <FilterSelect
        label="Assigned staff"
        value={filters.assignedStaffId}
        onChange={(v) => set({ assignedStaffId: v })}
        options={[
          { value: "all", label: "All" },
          { value: "unassigned", label: "Unassigned" },
          ...staff
            .filter((s) => s.status === "active")
            .map((s) => ({ value: s.id, label: s.full_name })),
        ]}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
