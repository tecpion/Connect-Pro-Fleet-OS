// Connect Pro Fleet — Settings > Extensions, Returns, Renewal,
// Reservations, Cancellations (Build #23).

import { SectionCard } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "./shared";
import { useCan } from "./useCan";
import type {
  ExtensionPolicyMode,
  ExtensionPaymentRequirement,
  ReservationMode,
  CancellationPolicyType,
  LateReturnFeeType,
} from "@/lib/companyPolicyTypes";

type P = ReturnType<
  typeof import("@/lib/store/companyPolicyStore").useCompanyPolicies
>["companyPolicies"];

export function OperationsPolicySection({
  form,
  set,
}: {
  form: P;
  set: (patch: Partial<P>) => void;
}) {
  const canManage = useCan("rental_policies.manage");
  return (
    <>
      <SectionCard title="Extensions">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Extension policy">
            <select
              disabled={!canManage}
              value={form.extension.mode}
              onChange={(e) =>
                set({
                  extension: {
                    ...form.extension,
                    mode: e.target.value as ExtensionPolicyMode,
                  },
                })
              }
              className={selectClass}
            >
              <option value="allowed">Allowed</option>
              <option value="approval_required">Approval required</option>
              <option value="not_allowed">Not allowed</option>
            </select>
          </Field>
          <Field label="Payment requirement">
            <select
              disabled={!canManage}
              value={form.extension.payment_requirement}
              onChange={(e) =>
                set({
                  extension: {
                    ...form.extension,
                    payment_requirement: e.target
                      .value as ExtensionPaymentRequirement,
                  },
                })
              }
              className={selectClass}
            >
              <option value="required_before">
                Payment required before extension
              </option>
              <option value="partial_balance">Partial balance allowed</option>
              <option value="manager_override">Manager override</option>
              <option value="none">No payment requirement</option>
            </select>
          </Field>
          <Field label="Notice (hours before return)" hint="Blank = anytime.">
            <Input
              type="number"
              min={0}
              disabled={!canManage}
              value={form.extension.notice_hours ?? ""}
              onChange={(e) =>
                set({
                  extension: {
                    ...form.extension,
                    notice_hours: e.target.value
                      ? Number(e.target.value)
                      : null,
                  },
                })
              }
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Returns">
        <p className="text-sm text-muted-foreground">
          Return cutoff is separate from the payment cutoff.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="Return cutoff time">
            <Input
              type="time"
              disabled={!canManage}
              value={form.returns.return_cutoff_time ?? ""}
              onChange={(e) =>
                set({
                  returns: {
                    ...form.returns,
                    return_cutoff_time: e.target.value || null,
                  },
                })
              }
              className="font-mono tabular"
            />
          </Field>
          <Field label="Return grace (minutes)">
            <Input
              type="number"
              min={0}
              disabled={!canManage}
              value={form.returns.grace_period_minutes}
              onChange={(e) =>
                set({
                  returns: {
                    ...form.returns,
                    grace_period_minutes: Number(e.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="Late return fee type">
            <select
              disabled={!canManage}
              value={form.returns.late_return_fee_type}
              onChange={(e) =>
                set({
                  returns: {
                    ...form.returns,
                    late_return_fee_type: e.target.value as LateReturnFeeType,
                  },
                })
              }
              className={selectClass}
            >
              <option value="none">None</option>
              <option value="fixed">Fixed</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="manual">Manual / custom</option>
            </select>
          </Field>
          <Field label="Late return fee amount">
            <Input
              type="number"
              min={0}
              disabled={
                !canManage || form.returns.late_return_fee_type === "none"
              }
              value={form.returns.late_return_fee_amount}
              onChange={(e) =>
                set({
                  returns: {
                    ...form.returns,
                    late_return_fee_amount: Number(e.target.value),
                  },
                })
              }
              className="font-mono tabular"
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Late-return fee enforcement is{" "}
          {form.returns.enforcement === "enforced" ? "active" : "pending"} —
          configuration is stored now; automatic application is deferred to a
          future build unless the current financial architecture safely supports
          it.
        </p>
      </SectionCard>

      <SectionCard title="Renewal">
        <Field label="Renewal mode">
          <select
            disabled={!canManage}
            value={form.renewal.mode}
            onChange={(e) =>
              set({
                renewal: {
                  ...form.renewal,
                  mode: e.target.value as typeof form.renewal.mode,
                },
              })
            }
            className={selectClass}
          >
            <option value="ends_automatically">
              Rental ends automatically
            </option>
            <option value="manual_extension">Manual extension required</option>
            <option value="auto_renew_if_paid">Auto-renew if paid</option>
            <option value="auto_renew_unless_notice">
              Auto-renew unless customer gives notice
            </option>
          </select>
        </Field>
      </SectionCard>

      <SectionCard title="Reservations">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Booking mode">
            <select
              disabled={!canManage}
              value={form.reservations.mode}
              onChange={(e) =>
                set({
                  reservations: {
                    ...form.reservations,
                    mode: e.target.value as ReservationMode,
                  },
                })
              }
              className={selectClass}
            >
              <option value="instant">Instant booking</option>
              <option value="request_approval">Request / approval</option>
              <option value="staff_created_only">Staff-created only</option>
            </select>
          </Field>
          <Field label="Min lead time (hours)" hint="Blank = same-day allowed.">
            <Input
              type="number"
              min={0}
              disabled={!canManage}
              value={form.reservations.min_lead_time_hours ?? ""}
              onChange={(e) =>
                set({
                  reservations: {
                    ...form.reservations,
                    min_lead_time_hours: e.target.value
                      ? Number(e.target.value)
                      : null,
                  },
                })
              }
            />
          </Field>
          <Field label="Max advance booking (days)" hint="Blank = no limit.">
            <Input
              type="number"
              min={0}
              disabled={!canManage}
              value={form.reservations.max_advance_booking_days ?? ""}
              onChange={(e) =>
                set({
                  reservations: {
                    ...form.reservations,
                    max_advance_booking_days: e.target.value
                      ? Number(e.target.value)
                      : null,
                  },
                })
              }
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Cancellations">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Cancellation policy">
            <select
              disabled={!canManage}
              value={form.cancellations.type}
              onChange={(e) =>
                set({
                  cancellations: {
                    ...form.cancellations,
                    type: e.target.value as CancellationPolicyType,
                  },
                })
              }
              className={selectClass}
            >
              <option value="free">Free cancellation</option>
              <option value="fee">Cancellation fee</option>
              <option value="deposit_forfeiture">Deposit forfeiture</option>
              <option value="no_refund_after_cutoff">
                No refund after cutoff
              </option>
              <option value="custom">Custom / manual</option>
            </select>
          </Field>
          <Field label="Cancellation fee ($)">
            <Input
              type="number"
              min={0}
              disabled={!canManage || form.cancellations.type !== "fee"}
              value={form.cancellations.fee_amount}
              onChange={(e) =>
                set({
                  cancellations: {
                    ...form.cancellations,
                    fee_amount: Number(e.target.value),
                  },
                })
              }
              className="font-mono tabular"
            />
          </Field>
          <Field
            label="Free until (hours before pickup)"
            hint="Blank = always free."
          >
            <Input
              type="number"
              min={0}
              disabled={!canManage}
              value={form.cancellations.free_cutoff_hours ?? ""}
              onChange={(e) =>
                set({
                  cancellations: {
                    ...form.cancellations,
                    free_cutoff_hours: e.target.value
                      ? Number(e.target.value)
                      : null,
                  },
                })
              }
            />
          </Field>
        </div>
      </SectionCard>
    </>
  );
}
