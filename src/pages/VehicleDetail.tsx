import { useState } from "react";
import { Link, useParams } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { useInvestors } from "@/lib/investorStore";
import {
  PageHeader,
  SectionCard,
  DataLabel,
  DataValue,
  EmptyState,
} from "@/components/ui-bits";
import { EntityAssignmentsSection } from "@/components/EntityAssignmentsSection";
import { StatusPill, vehicleTone } from "@/components/Status";
import {
  fmtMoney,
  fmtMoneyExact,
  fmtNumber,
  fmtDate,
  fmtDateShort,
  vehicleStatusMeta,
} from "@/lib/format";
import { OwnershipDetail } from "./vehicles/OwnershipDetail";
import { AvailabilityCalendar } from "./vehicles/AvailabilityCalendar";
import { VehicleExpensesSection } from "./vehicles/VehicleExpensesSection";
import { VehiclePerformanceSection } from "./vehicles/VehiclePerformanceSection";
import { VehicleVaultSection } from "./vehicles/VehicleVaultSection";
import { CashExpenseRecordDialog } from "./vehicles/CashExpenseRecordDialog";
import { BillOfSaleDialog } from "./vehicles/BillOfSaleDialog";
import { ReceiptCaptureDialog } from "./vehicles/ReceiptCaptureDialog";
import { UploadDocumentDialog } from "./vehicles/UploadDocumentDialog";
import { GeneratedDocDetailDialog } from "./vehicles/GeneratedDocDetailDialog";
import type { MenuAction } from "./vehicles/VaultAddMenu";
import type { VaultDocument } from "@/lib/vaultTypes";
import {
  VehicleDocuments,
  VehicleReservationHistory,
  Legend,
} from "./vehicles/VehicleDetailSections";
import { VehicleViolationsSection } from "./vehicles/VehicleViolationsSection";
import { VehicleTelematicsSection } from "./vehicles/VehicleTelematicsSection";
import { VehicleComplianceSection } from "./compliance/ComplianceSections";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Car,
  ArrowLeft,
  FileText,
  ImageIcon,
  ListTodo,
  Plus,
  Wrench,
} from "lucide-react";
import { CreateTaskDialog } from "@/pages/tasks/CreateTaskDialog";
import { CreateWorkOrderDialog } from "@/pages/maintenance/CreateWorkOrderDialog";
import { VehicleTwinOverview } from "./vehicles/VehicleTwinOverview";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { CreateClaimDialog } from "@/pages/damageClaims/CreateClaimDialog";
import { DAMAGE_CLAIM_STATUS_LABELS } from "@/lib/damageClaimTypes";
import {
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUS_TONE,
} from "@/lib/maintenanceTypes";
import { isWorkOrderActive } from "@/lib/maintenanceSelectors";

