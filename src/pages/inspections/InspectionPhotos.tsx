// Connect Pro Fleet — Inspection photo capture step.
//
// Angle tiles (grid) + mobile camera mode (one angle at a time with
// auto-advance + completed strip). Cargo/bed angle is only shown for
// trucks/vans. Required vs optional badges. Pure presentation.

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Camera, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import {
  ALL_PHOTO_ANGLES,
  REQUIRED_PHOTO_ANGLES,
} from "@/lib/inspectionWorkspaceTypes";

export function PhotoStep({
  photoData,
  setPhotoData,
  vehicleType,
  requiredCaptured,
  requiredCount,
  missing,
}: {
  photoData: Record<string, string>;
  setPhotoData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  vehicleType: string;
  requiredCaptured: number;
  requiredCount: number;
  missing: string[];
}) {
  const [mobileMode, setMobileMode] = useState(false);
  const [mobileIndex, setMobileIndex] = useState(0);

  const angles = ALL_PHOTO_ANGLES.filter((a) => {
    if (a === "Cargo/bed")
      return vehicleType === "truck" || vehicleType === "van";
    return true;
  });

  const capture = (angle: string, url: string) =>
    setPhotoData((p) => ({ ...p, [angle]: url }));
  const remove = (angle: string) =>
    setPhotoData((p) => {
      const next = { ...p };
      delete next[angle];
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {requiredCaptured} of {requiredCount} required photos captured
        </p>
        <button
          onClick={() => setMobileMode((m) => !m)}
          className="text-xs font-medium text-primary hover:underline"
          data-testid="toggle-mobile-camera"
        >
          {mobileMode ? "Grid view" : "Camera mode"}
        </button>
      </div>
      {missing.length > 0 && (
        <p className="text-xs text-status-maintenance">
          {missing.length} required photo{missing.length === 1 ? "" : "s"}{" "}
          remaining: {missing.join(", ")}
        </p>
      )}

      {mobileMode ? (
        <MobileCameraMode
          angles={angles as string[]}
          photoData={photoData}
          onCapture={capture}
          onRemove={remove}
          index={mobileIndex}
          setIndex={setMobileIndex}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(angles as string[]).map((angle) => (
            <AngleCapture
              key={angle}
              angle={angle}
              required={REQUIRED_PHOTO_ANGLES.includes(angle as never)}
              value={photoData[angle]}
              onCapture={(url) => capture(angle, url)}
              onRemove={() => remove(angle)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MobileCameraMode({
  angles,
  photoData,
  onCapture,
  onRemove,
  index,
  setIndex,
}: {
  angles: string[];
  photoData: Record<string, string>;
  onCapture: (angle: string, url: string) => void;
  onRemove: (angle: string) => void;
  index: number;
  setIndex: React.Dispatch<React.SetStateAction<number>>;
}) {
  const angle = angles[index];
  const next = () => setIndex((i) => Math.min(i + 1, angles.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));
  return (
    <div className="space-y-3" data-testid="mobile-camera-mode">
      <AngleCapture
        angle={angle}
        required={REQUIRED_PHOTO_ANGLES.includes(angle as never)}
        value={photoData[angle]}
        onCapture={(url) => {
          onCapture(angle, url);
          if (index < angles.length - 1) next();
        }}
        onRemove={() => onRemove(angle)}
        large
      />
      <div className="flex gap-1.5 overflow-x-auto">
        {angles.map((a, i) => (
          <button
            key={a}
            onClick={() => setIndex(i)}
            className={cn(
              "shrink-0 rounded-md border px-2 py-1 text-xs font-medium",
              i === index
                ? "border-primary text-primary"
                : photoData[a]
                  ? "border-status-available/40 text-status-available"
                  : "border-border text-muted-foreground",
            )}
          >
            {photoData[a] ? "✓ " : ""}
            {a}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={back}
          disabled={index === 0}
        >
          <ChevronLeft size={16} /> Back
        </Button>
        <span className="text-xs text-muted-foreground">
          {index + 1} / {angles.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={next}
          disabled={index === angles.length - 1}
        >
          Next <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}

export function AngleCapture({
  angle,
  required,
  value,
  onCapture,
  onRemove,
  large,
}: {
  angle: string;
  required: boolean;
  value: string | undefined;
  onCapture: (dataUrl: string) => void;
  onRemove: () => void;
  large?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onCapture(reader.result as string);
    reader.readAsDataURL(file);
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) readFile(f);
    e.target.value = "";
  };

  if (value) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border-2 border-status-available",
          large ? "h-64" : "h-28",
        )}
      >
        <img
          src={value}
          alt={`${angle} inspection photo`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
          <span className="text-xs font-medium text-white">{angle}</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="rounded bg-white/25 px-1.5 py-0.5 text-xs font-medium text-white hover:bg-white/40"
            >
              Retake
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rounded bg-white/25 px-1.5 py-0.5 text-xs font-medium text-white hover:bg-white/40"
            >
              Remove
            </button>
          </div>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPick}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40",
        large ? "h-64" : "h-28",
      )}
    >
      <Camera size={large ? 32 : 22} />
      <span className="text-xs font-medium">
        {angle}
        {required && (
          <span className="ml-1 rounded bg-status-maintenance/15 px-1 py-0.5 text-[10px] text-status-maintenance">
            Required
          </span>
        )}
      </span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:border-primary/40"
        >
          <Camera size={12} /> Camera
        </button>
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground hover:border-primary/40"
        >
          <Upload size={12} /> Upload
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
