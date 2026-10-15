import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { uid } from "@/lib/investorStore";
import { TENANT_ID } from "@/lib/store";
import type { Investor, InvestorRelationship } from "@/lib/investorTypes";

export function AddInvestorDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (i: Investor) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] =
    useState<InvestorRelationship>("external");
  const [joinedAt, setJoinedAt] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const save = () => {
    if (!fullName.trim()) return;
    onSave({
      id: uid("inv"),
      tenant_id: TENANT_ID,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      relationship,
      status: "active",
      joined_at: joinedAt,
      exited_at: null,
      exit_reason: null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add investor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Full name / entity</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1"
              placeholder="Daniel Reyes"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                placeholder="daniel@example.com"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1"
                placeholder="+1 305 555 0210"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Relationship</Label>
              <select
                value={relationship}
                onChange={(e) =>
                  setRelationship(e.target.value as InvestorRelationship)
                }
                className="mt-1 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm"
              >
                <option value="external">External</option>
                <option value="family">Family</option>
              </select>
            </div>
            <div>
              <Label>Joined</Label>
              <Input
                type="date"
                value={joinedAt}
                onChange={(e) => setJoinedAt(e.target.value)}
                className="mt-1 font-mono"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!fullName.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary-press"
          >
            Add investor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
