// Smart Capture — Scan Launcher (mobile-first operational scan experience).
//
// Lets staff take/upload a photo and identify a vehicle by plate or VIN,
// see its status + maintenance info, and jump into the right existing workflow.
//
// This is a UI/UX foundation ONLY. No OCR, AI vision, or automatic extraction is
// wired up. After capturing/uploading, the user manually enters the plate/VIN to
// match against existing fleet inventory. Nothing is ever fabricated or saved
// automatically — all actions route through existing validated workflows.
//
// Flow: SCAN/UPLOAD → MANUAL ENTRY → MATCH → REVIEW → CHOOSE ACTION → EXISTING WORKFLOW

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Camera,
  Upload,
  ScanLine,
  X,
  Check,
  RefreshCw,
  Search,
  Car,
  Wrench,
  ClipboardCheck,
  AlertTriangle,
  Wallet,
  ShieldCheck,
  FileText,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { fmtNumber, fmtDate, vehicleStatusMeta } from "@/lib/format";
import { StatusPill, vehicleTone } from "@/components/Status";
import type { Vehicle } from "@/lib/types";
import {
  SCAN_OPTIONS,
  isVehicleScan,
  type ScanOptionId,
  type ScanStage,
} from "./scanTypes";
import { maskVin, matchByPlate, matchByVin, searchVehicles } from "./scanMatch";
import { actionsForVehicle, type VehicleAction } from "./scanActions";

// Icon map for action menu items.
const ACTION_ICONS: Record<VehicleAction["icon"], typeof Car> = {
  car: Car,
  wrench: Wrench,
  clipboard: ClipboardCheck,
  alert: AlertTriangle,
  wallet: Wallet,
  shield: ShieldCheck,
  file: FileText,
};

// Icon map for scan option cards.
const OPTION_ICONS: Record<string, typeof Camera> = {
  scan: ScanLine,
  camera: Camera,
  file: FileText,
  wallet: Wallet,
  wrench: Wrench,
  shield: ShieldCheck,
  upload: Upload,
};

