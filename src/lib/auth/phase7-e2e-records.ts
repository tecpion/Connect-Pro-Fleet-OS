// Phase 7 E2E — create Phase 7 domain records through the real repository/app
// path (rentals, ledger, security deposits, deposit history, booking requests,
// inspections, maintenance work orders/events/vendors/receipts) and confirm the
// rows exist in Cloud. Every insert uses the authenticated Org A repository
// adapter; none uses the service-role admin. Test-harness only.

import type { FinancialTransaction } from "@/lib/chargeTypes";
import type { RentalDeposit, DepositHistoryEvent } from "@/lib/depositTypes";
import type { BookingRequest } from "@/lib/bookingRequestTypes";
import type { Inspection } from "@/lib/inspectionTypes";
import type {
  MaintenanceWorkOrder,
  MaintenanceWorkOrderEvent,
  MaintenanceVendor,
  MaintenanceReceipt,
} from "@/lib/maintenanceTypes";
import { getRentalSettlement } from "@/lib/rentalSettlement";
import { buildRental } from "./phase4-e2e-builders";
import type { Phase7Step } from "./phase7-e2e.server";
import { step, requireOk, type Phase7Runtime } from "./phase7-e2e-runtime";

export interface CreateRecordsResult {
  steps: Phase7Step[];
}

