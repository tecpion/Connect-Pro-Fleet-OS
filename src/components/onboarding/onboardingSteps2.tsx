// Connect Pro Fleet OS — Onboarding step components (part 2).

import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Car,
  FileSignature,
  CreditCard,
  Users,
  Plug,
  Bot,
  CheckCircle2,
  ShieldCheck,
  Clock,
  PenLine,
  Send,
  ChevronRight,
} from "lucide-react";
import {
  type OnboardingAnswers,
  StepTitle,
  ChoiceCard,
  QuickWin,
  HelpFooter,
  ContinueButton,
  SetupRow,
} from "./onboardingPrimitives";

type Navigate = ReturnType<typeof useNavigate>;

export function FleetStep({
  vehicles,
  navigate,
  onNext,
}: {
  vehicles: { id: string }[];
  navigate: Navigate;
  onNext: () => void;
}) {
  const hasVehicle = vehicles.length > 0;
  return (
    <div>
      <StepTitle
        icon={Car}
        title="Add your first vehicles"
        subtitle="You'll need at least one vehicle before you can run a real rental."
      />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <ChoiceCard
          label="Add Manually"
          description="Enter vehicle information yourself."
          selected={false}
          onClick={() => navigate("/vehicles")}
        />
        <ChoiceCard
          label="Smart Capture"
          description="Take a photo or upload a document."
          selected={false}
          onClick={() => navigate("/vehicles")}
        />
        <ChoiceCard
          label="Import Vehicles"
          description="Import multiple vehicles from a file."
          selected={false}
          onClick={() => navigate("/migration")}
        />
      </div>
      <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Smart Capture</span>{" "}
          scanning will be enabled once document extraction is connected.
        </p>
      </div>
      {hasVehicle ? (
        <QuickWin message="Your first vehicle is ready." />
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No vehicles added yet. You can skip for now, but you'll need at least
          one before running a rental.
        </p>
      )}
      <HelpFooter />
      <ContinueButton onClick={onNext} />
    </div>
  );
}

export function AgreementsStep({
  navigate,
  onNext,
}: {
  navigate: Navigate;
  onNext: () => void;
}) {
  return (
    <div>
      <StepTitle
        icon={FileSignature}
        title="Set up your rental agreements"
        subtitle="Connect Pro can require a new agreement when important rental details change."
      />
      <div className="space-y-2.5">
        <SetupRow
          icon={FileSignature}
          label="Agreement Templates"
          hint="Standard, weekly, long-term templates"
          onClick={() => navigate("/settings?section=agreements")}
        />
      </div>
      <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Re-sign triggers</p>
        <ul className="mt-1.5 space-y-1">
          <li>• Agreement expiration</li>
          <li>• Vehicle change</li>
          <li>• Rate change</li>
          <li>• Terms version change</li>
        </ul>
      </div>
      <QuickWin message="Your rental agreement rules are configured." />
      <HelpFooter />
      <ContinueButton onClick={onNext} />
    </div>
  );
}

export function PaymentsStep({
  navigate,
  onNext,
}: {
  navigate: Navigate;
  onNext: () => void;
}) {
  return (
    <div>
      <StepTitle
        icon={CreditCard}
        title="How do you collect rental payments?"
        subtitle="Choose your payment methods and configure deposit/payment rules."
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {["Stripe", "Cash", "Zelle", "Cash App", "Apple Pay", "Other"].map(
          (m) => (
            <div
              key={m}
              className="rounded-lg border border-border px-3 py-2.5 text-center text-sm text-foreground"
            >
              {m}
            </div>
          ),
        )}
      </div>
      <div className="mt-4 space-y-2.5">
        <SetupRow
          icon={ShieldCheck}
          label="Deposit Policy"
          hint="When deposits are collected and refunded"
          onClick={() => navigate("/settings?section=deposits")}
        />
        <SetupRow
          icon={Clock}
          label="Payment Due Rules"
          hint="Cutoff times and grace periods"
          onClick={() => navigate("/settings?section=rentalPolicies")}
        />
      </div>
      <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">
            Payment Policy Configured
          </span>{" "}
          vs{" "}
          <span className="font-medium text-foreground">
            Payment Processor Connected
          </span>{" "}
          — setting up policies here doesn't connect a live processor. You can
          connect Stripe or other processors in Integrations.
        </p>
      </div>
      <HelpFooter />
      <ContinueButton onClick={onNext} />
    </div>
  );
}

export function TeamStep({
  staff,
  answers,
  navigate,
  onNext,
}: {
  staff: { id: string }[];
  answers: OnboardingAnswers;
  navigate: Navigate;
  onNext: () => void;
}) {
  return (
    <div>
      <StepTitle
        icon={Users}
        title="Who helps run the business?"
        subtitle="Review roles and invite your team. You can skip this if it's just you."
      />
      <div className="space-y-2.5">
        <SetupRow
          icon={Users}
          label="Manage Staff & Roles"
          hint="Invite team members and set permissions"
          onClick={() => navigate("/staff?tab=team")}
        />
      </div>
      {staff.length > 0 && <QuickWin message="Your team is being set up." />}
      {!answers.hasStaff && (
        <p className="mt-4 text-sm text-muted-foreground">
          You can invite your team later from Staff &amp; Permissions.
        </p>
      )}
      <HelpFooter />
      <ContinueButton onClick={onNext} />
    </div>
  );
}

