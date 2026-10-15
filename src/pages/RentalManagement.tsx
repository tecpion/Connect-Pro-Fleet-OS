// Connect Pro Fleet — Rental Management workspace (UX consolidation).
//
// Unifies Reservations and Rentals into ONE operational workspace with five
// lifecycle tabs:
//
//   Reservations → Ready for Checkout → Active Rentals → Returns → Completed
//
// This is a NAVIGATION + UX consolidation. It does NOT merge the Reservation
// and Rental domain models — both remain separate authoritative objects. Each
// tab derives its rows from the EXISTING store state via the pure selectors in
// rentalManagementSelectors.ts, and every action routes to an EXISTING workflow
// (reservation detail, checkout workflow, return workflow, rental detail).
//
// The old separate /reservations and /rentals list pages still exist for deep
// links and tests; this page is the single primary entry point under
// Operations → "Rental Management".

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { useStore, uid } from "@/lib/store";
import { useBookingRequests } from "@/lib/store/bookingRequestStore";
import { useResourceCenter } from "@/lib/resourceCenterStore";
import { PageHeader } from "@/components/ui-bits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { NewReservationDialog } from "./reservations/NewReservationDialog";
import { BookingTab } from "./rentalManagement/BookingTab";
import { ReservationsTab } from "./rentalManagement/ReservationsTab";
import { ReadyTab } from "./rentalManagement/ReadyTab";
import { ActiveTab } from "./rentalManagement/ActiveTab";
import { ReturnsTab } from "./rentalManagement/ReturnsTab";
import { CompletedTab } from "./rentalManagement/CompletedTab";
import {
  RENTAL_MANAGEMENT_TABS,
  type RentalManagementTab,
  type ReturnFilter,
  selectReservationRows,
  selectReadyForCheckoutRows,
  selectActiveRentalRows,
  selectReturnRows,
  selectCompletedRentalRows,
} from "@/lib/rentalManagementSelectors";
import { cn } from "@/lib/utils";

const RESERVATION_FILTERS = [
  { value: "all", label: "All" },
  { value: "needs_action", label: "Needs Action" },
  { value: "pending_verification", label: "Pending Verification" },
  { value: "confirmed", label: "Confirmed" },
  { value: "blocked_license", label: "License Blocked" },
];

const ACTIVE_FILTERS = [
  { value: "all", label: "All" },
  { value: "payment_due", label: "Payment Due" },
  { value: "late", label: "Late Payment" },
  { value: "arrangement", label: "Payment Arrangement" },
  { value: "deposit", label: "Security Deposit" },
  { value: "return_pending", label: "Return Pending" },
  { value: "overdue", label: "Overdue Return" },
];

