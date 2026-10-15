// Connect Pro Fleet — Customer Portal layout (Build #32).
//
// Mobile-first portal shell. Does NOT render StaffLayout — the customer portal
// is a separate experience. Header shows company name + customer first name +
// Help link + Exit Portal. Bottom nav: Home, Rental, Payments, Documents,
// Requests. Help is accessible in the header.

import { NavLink, useNavigate } from "@/lib/router-compat";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import {
  Home,
  FileText,
  CreditCard,
  FolderOpen,
  MessageSquare,
  LifeBuoy,
  LogOut,
} from "lucide-react";
import { usePortalSession } from "@/lib/portalSessionStore";

interface PortalNavItem {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

const BOTTOM_NAV: PortalNavItem[] = [
  { to: "/portal", label: "Home", icon: Home, end: true },
  { to: "/portal/rental", label: "Rental", icon: FileText },
  { to: "/portal/payments", label: "Payments", icon: CreditCard },
  { to: "/portal/documents", label: "Documents", icon: FolderOpen },
  { to: "/portal/requests", label: "Requests", icon: MessageSquare },
];

export function CustomerPortalLayout({
  children,
  companyName,
  customerName,
}: {
  children: ReactNode;
  companyName: string;
  customerName: string;
}) {
  const navigate = useNavigate();
  const { endSession } = usePortalSession();

  const handleExit = () => {
    endSession();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
              <span className="font-display text-sm font-bold text-primary-foreground">
                {companyName.charAt(0)}
              </span>
            </div>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold text-foreground">
                {companyName}
              </p>
              <p className="text-xs text-muted-foreground">
                Hi, {customerName.split(" ")[0]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NavLink
              to="/portal/help"
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LifeBuoy size={16} />
              <span className="hidden sm:inline">Help</span>
            </NavLink>
            <button
              onClick={handleExit}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Exit portal"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 pb-24 sm:px-6">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface"
        aria-label="Portal navigation"
      >
        <div className="mx-auto flex max-w-2xl items-stretch justify-around">
          {BOTTOM_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }: { isActive: boolean }) =>
                cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
