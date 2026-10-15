import { Link } from "@/lib/router-compat";
import { useStore, uid } from "@/lib/store";
import { PageHeader, SectionCard, EmptyState } from "@/components/ui-bits";
import { StatusPill } from "@/components/Status";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert, ShieldX, IdCard } from "lucide-react";
import { toast } from "sonner";

export default function Drivers() {
  const { drivers, reservations, updateDriver, logActivity } = useStore();

  const markVerified = (id: string, name: string) => {
    updateDriver(id, { verification_status: "verified" });
    logActivity({
      id: uid("act"),
      at: new Date().toISOString(),
      label: `Driver verified — ${name}`,
      tone: "available",
    });
    toast.success("Driver marked verified.");
  };

  const markFailed = (id: string, name: string) => {
    updateDriver(id, { verification_status: "failed" });
    logActivity({
      id: uid("act"),
      at: new Date().toISOString(),
      label: `Driver verification failed — ${name}`,
      tone: "out",
    });
    toast.error("Driver marked failed.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Driver verification"
        subtitle={`${drivers.length} drivers · ${drivers.filter((d) => d.verification_status === "pending").length} pending`}
      />

      {drivers.length === 0 ? (
        <EmptyState
          title="No drivers to verify"
          hint="Drivers are created when a reservation comes in and verification is requested."
          icon={<IdCard size={28} />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {drivers.map((d) => {
            const res = reservations.find((r) => r.id === d.reservation_id);
            return (
              <SectionCard key={d.id}>
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      to={`/reservations/${d.reservation_id}`}
                      className="font-display text-base font-semibold text-foreground hover:text-primary"
                    >
                      {d.full_name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {res?.renter_email}
                    </p>
                  </div>
                  {d.verification_status === "verified" ? (
                    <StatusPill tone="available">
                      <ShieldCheck size={12} /> Verified
                    </StatusPill>
                  ) : d.verification_status === "failed" ? (
                    <StatusPill tone="out">
                      <ShieldX size={12} /> Failed
                    </StatusPill>
                  ) : (
                    <StatusPill tone="maintenance">
                      <ShieldAlert size={12} /> Pending
                    </StatusPill>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">
                      License #
                    </dt>
                    <dd className="font-mono tabular">{d.license_number}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">
                      State
                    </dt>
                    <dd>{d.license_state}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">
                      Expiry
                    </dt>
                    <dd className="font-mono tabular">
                      {fmtDate(d.license_expiry)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">
                      Status
                    </dt>
                    <dd className="capitalize">{d.verification_status}</dd>
                  </div>
                </dl>

                {/* Actions — manual verification via the Resource Center */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {d.verification_status !== "verified" && (
                    <Button
                      size="sm"
                      onClick={() => markVerified(d.id, d.full_name)}
                      className="bg-primary text-primary-foreground hover:bg-primary-press"
                    >
                      <ShieldCheck size={14} className="mr-1.5" /> Mark verified
                    </Button>
                  )}
                  {d.verification_status !== "failed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markFailed(d.id, d.full_name)}
                    >
                      Mark failed
                    </Button>
                  )}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
