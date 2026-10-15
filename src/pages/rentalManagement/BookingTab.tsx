// Connect Pro Fleet — Rental Management: Booking Requests tab.
//
// Intake workspace for CRM/website booking requests (the stage BEFORE a
// Reservation exists). Shows the request list, filters, search, and opens the
// request detail drawer. A request is NOT a confirmed Reservation — staff
// review and convert via the detail drawer.

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useBookingRequests } from "@/lib/store/bookingRequestStore";
import {
  selectBookingRequestRows,
  type BookingRequestRow,
} from "@/lib/bookingRequestSelectors";
import {
  BOOKING_REQUEST_STATUS_LABELS,
  BOOKING_REQUEST_SOURCE_LABELS,
  type BookingRequestStatus,
} from "@/lib/bookingRequestTypes";
import {
  ResponsiveTable,
  type ResponsiveColumn,
} from "@/components/ResponsiveTable";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui-bits";
import { StatusPill, type Tone } from "@/components/Status";
import { fmtDateShort, fmtDateTime } from "@/lib/format";
import { Search, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookingRequestDetail } from "./BookingRequestDetail";

const BOOKING_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "needs_follow_up", label: "Needs Follow-Up" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "declined", label: "Declined" },
  { value: "converted_to_reservation", label: "Converted" },
];

function bookingTone(status: BookingRequestStatus): Tone {
  switch (status) {
    case "new":
      return "rented";
    case "reviewing":
    case "needs_follow_up":
      return "maintenance";
    case "waitlisted":
      return "neutral";
    case "converted_to_reservation":
      return "neutral";
    case "declined":
    case "cancelled":
      return "out";
    default:
      return "neutral";
  }
}

export function BookingTab() {
  const store = useStore();
  const bookings = useBookingRequests();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      selectBookingRequestRows({
        requests: bookings.bookingRequests,
        vehicles: store.vehicles,
        vehicleClasses: store.vehicleClasses,
        query,
        filter,
      }),
    [
      bookings.bookingRequests,
      store.vehicles,
      store.vehicleClasses,
      query,
      filter,
    ],
  );

  const columns: ResponsiveColumn<BookingRequestRow>[] = [
    {
      key: "request",
      header: "Request",
      mobilePrimary: true,
      render: (r) => (
        <div>
          <button
            onClick={() => setOpenId(r.id)}
            className="font-mono text-xs font-medium uppercase tracking-wide text-foreground hover:text-primary"
          >
            {r.request_number}
          </button>
          <p className="font-mono text-xs tabular text-muted-foreground">
            {fmtDateTime(r.submitted_at)}
          </p>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (r) => (
        <div>
          <p className="text-sm font-medium text-foreground">
            {r.customer_name}
          </p>
          <p className="text-xs text-muted-foreground">{r.email}</p>
          <p className="text-xs text-muted-foreground">{r.phone}</p>
        </div>
      ),
    },
    {
      key: "vehicle",
      header: "Requested",
      render: (r) => (
        <div>
          <p className="text-sm text-foreground">
            {r.vehicle_label !== "—" ? r.vehicle_label : r.class_label}
          </p>
          <p className="text-xs text-muted-foreground">{r.requested_dates}</p>
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      mobileSecondary: true,
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {BOOKING_REQUEST_SOURCE_LABELS[r.source]}
        </span>
      ),
    },
    {
      key: "license",
      header: "License",
      render: (r) => (
        <span
          className={cn(
            "text-xs",
            r.driver_license_status === "not_provided"
              ? "text-status-out"
              : r.driver_license_status === "expired"
                ? "text-status-out"
                : "text-muted-foreground",
          )}
        >
          {r.driver_license_status === "not_provided"
            ? "Missing"
            : r.driver_license_status === "expired"
              ? "Expired"
              : "Provided"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <StatusPill tone={bookingTone(r.status)}>
          {BOOKING_REQUEST_STATUS_LABELS[r.status]}
        </StatusPill>
      ),
    },
    {
      key: "converted",
      header: "Reservation",
      render: (r) =>
        r.converted_reservation_id ? (
          <span className="font-mono text-xs text-primary">
            {r.converted_reservation_id}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, phone, email, vehicle..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BOOKING_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox size={28} />}
          title="No booking requests"
          hint="New requests from your website or Connect Pro CRM will appear here for review before becoming reservations."
        />
      ) : (
        <ResponsiveTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      )}

      <BookingRequestDetail
        bookingId={openId}
        onOpenChange={(v) => !v && setOpenId(null)}
      />
    </div>
  );
}

// re-export for the Rental Management page summary chip
export function bookingNewCount(
  requests: { status: BookingRequestStatus }[],
): number {
  return requests.filter((r) => r.status === "new").length;
}

export { fmtDateShort };
