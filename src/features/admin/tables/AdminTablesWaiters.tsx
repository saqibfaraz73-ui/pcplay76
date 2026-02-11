import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db/appDb";
import type { RestaurantTable, Settings, Waiter } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/features/admin/id";
import { Trash2, Plus, Edit2, Check, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function AdminTablesWaiters() {
  const { toast } = useToast();
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [tables, setTables] = React.useState<RestaurantTable[]>([]);
  const [waiters, setWaiters] = React.useState<Waiter[]>([]);

  // New table form
  const [newTableNumber, setNewTableNumber] = React.useState("");

  // New waiter form
  const [newWaiterName, setNewWaiterName] = React.useState("");
  const [newWaiterPassword, setNewWaiterPassword] = React.useState("");
  const [newWaiterDefaultTable, setNewWaiterDefaultTable] = React.useState("");

  // Edit states
  const [editingTableId, setEditingTableId] = React.useState<string | null>(null);
  const [editTableNumber, setEditTableNumber] = React.useState("");
  const [editingWaiterId, setEditingWaiterId] = React.useState<string | null>(null);
  const [editWaiterName, setEditWaiterName] = React.useState("");
  const [editWaiterPassword, setEditWaiterPassword] = React.useState("");
  const [editWaiterDefaultTable, setEditWaiterDefaultTable] = React.useState("");

  // Delete confirmations
  const [deleteTableId, setDeleteTableId] = React.useState<string | null>(null);
  const [deleteWaiterId, setDeleteWaiterId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const s = await db.settings.get("app");
    setSettings(s ?? null);
    const t = await db.restaurantTables.orderBy("createdAt").toArray();
    const w = await db.waiters.orderBy("createdAt").toArray();
    setTables(t);
    setWaiters(w);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Table CRUD
  const addTable = async () => {
    const num = newTableNumber.trim();
    if (!num) {
      toast({ title: "Enter table number", variant: "destructive" });
      return;
    }
    // Check for duplicates
    if (tables.some((t) => t.tableNumber.toLowerCase() === num.toLowerCase())) {
      toast({ title: "Table already exists", variant: "destructive" });
      return;
    }
    const table: RestaurantTable = {
      id: makeId("tbl"),
      tableNumber: num,
      createdAt: Date.now(),
    };
    await db.restaurantTables.put(table);
    setNewTableNumber("");
    toast({ title: `Table ${num} added` });
    await load();
  };

  const saveEditTable = async () => {
    if (!editingTableId) return;
    const num = editTableNumber.trim();
    if (!num) {
      toast({ title: "Enter table number", variant: "destructive" });
      return;
    }
    const existing = tables.find((t) => t.id === editingTableId);
    if (!existing) return;
    // Check for duplicates (excluding current)
    if (tables.some((t) => t.id !== editingTableId && t.tableNumber.toLowerCase() === num.toLowerCase())) {
      toast({ title: "Table number already exists", variant: "destructive" });
      return;
    }
    await db.restaurantTables.update(editingTableId, { tableNumber: num });
    setEditingTableId(null);
    toast({ title: "Table updated" });
    await load();
  };

  const confirmDeleteTable = async () => {
    if (!deleteTableId) return;
    await db.restaurantTables.delete(deleteTableId);
    setDeleteTableId(null);
    toast({ title: "Table deleted" });
    await load();
  };

  // Waiter CRUD
  const addWaiter = async () => {
    const name = newWaiterName.trim();
    if (!name) {
      toast({ title: "Enter waiter name", variant: "destructive" });
      return;
    }
    const waiter: Waiter = {
      id: makeId("wtr"),
      name,
      password: newWaiterPassword.trim() || undefined,
      defaultTableId: newWaiterDefaultTable || undefined,
      createdAt: Date.now(),
    };
    await db.waiters.put(waiter);
    setNewWaiterName("");
    setNewWaiterPassword("");
    setNewWaiterDefaultTable("");
    toast({ title: `Waiter ${name} added` });
    await load();
  };

  const saveEditWaiter = async () => {
    if (!editingWaiterId) return;
    const name = editWaiterName.trim();
    if (!name) {
      toast({ title: "Enter waiter name", variant: "destructive" });
      return;
    }
    await db.waiters.update(editingWaiterId, {
      name,
      password: editWaiterPassword.trim() || undefined,
      defaultTableId: editWaiterDefaultTable || undefined,
    });
    setEditingWaiterId(null);
    toast({ title: "Waiter updated" });
    await load();
  };

  const confirmDeleteWaiter = async () => {
    if (!deleteWaiterId) return;
    await db.waiters.delete(deleteWaiterId);
    setDeleteWaiterId(null);
    toast({ title: "Waiter deleted" });
    await load();
  };

  const startEditTable = (table: RestaurantTable) => {
    setEditingTableId(table.id);
    setEditTableNumber(table.tableNumber);
  };

  const startEditWaiter = (waiter: Waiter) => {
    setEditingWaiterId(waiter.id);
    setEditWaiterName(waiter.name);
    setEditWaiterPassword(waiter.password ?? "");
    setEditWaiterDefaultTable(waiter.defaultTableId ?? "");
  };

  if (!settings?.tableManagementEnabled) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Table Management is not enabled.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Go to Settings → Table Management to enable this feature.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tables Section */}
      <Card>
        <CardHeader>
          <CardTitle>Restaurant Tables</CardTitle>
          <CardDescription>Add table numbers for dine-in service.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new table */}
          <div className="flex gap-2">
            <Input
              placeholder="Table number (e.g. 1, A1)"
              value={newTableNumber}
              onChange={(e) => setNewTableNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addTable()}
              className="flex-1"
            />
            <Button onClick={() => void addTable()}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Table list */}
          {tables.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tables added yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {tables.map((table) => (
                <div
                  key={table.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-3"
                >
                  {editingTableId === table.id ? (
                    <>
                      <Input
                        value={editTableNumber}
                        onChange={(e) => setEditTableNumber(e.target.value)}
                        className="h-8 flex-1"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" onClick={() => void saveEditTable()}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingTableId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Table {table.tableNumber}</span>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => startEditTable(table)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDeleteTableId(table.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Waiters Section */}
      <Card>
        <CardHeader>
          <CardTitle>Waiters</CardTitle>
          <CardDescription>
            Manage waiter staff.
            {settings.waiterLoginEnabled && " Waiters can log in with their password."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add new waiter */}
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Waiter name"
              value={newWaiterName}
              onChange={(e) => setNewWaiterName(e.target.value)}
              className="flex-1 min-w-[150px]"
            />
            {settings.waiterLoginEnabled && (
              <Input
                placeholder="Password (optional)"
                type="password"
                value={newWaiterPassword}
                onChange={(e) => setNewWaiterPassword(e.target.value)}
                className="w-40"
              />
            )}
            <select
              value={newWaiterDefaultTable}
              onChange={(e) => setNewWaiterDefaultTable(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm w-40"
            >
              <option value="">Default Table</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>Table {t.tableNumber}</option>
              ))}
            </select>
            <Button onClick={() => void addWaiter()}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Waiter list */}
          {waiters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No waiters added yet.</p>
          ) : (
            <div className="grid gap-2">
              {waiters.map((waiter) => (
                <div
                  key={waiter.id}
                  className="flex items-center justify-between gap-2 rounded-md border p-3"
                >
                  {editingWaiterId === waiter.id ? (
                    <>
                      <div className="flex gap-2 flex-1 flex-wrap">
                        <Input
                          value={editWaiterName}
                          onChange={(e) => setEditWaiterName(e.target.value)}
                          className="h-8 flex-1 min-w-[120px]"
                          autoFocus
                        />
                        {settings.waiterLoginEnabled && (
                          <Input
                            type="password"
                            placeholder="New password"
                            value={editWaiterPassword}
                            onChange={(e) => setEditWaiterPassword(e.target.value)}
                            className="h-8 w-32"
                          />
                        )}
                        <select
                          value={editWaiterDefaultTable}
                          onChange={(e) => setEditWaiterDefaultTable(e.target.value)}
                          className="h-8 rounded-md border bg-background px-2 text-sm w-36"
                        >
                          <option value="">No default table</option>
                          {tables.map((t) => (
                            <option key={t.id} value={t.id}>Table {t.tableNumber}</option>
                          ))}
                        </select>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => void saveEditWaiter()}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingWaiterId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="font-medium">{waiter.name}</span>
                        {settings.waiterLoginEnabled && waiter.password && (
                          <span className="ml-2 text-xs text-muted-foreground">(has password)</span>
                        )}
                        {waiter.defaultTableId && tables.find((t) => t.id === waiter.defaultTableId) && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (Table {tables.find((t) => t.id === waiter.defaultTableId)?.tableNumber})
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => startEditWaiter(waiter)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDeleteWaiterId(waiter.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Table Confirmation */}
      <AlertDialog open={!!deleteTableId} onOpenChange={() => setDeleteTableId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete table?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the table. Any open orders for this table should be completed first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteTable()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Waiter Confirmation */}
      <AlertDialog open={!!deleteWaiterId} onOpenChange={() => setDeleteWaiterId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete waiter?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the waiter from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteWaiter()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
