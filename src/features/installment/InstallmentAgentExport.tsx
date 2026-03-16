import React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { db } from "@/db/appDb";
import type { InstallmentCustomer, InstallmentPayment } from "@/db/installment-schema";
import type { StaffAccount } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { formatIntMoney } from "@/features/pos/format";
import { saveFileBlob, shareFileBlob } from "@/features/pos/share-utils";
import { Download, Share2, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  customers: InstallmentCustomer[];
  agents: StaffAccount[];
}

/**
 * Export customer + payment data for a selected agent.
 * Excludes images (base64) to keep the file small.
 * Agent imports this on their device.
 */
export function InstallmentAgentExport({ open, onClose, customers, agents }: Props) {
  const { toast } = useToast();
  const [agentId, setAgentId] = React.useState("");
  const [exported, setExported] = React.useState(false);

  React.useEffect(() => {
    if (open) { setAgentId(""); setExported(false); }
  }, [open]);

  const agent = agents.find(a => a.id === agentId);
  const agentCustomers = customers.filter(c => c.agentId === agentId);

  const buildExportData = async () => {
    if (!agent || agentCustomers.length === 0) return null;

    // Get payments for these customers
    const customerIds = new Set(agentCustomers.map(c => c.id));
    const allPayments = await db.installmentPayments.toArray();
    const relevantPayments = allPayments.filter(p => customerIds.has(p.customerId));

    // Strip images from customers to keep file small
    const strippedCustomers = agentCustomers.map(c => {
      const { images, ...rest } = c;
      return rest;
    });

    return {
      type: "agent_assignment",
      agentId: agent.id,
      agentName: agent.name,
      agentAccount: {
        name: agent.name,
        phone: agent.phone ?? "",
        role: agent.role,
        pin: agent.pin,
      },
      exportedAt: Date.now(),
      customers: strippedCustomers,
      payments: relevantPayments,
    };
  };

  const handleSave = async () => {
    try {
      const data = await buildExportData();
      if (!data) { toast({ title: "No data to export", variant: "destructive" }); return; }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const fileName = `agent_${agent!.name.replace(/\s+/g, "_")}_${Date.now()}.json`;
      await saveFileBlob(blob, fileName);
      setExported(true);
      toast({ title: `Exported ${data.customers.length} customers for ${agent!.name}` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleShare = async () => {
    try {
      const data = await buildExportData();
      if (!data) { toast({ title: "No data to export", variant: "destructive" }); return; }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const fileName = `agent_${agent!.name.replace(/\s+/g, "_")}_${Date.now()}.json`;
      await shareFileBlob(blob, fileName);
      setExported(true);
    } catch (e: any) {
      toast({ title: "Share failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Data to Agent</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Select Agent</Label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Choose agent…</option>
              {agents.map(a => {
                const count = customers.filter(c => c.agentId === a.id).length;
                return <option key={a.id} value={a.id}>{a.name} ({count} customers)</option>;
              })}
            </select>
          </div>

          {agentId && agentCustomers.length > 0 && (
            <div className="rounded-md bg-muted/50 p-3 space-y-1 text-sm">
              <div className="font-medium">{agent?.name}</div>
              <div className="text-xs text-muted-foreground">{agentCustomers.length} customers assigned</div>
              <div className="text-xs">Total Balance: <strong>{formatIntMoney(agentCustomers.reduce((s, c) => s + c.totalBalance, 0))}</strong></div>
              <div className="text-[10px] text-muted-foreground mt-2">
                ℹ Images/documents will NOT be included to keep the file small.
              </div>
            </div>
          )}

          {agentId && agentCustomers.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              No customers assigned to this agent yet.
            </div>
          )}

          {exported && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Data exported successfully!
            </div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {agentId && agentCustomers.length > 0 && (
            <>
              <Button variant="outline" onClick={handleSave}>
                <Download className="h-4 w-4 mr-1" /> Save File
              </Button>
              <Button onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-1" /> Share to Agent
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
