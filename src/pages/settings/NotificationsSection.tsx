// Connect Pro Fleet — Settings > Notifications section (Build #12).
//
// Per-user notification preferences. User can edit own preferences only (the
// store enforces this). Categories grouped operationally. In-App and Email
// toggles are functional now; Connect Pro / SMS is shown as future-only and
// never presented as working. Changing preferences changes zero ledger state.

import { useStore } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  NOTIFICATION_CATEGORY_LABELS,
  type NotificationCategory,
} from "@/lib/notificationTypes";
import { NOTIFICATION_RULES } from "@/lib/notificationRules";
import { resolvePreference } from "@/lib/notificationSelectors";
import { Bell, Mail, MessageSquare } from "lucide-react";

interface CategoryGroup {
  label: string;
  hint: string;
  categories: NotificationCategory[];
}

const GROUPS: CategoryGroup[] = [
  {
    label: "Tasks",
    hint: "Assignments, due dates, overdue work",
    categories: ["task"],
  },
  {
    label: "Rentals & Returns",
    hint: "Operational rental exceptions",
    categories: ["rental", "reservation"],
  },
  {
    label: "Payments & Arrangements",
    hint: "Broken arrangements, promised-payment exceptions",
    categories: ["payment", "payment_arrangement"],
  },
  {
    label: "Vehicles & Maintenance",
    hint: "Maintenance and vehicle status issues",
    categories: ["vehicle", "maintenance"],
  },
  {
    label: "Documents & Verification",
    hint: "Registration, insurance, verification",
    categories: ["document", "verification"],
  },
  {
    label: "Deposits",
    hint: "Refund-related operational alerts",
    categories: ["deposit"],
  },
  {
    label: "Incidents & Damage",
    hint: "Operational review issues",
    categories: ["damage", "incident", "violation"],
  },
];

export function NotificationsSection() {
  const { currentStaffId, notificationPreferences, setPreference } = useStore();

  function resolved(category: NotificationCategory) {
    // Use the first rule for this category to get sensible defaults.
    const rule = Object.values(NOTIFICATION_RULES).find(
      (r) => r.category === category,
    );
    return resolvePreference(
      notificationPreferences,
      currentStaffId,
      category,
      {
        in_app: rule?.defaultInApp ?? true,
        email: rule?.defaultEmail ?? true,
      },
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Notification preferences">
        <p className="mb-4 text-sm text-muted-foreground">
          Choose how you're notified about operational events. These are your
          personal preferences — they don't affect anyone else.
        </p>
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.label} className="rounded-lg border border-border p-4">
              <div className="mb-3">
                <p className="font-display text-sm font-semibold text-foreground">
                  {g.label}
                </p>
                <p className="text-xs text-muted-foreground">{g.hint}</p>
              </div>
              <div className="space-y-2.5">
                {g.categories.map((cat) => {
                  const prefs = resolved(cat);
                  return (
                    <div
                      key={cat}
                      className="flex flex-col gap-2 border-t border-border pt-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm text-foreground">
                        {NOTIFICATION_CATEGORY_LABELS[cat]}
                      </span>
                      <div className="flex items-center gap-5">
                        <Toggle
                          icon={<Bell size={13} />}
                          label="In-App"
                          checked={prefs.in_app}
                          onChange={(v) =>
                            setPreference({
                              userId: currentStaffId,
                              category: cat,
                              inApp: v,
                            })
                          }
                        />
                        <Toggle
                          icon={<Mail size={13} />}
                          label="Email"
                          checked={prefs.email}
                          onChange={(v) =>
                            setPreference({
                              userId: currentStaffId,
                              category: cat,
                              email: v,
                            })
                          }
                        />
                        <span
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground/60"
                          title="SMS via Connect Pro — coming with integration"
                        >
                          <MessageSquare size={13} /> SMS
                          <span className="hidden sm:inline">
                            — coming soon
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function Toggle({
  icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs",
          checked ? "text-foreground" : "text-muted-foreground/60",
        )}
      >
        {icon}
        {label}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
