import { NavLink, useLocation } from "@/lib/router-compat";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/supabase/authContext";
import { can } from "@/lib/permissions";
import { useCompanyPolicies } from "@/lib/store/companyPolicyStore";
import { isVerificationEnabled } from "@/lib/verificationConfig";
import { RouteLine } from "@/components/RouteLine";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationBell } from "@/components/NotificationBell";
import { CopilotLauncher } from "@/components/copilot/CopilotLauncher";
import { CopilotVoiceDevDiagnostics } from "@/components/copilot/CopilotVoiceDevDiagnostics";
import {
  LayoutDashboard,
  Car,
  CalendarDays,
  ClipboardCheck,
  Wrench,
  Users,
  Settings,
  LineChart,
  Menu,
  X,
  FileText,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ShieldCheck,
  ListTodo,
  TrendingUp,
  LifeBuoy,
  Sparkles,
  Siren,
  Gavel,
  UserCog,
  Database,
  Plug,
  Wallet,
  Zap,
  Bot,
  Satellite,
} from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Grouped navigation — right rail, collapsible business-oriented sections.
//
// IA (Build #35): the old catch-all "Operations" group is gone. Items are now
// organized by business domain: Rentals, Fleet, Customers, Finance, Team,
// Insights, System. Reservation + Rental nav entries are consolidated under
// a single "Rental Management" workspace. Domain models are NOT merged —
// only the navigation is reorganized.
// ---------------------------------------------------------------------------

interface NavItem {
  to: string;
  label: string;
  icon: any;
  end?: boolean;
  /** Permission key required to see this item. Omit for always-visible. */
  perm?: string;
  /** Optional feature gate; the item is hidden when the feature is disabled by
   *  tenant configuration. Currently only "verification" is supported. */
  feature?: "verification";
}

interface NavGroup {
  label: string;
  icon: any;
  items: NavItem[];
}

// HOME — always-visible top items (no collapse).
// Build #37 — Daily Briefing + standalone Fleet Copilot are consolidated into
// one "Action Center" workspace. The global Copilot button remains in the app
// header. Domain models/selectors are unchanged.
export const standaloneNavItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/action-center", label: "Action Center", icon: Zap },
];

