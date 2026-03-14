import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { db } from "@/db/appDb";
import type { StaffAccount } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { parseNonDecimalInt } from "@/features/pos/format";

interface Props {
  selectedIds: Set<string>;
  agents: StaffAccount[];
  onClose: () => void;
  onAssigned: () => Promise<void>;
}

export function InstallmentAgentAssign({ selectedIds, agents, onClose, onAssigned }: Props) {
  const { toast } = useToast();
  const [agentId, setAgentId] = React.useState("");
  const [commissionType, setCommissionType] = React.useState<"percent" | "fixed">("percent");
  const [commissionValue, setCommissionValue] = React.useState(0);

  const handleAssign = async () => {
    if (!agentId) { toast({ title: "Select an agent", variant: "destructive" }); return; }
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    for (const id of selectedIds) {
      const c = await db.installmentCustomers.get(id);
      if (c) {
        c.agentId = agentId;
        c.agentName = agent.name;
        c.agentCommissionType = commissionType;
        c.agentCommissionValue = commissionValue > 0 ? commissionValue : undefined;
        await db.installmentCustomers.put(c);
      }
    }
    toast({ title: `Assigned ${selectedIds.size} customers to ${agent.name}` });
    await onAssigned();
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign {selectedIds.size} Customers to Agent</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Select Agent</Label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Choose agent…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Commission Type</Label>
              <select value={commissionType} onChange={e => setCommissionType(e.target.value as "percent" | "fixed")} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="percent">% of Recovery</option>
                <option value="fixed">Fixed per Collection</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Commission Value</Label>
              <Input value={commissionValue || ""} onChange={e => setCommissionValue(parseNonDecimalInt(e.target.value))} inputMode="numeric" placeholder={commissionType === "percent" ? "e.g. 5" : "e.g. 100"} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void handleAssign()}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