export default function VehicleDetail() {
  const { id } = useParams();
  const {
    vehicles,
    reservations,
    rentals,
    maintenance,
    workOrders,
    vehicleWorkOrders,
    vehicleClasses,
    depositPolicies,
    vehicleOwnershipHistory,
    staff,
    roles,
    currentStaffId,
  } = useStore();
  const { investors, investorVehicles } = useInvestors();
  const vehicle = vehicles.find((v) => v.id === id);

  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const roleObj = roles.find((r) => r.id === currentStaff?.role_id);
  const canViewFinancials = can(
    roleObj,
    currentStaff?.permission_overrides ?? null,
    "investors.view_financials",
  );
  const [monthOffset, setMonthOffset] = useState(0);
  const [taskOpen, setTaskOpen] = useState(false);
  const [woOpen, setWoOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  // Build #45 — Vehicle Document Vault dialog state.
  const [menuAction, setMenuAction] = useState<MenuAction | null>(null);
  const [cashOpen, setCashOpen] = useState(false);
  const [bosOpen, setBosOpen] = useState(false);
  const [bosInternal, setBosInternal] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPreset, setUploadPreset] = useState<
    import("@/lib/vaultTypes").VaultDocCategory | undefined
  >(undefined);
  const [detailDoc, setDetailDoc] = useState<VaultDocument | null>(null);
  const dc = useDamageClaims();
  const vehicleClaims = dc.vehicleClaims(vehicle?.id ?? "");

  function handleMenuAction(a: MenuAction) {
    setMenuAction(a);
    if (a === "scan_receipt" || a === "upload_document") {
      setUploadPreset(a === "scan_receipt" ? "receipt" : undefined);
      setUploadOpen(true);
    } else if (a === "cash_expense") {
      setCashOpen(true);
    } else if (a === "bill_of_sale") {
      setBosInternal(false);
      setBosOpen(true);
    } else if (a === "purchase_record") {
      setBosInternal(true);
      setBosOpen(true);
    } else if (a === "other_document") {
      setUploadPreset("other");
      setUploadOpen(true);
    }
  }

  if (!vehicle) {
    return (
      <EmptyState
        title="Vehicle not found"
        hint="This vehicle may have been removed. Return to the inventory to pick another."
        action={
          <Link to="/vehicles">
            <Button variant="outline">Back to inventory</Button>
          </Link>
        }
      />
    );
  }

  const vehicleReservations = reservations.filter(
    (r) => r.vehicle_id === vehicle.id,
  );
  const vehicleMaintenance = maintenance.filter(
    (m) => m.vehicle_id === vehicle.id,
  );
  const vehicleWOs = vehicleWorkOrders(vehicle.id);

  // Financial summary is now derived via the profitability selectors in
  // VehiclePerformanceSection (Build #16) — no manual revenue/expense math here.

  return (
    <div className="space-y-6">
      <Link
        to="/vehicles"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft size={14} /> Inventory
      </Link>

      <PageHeader
        title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
        subtitle={<span className="font-mono tabular">{vehicle.vin}</span>}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setTaskOpen(true)}>
              <ListTodo size={15} className="mr-1.5" /> Create task
            </Button>
            <StatusPill tone={vehicleTone(vehicle.status)}>
              {vehicleStatusMeta[vehicle.status].label}
            </StatusPill>
          </div>
        }
      />

      {/* Fleet Digital Twin overview (Build #27) */}
      <VehicleTwinOverview vehicleId={vehicle.id} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Specs */}
        <SectionCard title="Vehicle record" className="lg:col-span-1">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <DataLabel>Vehicle class</DataLabel>
              <DataValue>
                {vehicleClasses.find((c) => c.id === vehicle.vehicle_class_id)
                  ?.name ?? "Unassigned"}
              </DataValue>
            </div>
            <div>
              <DataLabel>License plate</DataLabel>
              <DataValue mono>{vehicle.license_plate}</DataValue>
            </div>
            <div>
              <DataLabel>Mileage</DataLabel>
              <DataValue mono>
                {fmtNumber(vehicle.current_mileage)} mi
              </DataValue>
            </div>
            <div>
              <DataLabel>Daily rate</DataLabel>
              <DataValue mono>
                {vehicle.daily_rate
                  ? fmtMoney(vehicle.daily_rate) + "/day"
                  : "—"}
              </DataValue>
              <span className="text-[11px] text-muted-foreground">
                {vehicle.pricing_override
                  ? "Custom vehicle rate"
                  : vehicle.vehicle_class_id
                    ? "Class pricing"
                    : ""}
              </span>
            </div>
            <div>
              <DataLabel>Weekly rate</DataLabel>
              <DataValue mono>
                {vehicle.weekly_rate
                  ? fmtMoney(vehicle.weekly_rate) + "/wk"
                  : "—"}
              </DataValue>
            </div>
            <div>
              <DataLabel>Deposit</DataLabel>
              <DataValue mono>
                {vehicle.deposit_amount
                  ? fmtMoney(vehicle.deposit_amount)
                  : "None"}
              </DataValue>
            </div>
            <div>
              <DataLabel>Purchase date</DataLabel>
              <DataValue mono>{fmtDate(vehicle.purchase_date)}</DataValue>
            </div>
            <div>
              <DataLabel>Purchase price</DataLabel>
              <DataValue mono>{fmtMoney(vehicle.purchase_price)}</DataValue>
            </div>
            <div>
              <DataLabel>Insurance policy</DataLabel>
              <DataValue mono>{vehicle.insurance_policy_number}</DataValue>
            </div>
            <div>
              <DataLabel>Insurance expiry</DataLabel>
              <DataValue mono>{fmtDate(vehicle.insurance_expiry)}</DataValue>
            </div>
            <div>
              <DataLabel>Registration expiry</DataLabel>
              <DataValue mono>{fmtDate(vehicle.registration_expiry)}</DataValue>
            </div>
          </dl>
        </SectionCard>

        {/* Operational assignments */}
        <EntityAssignmentsSection
          entityType="vehicle"
          entityId={vehicle.id}
          entityLabel={vehicle.vin}
          title="Operational Owner"
        />

        {/* Availability calendar */}
        <SectionCard
          title="Availability calendar"
          className="lg:col-span-2"
          right={
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMonthOffset((m) => m - 1)}
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMonthOffset((m) => m + 1)}
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          }
        >
          <AvailabilityCalendar
            reservations={vehicleReservations}
            maintenance={vehicleMaintenance}
            monthOffset={monthOffset}
          />
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <Legend color="bg-status-available" label="Available" />
            <Legend color="bg-status-rented" label="Booked" />
            <Legend color="bg-status-maintenance" label="Maintenance" />
            <Legend color="bg-status-out" label="Out of service" />
          </div>
        </SectionCard>
      </div>

      {/* Ownership + compensation */}
      <OwnershipDetail
        vehicle={vehicle}
        investors={investors}
        investorVehicles={investorVehicles}
        ownershipHistory={vehicleOwnershipHistory(vehicle.id)}
        canViewFinancials={canViewFinancials}
      />

      {/* Documents & Compliance (Build #26) */}
      <VehicleComplianceSection
        vehicleId={vehicle.id}
        vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.license_plate})`}
      />

      {/* Violations (Build #25) */}
      <VehicleViolationsSection vehicleId={vehicle.id} />

      {/* V1 Telematics Hub — compact GPS/telematics card for this vehicle. */}
      <VehicleTelematicsSection vehicleId={vehicle.id} />

      {/* Performance (Build #16 — derived profitability) */}
      <VehiclePerformanceSection vehicleId={vehicle.id} />

      {/* Maintenance work orders */}
      <SectionCard
        title="Maintenance work orders"
        right={
          <Button size="sm" variant="outline" onClick={() => setWoOpen(true)}>
            <Plus size={14} className="mr-1" /> Create
          </Button>
        }
      >
        {vehicleWOs.length === 0 ? (
          <EmptyState
            title="No maintenance history yet."
            hint="Create a work order when this vehicle needs service or repair."
            icon={<Wrench size={22} />}
          />
        ) : (
          <ul className="divide-y divide-border">
            {vehicleWOs
              .sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1))
              .map((w) => (
                <li
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      to="/maintenance"
                      className="font-mono text-sm font-medium text-foreground hover:text-primary"
                    >
                      {w.work_order_number}
                    </Link>
                    <p className="truncate text-sm text-foreground">
                      {w.title}
                    </p>
                    <p className="font-mono text-xs tabular text-muted-foreground">
                      {fmtDate(w.opened_at.slice(0, 10))}
                      {w.downtime_started_at &&
                        !w.downtime_ended_at &&
                        " · vehicle down"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isWorkOrderActive(w) && w.blocks_vehicle_use && (
                      <StatusPill tone="maintenance">Down</StatusPill>
                    )}
                    <StatusPill tone={WORK_ORDER_STATUS_TONE[w.status]}>
                      {WORK_ORDER_STATUS_LABELS[w.status]}
                    </StatusPill>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </SectionCard>

      {/* Damage claims */}
      <SectionCard
        title="Damage claims"
        right={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClaimOpen(true)}
          >
            <Plus size={14} className="mr-1.5" /> Create claim
          </Button>
        }
      >
        {vehicleClaims.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No damage claims for this vehicle.
          </p>
        ) : (
          <ul className="space-y-2">
            {vehicleClaims.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border p-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {c.claim_number} ·{" "}
                    {DAMAGE_CLAIM_STATUS_LABELS[c.claim_status]}
                  </p>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {c.description}
                  </p>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {fmtDate(c.discovered_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Vehicle images */}
      <SectionCard title="Vehicle images">
        {vehicle.images.length === 0 ? (
          <EmptyState
            title="No photos yet"
            hint="Add photos from the vehicle record to document condition and build a visual history."
            icon={<ImageIcon size={24} />}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {vehicle.images.map((img) => (
              <a
                key={img.url}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                className="group relative aspect-video overflow-hidden rounded-md border border-border bg-surface"
              >
                <img
                  src={img.url}
                  alt={img.name}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
                <span className="absolute bottom-0 left-0 right-0 truncate bg-night/70 px-2 py-1 text-[10px] font-mono text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {img.name}
                </span>
              </a>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Expenses */}
      <VehicleExpensesSection vehicleId={vehicle.id} />

      {/* Build #45 — Vehicle Document Vault */}
      <VehicleVaultSection
        vehicleId={vehicle.id}
        onMenuAction={handleMenuAction}
        onSelectDoc={(d) => setDetailDoc(d)}
      />

      {/* Documents (legacy file list) */}
      <VehicleDocuments docs={vehicle.documents} />

      {/* Reservation history */}
      <VehicleReservationHistory reservations={vehicleReservations} />

      <CreateTaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        preset={{
          entityType: "vehicle",
          entityId: vehicle.id,
          entityLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model} · ${vehicle.license_plate}`,
          category: "vehicle",
        }}
      />
      <CreateWorkOrderDialog
        open={woOpen}
        onOpenChange={setWoOpen}
        presetVehicleId={vehicle.id}
      />
      {claimOpen && (
        <CreateClaimDialog
          vehicles={vehicles}
          rentals={rentals}
          staff={staff}
          prefillVehicleId={vehicle.id}
          onClose={() => setClaimOpen(false)}
          onSave={(input) => {
            dc.createClaim(input);
            setClaimOpen(false);
          }}
        />
      )}

      {/* Build #45 — Vault dialogs */}
      <CashExpenseRecordDialog
        vehicle={vehicle}
        open={cashOpen}
        onOpenChange={setCashOpen}
      />
      <BillOfSaleDialog
        vehicle={vehicle}
        open={bosOpen}
        onOpenChange={setBosOpen}
        isInternal={bosInternal}
      />
      <ReceiptCaptureDialog
        vehicle={vehicle}
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
      />
      <UploadDocumentDialog
        vehicle={vehicle}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        presetCategory={uploadPreset}
      />
      <GeneratedDocDetailDialog
        doc={detailDoc}
        vehicle={vehicle}
        open={!!detailDoc}
        onOpenChange={(v) => {
          if (!v) setDetailDoc(null);
        }}
      />
    </div>
  );
}
