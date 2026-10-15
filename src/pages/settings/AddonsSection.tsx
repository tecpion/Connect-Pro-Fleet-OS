import { useState } from "react";
import { useStore, uid, TENANT_ID } from "@/lib/store";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import type {
  AddonCatalogItem,
  AddonCategory,
  AddonPricingType,
} from "@/lib/types";
import { Field, selectClass } from "./shared";

const PRICING_TYPES: AddonPricingType[] = [
  "one_time",
  "per_day",
  "per_week",
  "per_rental",
  "custom",
];

export function AddonsSection() {
  const {
    addonCategories,
    addonCatalog,
    addAddonCategory,
    addAddonCatalogItem,
    updateAddonCatalogItem,
    logSettingsChange,
  } = useStore();
  const [catOpen, setCatOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);

  const blankCat: AddonCategory = {
    id: uid("cat"),
    tenant_id: TENANT_ID,
    name: "",
    description: "",
    active: true,
    display_order: addonCategories.length + 1,
    created_at: new Date().toISOString(),
  };
  const [catForm, setCatForm] = useState<AddonCategory>(blankCat);

  const blankItem: AddonCatalogItem = {
    id: uid("ao"),
    tenant_id: TENANT_ID,
    category_id: "",
    name: "",
    description: "",
    price: 0,
    pricing_type: "one_time",
    taxable: false,
    required: false,
    active: true,
    display_order: 1,
    created_at: new Date().toISOString(),
  };
  const [itemForm, setItemForm] = useState<AddonCatalogItem>(blankItem);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setCatForm(blankCat);
            setCatOpen(true);
          }}
        >
          <Plus size={16} className="mr-1.5" /> Add category
        </Button>
      </div>

      <div className="space-y-4">
        {addonCategories.map((cat) => {
          const items = addonCatalog.filter((a) => a.category_id === cat.id);
          return (
            <SectionCard
              key={cat.id}
              title={cat.name}
              right={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setItemForm({ ...blankItem, category_id: cat.id });
                    setItemOpen(true);
                  }}
                >
                  <Plus size={14} className="mr-1" /> Add add-on
                </Button>
              }
            >
              {cat.description && (
                <p className="mb-3 text-xs text-muted-foreground">
                  {cat.description}
                </p>
              )}
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No add-ons in this category yet.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {item.name}
                          {!item.active && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (inactive)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm tabular text-foreground">
                          {fmtMoney(item.price)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {item.pricing_type === "one_time"
                              ? "one-time"
                              : item.pricing_type.replace("_", "/")}
                          </span>
                        </span>
                        <Switch
                          checked={item.active}
                          onCheckedChange={(v) => {
                            updateAddonCatalogItem(item.id, { active: v });
                            logSettingsChange({
                              action: v
                                ? "Add-on activated"
                                : "Add-on deactivated",
                              new_value: item.name,
                            });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          );
        })}
      </div>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Category name">
              <Input
                value={catForm.name}
                onChange={(e) =>
                  setCatForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </Field>
            <Field label="Description">
              <Input
                value={catForm.description}
                onChange={(e) =>
                  setCatForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!catForm.name.trim()) {
                  toast.error("Enter a category name.");
                  return;
                }
                addAddonCategory(catForm);
                logSettingsChange({
                  action: "Add-on category created",
                  new_value: catForm.name,
                });
                toast.success("Category added.");
                setCatOpen(false);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Add category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add add-on</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Add-on name">
              <Input
                value={itemForm.name}
                onChange={(e) =>
                  setItemForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </Field>
            <Field label="Description">
              <Input
                value={itemForm.description}
                onChange={(e) =>
                  setItemForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price ($)">
                <Input
                  type="number"
                  min={0}
                  value={itemForm.price}
                  onChange={(e) =>
                    setItemForm((f) => ({
                      ...f,
                      price: Number(e.target.value),
                    }))
                  }
                  className="font-mono tabular"
                />
              </Field>
              <Field label="Pricing type">
                <select
                  value={itemForm.pricing_type}
                  onChange={(e) =>
                    setItemForm((f) => ({
                      ...f,
                      pricing_type: e.target.value as AddonPricingType,
                    }))
                  }
                  className={selectClass}
                >
                  {PRICING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === "one_time"
                        ? "One-time"
                        : t.replace("_", " ").replace("per", "Per")}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={itemForm.taxable}
                  onCheckedChange={(v) =>
                    setItemForm((f) => ({ ...f, taxable: !!v }))
                  }
                />
                Taxable
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={itemForm.required}
                  onCheckedChange={(v) =>
                    setItemForm((f) => ({ ...f, required: !!v }))
                  }
                />
                Required
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!itemForm.name.trim()) {
                  toast.error("Enter an add-on name.");
                  return;
                }
                addAddonCatalogItem(itemForm);
                logSettingsChange({
                  action: "Add-on created",
                  new_value: itemForm.name,
                });
                toast.success("Add-on added.");
                setItemOpen(false);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary-press"
            >
              Add add-on
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