export function ScanLauncher({
  open,
  onOpenChange,
  initialOption,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialOption?: ScanOptionId;
}) {
  const navigate = useNavigate();
  const { vehicles } = useStore();
  const [stage, setStage] = useState<ScanStage>("options");
  const [selectedOption, setSelectedOption] = useState<ScanOptionId | null>(
    null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [idValue, setIdValue] = useState("");
  const [matches, setMatches] = useState<Vehicle[]>([]);
  const [matchedVehicle, setMatchedVehicle] = useState<Vehicle | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setStage("options");
    setSelectedOption(null);
    setPreviewUrl(null);
    setIdValue("");
    setMatches([]);
    setMatchedVehicle(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (open && initialOption) {
      setSelectedOption(initialOption);
      setStage("capture");
    }
  }, [open, initialOption]);

  const handleFile = useCallback((file: File | undefined) => {
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setStage("enter_id");
  }, []);

  const doMatch = useCallback(() => {
    const val = idValue.trim();
    if (!val) {
      toast.error("Enter a plate or VIN to search.");
      return;
    }
    let results: Vehicle[] = [];
    if (selectedOption === "plate" || selectedOption === "registration") {
      results = matchByPlate(vehicles, val);
      if (results.length === 0) results = matchByVin(vehicles, val);
    } else if (selectedOption === "vin") {
      results = matchByVin(vehicles, val);
      if (results.length === 0) results = matchByPlate(vehicles, val);
    } else {
      results = searchVehicles(vehicles, val);
    }
    if (results.length === 0) {
      setStage("no_match");
    } else if (results.length === 1) {
      setMatchedVehicle(results[0]);
      setStage("match_result");
    } else {
      setMatches(results);
      setStage("multiple_matches");
    }
  }, [idValue, selectedOption, vehicles]);

  const handleAction = useCallback(
    (to: string) => {
      onOpenChange(false);
      navigate(to);
    },
    [navigate, onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg sm:mx-auto sm:rounded-t-2xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <ScanLine size={20} className="text-primary" /> Smart Capture
          </SheetTitle>
          <SheetDescription>
            Take a photo or upload an image to quickly find a vehicle or start a
            workflow.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          {/* STAGE: options */}
          {stage === "options" && (
            <div className="space-y-3">
              <div className="rounded-lg border border-status-maintenance/30 bg-status-maintenance/5 p-3">
                <div className="flex items-start gap-2 text-sm">
                  <AlertCircle
                    size={16}
                    className="mt-0.5 shrink-0 text-status-maintenance"
                  />
                  <p className="text-muted-foreground">
                    Smart Capture recognition will be enabled when the scanning
                    service is connected. You can still search for a vehicle
                    manually below.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {SCAN_OPTIONS.map((opt) => {
                  const Icon = OPTION_ICONS[opt.icon] ?? Camera;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setSelectedOption(opt.id);
                        setStage("capture");
                      }}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-primary/50 hover:bg-surface-2"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground">
                          {opt.label}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {opt.hint}
                        </p>
                      </div>
                      <ChevronRight
                        size={18}
                        className="shrink-0 text-muted-foreground"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STAGE: capture */}
          {stage === "capture" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => cameraRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-surface-2"
                >
                  <Camera size={32} className="text-primary" />
                  <span className="font-medium text-foreground">
                    Take Photo
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Use your phone camera
                  </span>
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-surface-2"
                >
                  <Upload size={28} className="text-muted-foreground" />
                  <span className="font-medium text-foreground">
                    Upload Document
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Choose a file from your device
                  </span>
                </button>
              </div>
              <div className="flex flex-wrap justify-between">
                <Button variant="ghost" onClick={() => setStage("options")}>
                  Back
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedOption("plate");
                    setStage("enter_id");
                  }}
                >
                  <Search size={15} className="mr-1.5" /> Search Manually
                </Button>
              </div>
            </div>
          )}

          {/* STAGE: enter_id */}
          {stage === "enter_id" && (
            <div className="space-y-4">
              {previewUrl && (
                <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
                  <img
                    src={previewUrl}
                    alt="Captured image"
                    className="max-h-[200px] w-full object-contain"
                  />
                </div>
              )}
              <div className="rounded-lg border border-status-maintenance/30 bg-status-maintenance/5 p-3">
                <div className="flex items-start gap-2 text-sm">
                  <AlertCircle
                    size={16}
                    className="mt-0.5 shrink-0 text-status-maintenance"
                  />
                  <p className="text-muted-foreground">
                    Smart Capture is being prepared. Enter the plate or VIN
                    below to find the vehicle. Document scanning will be enabled
                    once the extraction service is connected.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scan-id">
                  {isVehicleScan(selectedOption)
                    ? "License plate or VIN"
                    : "Search vehicles"}
                </Label>
                <Input
                  id="scan-id"
                  value={idValue}
                  onChange={(e) => setIdValue(e.target.value)}
                  placeholder="Enter plate or VIN…"
                  onKeyDown={(e) => e.key === "Enter" && doMatch()}
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => setStage("capture")}>
                  Back
                </Button>
                <Button onClick={doMatch} className="gap-2">
                  <Search size={15} /> Find Vehicle
                </Button>
              </div>
            </div>
          )}

          {/* STAGE: no_match */}
          {stage === "no_match" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/40">
                  <Search size={28} className="text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    No matching vehicle found
                  </p>
                  {idValue.trim() && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Detected:{" "}
                      <span className="font-mono">{idValue.trim()}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    setIdValue("");
                    setStage("enter_id");
                  }}
                >
                  <RefreshCw size={15} /> Try Again
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    onOpenChange(false);
                    navigate("/vehicles?new=1");
                  }}
                >
                  <Car size={15} /> Add New Vehicle
                </Button>
              </div>
            </div>
          )}

          {/* STAGE: multiple_matches */}
          {stage === "multiple_matches" && (
            <div className="space-y-4">
              <div className="text-center">
                <p className="font-medium text-foreground">
                  We found more than one possible match.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select the correct vehicle to continue.
                </p>
              </div>
              <div className="space-y-2">
                {matches.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setMatchedVehicle(v);
                      setStage("match_result");
                    }}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-2"
                  >
                    <Car size={20} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {v.year} {v.make} {v.model}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {v.license_plate} · VIN {maskVin(v.vin)}
                      </p>
                    </div>
                    <ChevronRight
                      size={18}
                      className="shrink-0 text-muted-foreground"
                    />
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setIdValue("");
                  setStage("enter_id");
                }}
              >
                Search Again
              </Button>
            </div>
          )}

          {/* STAGE: match_result */}
          {stage === "match_result" && matchedVehicle && (
            <MatchResult
              vehicle={matchedVehicle}
              onAction={handleAction}
              onRescan={() => {
                setIdValue("");
                setStage("enter_id");
              }}
            />
          )}
        </div>

        <div className="border-t border-border px-5 py-3">
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            <X size={15} className="mr-1.5" /> Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// --- Match result + maintenance summary + action menu ---

