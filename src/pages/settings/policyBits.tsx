// Connect Pro Fleet — shared policy UI bits (Build #23).

import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";

export function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
      <span className="text-sm text-foreground">{label}</span>
      <Switch
        disabled={disabled}
        checked={checked}
        onCheckedChange={onChange}
      />
    </label>
  );
}

export function SaveBar({ onSave }: { onSave: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        onClick={onSave}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-press"
      >
        Save policies
      </button>
    </div>
  );
}

export function PolicyHint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
