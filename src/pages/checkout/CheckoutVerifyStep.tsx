// Connect Pro Fleet — Checkout verify + vehicle steps (Build #5).
// Extracted from CheckoutWorkflow.tsx (which exceeds the per-file line limit).
// Step 0: confirm license + insurance. Step 1: capture mileage + fuel out.

import type { Customer, Vehicle } from "@/lib/types";
import { fmtNumber } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VerifyCard } from "./CheckoutHelpers";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Car,
  Gauge,
  Fuel,
} from "lucide-react";

export function VerifyStep({
  customer,
  licenseOk,
  insuranceOk,
  verificationReady,
}: {
  customer?: Customer;
  licenseOk: boolean;
  insuranceOk: boolean;
  verificationReady: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Confirm the renter's license and insurance are valid before handing over
        the keys.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <VerifyCard
          ok={licenseOk}
          icon={licenseOk ? ShieldCheck : ShieldAlert}
          title="Driver's license"
          lines={[
            customer ? `${customer.first_name} ${customer.last_name}` : "—",
            customer?.drivers_license_number
              ? `${customer.drivers_license_state ?? ""} ${customer.drivers_license_number}`
              : "No license on file",
            `Expires ${customer?.drivers_license_expiry ?? "—"}`,
          ]}
        />
        <VerifyCard
          ok={insuranceOk}
          icon={insuranceOk ? ShieldCheck : ShieldAlert}
          title="Insurance"
          lines={[
            customer?.insurance_company ?? "No carrier on file",
            customer?.insurance_policy_number ?? "—",
            insuranceOk
              ? "Coverage adequate"
              : "Add or update insurance before checkout",
          ]}
        />
      </div>
      {!verificationReady && (
        <p className="flex items-center gap-2 rounded-md bg-status-maintenance/10 px-3 py-2 text-sm text-status-maintenance">
          <AlertTriangle size={16} /> Resolve license or insurance issues before
          continuing.
        </p>
      )}
    </div>
  );
}

export function VehicleStep({
  vehicle,
  mileageOut,
  setMileageOut,
  fuelOut,
  setFuelOut,
}: {
  vehicle?: Vehicle;
  mileageOut: number;
  setMileageOut: (n: number) => void;
  fuelOut: number;
  setFuelOut: (n: number) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-surface-2 p-4">
        <div className="flex items-center gap-2">
          <Car size={18} className="text-primary" />
          <p className="font-display font-semibold text-foreground">
            {vehicle?.make} {vehicle?.model} ({vehicle?.year})
          </p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-muted-foreground">Plate</dt>
            <dd className="font-mono tabular text-sm">
              {vehicle?.license_plate}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">VIN</dt>
            <dd className="font-mono tabular text-xs">{vehicle?.vin}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-muted-foreground">
              Current mileage
            </dt>
            <dd className="font-mono tabular text-sm">
              {vehicle ? fmtNumber(vehicle.current_mileage) : "—"} mi
            </dd>
          </div>
        </dl>
      </div>
      <div>
        <Label className="flex items-center gap-1.5">
          <Gauge size={15} /> Mileage out (mi)
        </Label>
        <Input
          type="number"
          value={mileageOut || ""}
          onChange={(e) => setMileageOut(Math.max(0, Number(e.target.value)))}
          placeholder="0"
          inputMode="numeric"
          className="mt-1.5 h-14 font-mono text-2xl tabular"
        />
      </div>
      <div>
        <Label className="flex items-center gap-1.5">
          <Fuel size={15} /> Fuel level out
        </Label>
        <div className="mt-2 flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={fuelOut}
            onChange={(e) => setFuelOut(Number(e.target.value))}
            className="flex-1 accent-primary"
            aria-label="Fuel level out"
          />
          <span className="w-14 text-right font-mono text-lg tabular text-foreground">
            {fuelOut}%
          </span>
        </div>
      </div>
    </div>
  );
}
