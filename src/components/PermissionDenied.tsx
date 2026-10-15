// Connect Pro Fleet — Build #20 permission-denied block.
//
// Used by pages/sections when a user lacks access. Distinct from 404 — it
// states "You don't have access" and never leaks data. Reused across modules
// so the pattern is consistent.

import { EmptyState } from "@/components/ui-bits";
import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { ShieldX } from "lucide-react";

export function PermissionDenied({
  title = "Access restricted",
  hint = "You don't have permission to view this page. Contact an administrator if you believe this is a mistake.",
  showBack = true,
}: {
  title?: string;
  hint?: string;
  showBack?: boolean;
}) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
      <EmptyState
        title={title}
        hint={hint}
        icon={<ShieldX size={28} />}
        action={
          showBack ? (
            <Link to="/">
              <Button variant="outline">Go to dashboard</Button>
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