function MatchResult({
  vehicle,
  onAction,
  onRescan,
}: {
  vehicle: Vehicle;
  onAction: (to: string) => void;
  onRescan: () => void;
}) {
  const { maintenance, vehicleWorkOrders } = useStore();
  const openWOs = vehicleWorkOrders(vehicle.id).filter((w) =>
    ["open", "in_progress", "parts_ordered"].includes(w.status),
  );
  const recent = maintenance
    .filter((m) => m.vehicle_id === vehicle.id)
    .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1))
    .slice(0, 3);
  const actions = actionsForVehicle(vehicle);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <Check size={14} /> Vehicle Found
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </p>
            <p className="font-mono text-sm text-muted-foreground">
              {vehicle.license_plate} · VIN {maskVin(vehicle.vin)}
            </p>
          </div>
          <StatusPill tone={vehicleTone(vehicle.status)}>
            {vehicleStatusMeta[vehicle.status].label}
          </StatusPill>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Maintenance Status
        </p>
        <div className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current mileage</span>
            <span className="font-mono tabular text-foreground">
              {fmtNumber(vehicle.current_mileage)} mi
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Open work orders</span>
            <span className="font-medium text-foreground">
              {openWOs.length}
            </span>
          </div>
          {recent.length > 0 ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last service</span>
              <span className="font-mono tabular text-foreground">
                {fmtDate(recent[0].scheduled_date)}
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No maintenance history recorded for this vehicle.
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-sm font-medium text-foreground">
          What would you like to do?
        </p>
        <div className="grid grid-cols-1 gap-2.5">
          {actions.map((a) => {
            const Icon = ACTION_ICONS[a.icon] ?? Car;
            return (
              <button
                key={a.id}
                onClick={() => onAction(a.to)}
                className="flex min-h-[48px] items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-2"
              >
                <Icon size={20} className="shrink-0 text-primary" />
                <span className="flex-1 font-medium text-foreground">
                  {a.label}
                </span>
                <ChevronRight
                  size={18}
                  className="shrink-0 text-muted-foreground"
                />
              </button>
            );
          })}
        </div>
      </div>

      <Button variant="ghost" className="w-full gap-2" onClick={onRescan}>
        <RefreshCw size={15} /> Scan Another Vehicle
      </Button>
    </div>
  );
}

// --- Reusable trigger button ---

export function ScanButton({
  onClick,
  label = "Scan",
  variant = "outline",
  size,
  className,
}: {
  onClick: () => void;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}) {
  return (
    <Button
      onClick={onClick}
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
    >
      <ScanLine size={16} />
      {label}
    </Button>
  );
}
