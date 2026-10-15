// Connect Pro Fleet — Create Task dialog (Build #11).
// Fast task creation. Supports contextual pre-fill (linked entity) via props.

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_CATEGORY_LABELS, TASK_PRIORITY_LABELS } from "@/lib/taskTypes";
import type {
  TaskCategory,
  TaskEntityType,
  TaskPriority,
} from "@/lib/taskTypes";
import { toast } from "sonner";

const CATEGORIES = Object.keys(TASK_CATEGORY_LABELS) as TaskCategory[];
const PRIORITIES = Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[];

export function CreateTaskDialog({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preset?: {
    entityType?: TaskEntityType;
    entityId?: string;
    entityLabel?: string;
    title?: string;
    category?: TaskCategory;
  };
}) {
  const { staff, createTask } = useStore();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TaskCategory>("customer_follow_up");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [assignee, setAssignee] = useState<string>("__none__");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(preset?.title ?? "");
      setDescription("");
      setCategory(preset?.category ?? "customer_follow_up");
      setPriority("normal");
      setAssignee("__none__");
      setDueDate("");
      setDueTime("");
    }
  }, [open, preset]);

  const submit = () => {
    if (!title.trim()) {
      toast.error("Add a task title.");
      return;
    }
    createTask({
      title: title.trim(),
      description: description.trim() || null,
      category,
      priority,
      assignedToUserId: assignee === "__none__" ? null : assignee,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      entityType: preset?.entityType ?? null,
      entityId: preset?.entityId ?? null,
      entityLabel: preset?.entityLabel ?? null,
    });
    toast.success("Task created.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {preset?.entityLabel && (
            <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
              Linked to{" "}
              <span className="font-medium text-foreground">
                {preset.entityLabel}
              </span>
            </div>
          )}
          <div>
            <Label>Task</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add context for whoever picks this up…"
              className="mt-1"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as TaskCategory)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {TASK_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TaskPriority)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {TASK_PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Assign to</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Unassigned</SelectItem>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
            <div>
              <Label>Due time (optional)</Label>
              <Input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="mt-1 font-mono tabular"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