const RETURN_FILTERS: { value: ReturnFilter; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "pending", label: "Pending" },
  { value: "overdue", label: "Overdue" },
  { value: "all", label: "All" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function RentalManagement() {
  const {
    reservations,
    rentals,
    customers,
    vehicles,
    rentalDeposits,
    paymentArrangements,
    addReservation,
    logActivity,
  } = useStore();
  const bookings = useBookingRequests();
  const { resourceCategories, reservationVerificationsFor } =
    useResourceCenter();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // V1 baseline — the sidebar default is ACTIVE RENTALS (the operational
  // center of gravity). Booking Requests is the first intake stage in the
  // lifecycle ordering, but it only opens automatically when explicitly
  // requested: via `?tab=booking`, an Action Center / CRM deep-link, or
  // another contextual link. Without an explicit `tab` param we land on
  // Active Rentals.
  const requestedTab = searchParams.get("tab") as RentalManagementTab | null;
  const defaultTab: RentalManagementTab = "active";
  const initialTab = RENTAL_MANAGEMENT_TABS.some((t) => t.key === requestedTab)
    ? (requestedTab as RentalManagementTab)
    : defaultTab;
  const [tab, setTab] = useState<RentalManagementTab>(initialTab);
  const [query, setQuery] = useState("");
  const [resFilter, setResFilter] = useState("all");
  // Build #58 — the active filter can be deep-linked from old routes
  // (/payments-due, /payment-arrangements, /deposits). Honor ?filter= on load.
  const [activeFilter, setActiveFilter] = useState(
    searchParams.get("filter") &&
      ACTIVE_FILTERS.some((f) => f.value === searchParams.get("filter"))
      ? (searchParams.get("filter") as string)
      : "all",
  );
  const [returnFilter, setReturnFilter] = useState<ReturnFilter>("today");
  const [newResOpen, setNewResOpen] = useState(false);

  // Quick Add / deep link: auto-open the reservation dialog when ?new=1.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setNewResOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setTabAndUrl = (next: RentalManagementTab) => {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  // ---- Derived rows per tab (pure selectors) ----
  const reservationRows = useMemo(
    () =>
      selectReservationRows({
        reservations,
        vehicles,
        query,
        filter: resFilter,
      }),
    [reservations, vehicles, query, resFilter],
  );

  const verifications = useMemo(
    () => reservations.flatMap((r) => reservationVerificationsFor(r.id)),
    [reservations, reservationVerificationsFor],
  );

  const readyRows = useMemo(
    () =>
      selectReadyForCheckoutRows({
        reservations,
        vehicles,
        deposits: rentalDeposits,
        resourceCategories,
        verifications,
        query,
      }),
    [
      reservations,
      vehicles,
      rentalDeposits,
      resourceCategories,
      verifications,
      query,
    ],
  );

  const activeRows = useMemo(
    () =>
      selectActiveRentalRows({
        rentals,
        customers,
        vehicles,
        query,
        filter: activeFilter,
        arrangements: paymentArrangements,
        deposits: rentalDeposits,
      }),
    [
      rentals,
      customers,
      vehicles,
      query,
      activeFilter,
      paymentArrangements,
      rentalDeposits,
    ],
  );

  const returnRows = useMemo(
    () =>
      selectReturnRows({
        rentals,
        customers,
        vehicles,
        query,
        filter: returnFilter,
        todayISO: todayISO(),
      }),
    [rentals, customers, vehicles, query, returnFilter],
  );

  const completedRows = useMemo(
    () =>
      selectCompletedRentalRows({
        rentals,
        customers,
        vehicles,
        query,
      }),
    [rentals, customers, vehicles, query],
  );

  // ---- Summary counts for the header ----
  const today = todayISO();
  const activeCount = rentals.filter((r) =>
    ["active", "late", "overdue", "payment_due", "return_pending"].includes(
      r.status,
    ),
  ).length;
  const readyCount = reservations.filter(
    (r) => r.status === "confirmed" && !r.converted_to_rental_id,
  ).length;
  const returnsTodayCount = rentals.filter(
    (r) =>
      r.scheduled_return_date === today &&
      ["active", "late", "overdue", "payment_due", "return_pending"].includes(
        r.status,
      ),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rental Management"
        subtitle="Manage every rental from reservation through return."
        actions={
          <Button
            onClick={() => setNewResOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            <Plus size={16} className="mr-1.5" /> New reservation
          </Button>
        }
      />

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border bg-surface px-3 py-1 font-medium text-muted-foreground">
          <span className="font-semibold text-foreground">
            {bookings.bookingRequests.filter((r) => r.status === "new").length}
          </span>{" "}
          new booking requests
        </span>
        <span className="rounded-full border border-border bg-surface px-3 py-1 font-medium text-muted-foreground">
          <span className="font-semibold text-foreground">{readyCount}</span>{" "}
          ready for checkout
        </span>
        <span className="rounded-full border border-border bg-surface px-3 py-1 font-medium text-muted-foreground">
          <span className="font-semibold text-foreground">{activeCount}</span>{" "}
          active rentals
        </span>
        <span className="rounded-full border border-border bg-surface px-3 py-1 font-medium text-muted-foreground">
          <span className="font-semibold text-foreground">
            {returnsTodayCount}
          </span>{" "}
          returns today
        </span>
      </div>

      {/* Lifecycle tabs (segmented control) */}
      <div
        role="tablist"
        aria-label="Rental lifecycle"
        className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1"
      >
        {RENTAL_MANAGEMENT_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            data-testid={`rm-tab-${t.key}`}
            onClick={() => setTabAndUrl(t.key)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Unified search + per-tab filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rental, reservation, customer, vehicle..."
            className="pl-9"
          />
        </div>
        {tab === "reservations" && (
          <FilterChips
            filters={RESERVATION_FILTERS}
            value={resFilter}
            onChange={setResFilter}
          />
        )}
        {tab === "active" && (
          <FilterChips
            filters={ACTIVE_FILTERS}
            value={activeFilter}
            onChange={setActiveFilter}
          />
        )}
        {tab === "returns" && (
          <FilterChips
            filters={RETURN_FILTERS}
            value={returnFilter}
            onChange={(v) => setReturnFilter(v as ReturnFilter)}
          />
        )}
      </div>

      {/* Tab content */}
      {tab === "booking" && <BookingTab />}
      {tab === "reservations" && (
        <ReservationsTab rows={reservationRows} navigate={navigate} />
      )}
      {tab === "ready" && <ReadyTab rows={readyRows} navigate={navigate} />}
      {tab === "active" && <ActiveTab rows={activeRows} navigate={navigate} />}
      {tab === "returns" && (
        <ReturnsTab rows={returnRows} navigate={navigate} />
      )}
      {tab === "completed" && (
        <CompletedTab rows={completedRows} navigate={navigate} />
      )}

      <NewReservationDialog
        open={newResOpen}
        onOpenChange={setNewResOpen}
        onCreate={(r) => {
          addReservation(r);
          logActivity({
            id: uid("act"),
            at: new Date().toISOString(),
            label: `Reservation created — ${r.renter_name}`,
            tone: "available",
          });
          toast.success(
            "Reservation created and dates blocked on the calendar.",
          );
          setNewResOpen(false);
          setTabAndUrl("reservations");
        }}
      />
    </div>
  );
}

function FilterChips({
  filters,
  value,
  onChange,
}: {
  filters: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {filters.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === f.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