export async function runCreatePhase7Records(
  runtime: Phase7Runtime,
): Promise<CreateRecordsResult> {
  const steps: Phase7Step[] = [];
  const {
    ledger,
    deposits,
    bookingRequests,
    inspections,
    maintenance,
    rentals,
    orgA,
    ctx,
    now,
    date,
  } = runtime;

  // ── Rental ledger: a charge + a payment ──────────────────────────────────
  const charge: FinancialTransaction = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    rental_id: ctx.rentalId,
    customer_id: ctx.custId,
    vehicle_id: ctx.vehId,
    transaction_type: "rental_charge",
    category: "charge",
    description: "Phase7 rental charge",
    amount: 1000,
    direction: "charge",
    status: "posted",
    effective_date: date,
    created_at: now,
    created_by: null,
  };
  const payment: FinancialTransaction = {
    ...charge,
    id: crypto.randomUUID(),
    transaction_type: "ach_payment",
    category: "payment",
    direction: "payment",
    description: "Phase7 rental payment",
    amount: 1000,
  };
  await ledger.insert(charge);
  await ledger.insert(payment);
  runtime.recordIds.charge = charge.id;
  runtime.recordIds.payment = payment.id;
  requireOk(
    await step(steps, "rental_ledger_persistence", async () => {
      const rows = await ledger.listForRental(orgA, ctx.rentalId);
      return (
        rows.length === 2 &&
        rows.some((r) => r.id === charge.id) &&
        rows.some((r) => r.id === payment.id)
      );
    }),
  );

  // ── Security deposit + deposit history event ───────────────────────────
  const deposit: RentalDeposit = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    reservation_id: null,
    rental_id: ctx.rentalId,
    customer_id: ctx.custId,
    vehicle_id: ctx.vehId,
    policy_id: null,
    required_amount: 600,
    collected_amount: 600,
    applied_amount: 0,
    refunded_amount: 0,
    forfeited_amount: 0,
    status: "held",
    currency: "USD",
    source_snapshot: { source: "manual" },
    collected_at: now,
    refund_due_at: null,
    completed_at: null,
    notes: null,
    created_at: now,
    updated_at: now,
    created_by: null,
  };
  await deposits.insert(deposit);
  runtime.recordIds.deposit = deposit.id;

  const depositHistory: DepositHistoryEvent = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    deposit_id: deposit.id,
    event_type: "collected",
    amount: 600,
    payment_method: "ach",
    transaction_id: null,
    reason: null,
    staff_id: null,
    at: now,
    request_key: null,
  };
  await deposits.insertHistory(depositHistory);
  runtime.recordIds.depositHistory = depositHistory.id;

  requireOk(
    await step(steps, "security_deposit_and_history_persistence", async () => {
      const list = await deposits.list(orgA);
      const dep = list.find((d) => d.id === deposit.id);
      if (!dep) return false;
      const history = await deposits.listHistory(orgA, deposit.id);
      return (
        dep.status === "held" &&
        dep.collected_amount === 600 &&
        history.length === 1 &&
        history[0].id === depositHistory.id &&
        history[0].event_type === "collected" &&
        history[0].amount === 600
      );
    }),
  );

  // ── Booking request ─────────────────────────────────────────────────────
  const booking: BookingRequest = {
    id: crypto.randomUUID(),
    organization_id: orgA,
    location_id: null,
    first_name: "Hector",
    last_name: "Park",
    phone: "555-0200",
    email: `phase7-${ctx.stamp}@e2e.test`,
    requested_vehicle_id: ctx.vehId,
    requested_vehicle_class_id: null,
    requested_start_date: date,
    requested_end_date: date,
    rental_duration_type: "daily",
    notes: "Phase7 booking request",
    driver_license_document_reference: null,
    driver_license_status: "not_provided",
    verification_status: "not_required",
    source: "manual",
    crm_contact_id: null,
    crm_opportunity_id: null,
    crm_pipeline_stage: null,
    external_request_id: null,
    lead_source: null,
    submitted_at: now,
    form_answers: null,
    status: "new",
    assigned_to: null,
    customer_match: { kind: "none" },
    converted_reservation_id: null,
    declined: null,
    waitlist: null,
    created_by: null,
    created_at: now,
    updated_at: now,
  };
  await bookingRequests.insert(booking);
  runtime.recordIds.booking = booking.id;
  requireOk(
    await step(steps, "booking_request_persistence", async () => {
      const rows = await bookingRequests.list(orgA);
      return (
        rows.length === 1 &&
        rows[0].id === booking.id &&
        rows[0].status === "new" &&
        rows[0].email === booking.email
      );
    }),
  );

  // ── Inspection ──────────────────────────────────────────────────────────
  const inspection: Inspection = {
    id: crypto.randomUUID(),
    reservation_id: ctx.rentalId,
    vehicle_id: ctx.vehId,
    inspection_type: "checkout",
    photos: [],
    odometer_reading: 12000,
    fuel_level: 100,
    damage_notes: "",
    damage_detected: false,
    damage_ai_confidence: 0,
    damage_ai_flagged_regions: [],
    inspector_signature_url: null,
    timestamp: now,
    tenant_id: orgA,
  };
  await inspections.insert(inspection);
  runtime.recordIds.inspection = inspection.id;
  requireOk(
    await step(steps, "inspection_persistence", async () => {
      const rows = await inspections.list(orgA);
      return (
        rows.length === 1 &&
        rows[0].id === inspection.id &&
        rows[0].inspection_type === "checkout" &&
        rows[0].odometer_reading === 12000
      );
    }),
  );

  // ── Maintenance: vendor → work order → event → receipt ──────────────────
  const vendor: MaintenanceVendor = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    name: "Phase7 Brake Shop",
    contact_name: null,
    phone: "555-0100",
    email: null,
    address: null,
    city: null,
    state: null,
    postal: null,
    vendor_type: "repair_shop",
    notes: null,
    active: true,
    created_at: now,
    updated_at: now,
  };
  await maintenance.insertVendor(vendor);
  runtime.recordIds.vendor = vendor.id;

  const workOrder: MaintenanceWorkOrder = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    work_order_number: `WO-P7-${ctx.stamp}`,
    vehicle_id: ctx.vehId,
    location_id: null,
    status: "open",
    priority: "high",
    maintenance_type: "brakes",
    source: "manual",
    title: "Phase7 brake pad replacement",
    description: "Front brake pads",
    reported_issue: "Squealing on braking",
    diagnosis: null,
    work_performed: null,
    vendor_id: vendor.id,
    assigned_user_id: null,
    opened_by_user_id: runtime.userAId,
    opened_at: now,
    scheduled_start_at: null,
    actual_start_at: null,
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    expected_ready_at: null,
    actual_ready_at: null,
    odometer_in: 12000,
    odometer_out: null,
    fuel_level_in: null,
    notes: null,
    internal_notes: null,
    estimated_cost: 180,
    actual_cost: null,
    labor_cost: 80,
    parts_cost: 100,
    tax_cost: 0,
    other_cost: 0,
    blocks_vehicle_use: true,
    downtime_started_at: now,
    downtime_ended_at: null,
    next_service_due_date: null,
    next_service_due_odometer: null,
    created_at: now,
    updated_at: now,
  };
  await maintenance.insertWorkOrder(workOrder);
  runtime.recordIds.workOrder = workOrder.id;

  const workOrderEvent: MaintenanceWorkOrderEvent = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    work_order_id: workOrder.id,
    event_type: "created",
    label: "Work order created",
    actor_user_id: runtime.userAId,
    actor_is_system: false,
    old_value: null,
    new_value: "open",
    note: null,
    created_at: now,
  };
  await maintenance.insertWorkOrderEvent(workOrderEvent);
  runtime.recordIds.workOrderEvent = workOrderEvent.id;

  const receipt: MaintenanceReceipt = {
    id: crypto.randomUUID(),
    tenant_id: orgA,
    work_order_id: workOrder.id,
    file_name: "brake-receipt.pdf",
    file_url: `${orgA}/maintenance/${workOrder.id}/brake-receipt.pdf`,
    mime_type: "application/pdf",
    receipt_type: "receipt",
    amount: 180,
    vendor_id: vendor.id,
    uploaded_by: runtime.userAId,
    uploaded_at: now,
    note: null,
    voided_at: null,
  };
  await maintenance.insertReceipt(receipt);
  runtime.recordIds.receipt = receipt.id;

  requireOk(
    await step(steps, "maintenance_vendor_persistence", async () => {
      const rows = await maintenance.listVendors(orgA);
      return rows.length === 1 && rows[0].id === vendor.id;
    }),
  );
  requireOk(
    await step(steps, "maintenance_work_order_persistence", async () => {
      const rows = await maintenance.listWorkOrders(orgA);
      const wo = rows.find((w) => w.id === workOrder.id);
      if (!wo) return false;
      const events = await maintenance.listWorkOrderEvents(orgA, workOrder.id);
      const receipts = await maintenance.listReceipts(orgA);
      return (
        wo.status === "open" &&
        wo.maintenance_type === "brakes" &&
        wo.blocks_vehicle_use === true &&
        wo.vendor_id === vendor.id &&
        events.length === 1 &&
        events[0].id === workOrderEvent.id &&
        receipts.length === 1 &&
        receipts[0].id === receipt.id &&
        receipts[0].work_order_id === workOrder.id
      );
    }),
  );

  // ── Balances/statuses + relationships remain correct ───────────────────
  await step(steps, "rental_balances_and_relationships_correct", async () => {
    const ledgerRows = await ledger.listForRental(orgA, ctx.rentalId);
    const depRows = await deposits.list(orgA);
    const dep = depRows.find((d) => d.id === deposit.id);
    const settlement = getRentalSettlement(
      buildRental(ctx),
      ledgerRows,
      dep ?? null,
    );
    return (
      settlement.totalCharges === 1000 &&
      settlement.payments === 1000 &&
      settlement.customerBalanceDue === 0 &&
      dep?.rental_id === ctx.rentalId
    );
  });

  // Stash the fixtures for the hydration step (not on the repo shape).
  runtime.phase7 = {
    charge,
    payment,
    deposit,
    depositHistory,
    booking,
    inspection,
    workOrder,
    workOrderEvent,
    vendor,
    receipt,
  };

  return { steps };
}
