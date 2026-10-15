import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { useStore } from "@/lib/store";
import {
  customerStatusMeta,
  rentalStatusMeta,
  reservationStatusMeta,
  vehicleStatusMeta,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Search,
  User,
  Car,
  CalendarDays,
  FileText,
  CornerDownLeft,
} from "lucide-react";

type ResultKind = "customer" | "vehicle" | "reservation" | "rental";

interface Result {
  kind: ResultKind;
  id: string;
  label: string;
  sub: string;
  mono?: string;
  to: string;
  tone: string;
}

const KIND_META: Record<ResultKind, { label: string; icon: typeof User }> = {
  customer: { label: "Customers", icon: User },
  vehicle: { label: "Vehicles", icon: Car },
  reservation: { label: "Reservations", icon: CalendarDays },
  rental: { label: "Rental Agreements", icon: FileText },
};

export function GlobalSearch() {
  const navigate = useNavigate();
  const { customers, vehicles, reservations, rentals } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // CMD+K / CTRL+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Result[] = [];

    for (const c of customers) {
      const hay =
        `${c.first_name} ${c.last_name} ${c.phone} ${c.email} ${c.drivers_license_number ?? ""}`.toLowerCase();
      if (hay.includes(q)) {
        out.push({
          kind: "customer",
          id: c.id,
          label: `${c.first_name} ${c.last_name}`,
          sub: customerStatusMeta[c.customer_status].label,
          mono: c.phone,
          to: `/customers/${c.id}`,
          tone: customerStatusMeta[c.customer_status].tone,
        });
      }
    }
    for (const v of vehicles) {
      const hay =
        `${v.make} ${v.model} ${v.license_plate} ${v.vin} ${v.location}`.toLowerCase();
      if (hay.includes(q)) {
        out.push({
          kind: "vehicle",
          id: v.id,
          label: `${v.make} ${v.model} ${v.year}`,
          sub: vehicleStatusMeta[v.status].label,
          mono: v.license_plate,
          to: `/vehicles/${v.id}`,
          tone: vehicleStatusMeta[v.status].tone,
        });
      }
    }
    for (const r of reservations) {
      const hay =
        `${r.id} ${r.renter_name} ${r.renter_email} ${r.renter_phone}`.toLowerCase();
      if (hay.includes(q)) {
        out.push({
          kind: "reservation",
          id: r.id,
          label: r.renter_name,
          sub: reservationStatusMeta[r.status].label,
          mono: r.id,
          to: `/reservations/${r.id}`,
          tone: reservationStatusMeta[r.status].tone,
        });
      }
    }
    for (const r of rentals) {
      const hay =
        `${r.agreement_number} ${r.id} ${r.customer_id}`.toLowerCase();
      if (hay.includes(q)) {
        out.push({
          kind: "rental",
          id: r.id,
          label: r.agreement_number,
          sub: rentalStatusMeta[r.status].label,
          mono: r.id,
          to: `/rentals/${r.id}`,
          tone: rentalStatusMeta[r.status].tone,
        });
      }
    }
    return out.slice(0, 30);
  }, [query, customers, vehicles, reservations, rentals]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(results.length - 1, a + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = results[active];
        if (r) {
          navigate(r.to);
          setOpen(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, results, active, navigate]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const grouped = useMemo(() => {
    const g: Record<ResultKind, Result[]> = {
      customer: [],
      vehicle: [],
      reservation: [],
      rental: [],
    };
    for (const r of results) g[r.kind].push(r);
    return g;
  }, [results]);

  const order: ResultKind[] = ["customer", "vehicle", "reservation", "rental"];

  return (
    <div ref={containerRef} className="relative w-full max-w-lg">
      <button
        onClick={() => setOpen(true)}
        className="group flex h-10 w-full items-center gap-2.5 rounded-xl border border-border/80 bg-surface-2/60 px-3.5 text-left text-sm text-muted-foreground transition-all hover:border-primary/40 hover:bg-surface-2 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        aria-label="Global search"
      >
        <Search
          size={16}
          className="shrink-0 text-muted-foreground group-hover:text-primary"
        />
        <span className="flex-1 truncate text-xs font-medium sm:text-sm">
          Search customers, vehicles, rentals, reservations…
        </span>
        <kbd className="hidden shrink-0 rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground shadow-2xs sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-center bg-black/30 px-4 pt-[8vh] backdrop-blur-sm sm:pt-[12vh]">
          <div className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
            {/* Input */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search size={18} className="text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Search customers, vehicles, rentals, reservations…"
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={() => setOpen(false)}
                className="rounded px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-surface-2"
              >
                ESC
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {results.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {query
                    ? "No matches. Try a name, phone, plate, VIN, or ID."
                    : "Start typing to search across customers, vehicles, rentals, and reservations."}
                </div>
              ) : (
                <div className="py-2">
                  {order.map((kind) => {
                    const items = grouped[kind];
                    if (items.length === 0) return null;
                    const meta = KIND_META[kind];
                    const Icon = meta.icon;
                    return (
                      <div key={kind} className="px-2">
                        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {meta.label}
                        </p>
                        {items.map((r) => {
                          const idx = results.indexOf(r);
                          const isActive = idx === active;
                          return (
                            <button
                              key={`${r.kind}-${r.id}`}
                              onMouseEnter={() => setActive(idx)}
                              onClick={() => {
                                navigate(r.to);
                                setOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
                                isActive
                                  ? "bg-primary/10"
                                  : "hover:bg-surface-2",
                              )}
                            >
                              <Icon
                                size={16}
                                className={cn(
                                  "shrink-0",
                                  isActive
                                    ? "text-primary"
                                    : "text-muted-foreground",
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {r.label}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {r.sub}
                                </p>
                              </div>
                              {r.mono && (
                                <span className="shrink-0 font-mono text-xs tabular text-muted-foreground">
                                  {r.mono}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CornerDownLeft size={12} /> to open
              </span>
              <span className="flex items-center gap-3">
                <span>↑↓ to navigate</span>
                <span>ESC to close</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
