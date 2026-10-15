import { useEffect, type ReactNode } from "react";
import { HeadContent, Link, Outlet, Scripts, createRootRouteWithContext, useRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/supabase/authContext";
import { StoreProvider } from "@/lib/store";
import { ResourceCenterProvider } from "@/lib/resourceCenterStore";
import { IncidentsProvider } from "@/lib/incidentsStore";
import { DefenseProvider } from "@/lib/store/defenseStore";
import { InvestorProvider } from "@/lib/investorStore";
import { PartnershipProvider } from "@/lib/partnershipStore";
import { InvestorWorkspaceProvider } from "@/lib/investorWorkspaceStore";
import { DamageClaimProvider } from "@/lib/damageClaimStoreProvider";
import { VaultProvider } from "@/lib/vaultStoreProvider";
import { MigrationProvider } from "@/lib/migrationStore";
import { IntegrationProvider } from "@/lib/integrationStore";
import { StaffAssignmentProvider } from "@/lib/staffAssignmentStore";
import { ViolationPolicyProvider } from "@/lib/violationPolicyStore";
import { ViolationProvider } from "@/lib/violationStoreProvider";
import { CaseCenterProvider } from "@/lib/store/caseCenterStore";
import { BookingRequestProvider } from "@/lib/store/bookingRequestStore";
import { ComplianceProvider } from "@/lib/complianceStoreProvider";
import { TelematicsProvider } from "@/lib/store/telematicsStore";
import { CustomerNotesProvider } from "@/lib/customerNoteStore";
import { CustomerTagsProvider } from "@/lib/customerTagStore";
import { CustomerImportHistoryProvider } from "@/lib/customerImportHistoryStore";
import { CompanyPolicyProvider } from "@/lib/store/companyPolicyStore";
import { BillingProvider } from "@/lib/billingStore";
import { SupportProvider } from "@/lib/supportStore";
import { PortalSessionProvider } from "@/lib/portalSessionStore";
import { PortalRequestProvider } from "@/lib/portalRequestStore";
import { AgentStoreProvider } from "@/lib/agentStoreProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { reportVibeError } from "@/lib/vibe-error-reporting";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Connect Pro Fleet — Fleet Operations in Real Time" },
      { name: "description", content: "Connect Pro Fleet is an internal operations tool for rental fleets — manage vehicles, reservations, inspections, maintenance, and driver verification in one place." },
      { property: "og:title", content: "Connect Pro Fleet — Fleet Operations in Real Time" },
      { property: "og:description", content: "Internal operations tool for rental fleets: vehicle inventory, reservations, digital inspections, maintenance tracking, and driver verification." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { property: "og:image", content: "https://vibe.filesafe.space/1792075662074145481/assets/1f58be04-7d6d-41e7-8056-67f9e356cc9a.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Connect Pro Fleet — Fleet Operations in Real Time" },
      { name: "twitter:description", content: "Internal operations tool for rental fleets: vehicle inventory, reservations, digital inspections, maintenance tracking, and driver verification." },
      { name: "twitter:image", content: "https://vibe.filesafe.space/1792075662074145481/assets/1f58be04-7d6d-41e7-8056-67f9e356cc9a.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "canonical", href: "/" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

function RootShell({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><HeadContent /></head><body>{children}<Scripts /></body></html>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return <QueryClientProvider client={queryClient}><TooltipProvider><Toaster /><Sonner /><AuthProvider><StoreProvider><CompanyPolicyProvider><BillingProvider><ResourceCenterProvider><IncidentsProvider><DefenseProvider><InvestorProvider><PartnershipProvider><InvestorWorkspaceProvider><DamageClaimProvider><VaultProvider><MigrationProvider><IntegrationProvider><StaffAssignmentProvider><ViolationPolicyProvider><ViolationProvider><BookingRequestProvider><CaseCenterProvider><ComplianceProvider><TelematicsProvider><CustomerNotesProvider><CustomerTagsProvider><CustomerImportHistoryProvider><SupportProvider><PortalSessionProvider><PortalRequestProvider><ThemeProvider><AgentStoreProvider><ErrorBoundary><Outlet /></ErrorBoundary></AgentStoreProvider></ThemeProvider></PortalRequestProvider></PortalSessionProvider></SupportProvider></CustomerImportHistoryProvider></CustomerTagsProvider></CustomerNotesProvider></TelematicsProvider></ComplianceProvider></CaseCenterProvider></BookingRequestProvider></ViolationProvider></ViolationPolicyProvider></StaffAssignmentProvider></IntegrationProvider></MigrationProvider></VaultProvider></DamageClaimProvider></InvestorWorkspaceProvider></PartnershipProvider></InvestorProvider></DefenseProvider></IncidentsProvider></ResourceCenterProvider></BillingProvider></CompanyPolicyProvider></StoreProvider></AuthProvider></TooltipProvider></QueryClientProvider>;
}

function NotFound() {
  return <div className="flex min-h-screen items-center justify-center bg-background px-4"><div className="max-w-md text-center"><h1 className="font-display text-2xl font-semibold text-foreground">Page not found</h1><p className="mt-2 text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p><Link to="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-primary-foreground">Go to dashboard</Link></div></div>;
}

function RootError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { console.error(error); reportVibeError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return <div className="flex min-h-screen items-center justify-center bg-background px-4"><div className="max-w-md text-center"><h1 className="font-display text-2xl font-semibold text-foreground">This page didn&apos;t load</h1><p className="mt-2 text-sm text-muted-foreground">Please try again or return to your dashboard.</p><div className="mt-6 flex justify-center gap-2"><button className="rounded-md bg-primary px-4 py-2 text-primary-foreground" onClick={() => { router.invalidate(); reset(); }}>Try again</button><Link to="/" className="rounded-md border border-border px-4 py-2 text-foreground">Go home</Link></div></div></div>;
}
