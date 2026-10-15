import { useState } from "react";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { SectionCard, EmptyState } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { MapPin, Plus, Pencil } from "lucide-react";
import type { Location } from "@/lib/types";
import { Field, selectClass } from "./shared";

export function LocationsSection() {
  const {
    locations,
    addLocation,
    updateLocation,
    setDefaultLocation,
    logSettingsChange,
  } = useStore();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const blank: Location = {
    id: uid("loc"),
    tenant_id: TENANT_ID,
    name: "",
    address: "",
    phone: "",
    timezone: "America/New_York",
  };
  const [form, setForm] = useState<Location>(blank);
  const set = (patch: Partial<Location>) =>
    setForm((f) => ({ ...f, ...patch }));

  const openAdd = () => {
    setForm(blank);
    setEditId(null);
    setOpen(true);
  };
  const openEdit = (loc: Location) => {
    setForm(loc);
    setEditId(loc.id);
    setOpen(true);
  };

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Enter a location name.");
      return;
    }
    if (editId) {
      updateLocation(editId, form);
      logSettingsChange({ action: "Location updated", new_value: form.name });
      toast.success("Location updated.");
    } else {
      addLocation(form);
      logSettingsChange({ action: "Location added", new_value: form.name });
      toast.success("Location added.");
    }
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={openAdd}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          <Plus size={16} className="mr-1.5" /> Add location
        </Button>
      </div>

      {locations.length === 0 ? (
        <EmptyState
          title="No locations yet"
          hint="Add your first location so vehicles and rentals can be assigned to it."
          icon={<MapPin size={28} />}
          action={<Button onClick={openAdd}>Add location</Button>}
        />
      ) : (
        <div className="space-y-3">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display text-sm font-semibold text-foreground">
                    {loc.name}
                  </p>
                  {loc.is_default && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Default
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {loc.address}
                </p>
                <p className="mt-0.5 font-mono text-xs tabular text-muted-foreground">
                  {loc.phone}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!loc.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDefaultLocation(loc.id);
                      logSettingsChange({
                        action: "Default location set",
                        new_value: loc.name,
                      });
                      toast.success(`${loc.name} is now the default location.`);
                    }}
                  >
                    Set default
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => openEdit(loc)}>
                  <Pencil size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editId ? "Edit location" : "Add location"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Location name">
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field label="Address">
              <Input
                value={form.address}
                onChange={(e) => set({ address: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone">
                <Input
                  value={form.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                  className="font-mono tabular"
                />
              </Field>
              <Field label="Timezone">
                <Input
                  value={form.timezone}
                  onChange={(e) => set({ timezone: e.target.value })}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              {editId ? "Save" : "Add location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
