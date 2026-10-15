// Connect Pro Fleet — Staff Center (Build #24 / Staff workspace enhancement).
//
// The authoritative place for people, roles, permissions, location access,
// responsibilities, workload visibility, and team activity. Four tabs:
//   Team · Roles & Permissions · Workload · Activity
//
// "My Work" and "Needs Assignment" are NOT duplicated here. Personal work
// execution lives in Action Center → My Work; the unassigned-work queue lives
// in Action Center → Needs Assignment. The Workload tab surfaces a compact
// "Review Unassigned Work" deep-link to the authoritative queue instead of
// maintaining a second one. Tasks and Action Center remain authoritative.

import { useState, useEffect } from "react";
import { useSearchParams, Navigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import { useStaffAssignments } from "@/lib/staffAssignmentStore";
import { useDamageClaims } from "@/lib/damageClaimStoreProvider";
import { useCan } from "@/pages/settings/useCan";
import { TeamList } from "./staff/TeamList";
import { StaffProfile } from "./staff/StaffProfile";
import { RolesSection } from "./staff/RolesSection";
import { WorkloadView } from "./staff/WorkloadView";
import { StaffActivity } from "./staff/StaffActivity";
import { cn } from "@/lib/utils";
import { Users, Shield, BarChart3, Activity } from "lucide-react";

type Tab = "team" | "roles" | "workload" | "activity";

// Legacy Staff tabs that have been moved to the authoritative Action Center.
// A bookmarked ?tab=mywork or ?tab=unassigned redirects there instead of
// rendering a duplicate queue inside Staff.
const DEPRECATED_TAB_REDIRECT: Record<string, string> = {
  mywork: "/action-center?focus=my-work",
  "my-work": "/action-center?focus=my-work",
  unassigned: "/action-center?focus=needs-assignment",
  "needs-assignment": "/action-center?focus=needs-assignment",
};

const TABS: { id: Tab; label: string; icon: any; perm?: string }[] = [
  { id: "team", label: "Team", icon: Users },
  {
    id: "roles",
    label: "Roles & Permissions",
    icon: Shield,
    perm: "staff.view",
  },
  { id: "workload", label: "Workload", icon: BarChart3, perm: "staff.view" },
  {
    id: "activity",
    label: "Activity",
    icon: Activity,
    perm: "staff.view_activity",
  },
];

export default function Staff() {
  const store = useStore();
  const assignments = useStaffAssignments();
  const damageClaims = useDamageClaims();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const canView = useCan("staff.view");
  const canViewActivity = useCan("staff.view_activity");

  // Legacy tab routing: deprecated tabs redirect to Action Center. Valid tabs
  // are read from the URL so navigation is addressable + refresh-safe.
  const queryTab = searchParams.get("tab") as Tab | null;
  const deprecated = queryTab ? DEPRECATED_TAB_REDIRECT[queryTab] : undefined;
  const [tab, setTab] = useState<Tab>(
    queryTab && !deprecated && TABS.some((t) => t.id === queryTab)
      ? queryTab
      : "team",
  );

  useEffect(() => {
    if (deprecated) return; // redirect handles it
    const next = searchParams.get("tab") as Tab | null;
    if (next && next !== tab && TABS.some((t) => t.id === next)) {
      setTab(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  }

  if (deprecated) {
    return <Navigate to={deprecated} replace />;
  }

  const inputs = {
    tasks: store.tasks,
    rentals: store.rentals,
    workOrders: store.workOrders,
    damageClaims: damageClaims.damageClaims,
    assignments: assignments.assignments,
  };

  const visibleTabs = TABS.filter((t) =>
    t.perm
      ? t.perm === "staff.view_activity"
        ? canViewActivity
        : canView
      : true,
  );

  if (!canView) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        You don't have permission to view staff.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Staff
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your team, roles, permissions, responsibilities, and workload.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border pb-px">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => selectTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon size={15} />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "team" && !selectedStaffId && (
        <TeamList onSelectStaff={setSelectedStaffId} inputs={inputs} />
      )}
      {tab === "team" && selectedStaffId && (
        <StaffProfile
          staffId={selectedStaffId}
          inputs={inputs}
          onBack={() => setSelectedStaffId(null)}
        />
      )}
      {tab === "roles" && <RolesSection />}
      {tab === "workload" && <WorkloadView inputs={inputs} />}
      {tab === "activity" && <StaffActivity />}
    </div>
  );
}