export function ToolsStep({
  navigate,
  onNext,
}: {
  navigate: Navigate;
  onNext: () => void;
}) {
  const integrations = [
    {
      name: "Connect Pro CRM",
      status: "Setup Required",
      desc: "Connect your CRM so qualified booking activity and rental updates move between systems.",
    },
    {
      name: "GPS / Telematics",
      status: "Coming Soon",
      desc: "Live vehicle tracking and geofence alerts.",
    },
    {
      name: "Accounting",
      status: "Coming Soon",
      desc: "Sync expenses and revenue with your accounting software.",
    },
    {
      name: "Payment Processor",
      status: "Setup Required",
      desc: "Connect Stripe or another processor to accept card payments.",
    },
  ];
  return (
    <div>
      <StepTitle
        icon={Plug}
        title="Connect the tools you already use"
        subtitle="Integrations are optional — you can finish these anytime."
      />
      <div className="space-y-2.5">
        {integrations.map((i) => (
          <div
            key={i.name}
            className="flex items-center justify-between rounded-lg border border-border p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{i.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{i.desc}</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                i.status === "Connected"
                  ? "bg-primary/10 text-primary"
                  : i.status === "Coming Soon"
                    ? "bg-surface-2 text-muted-foreground"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              )}
            >
              {i.status}
            </span>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => navigate("/integrations")}
      >
        Open Integrations
      </Button>
      <HelpFooter />
      <ContinueButton onClick={onNext} />
    </div>
  );
}

export function AiOperatorStep({
  navigate,
  onNext,
}: {
  navigate: Navigate;
  onNext: () => void;
}) {
  const areas = [
    {
      name: "Operations",
      items: ["Rentals", "Fleet readiness", "Maintenance", "Compliance"],
    },
    {
      name: "Payments & Finance",
      items: ["Payments", "Deposits", "Collections", "Financial exceptions"],
    },
  ];
  return (
    <div>
      <StepTitle
        icon={Bot}
        title="Choose what your AI Operator should help manage"
        subtitle="Start with monitoring and approvals. You can increase automation later."
      />
      <div className="space-y-3">
        {areas.map((a) => (
          <div key={a.name} className="rounded-lg border border-border p-4">
            <p className="text-sm font-semibold text-foreground">{a.name}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {a.items.map((i) => (
                <span
                  key={i}
                  className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {i}
                </span>
              ))}
            </div>
            <div className="mt-3 flex gap-1.5">
              {["Off", "Monitor", "Prepare", "Auto"].map((m, idx) => (
                <span
                  key={m}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium",
                    idx === 1
                      ? "bg-primary/10 text-primary"
                      : "border border-border text-muted-foreground",
                  )}
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
        <p className="text-xs font-medium text-foreground">How AI works</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <Clock size={16} className="mx-auto text-primary" />
            <p className="mt-1 text-xs font-medium text-foreground">Watch</p>
            <p className="text-xs text-muted-foreground">
              Identifies what needs attention.
            </p>
          </div>
          <div>
            <PenLine size={16} className="mx-auto text-primary" />
            <p className="mt-1 text-xs font-medium text-foreground">Draft</p>
            <p className="text-xs text-muted-foreground">
              Prepares the next step.
            </p>
          </div>
          <div>
            <Send size={16} className="mx-auto text-primary" />
            <p className="mt-1 text-xs font-medium text-foreground">Act</p>
            <p className="text-xs text-muted-foreground">
              Executes approved actions.
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          AI follows your staff permissions and approval rules.
        </p>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        New tenants default to{" "}
        <span className="font-medium text-foreground">Monitor</span> mode. Auto
        mode is available after AI automation is enabled.
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={() => navigate("/ai-workforce")}
      >
        Open AI Operator
      </Button>
      <ContinueButton onClick={onNext} />
    </div>
  );
}

export function ReadinessStep({
  answers,
  companyInfo,
  vehicles,
  staff,
  navigate,
  onFinish,
}: {
  answers: OnboardingAnswers;
  companyInfo: { legal_name: string };
  vehicles: { id: string }[];
  staff: { id: string }[];
  navigate: Navigate;
  onFinish: () => void;
}) {
  const hasProfile = !!companyInfo.legal_name;
  const hasVehicle = vehicles.length > 0;
  const hasTeam = staff.length > 0;
  const checks = [
    { label: "Business Profile", done: hasProfile, optional: false },
    {
      label: "Rental Model",
      done: answers.rentalCadences.length > 0,
      optional: false,
    },
    { label: "Pricing", done: false, optional: false },
    { label: "At Least One Vehicle", done: hasVehicle, optional: false },
    { label: "Deposit Policy", done: false, optional: false },
    { label: "Rental Agreement", done: false, optional: false },
    { label: "Payment Methods", done: false, optional: false },
    { label: "Team", done: hasTeam, optional: true },
    { label: "Connect Pro CRM", done: false, optional: true },
    { label: "AI Operator", done: false, optional: true },
  ];
  const doneCount = checks.filter((c) => c.done).length;

  return (
    <div>
      <StepTitle
        icon={CheckCircle2}
        title="You're almost ready"
        subtitle="Here's your setup checklist."
      />
      <div className="space-y-2">
        {checks.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              {c.done ? (
                <CheckCircle2 size={16} className="text-primary" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-border" />
              )}
              <span className="text-sm text-foreground">{c.label}</span>
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                c.done
                  ? "text-primary"
                  : c.optional
                    ? "text-muted-foreground"
                    : "text-amber-600 dark:text-amber-400",
              )}
            >
              {c.done
                ? "Completed"
                : c.optional
                  ? "Optional"
                  : "Needs Attention"}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {doneCount} of {checks.length} items complete. You can finish the rest
        anytime from Settings.
      </p>
      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={() => navigate("/settings")}>
          Review Setup
        </Button>
        <Button
          onClick={onFinish}
          className="bg-primary text-primary-foreground"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
