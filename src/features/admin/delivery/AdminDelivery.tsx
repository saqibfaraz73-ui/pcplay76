import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/db/appDb";
import type { DeliveryCustomer, DeliveryPerson, Settings } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, Download, Users } from "lucide-react";
import { exportDeliveryCustomersToExcel, downloadExcel } from "./delivery-customers";
import { format } from "date-fns";

function makeId(prefix: string) {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto 
    ? (crypto as any).randomUUID() 
    : Math.random().toString(16).slice(2);
  return `${prefix}_${rand}_${Date.now().toString(16)}`;
}

export function AdminDelivery() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [deliveryPersons, setDeliveryPersons] = React.useState<DeliveryPerson[]>([]);
  const [deliveryCustomers, setDeliveryCustomers] = React.useState<DeliveryCustomer[]>([]);

  // Settings state
  const [deliveryEnabled, setDeliveryEnabled] = React.useState(false);
  const [showCustomerName, setShowCustomerName] = React.useState(true);
  const [showCustomerAddress, setShowCustomerAddress] = React.useState(true);
  const [showCustomerPhone, setShowCustomerPhone] = React.useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingPerson, setEditingPerson] = React.useState<DeliveryPerson | null>(null);
  const [personName, setPersonName] = React.useState("");
  const [personPhone, setPersonPhone] = React.useState("");

  const load = React.useCallback(async () => {
    const s = await db.settings.get("app");
    if (s) {
      setSettings(s);
      setDeliveryEnabled(!!s.deliveryEnabled);
      setShowCustomerName(s.deliveryShowCustomerName ?? true);
      setShowCustomerAddress(s.deliveryShowCustomerAddress ?? true);
      setShowCustomerPhone(s.deliveryShowCustomerPhone ?? true);
    }
    const persons = await db.deliveryPersons.orderBy("createdAt").toArray();
    setDeliveryPersons(persons);
    const customers = await db.deliveryCustomers.orderBy("createdAt").reverse().toArray();
    setDeliveryCustomers(customers);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    try {
      const next: Settings = {
        ...settings,
        deliveryEnabled,
        deliveryShowCustomerName: showCustomerName,
        deliveryShowCustomerAddress: showCustomerAddress,
        deliveryShowCustomerPhone: showCustomerPhone,
        updatedAt: Date.now(),
      };
      await db.settings.put(next);
      setSettings(next);
      toast({ title: "Delivery settings saved" });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const openAddDialog = () => {
    setEditingPerson(null);
    setPersonName("");
    setPersonPhone("");
    setDialogOpen(true);
  };

  const openEditDialog = (person: DeliveryPerson) => {
    setEditingPerson(person);
    setPersonName(person.name);
    setPersonPhone(person.phone ?? "");
    setDialogOpen(true);
  };

  const savePerson = async () => {
    const name = personName.trim();
    if (!name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    try {
      if (editingPerson) {
        const updated: DeliveryPerson = {
          ...editingPerson,
          name,
          phone: personPhone.trim() || undefined,
        };
        await db.deliveryPersons.put(updated);
        toast({ title: "Delivery person updated" });
      } else {
        const newPerson: DeliveryPerson = {
          id: makeId("dp"),
          name,
          phone: personPhone.trim() || undefined,
          createdAt: Date.now(),
        };
        await db.deliveryPersons.put(newPerson);
        toast({ title: "Delivery person added" });
      }
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: "Failed to save", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const deletePerson = async (person: DeliveryPerson) => {
    if (!confirm(`Delete ${person.name}?`)) return;
    try {
      await db.deliveryPersons.delete(person.id);
      toast({ title: "Delivery person deleted" });
      await load();
    } catch (e: any) {
      toast({ title: "Failed to delete", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const exportCustomers = async () => {
    try {
      if (deliveryCustomers.length === 0) {
        toast({ title: "No customers to export", variant: "destructive" });
        return;
      }
      const blob = await exportDeliveryCustomersToExcel();
      downloadExcel(blob, `delivery_customers_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      toast({ title: "Customers exported" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const deleteCustomer = async (customer: DeliveryCustomer) => {
    if (!confirm(`Delete customer ${customer.name}?`)) return;
    try {
      await db.deliveryCustomers.delete(customer.id);
      toast({ title: "Customer deleted" });
      await load();
    } catch (e: any) {
      toast({ title: "Failed to delete", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Delivery Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Delivery Settings</CardTitle>
          <CardDescription>Enable delivery option and configure receipt fields.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Enable Delivery</div>
              <div className="text-xs text-muted-foreground">Show delivery option in Sales Dashboard.</div>
            </div>
            <Switch checked={deliveryEnabled} onCheckedChange={setDeliveryEnabled} />
          </div>

          {deliveryEnabled && (
            <div className="space-y-3 pl-3 border-l-2 border-primary/20">
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Show Customer Name</div>
                  <div className="text-xs text-muted-foreground">Allow entering customer name on delivery orders.</div>
                </div>
                <Switch checked={showCustomerName} onCheckedChange={setShowCustomerName} />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Show Customer Address</div>
                  <div className="text-xs text-muted-foreground">Allow entering delivery address.</div>
                </div>
                <Switch checked={showCustomerAddress} onCheckedChange={setShowCustomerAddress} />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Show Customer Phone</div>
                  <div className="text-xs text-muted-foreground">Allow entering customer phone number.</div>
                </div>
                <Switch checked={showCustomerPhone} onCheckedChange={setShowCustomerPhone} />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => void saveSettings()}>Save Settings</Button>
          </div>
        </CardContent>
      </Card>

      {/* Delivery Persons */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Delivery Persons</CardTitle>
            <CardDescription>Manage delivery staff.</CardDescription>
          </div>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          {deliveryPersons.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No delivery persons added yet.
            </div>
          ) : (
            <div className="space-y-2">
              {deliveryPersons.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    {p.phone && <div className="text-sm text-muted-foreground">{p.phone}</div>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(p)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => void deletePerson(p)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery Customers */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Delivery Customers
            </CardTitle>
            <CardDescription>Customers saved from delivery orders.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void exportCustomers()} disabled={deliveryCustomers.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            Export Excel
          </Button>
        </CardHeader>
        <CardContent>
          {deliveryCustomers.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No delivery customers yet. Customers are saved when you make delivery sales.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {deliveryCustomers.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {c.phone && <span className="mr-3">📞 {c.phone}</span>}
                      {c.address && <span className="truncate">📍 {c.address}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Added: {format(new Date(c.createdAt), "dd MMM yyyy")}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => void deleteCustomer(c)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPerson ? "Edit Delivery Person" : "Add Delivery Person"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="personName">Name *</Label>
              <Input
                id="personName"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="Enter name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="personPhone">Phone (optional)</Label>
              <Input
                id="personPhone"
                inputMode="tel"
                value={personPhone}
                onChange={(e) => setPersonPhone(e.target.value)}
                placeholder="Enter phone number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void savePerson()}>
              {editingPerson ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
