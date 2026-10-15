import { useEffect, useState } from "react";
import { useResourceCenter } from "@/lib/resourceCenterStore";
import { SectionCard } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, ExternalLink, ArrowUp, ArrowDown } from "lucide-react";
import type { ResourceCategory, ResourceLink } from "@/lib/resourceCenter";
import { Field, selectClass } from "./shared";

// ---------------------------------------------------------------------------
// Operational Resources — manual verification replaces automated API
// integrations. (Renamed from "Resource Center" in the Settings
// Consolidation pass — underlying data and categories are unchanged.)
//
// Operators curate resource links grouped into categories, and mark which
// categories must be "passed" before a reservation can be confirmed. Inactive
// categories are fully hidden from staff. The "required" toggle is off by
// default — different operators use different subsets of checks.
// ---------------------------------------------------------------------------

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;

export function ResourceCenterSection() {
  const {
    resourceCategories,
    resourceLinks,
    addResourceCategory,
    updateResourceCategory,
    addResourceLink,
    updateResourceLink,
  } = useResourceCenter();

  const [catOpen, setCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<ResourceCategory | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<ResourceLink | null>(null);
  const [linkTargetCat, setLinkTargetCat] = useState<string>("");

  const sorted = [...resourceCategories].sort(
    (a, b) => a.display_order - b.display_order,
  );

  const linksFor = (catId: string) =>
    resourceLinks
      .filter((l) => l.category_id === catId)
      .sort((a, b) => a.display_order - b.display_order);

  const openAddCat = () => {
    setEditingCat(null);
    setCatOpen(true);
  };
  const openEditCat = (cat: ResourceCategory) => {
    setEditingCat(cat);
    setCatOpen(true);
  };
  const openAddLink = (catId: string) => {
    setEditingLink(null);
    setLinkTargetCat(catId);
    setLinkOpen(true);
  };
  const openEditLink = (link: ResourceLink) => {
    setEditingLink(link);
    setLinkTargetCat(link.category_id);
    setLinkOpen(true);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Curate the checks and references your staff uses at handoff — license
        lookups, insurance verification, GPS installers, roadside programs. Mark
        a category "required" to block confirming a booking until it's passed.
        Inactive categories are fully hidden from staff.
      </p>

      <div className="flex justify-end">
        <Button
          onClick={openAddCat}
          className="bg-primary text-primary-foreground hover:bg-primary-press"
        >
          <Plus size={16} className="mr-1.5" /> Add category
        </Button>
      </div>

      <div className="space-y-4">
        {sorted.map((cat) => {
          const links = linksFor(cat.id);
          return (
            <SectionCard
              key={cat.id}
              title={cat.name}
              right={
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Required to confirm
                    <Switch
                      checked={cat.is_required ?? false}
                      onCheckedChange={(v) => {
                        updateResourceCategory(cat.id, { is_required: v });
                        toast.success(
                          v
                            ? `${cat.name} now required to confirm a booking.`
                            : `${cat.name} is optional.`,
                        );
                      }}
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditCat(cat)}
                  >
                    <Pencil size={14} />
                  </Button>
                </div>
              }
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  {cat.description && (
                    <p className="text-xs text-muted-foreground">
                      {cat.description}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch
                        checked={cat.is_active}
                        onCheckedChange={(v) => {
                          updateResourceCategory(cat.id, { is_active: v });
                          toast.success(
                            v
                              ? `${cat.name} is visible to staff.`
                              : `${cat.name} hidden from staff.`,
                          );
                        }}
                      />
                      {cat.is_active ? "Active" : "Inactive (hidden)"}
                    </label>
                    {!(cat.is_required ?? false) && (
                      <span className="text-xs text-muted-foreground">
                        optional
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openAddLink(cat.id)}
                >
                  <Plus size={14} className="mr-1" /> Add link
                </Button>
              </div>

              {links.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No links in this category yet. Add reference links your staff
                  should use here.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {links.map((link, i) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
                        >
                          {link.name}
                          <ExternalLink
                            size={12}
                            className="text-muted-foreground"
                          />
                        </a>
                        {link.description && (
                          <p className="truncate text-xs text-muted-foreground">
                            {link.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() =>
                            updateResourceLink(link.id, {
                              display_order: link.display_order - 1,
                            })
                          }
                          disabled={i === 0}
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          onClick={() =>
                            updateResourceLink(link.id, {
                              display_order: link.display_order + 1,
                            })
                          }
                          disabled={i === links.length - 1}
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <Switch
                          checked={link.is_active}
                          onCheckedChange={(v) =>
                            updateResourceLink(link.id, { is_active: v })
                          }
                        />
                        <button
                          onClick={() => openEditLink(link)}
                          className="p-1 text-muted-foreground hover:text-foreground"
                          aria-label="Edit link"
                        >
                          <Pencil size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          );
        })}
      </div>

      <CategoryDialog
        open={catOpen}
        onOpenChange={setCatOpen}
        editing={editingCat}
        onSave={(cat) => {
          if (editingCat) {
            updateResourceCategory(editingCat.id, cat);
            toast.success("Category updated.");
          } else {
            addResourceCategory(cat);
            toast.success("Category added.");
          }
          setCatOpen(false);
        }}
      />
      <LinkDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        editing={editingLink}
        targetCat={linkTargetCat}
        onSave={(link) => {
          if (editingLink) {
            updateResourceLink(editingLink.id, link);
            toast.success("Link updated.");
          } else {
            addResourceLink(link);
            toast.success("Link added.");
          }
          setLinkOpen(false);
        }}
      />
    </div>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  editing,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: ResourceCategory | null;
  onSave: (cat: ResourceCategory) => void;
}) {
  const { resourceCategories } = useResourceCenter();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setDesc(editing?.description ?? "");
    }
  }, [open, editing]);

  const submit = () => {
    if (!name.trim()) {
      toast.error("Enter a category name.");
      return;
    }
    onSave({
      id: editing?.id ?? uid("rc"),
      tenant_id: editing?.tenant_id ?? "tnt_connectpro",
      name,
      description: desc,
      display_order: editing?.display_order ?? resourceCategories.length + 1,
      is_active: editing?.is_active ?? true,
      is_required: editing?.is_required ?? false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit category" : "Add category"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Category name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Driver / ID Verification"
            />
          </Field>
          <Field label="Description">
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What this category is for"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            {editing ? "Save" : "Add category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkDialog({
  open,
  onOpenChange,
  editing,
  targetCat,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: ResourceLink | null;
  targetCat: string;
  onSave: (link: ResourceLink) => void;
}) {
  const { resourceCategories, resourceLinks } = useResourceCenter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");
  const [catId, setCatId] = useState("");

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setUrl(editing?.url ?? "");
      setDesc(editing?.description ?? "");
      setCatId(editing?.category_id ?? targetCat);
    }
  }, [open, editing, targetCat]);

  const submit = () => {
    if (!name.trim()) {
      toast.error("Enter a link name.");
      return;
    }
    if (!url.trim()) {
      toast.error("Enter a URL.");
      return;
    }
    const target = catId || targetCat;
    onSave({
      id: editing?.id ?? uid("rl"),
      tenant_id: editing?.tenant_id ?? "tnt_connectpro",
      category_id: target,
      name,
      url,
      description: desc,
      is_active: editing?.is_active ?? true,
      display_order:
        editing?.display_order ??
        resourceLinks.filter((l) => l.category_id === target).length + 1,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit link" : "Add link"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Category">
            <select
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
              className={selectClass}
            >
              {resourceCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Link name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. License Status Lookup"
            />
          </Field>
          <Field label="URL">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="font-mono tabular"
            />
          </Field>
          <Field label="Description">
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What staff uses this for"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            {editing ? "Save" : "Add link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