export const navGroups: NavGroup[] = [
  {
    label: "Rentals",
    icon: CalendarRange,
    items: [
      {
        to: "/rental-management",
        label: "Rental Management",
        icon: CalendarRange,
      },
      { to: "/planner", label: "Planner", icon: CalendarDays },
    ],
  },
  {
    label: "Fleet",
    icon: Car,
    items: [
      { to: "/vehicles", label: "Vehicles", icon: Car },
      // V1 Telematics Hub — a dedicated Fleet operational workspace (GPS,
      // live map, alerts, trips, geofences, devices). Applies to the whole
      // fleet, not only active rentals, so it lives here rather than hidden
      // inside Vehicles. Visible with the telematics.view permission.
      {
        to: "/telematics",
        label: "Telematics",
        icon: Satellite,
        perm: "telematics.view",
      },
      { to: "/maintenance", label: "Maintenance", icon: Wrench },
      { to: "/inspections", label: "Inspections", icon: ClipboardCheck },
      // Build #56 — Incidents & Violations and Damage Claims are removed from
      // the sidebar. They remain authoritative underlying domains, accessible
      // from Case Center (the issue/case umbrella), Rental/Vehicle/Customer
      // detail, and their direct routes (/incidents-violations, /damage-claims).
      // Case Center surfaces incidents, violations, tolls, damage claims,
      // customer violations, deposits/refunds, disputes, and roadside cases.
      {
        to: "/case-center",
        label: "Case Center",
        icon: Gavel,
        perm: "case.view",
      },
      {
        to: "/compliance",
        label: "Compliance",
        icon: ShieldCheck,
        perm: "compliance.view",
      },
    ],
  },
  {
    label: "Customers",
    icon: Users,
    items: [
      // Build #58 — Verification is no longer a standalone sidebar link. The
      // Customers list owns verification filters (Needs Verification, License
      // Expired, etc.) and Customer Detail owns the per-customer verification
      // record. The /drivers route remains mounted and redirects to
      // /customers?filter=pending_verification for backward compatibility.
      { to: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    label: "Finance",
    icon: Wallet,
    items: [
      {
        to: "/finance",
        label: "Finance",
        icon: Wallet,
      },
      {
        to: "/profitability",
        label: "Profitability",
        icon: TrendingUp,
        perm: "reports.view_profitability",
      },
      {
        to: "/investors",
        label: "Investor & Partner Management",
        icon: LineChart,
        perm: "investors.view",
      },
    ],
  },
  {
    label: "Team",
    icon: UserCog,
    items: [
      { to: "/tasks", label: "Tasks", icon: ListTodo },
      {
        to: "/staff",
        label: "Staff",
        icon: Users,
        perm: "staff.view",
      },
    ],
  },
  {
    label: "Insights",
    icon: LineChart,
    items: [
      {
        to: "/reports",
        label: "Reports",
        icon: FileText,
        perm: "reports.view_management_summary",
      },
    ],
  },
  {
    label: "System",
    icon: Settings,
    items: [
      {
        to: "/ai-workforce",
        label: "Fleet Copilot",
        icon: Bot,
        perm: "ai_workforce.view",
      },
      {
        to: "/integrations",
        label: "Integrations",
        icon: Plug,
        perm: "integrations.view",
      },
      {
        to: "/migration",
        label: "Data Import / Migration",
        icon: Database,
        perm: "migration.view",
      },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

// Footer — Help & Support, visually separated from business navigation.
export const footerNavItems: NavItem[] = [
  {
    to: "/support",
    label: "Help & Support",
    icon: LifeBuoy,
    perm: "support.view",
  },
];

function useVisibleNav() {
  const { staff, roles, currentStaffId } = useStore();
  const { companyPolicies } = useCompanyPolicies();
  const verificationOn = isVerificationEnabled(companyPolicies);
  const currentStaff = staff.find((s) => s.id === currentStaffId);
  const role = currentStaff
    ? (roles.find((r) => r.id === currentStaff.role_id) ??
      roles.find((r) => r.name === currentStaff.role))
    : undefined;
  const overrides = currentStaff?.permission_overrides ?? null;
  const allowed = (perm?: string) => (perm ? can(role, overrides, perm) : true);
  // Feature gates — hide an item when its feature is disabled by the tenant.
  const featureVisible = (feature?: string) => {
    if (feature === "verification") return verificationOn;
    return true;
  };

  const visibleStandalone = standaloneNavItems.filter(
    (i) => allowed(i.perm) && featureVisible(i.feature),
  );
  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => allowed(i.perm) && featureVisible(i.feature),
      ),
    }))
    .filter((g) => g.items.length > 0);
  const visibleFooter = footerNavItems.filter(
    (i) => allowed(i.perm) && featureVisible(i.feature),
  );
  return { visibleStandalone, visibleGroups, visibleFooter };
}

function NavGroupSection({
  group,
  mobileOpen,
}: {
  group: NavGroup;
  mobileOpen: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // Auto-expand if any child route is active.
  const activeChild = group.items.some((item) =>
    item.end
      ? location.pathname === item.to
      : location.pathname.startsWith(item.to),
  );

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
          activeChild
            ? "text-nav-foreground"
            : "text-nav-muted hover:text-nav-foreground",
        )}
        aria-expanded={open || activeChild}
      >
        {open || activeChild ? (
          <ChevronDown size={13} className="shrink-0" />
        ) : (
          <ChevronRight size={13} className="shrink-0" />
        )}
        <group.icon size={15} className="shrink-0" />
        {group.label}
        {activeChild && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-nav-active-glow shadow-[0_0_6px] shadow-nav-active-glow/60" />
        )}
      </button>
      {(open || activeChild) && (
        <nav className="ml-3 mt-1 space-y-1 border-l border-white/[0.08] pl-3">
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => mobileOpen(false)}
              className={({ isActive }: { isActive: boolean }) =>
                cn(
                  "flex min-h-[40px] items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-nav-active-soft text-nav-active-foreground shadow-[0_4px_12px_-4px] shadow-nav-active/30 ring-1 ring-inset ring-white/10"
                    : "text-nav-foreground/70 hover:bg-white/[0.06] hover:text-nav-foreground",
                )
              }
            >
              <item.icon
                size={15}
                className={cn("shrink-0 transition-colors", "text-nav-muted")}
              />
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

export function StaffLayout({ children }: { children: React.ReactNode }) {
  const { tenant, staff, currentStaffId, setCurrentStaffId } = useStore();
  const { session, backendMode, signOut } = useAuth();
  const { visibleStandalone, visibleGroups, visibleFooter } = useVisibleNav();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-nav px-4 py-3 lg:hidden">
        <Brand />
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-md p-2.5 text-nav-foreground hover:bg-white/5"
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <div className="flex">
        {/* Left rail — premium navy gradient */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 shrink-0 transform bg-nav text-nav-foreground transition-transform duration-200 lg:static lg:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          style={{
            backgroundImage:
              "linear-gradient(185deg, hsl(var(--nav)) 0%, hsl(var(--nav-2)) 100%)",
          }}
        >
          <div className="flex h-full flex-col">
            <div className="hidden px-5 py-5 lg:block">
              <Brand />
            </div>

            <nav
              className="flex-1 space-y-3 overflow-y-auto px-3 py-2"
              aria-label="Primary"
            >
              {/* HOME — standalone top items */}
              <div className="space-y-1">
                {visibleStandalone.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }: { isActive: boolean }) =>
                      cn(
                        "group relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                        isActive
                          ? "bg-nav-active-soft text-nav-active-foreground shadow-[0_4px_14px_-4px] shadow-nav-active/30 ring-1 ring-inset ring-white/10"
                          : "text-nav-foreground/75 hover:bg-white/[0.06] hover:text-nav-foreground",
                      )
                    }
                  >
                    {({ isActive }: { isActive: boolean }) => (
                      <>
                        {isActive && (
                          <span
                            className="absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-full bg-nav-active-glow shadow-[0_0_10px] shadow-nav-active-glow/70"
                            style={{ width: 3 }}
                          />
                        )}
                        <item.icon
                          size={18}
                          className={cn(
                            "shrink-0 transition-colors",
                            isActive
                              ? "text-nav-active-glow"
                              : "text-nav-muted group-hover:text-nav-foreground",
                          )}
                        />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>

              <div className="h-px bg-white/[0.07]" />

              {/* Collapsible business groups */}
              <div className="space-y-2">
                {visibleGroups.map((group) => (
                  <NavGroupSection
                    key={group.label}
                    group={group}
                    mobileOpen={setMobileOpen}
                  />
                ))}
              </div>

              {/* Footer — Help & Support, visually separated */}
              {visibleFooter.length > 0 && (
                <>
                  <div className="h-px bg-white/[0.07]" />
                  <div className="space-y-1">
                    {visibleFooter.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setMobileOpen(false)}
                        className={({ isActive }: { isActive: boolean }) =>
                          cn(
                            "flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                            isActive
                              ? "bg-nav-active-soft text-nav-active-foreground shadow-[0_4px_14px_-4px] shadow-nav-active/30 ring-1 ring-inset ring-white/10"
                              : "text-nav-foreground/75 hover:bg-white/[0.06] hover:text-nav-foreground",
                          )
                        }
                      >
                        <item.icon size={18} className="shrink-0 opacity-70" />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </>
              )}
            </nav>

            {/* Route-line flourish */}
            <div className="px-5 pb-3 text-nav-active-glow">
              <RouteLine className="opacity-50" width={1.5} />
            </div>

            {/* Staff identity */}
            <div className="border-t border-white/[0.08] px-4 py-4">
              <p className="text-xs text-nav-muted">Signed in as</p>
              {backendMode === "supabase" && session?.user ? (
                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-nav-foreground">
                      {session.profile?.display_name ||
                        session.profile?.first_name ||
                        session.user.email?.split("@")[0] ||
                        "User"}{" "}
                      <span className="text-xs text-nav-muted">
                        · {session.memberships[0]?.role_code || "owner"}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-nav-muted">
                      {session.user.email}
                    </p>
                  </div>
                  <button
                    onClick={() => signOut()}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-nav-muted hover:bg-white/10 hover:text-nav-foreground transition-colors"
                    title="Sign out"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <select
                  value={currentStaffId}
                  onChange={(e) => setCurrentStaffId(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-nav-foreground focus:border-nav-active focus:outline-none"
                  aria-label="Switch staff member"
                >
                  {staff.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      className="bg-nav text-nav-foreground"
                    >
                      {s.full_name} · {s.role}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-2 font-mono text-[11px] text-nav-muted">
                {session?.memberships[0]?.organization_name ||
                  tenant.business_name}
              </p>
            </div>
          </div>
        </aside>

        {/* Backdrop */}
        {mobileOpen && (
          <button
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
        )}

        {/* Main */}
        <main className="min-w-0 flex-1">
          {/* Global top bar — elevated, blue-tinted header */}
          <div className="hidden h-[68px] items-center justify-between gap-4 border-b border-border/70 bg-surface/95 px-6 backdrop-blur-md shadow-[0_1px_0_0_hsl(var(--border))] sm:flex lg:px-8">
            <GlobalSearch />
            <div className="flex items-center gap-3">
              <CopilotLauncher />
              <NotificationBell />
            </div>
          </div>
          {/* Mobile: bell only (search is via global CMD+K) */}
          <div className="flex h-14 items-center justify-end gap-2 border-b border-border/80 bg-surface px-4 sm:hidden">
            <CopilotLauncher />
            <NotificationBell />
          </div>
          <div
            key={location.pathname}
            className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-8"
          >
            {children}
          </div>
        </main>
      </div>
      {/* Dev-only voice diagnostics — never rendered in production. */}
      <CopilotVoiceDevDiagnostics />
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-nav-active to-nav-active-glow shadow-[0_4px_12px_-2px] shadow-nav-active/50">
        <RouteLine className="text-white" width={1.5} />
      </div>
      <div className="leading-tight">
        <p className="font-display text-[15px] font-semibold tracking-tight text-nav-foreground">
          Connect Pro Fleet
        </p>
        <p className="text-[10px] font-medium uppercase tracking-wider text-nav-muted">
          Operations Platform
        </p>
      </div>
    </div>
  );
}
