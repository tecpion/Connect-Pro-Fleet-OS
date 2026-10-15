// Connect Pro Fleet — route protection (Build #22).
//
// Wraps protected routes. Unauthenticated → redirect to /signin. Authenticated
// but lacking a required permission → PermissionDenied (distinct from 404).
// In memory mode the demo session is always authenticated, so existing routes
// keep working without a sign-in screen.

import type { ReactNode } from "react";
import { Navigate } from "@/lib/router-compat";
import { useAuth } from "@/lib/supabase/authContext";
import { useStore } from "@/lib/store";
import { can } from "@/lib/permissions";
import { PermissionDenied } from "@/components/PermissionDenied";

export function RequireAuth({
  children,
  permission,
}: {
  children: ReactNode;
  permission?: string;
}) {
  const { session, loading } = useAuth();
  const store = useStore();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!session?.user) {
    return <Navigate to="/signin" replace />;
  }
  if (permission) {
    // Resolve the current staff's Role object (by role_id, then by role name)
    // and check permission via the authoritative can(role, overrides, key).
    // Mirrors StaffLayout's nav-visibility resolution.
    const currentStaff = store.staff.find((s) => s.id === store.currentStaffId);
    const role = currentStaff
      ? (store.roles.find((r) => r.id === currentStaff.role_id) ??
        store.roles.find((r) => r.name === currentStaff.role))
      : undefined;
    const overrides = currentStaff?.permission_overrides ?? null;
    const allowed = role ? can(role, overrides, permission) : true;
    if (!allowed) return <PermissionDenied />;
  }
  return <>{children}</>;
}
