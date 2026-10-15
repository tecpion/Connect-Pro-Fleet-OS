import { useState } from "react";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export function AutomationsSection() {
  const [events, setEvents] = useState({
    reservation: true,
    inspection: true,
    maintenance: true,
    weekly_billing: false,
    late_fee: true,
  });
  return (
    <SectionCard title="Operational Automations">
      <p className="text-sm text-muted-foreground">
        Fire outbound events and run scheduled checks automatically.
      </p>
      <div className="mt-4 space-y-2">
        {(
          [
            { key: "reservation", label: "Reservation created / updated" },
            { key: "inspection", label: "Inspection completed" },
            { key: "maintenance", label: "Maintenance flagged" },
            { key: "weekly_billing", label: "Weekly billing period opens" },
            { key: "late_fee", label: "Late fee applied" },
          ] as const
        ).map((e) => (
          <label
            key={e.key}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2.5"
          >
            <span className="text-sm text-foreground">{e.label}</span>
            <Switch
              checked={events[e.key as keyof typeof events]}
              onCheckedChange={(v) =>
                setEvents((ev) => ({ ...ev, [e.key]: v }))
              }
            />
          </label>
        ))}
      </div>
      <Button
        className="mt-4 bg-primary text-primary-foreground hover:bg-primary-press"
        onClick={() => toast.success("Automation settings saved.")}
      >
        Save automations
      </Button>
    </SectionCard>
  );
}
