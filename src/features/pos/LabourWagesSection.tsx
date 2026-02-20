import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { db } from "@/db/appDb";
import type { Labour, LabourTransaction, LabourTransactionType, WagePeriod, LabourAttendance, AttendanceStatus, LabourProduction, LabourProductionLine, MenuItem } from "@/db/schema";
import { WAGE_PERIODS } from "@/db/schema";
import { useToast } from "@/hooks/use-toast";
import { makeId } from "@/features/admin/id";
import { formatIntMoney, parseNonDecimalInt } from "@/features/pos/format";
import { Plus, Trash2, ArrowLeft, Wallet, ArrowDownCircle, ArrowUpCircle, MinusCircle, PlusCircle, Share2, Clock, Calendar, CheckCircle2, XCircle, Clock3, ChevronLeft, ChevronRight, Factory, Package } from "lucide-react";
import { sharePdfBytes, savePdfBytes } from "@/features/pos/share-utils";
import { SaveShareMenu } from "@/components/SaveShareMenu";
import { jsPDF } from "jspdf";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, subMonths, addMonths, isAfter } from "date-fns";

interface Props {
  workPeriodId?: string;
  onBack: () => void;
}

export default function LabourWagesSection({ workPeriodId, onBack }: Props) {
  const { toast } = useToast();
  const [labours, setLabours] = React.useState<Labour[]>([]);
  const [transactions, setTransactions] = React.useState<LabourTransaction[]>([]);

  // Add/Edit labour dialog
  const [labourDialogOpen, setLabourDialogOpen] = React.useState(false);
  const [editingLabour, setEditingLabour] = React.useState<Labour | null>(null);
  const [formName, setFormName] = React.useState("");
  const [formPosition, setFormPosition] = React.useState("");
  const [formContact, setFormContact] = React.useState("");
  const [formAddress, setFormAddress] = React.useState("");
  const [formWagePeriod, setFormWagePeriod] = React.useState<WagePeriod>("daily");
  const [formWageAmount, setFormWageAmount] = React.useState(0);
  const [formHourlyRate, setFormHourlyRate] = React.useState(0);

  // Transaction dialog
  const [txDialogOpen, setTxDialogOpen] = React.useState(false);
  const [txLabour, setTxLabour] = React.useState<Labour | null>(null);
  const [txType, setTxType] = React.useState<LabourTransactionType>("wage");
  const [txAmount, setTxAmount] = React.useState(0);
  const [txNote, setTxNote] = React.useState("");

  // Hourly calculator (for wage payment dialog)
  const [txHoursWorked, setTxHoursWorked] = React.useState(0);
  const [txHourlyRate, setTxHourlyRate] = React.useState(0);

  // Attendance (for weekly/monthly wage payment) — now auto-filled from records
  const [txTotalDays, setTxTotalDays] = React.useState(0);
  const [txAbsentDays, setTxAbsentDays] = React.useState(0);
  const [txUseAttendance, setTxUseAttendance] = React.useState(false);
  const [txManualDeduction, setTxManualDeduction] = React.useState(0);

  // Delete
  const [deleteTarget, setDeleteTarget] = React.useState<Labour | null>(null);

  // Selected labour detail view
  const [selectedLabour, setSelectedLabour] = React.useState<Labour | null>(null);

  // Attendance tracking state
  const [attendanceMonth, setAttendanceMonth] = React.useState(new Date());
  const [attendanceRecords, setAttendanceRecords] = React.useState<LabourAttendance[]>([]);
  const [showAttendanceView, setShowAttendanceView] = React.useState(false);

  // Production (piece-rate) state
  const [productions, setProductions] = React.useState<LabourProduction[]>([]);
  const [showProductionView, setShowProductionView] = React.useState(false);
  const [prodDialogOpen, setProdDialogOpen] = React.useState(false);
  const [prodLines, setProdLines] = React.useState<LabourProductionLine[]>([{ itemName: "", qty: 0, perItemWage: 0, lineTotal: 0 }]);
  const [prodNote, setProdNote] = React.useState("");
  const [menuItems, setMenuItems] = React.useState<MenuItem[]>([]);
  const [menuSearchQuery, setMenuSearchQuery] = React.useState("");
  const [showMenuPicker, setShowMenuPicker] = React.useState<number | null>(null);

  // Transaction date range filter
  const toDateStr = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [txFilterFrom, setTxFilterFrom] = React.useState(toDateStr(Date.now()));
  const [txFilterTo, setTxFilterTo] = React.useState(toDateStr(Date.now()));

  const refresh = React.useCallback(async () => {
    const all = await db.labours.orderBy("createdAt").reverse().toArray();
    setLabours(all);
    const txAll = await db.labourTransactions.orderBy("createdAt").reverse().toArray();
    setTransactions(txAll);
    const prodAll = await db.labourProduction.orderBy("createdAt").reverse().toArray();
    setProductions(prodAll);
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh]);

  // Load attendance records for selected labour & month
  const refreshAttendance = React.useCallback(async (labourId: string, month: Date) => {
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    const records = await db.labourAttendance
      .where("labourId").equals(labourId)
      .and(r => r.date >= start && r.date <= end)
      .toArray();
    setAttendanceRecords(records);
  }, []);

  React.useEffect(() => {
    if (selectedLabour && showAttendanceView) {
      void refreshAttendance(selectedLabour.id, attendanceMonth);
    }
  }, [selectedLabour, attendanceMonth, showAttendanceView, refreshAttendance]);

  const openAddLabour = () => {
    setEditingLabour(null);
    setFormName("");
    setFormPosition("");
    setFormContact("");
    setFormAddress("");
    setFormWagePeriod("daily");
    setFormWageAmount(0);
    setFormHourlyRate(0);
    setLabourDialogOpen(true);
  };

  const openEditLabour = (l: Labour) => {
    setEditingLabour(l);
    setFormName(l.name);
    setFormPosition(l.position || "");
    setFormContact(l.contact || "");
    setFormAddress(l.address || "");
    setFormWagePeriod(l.wagePeriod);
    setFormWageAmount(l.wageAmount);
    setFormHourlyRate(l.hourlyRate || 0);
    setLabourDialogOpen(true);
  };

  const saveLabour = async () => {
    try {
      if (!formName.trim()) throw new Error("Name is required");
      if (formWagePeriod !== "piece_rate" && formWageAmount <= 0 && formHourlyRate <= 0) throw new Error("Enter wage amount or hourly rate");

      if (editingLabour) {
        await db.labours.update(editingLabour.id, {
          name: formName.trim(),
          position: formPosition.trim() || undefined,
          contact: formContact.trim() || undefined,
          address: formAddress.trim() || undefined,
          wagePeriod: formWagePeriod,
          wageAmount: formWageAmount,
          hourlyRate: formHourlyRate > 0 ? formHourlyRate : undefined,
        });
        toast({ title: "Staff updated" });
      } else {
        const labour: Labour = {
          id: makeId("lab"),
          name: formName.trim(),
          position: formPosition.trim() || undefined,
          contact: formContact.trim() || undefined,
          address: formAddress.trim() || undefined,
          wagePeriod: formWagePeriod,
          wageAmount: formWageAmount,
          hourlyRate: formHourlyRate > 0 ? formHourlyRate : undefined,
          advanceBalance: 0,
          shortBalance: 0,
          createdAt: Date.now(),
        };
        await db.labours.put(labour);
        toast({ title: "Staff added" });
      }
      setLabourDialogOpen(false);
      await refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    }
  };

  const openTxDialog = async (l: Labour, type: LabourTransactionType) => {
    setTxLabour(l);
    setTxType(type);
    setTxAmount(type === "wage" ? l.wageAmount : 0);
    setTxNote("");
    setTxHoursWorked(0);
    setTxHourlyRate(l.hourlyRate || 0);
    setTxManualDeduction(0);

    // Auto-fill attendance from records for weekly/monthly staff
    if (type === "wage" && (l.wagePeriod === "weekly" || l.wagePeriod === "monthly")) {
      const now = new Date();
      const start = format(startOfMonth(now), "yyyy-MM-dd");
      const end = format(endOfMonth(now), "yyyy-MM-dd");
      const records = await db.labourAttendance
        .where("labourId").equals(l.id)
        .and(r => r.date >= start && r.date <= end)
        .toArray();
      const totalMarked = records.length;
      const absentCount = records.filter(r => r.status === "absent").length;
      const halfCount = records.filter(r => r.status === "half").length;
      // Total days in period
      const daysInMonth = eachDayOfInterval({ start: startOfMonth(now), end: endOfMonth(now) }).length;
      setTxTotalDays(daysInMonth);
      setTxAbsentDays(absentCount + Math.ceil(halfCount / 2));
      setTxUseAttendance(totalMarked > 0);
    } else {
      setTxTotalDays(0);
      setTxAbsentDays(0);
      setTxUseAttendance(false);
    }

    setTxDialogOpen(true);
  };

  // Computed amounts for wage payment
  const hourlyTotal = txHoursWorked > 0 && txHourlyRate > 0 ? txHoursWorked * txHourlyRate : 0;

  const attendanceDeduction = React.useMemo(() => {
    if (!txUseAttendance || !txLabour || txTotalDays <= 0 || txAbsentDays <= 0) return 0;
    const baseWage = txLabour.wageAmount;
    const perDay = baseWage / txTotalDays;
    return Math.round(perDay * txAbsentDays);
  }, [txUseAttendance, txLabour, txTotalDays, txAbsentDays]);

  const finalWageAmount = React.useMemo(() => {
    if (txType !== "wage") return txAmount;
    let base = txAmount;
    if (txUseAttendance && attendanceDeduction > 0) {
      base = Math.max(0, base - attendanceDeduction);
    }
    if (txManualDeduction > 0) {
      base = Math.max(0, base - txManualDeduction);
    }
    return base;
  }, [txType, txAmount, txUseAttendance, attendanceDeduction, txManualDeduction]);

  const saveTx = async () => {
    const amount = txType === "wage" ? finalWageAmount : txAmount;
    if (!txLabour || amount <= 0) return;
    try {
      const noteparts: string[] = [];
      if (txNote.trim()) noteparts.push(txNote.trim());
      if (txType === "wage") {
        if (txHoursWorked > 0 && txHourlyRate > 0) noteparts.push(`${txHoursWorked}h × ${formatIntMoney(txHourlyRate)}/hr`);
        if (txUseAttendance && txAbsentDays > 0) noteparts.push(`Absent ${txAbsentDays}/${txTotalDays} days (−${formatIntMoney(attendanceDeduction)})`);
        if (txManualDeduction > 0) noteparts.push(`Manual deduction −${formatIntMoney(txManualDeduction)}`);
      }

      const tx: LabourTransaction = {
        id: makeId("ltx"),
        labourId: txLabour.id,
        type: txType,
        amount,
        note: noteparts.join(" | ") || undefined,
        workPeriodId,
        createdAt: Date.now(),
      };

      // Create expense record for wage and advance payments
      let expenseId: string | undefined;
      if (txType === "wage" || txType === "advance") {
        const expense = {
          id: makeId("exp"),
          name: `Staff/Wages - ${txLabour.name}`,
          amount,
          note: txType === "advance" ? `Advance to ${txLabour.name}` : `Wage payment to ${txLabour.name}`,
          workPeriodId,
          createdAt: Date.now(),
        };
        await db.expenses.put(expense);
        expenseId = expense.id;
        tx.expenseId = expenseId;
      }

      await db.labourTransactions.put(tx);

      // Update balances
      const updates: Partial<Labour> = {};
      if (txType === "advance") {
        const shortBal = txLabour.shortBalance;
        if (shortBal > 0) {
          const offset = Math.min(amount, shortBal);
          const remainder = amount - offset;
          updates.shortBalance = shortBal - offset;
          updates.advanceBalance = txLabour.advanceBalance + remainder;
        } else {
          updates.advanceBalance = txLabour.advanceBalance + amount;
        }
      } else if (txType === "short") {
        const advBal = txLabour.advanceBalance;
        if (advBal > 0) {
          const offset = Math.min(amount, advBal);
          const remainder = amount - offset;
          updates.advanceBalance = advBal - offset;
          updates.shortBalance = txLabour.shortBalance + remainder;
        } else {
          updates.shortBalance = txLabour.shortBalance + amount;
        }
      } else if (txType === "deduct_advance") {
        updates.advanceBalance = Math.max(0, txLabour.advanceBalance - amount);
      } else if (txType === "deduct_short") {
        updates.shortBalance = Math.max(0, txLabour.shortBalance - amount);
        const expense = {
          id: makeId("exp"),
          name: `Staff/Wages - ${txLabour.name}`,
          amount,
          note: `Short salary payment to ${txLabour.name}`,
          workPeriodId,
          createdAt: Date.now(),
        };
        await db.expenses.put(expense);
        tx.expenseId = expense.id;
        await db.labourTransactions.update(tx.id, { expenseId: expense.id });
      } else if (txType === "wage") {
        const diff = amount - txLabour.wageAmount;
        if (diff > 0) {
          const shortBal = txLabour.shortBalance;
          if (shortBal > 0) {
            const offset = Math.min(diff, shortBal);
            const remainder = diff - offset;
            updates.shortBalance = shortBal - offset;
            if (remainder > 0) updates.advanceBalance = txLabour.advanceBalance + remainder;
          } else {
            updates.advanceBalance = txLabour.advanceBalance + diff;
          }
        } else if (diff < 0) {
          const gap = Math.abs(diff);
          const advBal = txLabour.advanceBalance;
          if (advBal > 0) {
            const offset = Math.min(gap, advBal);
            const remainder = gap - offset;
            updates.advanceBalance = advBal - offset;
            if (remainder > 0) updates.shortBalance = txLabour.shortBalance + remainder;
          } else {
            updates.shortBalance = txLabour.shortBalance + gap;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.labours.update(txLabour.id, updates);
      }

      const labels: Record<LabourTransactionType, string> = {
        wage: "Wage Paid",
        advance: "Advance Given",
        short: "Short Recorded",
        deduct_advance: "Advance Deducted",
        deduct_short: "Short Paid",
      };
      toast({ title: labels[txType], description: `${txLabour.name} — ${formatIntMoney(amount)}` });
      setTxDialogOpen(false);
      if (selectedLabour?.id === txLabour.id) {
        const updated = await db.labours.get(txLabour.id);
        if (updated) setSelectedLabour(updated);
      }
      await refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await db.labourTransactions.where("labourId").equals(deleteTarget.id).delete();
    await db.labourAttendance.where("labourId").equals(deleteTarget.id).delete();
    await db.labourProduction.where("labourId").equals(deleteTarget.id).delete();
    await db.labours.delete(deleteTarget.id);
    toast({ title: "Staff deleted" });
    setDeleteTarget(null);
    if (selectedLabour?.id === deleteTarget.id) setSelectedLabour(null);
    await refresh();
  };

  // Mark attendance for a specific date
  const markAttendance = async (labourId: string, dateStr: string, status: AttendanceStatus) => {
    const id = `${labourId}_${dateStr}`;
    const existing = await db.labourAttendance.get(id);
    if (existing && existing.status === status) {
      // Toggle off — remove record
      await db.labourAttendance.delete(id);
    } else {
      await db.labourAttendance.put({
        id,
        labourId,
        date: dateStr,
        status,
        createdAt: existing?.createdAt || Date.now(),
      });
    }
    await refreshAttendance(labourId, attendanceMonth);
  };

  // ─── Production helpers ───
  const labourProds = selectedLabour
    ? productions.filter((p) => p.labourId === selectedLabour.id)
    : [];

  const unpaidProductionTotal = React.useMemo(() => {
    if (!selectedLabour) return 0;
    return labourProds.reduce((sum, p) => sum + (p.total - p.paid), 0);
  }, [selectedLabour, labourProds]);

  const openProdDialog = async () => {
    const items = await db.items.orderBy("name").toArray();
    setMenuItems(items);
    setProdLines([{ itemName: "", qty: 0, perItemWage: 0, lineTotal: 0 }]);
    setProdNote("");
    setMenuSearchQuery("");
    setShowMenuPicker(null);
    setProdDialogOpen(true);
  };

  const addProdLine = () => {
    setProdLines((prev) => [...prev, { itemName: "", qty: 0, perItemWage: 0, lineTotal: 0 }]);
  };

  const removeProdLine = (idx: number) => {
    setProdLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateProdLine = (idx: number, field: keyof LabourProductionLine, val: any) => {
    setProdLines((prev) => {
      const next = [...prev];
      const line = { ...next[idx], [field]: val };
      line.lineTotal = (line.qty || 0) * (line.perItemWage || 0);
      next[idx] = line;
      return next;
    });
  };

  const selectMenuItem = (idx: number, item: MenuItem) => {
    setProdLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], itemId: item.id, itemName: item.name };
      return next;
    });
    setShowMenuPicker(null);
    setMenuSearchQuery("");
  };

  const prodTotal = prodLines.reduce((s, l) => s + l.lineTotal, 0);

  const saveProdRecord = async () => {
    if (!selectedLabour || prodTotal <= 0) return;
    try {
      const validLines = prodLines.filter((l) => l.itemName && l.qty > 0 && l.perItemWage > 0);
      if (validLines.length === 0) throw new Error("Add at least one item with qty and wage");

      const prod: LabourProduction = {
        id: makeId("lprod"),
        labourId: selectedLabour.id,
        lines: validLines,
        total: validLines.reduce((s, l) => s + l.lineTotal, 0),
        paid: 0,
        note: prodNote.trim() || undefined,
        workPeriodId,
        createdAt: Date.now(),
      };
      await db.labourProduction.put(prod);

      // Add the earned amount to short balance (employer owes worker)
      await db.labours.update(selectedLabour.id, {
        shortBalance: selectedLabour.shortBalance + prod.total,
      });

      toast({ title: "Production recorded", description: `${selectedLabour.name} — ${formatIntMoney(prod.total)}` });
      setProdDialogOpen(false);
      const updated = await db.labours.get(selectedLabour.id);
      if (updated) setSelectedLabour(updated);
      await refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message, variant: "destructive" });
    }
  };

  const labourTxs = React.useMemo(() => {
    if (!selectedLabour) return [];
    const all = transactions.filter((t) => t.labourId === selectedLabour.id);
    const [fy, fm, fd] = txFilterFrom.split("-").map(Number);
    const [ty, tm, td] = txFilterTo.split("-").map(Number);
    const fromTs = new Date(fy, fm - 1, fd, 0, 0, 0, 0).getTime();
    const toTs = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();
    return all.filter((t) => t.createdAt >= fromTs && t.createdAt <= toTs);
  }, [selectedLabour, transactions, txFilterFrom, txFilterTo]);

  const labourTxsTotal = labourTxs.reduce((sum, t) => {
    if (t.type === "wage" || t.type === "advance" || t.type === "deduct_short") return sum + t.amount;
    return sum;
  }, 0);

  const wagePeriodLabel = (p: WagePeriod) => WAGE_PERIODS.find((w) => w.value === p)?.label || p;
  const txTypeLabel = (t: LabourTransactionType) => {
    const m: Record<LabourTransactionType, string> = {
      wage: "Wage Paid",
      advance: "Advance Given",
      short: "Short Recorded",
      deduct_advance: "Advance Deducted",
      deduct_short: "Short Paid",
    };
    return m[t];
  };
  const txTypeColor = (t: LabourTransactionType) => {
    if (t === "advance" || t === "wage" || t === "deduct_short") return "text-destructive";
    if (t === "deduct_advance") return "text-green-600";
    return "text-orange-500";
  };

  const buildLabourPdfBytes = async (labour: Labour) => {
    if (labourTxs.length === 0) {
      toast({ title: "No transactions in this date range" });
      return;
    }
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    let y = 15;
    const lm = 14;
    const addPage = () => { doc.addPage(); y = 15; };
    const checkPage = (need: number) => { if (y + need > 280) addPage(); };

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`${labour.name} — Wage Log`, pw / 2, y, { align: "center" });
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    if (labour.position) {
      doc.text(`Position: ${labour.position}`, pw / 2, y, { align: "center" });
      y += 5;
    }
    doc.text(`Period: ${txFilterFrom} → ${txFilterTo}`, pw / 2, y, { align: "center" });
    y += 5;
    doc.text(`Wage: ${formatIntMoney(labour.wageAmount)} (${wagePeriodLabel(labour.wagePeriod)})`, pw / 2, y, { align: "center" });
    y += 5;
    if (labour.hourlyRate) {
      doc.text(`Hourly Rate: ${formatIntMoney(labour.hourlyRate)}/hr`, pw / 2, y, { align: "center" });
      y += 5;
    }
    doc.text(`Advance Balance: ${formatIntMoney(labour.advanceBalance)}  |  Short Balance: ${formatIntMoney(labour.shortBalance)}`, pw / 2, y, { align: "center" });
    y += 5;
    doc.text(`Total Paid (in range): ${formatIntMoney(labourTxsTotal)}  |  Transactions: ${labourTxs.length}`, pw / 2, y, { align: "center" });
    y += 8;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Date", lm, y);
    doc.text("Type", lm + 35, y);
    doc.text("Amount", lm + 80, y);
    doc.text("Note", lm + 110, y);
    y += 1;
    doc.setDrawColor(180);
    doc.line(lm, y, pw - lm, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    for (const tx of labourTxs) {
      checkPage(6);
      const d = new Date(tx.createdAt);
      doc.text(`${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, lm, y);
      doc.text(txTypeLabel(tx.type), lm + 35, y);
      doc.text(formatIntMoney(tx.amount), lm + 80, y);
      doc.text(tx.note || "-", lm + 110, y, { maxWidth: pw - lm - 115 });
      y += 5;
    }

    const bytes = doc.output("arraybuffer");
    const fileName = `${labour.name}-wage-log-${txFilterFrom}-${txFilterTo}.pdf`;
    return { bytes: new Uint8Array(bytes), fileName };
  };

  const saveLabourPdf = async (labour: Labour, overrideName?: string) => {
    try {
      const result = await buildLabourPdfBytes(labour);
      if (!result) return;
      await savePdfBytes(result.bytes, overrideName ?? result.fileName);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const shareLabourPdf = async (labour: Labour) => {
    try {
      const result = await buildLabourPdfBytes(labour);
      if (!result) return;
      await sharePdfBytes(result.bytes, result.fileName, `${labour.name} Wage Log`);
    } catch (e: any) {
      toast({ title: "Share failed", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  // Attendance summary for current month
  const attendanceSummary = React.useMemo(() => {
    const present = attendanceRecords.filter(r => r.status === "present").length;
    const absent = attendanceRecords.filter(r => r.status === "absent").length;
    const half = attendanceRecords.filter(r => r.status === "half").length;
    return { present, absent, half, total: attendanceRecords.length };
  }, [attendanceRecords]);

  // Render attendance calendar view
  function renderAttendanceCalendar(labour: Labour) {
    const monthStart = startOfMonth(attendanceMonth);
    const monthEnd = endOfMonth(attendanceMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const today = new Date();
    const todayStr = format(today, "yyyy-MM-dd");

    // Build lookup
    const recordMap = new Map<string, AttendanceStatus>();
    for (const r of attendanceRecords) {
      recordMap.set(r.date, r.status);
    }

    // Day names
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    // Padding for first day
    const startDayOfWeek = monthStart.getDay();

    return (
      <div className="space-y-3">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAttendanceMonth(subMonths(attendanceMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{format(attendanceMonth, "MMMM yyyy")}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setAttendanceMonth(addMonths(attendanceMonth, 1))}
            disabled={isAfter(startOfMonth(addMonths(attendanceMonth, 1)), startOfMonth(today))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary */}
        <div className="flex gap-3 text-xs justify-center">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-600" /> {attendanceSummary.present} Present</span>
          <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-destructive" /> {attendanceSummary.absent} Absent</span>
          <span className="flex items-center gap-1"><Clock3 className="h-3 w-3 text-orange-500" /> {attendanceSummary.half} Half</span>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {dayNames.map(d => (
            <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
          ))}
          {/* Padding cells */}
          {Array.from({ length: startDayOfWeek }).map((_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {days.map(day => {
            const dateStr = format(day, "yyyy-MM-dd");
            const status = recordMap.get(dateStr);
            const isFuture = isAfter(day, today);
            const isToday = dateStr === todayStr;

            return (
              <div key={dateStr} className={`relative flex flex-col items-center rounded-md p-1 ${isToday ? "ring-1 ring-primary" : ""} ${isFuture ? "opacity-40" : ""}`}>
                <span className="text-[11px] text-muted-foreground">{day.getDate()}</span>
                {!isFuture && (
                  <div className="flex gap-0.5 mt-0.5">
                    <button
                      type="button"
                      onClick={() => void markAttendance(labour.id, dateStr, "present")}
                      className={`rounded-full p-0.5 transition-colors ${status === "present" ? "bg-green-600 text-white" : "text-muted-foreground hover:text-green-600"}`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void markAttendance(labour.id, dateStr, "absent")}
                      className={`rounded-full p-0.5 transition-colors ${status === "absent" ? "bg-destructive text-white" : "text-muted-foreground hover:text-destructive"}`}
                    >
                      <XCircle className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void markAttendance(labour.id, dateStr, "half")}
                      className={`rounded-full p-0.5 transition-colors ${status === "half" ? "bg-orange-500 text-white" : "text-muted-foreground hover:text-orange-500"}`}
                    >
                      <Clock3 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Quick mark today */}
        {isSameMonth(today, attendanceMonth) && (
          <div className="flex gap-2 justify-center pt-1">
            <span className="text-xs text-muted-foreground self-center">Today:</span>
            <Button size="sm" variant={recordMap.get(todayStr) === "present" ? "default" : "outline"} className="h-7 text-xs gap-1"
              onClick={() => void markAttendance(labour.id, todayStr, "present")}>
              <CheckCircle2 className="h-3 w-3" /> Present
            </Button>
            <Button size="sm" variant={recordMap.get(todayStr) === "absent" ? "destructive" : "outline"} className="h-7 text-xs gap-1"
              onClick={() => void markAttendance(labour.id, todayStr, "absent")}>
              <XCircle className="h-3 w-3" /> Absent
            </Button>
            <Button size="sm" variant={recordMap.get(todayStr) === "half" ? "default" : "outline"} className="h-7 text-xs gap-1 bg-orange-500 hover:bg-orange-600 text-white border-orange-500"
              style={recordMap.get(todayStr) !== "half" ? { background: "transparent", color: "inherit" } : {}}
              onClick={() => void markAttendance(labour.id, todayStr, "half")}>
              <Clock3 className="h-3 w-3" /> Half Day
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Detail view for selected labour
  if (selectedLabour) {
    const fresh = labours.find((l) => l.id === selectedLabour.id) || selectedLabour;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedLabour(null); setShowAttendanceView(false); setShowProductionView(false); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{fresh.name}</h2>
            <p className="text-xs text-muted-foreground">
              {fresh.position && <span className="font-medium">{fresh.position} • </span>}
              {fresh.wagePeriod === "piece_rate" ? "Per Piece" : `${wagePeriodLabel(fresh.wagePeriod)} — ${formatIntMoney(fresh.wageAmount)}`}
              {fresh.hourlyRate ? ` • ${formatIntMoney(fresh.hourlyRate)}/hr` : ""}
            </p>
          </div>
          <SaveShareMenu label="Export" size="sm" getDefaultFileName={() => `${fresh.name}-wage-log-${txFilterFrom}-${txFilterTo}.pdf`} onSave={(fn) => void saveLabourPdf(fresh, fn)} onShare={() => void shareLabourPdf(fresh)} />
          <Button variant="outline" size="sm" onClick={() => openEditLabour(fresh)}>Edit</Button>
        </div>

        {/* Balance cards */}
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xs text-muted-foreground">Advance Balance</div>
              <div className="text-lg font-bold text-orange-500">{formatIntMoney(fresh.advanceBalance)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-xs text-muted-foreground">Short Balance</div>
              <div className="text-lg font-bold text-destructive">{formatIntMoney(fresh.shortBalance)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Tab toggle: Transactions / Attendance / Production */}
        <div className="flex gap-2 border-b overflow-x-auto">
          <button
            type="button"
            className={`pb-2 text-sm font-medium border-b-2 transition-colors px-3 whitespace-nowrap ${!showAttendanceView && !showProductionView ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => { setShowAttendanceView(false); setShowProductionView(false); }}
          >
            Transactions
          </button>
          <button
            type="button"
            className={`pb-2 text-sm font-medium border-b-2 transition-colors px-3 whitespace-nowrap ${showAttendanceView ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => { setShowAttendanceView(true); setShowProductionView(false); setAttendanceMonth(new Date()); }}
          >
            Attendance
          </button>
          {fresh.wagePeriod === "piece_rate" && (
            <button
              type="button"
              className={`pb-2 text-sm font-medium border-b-2 transition-colors px-3 whitespace-nowrap ${showProductionView ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setShowProductionView(true); setShowAttendanceView(false); }}
            >
              Production
            </button>
          )}
        </div>

        {showAttendanceView ? (
          <Card>
            <CardContent className="p-3">
              {renderAttendanceCalendar(fresh)}
            </CardContent>
          </Card>
        ) : showProductionView ? (
          /* ─── Production View ─── */
          <div className="space-y-3">
            <Button size="sm" onClick={() => void openProdDialog()} className="gap-1">
              <Factory className="h-3.5 w-3.5" /> Add Production Entry
            </Button>

            {labourProds.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-sm text-muted-foreground">
                  No production records yet. Tap "Add Production Entry" to record manufactured items.
                </CardContent>
              </Card>
            ) : (
              labourProds.map((prod) => (
                <Card key={prod.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        {new Date(prod.createdAt).toLocaleDateString()} {new Date(prod.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className="text-sm font-bold">{formatIntMoney(prod.total)}</div>
                    </div>
                    {prod.lines.map((line, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span>{line.itemName}</span>
                        <span className="text-muted-foreground">{line.qty} × {formatIntMoney(line.perItemWage)} = {formatIntMoney(line.lineTotal)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs pt-1 border-t">
                      <span className="text-muted-foreground">Paid: {formatIntMoney(prod.paid)}</span>
                      <span className={prod.total - prod.paid > 0 ? "text-destructive font-medium" : "text-green-600 font-medium"}>
                        {prod.total - prod.paid > 0 ? `Unpaid: ${formatIntMoney(prod.total - prod.paid)}` : "Fully Paid"}
                      </span>
                    </div>
                    {prod.note && <div className="text-xs text-muted-foreground">{prod.note}</div>}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          <>
            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              {fresh.wagePeriod === "piece_rate" ? (
                <>
                  <Button variant="default" size="sm" onClick={() => void openProdDialog()} className="gap-1">
                    <Factory className="h-3.5 w-3.5" /> Add Production
                  </Button>
                  {fresh.shortBalance > 0 && (
                    <Button variant="default" size="sm" onClick={() => void openTxDialog(fresh, "deduct_short")} className="gap-1">
                      <Wallet className="h-3.5 w-3.5" /> Pay Wage
                    </Button>
                  )}
                </>
              ) : (
                <Button variant="default" size="sm" onClick={() => void openTxDialog(fresh, "wage")} className="gap-1">
                  <Wallet className="h-3.5 w-3.5" /> Pay Wage
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => void openTxDialog(fresh, "advance")} className="gap-1">
                <ArrowUpCircle className="h-3.5 w-3.5" /> Give Advance
              </Button>
              {fresh.wagePeriod !== "piece_rate" && (
                <Button variant="outline" size="sm" onClick={() => void openTxDialog(fresh, "short")} className="gap-1">
                  <ArrowDownCircle className="h-3.5 w-3.5" /> Record Short
                </Button>
              )}
              {fresh.advanceBalance > 0 && (
                <Button variant="outline" size="sm" onClick={() => void openTxDialog(fresh, "deduct_advance")} className="gap-1">
                  <MinusCircle className="h-3.5 w-3.5" /> Deduct Advance
                </Button>
              )}
              {fresh.shortBalance > 0 && fresh.wagePeriod !== "piece_rate" && (
                <Button variant="outline" size="sm" onClick={() => void openTxDialog(fresh, "deduct_short")} className="gap-1">
                  <PlusCircle className="h-3.5 w-3.5" /> Pay Short
                </Button>
              )}
            </div>

            {/* Transaction history with date filter */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Transaction History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="txFrom" className="text-xs">From</Label>
                    <Input id="txFrom" type="date" value={txFilterFrom} onChange={(e) => setTxFilterFrom(e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="txTo" className="text-xs">To</Label>
                    <Input id="txTo" type="date" value={txFilterTo} onChange={(e) => setTxFilterTo(e.target.value)} className="h-8 text-sm" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{labourTxs.length} transactions • Total paid: {formatIntMoney(labourTxsTotal)}</span>
                  <SaveShareMenu label="Wage PDF" size="sm" getDefaultFileName={() => `${fresh.name}-wage-log-${txFilterFrom}-${txFilterTo}.pdf`} onSave={(fn) => void saveLabourPdf(fresh, fn)} onShare={() => void shareLabourPdf(fresh)} disabled={labourTxs.length === 0} />
                </div>
                {labourTxs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No transactions in this date range.</div>
                ) : (
                  labourTxs.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-md border p-2">
                      <div>
                        <div className="text-sm font-medium">{txTypeLabel(tx.type)}</div>
                        {tx.note && <div className="text-xs text-muted-foreground">{tx.note}</div>}
                        <div className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString()} {new Date(tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${txTypeColor(tx.type)}`}>
                        {formatIntMoney(tx.amount)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}

        {renderDialogs()}
      </div>
    );
  }

  function renderDialogs() {
    const showAttendance = txType === "wage" && txLabour && (txLabour.wagePeriod === "weekly" || txLabour.wagePeriod === "monthly");

    return (
      <>
        {/* Add/Edit Labour Dialog */}
        <Dialog open={labourDialogOpen} onOpenChange={setLabourDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingLabour ? "Edit Staff" : "Add Staff"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Worker name" />
              </div>
              <div className="space-y-1">
                <Label>Position (optional)</Label>
                <Input value={formPosition} onChange={(e) => setFormPosition(e.target.value)} placeholder="e.g. Cashier, Cook, Guard" />
              </div>
              <div className="space-y-1">
                <Label>Contact (optional)</Label>
                <Input value={formContact} onChange={(e) => setFormContact(e.target.value)} placeholder="Phone number" />
              </div>
              <div className="space-y-1">
                <Label>Address (optional)</Label>
                <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Address" />
              </div>
              <div className="space-y-1">
                <Label>Wage Period</Label>
                <Select value={formWagePeriod} onValueChange={(v) => setFormWagePeriod(v as WagePeriod)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WAGE_PERIODS.map((wp) => (
                      <SelectItem key={wp.value} value={wp.value}>{wp.label}</SelectItem>
                    ))}
                  </SelectContent>
              </Select>
                {formWagePeriod === "piece_rate" && (
                  <p className="text-xs text-muted-foreground">Worker gets paid per item manufactured. Add production entries to track earnings.</p>
                )}
              </div>
              {formWagePeriod !== "piece_rate" && (
                <>
                  <div className="space-y-1">
                    <Label>Wage Amount {formHourlyRate > 0 ? "(optional — set 0 if hourly only)" : "*"}</Label>
                    <Input
                      inputMode="numeric"
                      value={formWageAmount === 0 ? "" : String(formWageAmount)}
                      onChange={(e) => setFormWageAmount(parseNonDecimalInt(e.target.value))}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Pay Per Hour (optional)</Label>
                    <Input
                      inputMode="numeric"
                      value={formHourlyRate === 0 ? "" : String(formHourlyRate)}
                      onChange={(e) => setFormHourlyRate(parseNonDecimalInt(e.target.value))}
                      placeholder="e.g. 150"
                    />
                    <p className="text-xs text-muted-foreground">If set, you can calculate wage by hours worked when paying</p>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLabourDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => void saveLabour()}
                disabled={!formName.trim() || (formWagePeriod !== "piece_rate" && formWageAmount <= 0 && formHourlyRate <= 0)}
              >
                {editingLabour ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transaction Dialog */}
        <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {txType === "wage" && "Pay Wage"}
                {txType === "advance" && "Give Advance"}
                {txType === "short" && "Record Short Salary"}
                {txType === "deduct_advance" && "Deduct from Advance"}
                {txType === "deduct_short" && "Pay Short Salary"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {txLabour && (
                <div className="text-sm text-muted-foreground">
                  {txLabour.name}
                  {txLabour.position ? ` • ${txLabour.position}` : ""}
                  {" "}• Advance: {formatIntMoney(txLabour.advanceBalance)} • Short: {formatIntMoney(txLabour.shortBalance)}
                </div>
              )}

              {/* Hourly calculator — shown in wage payment if staff has hourly rate */}
              {txType === "wage" && txLabour && (
                <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Clock className="h-3.5 w-3.5" /> Hourly Calculator (optional)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Rate per Hour</Label>
                      <Input
                        inputMode="numeric"
                        value={txHourlyRate === 0 ? "" : String(txHourlyRate)}
                        onChange={(e) => {
                          const rate = parseNonDecimalInt(e.target.value);
                          setTxHourlyRate(rate);
                          if (rate > 0 && txHoursWorked > 0) {
                            setTxAmount(rate * txHoursWorked);
                          }
                        }}
                        placeholder="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Hours Worked</Label>
                      <Input
                        inputMode="numeric"
                        value={txHoursWorked === 0 ? "" : String(txHoursWorked)}
                        onChange={(e) => {
                          const hours = parseNonDecimalInt(e.target.value);
                          setTxHoursWorked(hours);
                          if (hours > 0 && txHourlyRate > 0) {
                            setTxAmount(hours * txHourlyRate);
                          }
                        }}
                        placeholder="0"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  {hourlyTotal > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {txHoursWorked}h × {formatIntMoney(txHourlyRate)} = <span className="font-bold text-foreground">{formatIntMoney(hourlyTotal)}</span>
                      <span className="ml-1 text-muted-foreground">(auto-filled above)</span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <Label>Amount</Label>
                <Input
                  inputMode="numeric"
                  value={txAmount === 0 ? "" : String(txAmount)}
                  onChange={(e) => setTxAmount(parseNonDecimalInt(e.target.value))}
                  placeholder="0"
                />
              </div>

              {/* Attendance tracking — auto-filled from daily records */}
              {showAttendance && (
                <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Calendar className="h-3.5 w-3.5" /> Attendance Deduction
                    </div>
                    <button
                      type="button"
                      onClick={() => setTxUseAttendance((v) => !v)}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        txUseAttendance ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent border-border"
                      }`}
                    >
                      {txUseAttendance ? "On" : "Off"}
                    </button>
                  </div>
                  {txUseAttendance && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Auto-filled from attendance records. You can adjust manually.</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Total Days</Label>
                          <Input
                            inputMode="numeric"
                            value={txTotalDays === 0 ? "" : String(txTotalDays)}
                            onChange={(e) => setTxTotalDays(parseNonDecimalInt(e.target.value))}
                            placeholder="e.g. 30"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Absent Days</Label>
                          <Input
                            inputMode="numeric"
                            value={txAbsentDays === 0 ? "" : String(txAbsentDays)}
                            onChange={(e) => setTxAbsentDays(Math.min(parseNonDecimalInt(e.target.value), txTotalDays || 999))}
                            placeholder="0"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                      {attendanceDeduction > 0 && (
                        <div className="text-xs text-destructive font-medium">
                          Absent deduction: −{formatIntMoney(attendanceDeduction)}
                          <span className="text-muted-foreground font-normal ml-1">
                            ({txAbsentDays} day{txAbsentDays > 1 ? "s" : ""} of {txTotalDays})
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Manual deduction for wage payments */}
              {txType === "wage" && (
                <div className="space-y-1">
                  <Label>Manual Salary Deduction (optional)</Label>
                  <Input
                    inputMode="numeric"
                    value={txManualDeduction === 0 ? "" : String(txManualDeduction)}
                    onChange={(e) => setTxManualDeduction(parseNonDecimalInt(e.target.value))}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">Enter any additional amount to deduct from wage</p>
                </div>
              )}

              {/* Final amount summary */}
              {txType === "wage" && (txUseAttendance || txManualDeduction > 0) && txAmount > 0 && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base wage</span>
                    <span>{formatIntMoney(txAmount)}</span>
                  </div>
                  {txUseAttendance && attendanceDeduction > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Absent deduction ({txAbsentDays}d)</span>
                      <span>−{formatIntMoney(attendanceDeduction)}</span>
                    </div>
                  )}
                  {txManualDeduction > 0 && (
                    <div className="flex justify-between text-destructive">
                      <span>Manual deduction</span>
                      <span>−{formatIntMoney(txManualDeduction)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t pt-1 mt-1">
                    <span>Final Amount</span>
                    <span className="text-primary">{formatIntMoney(finalWageAmount)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label>Note (optional)</Label>
                <Input value={txNote} onChange={(e) => setTxNote(e.target.value)} placeholder="Optional note" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTxDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void saveTx()} disabled={(txType === "wage" ? finalWageAmount : txAmount) <= 0}>
                Confirm {txType === "wage" && finalWageAmount > 0 ? `— ${formatIntMoney(finalWageAmount)}` : ""}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Staff?</AlertDialogTitle>
              <AlertDialogDescription>
                Delete "{deleteTarget?.name}" and all their transactions? This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Production Entry Dialog */}
        <Dialog open={prodDialogOpen} onOpenChange={setProdDialogOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Production Entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Add items manufactured by {selectedLabour?.name}. Select from menu or type a custom item name.
              </p>

              {prodLines.map((line, idx) => (
                <div key={idx} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                    {prodLines.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeProdLine(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Item Name</Label>
                    <div className="flex gap-1">
                      <Input
                        value={line.itemName}
                        onChange={(e) => updateProdLine(idx, "itemName", e.target.value)}
                        placeholder="Type or pick from menu"
                        className="h-8 text-sm flex-1"
                      />
                      <Button variant="outline" size="sm" className="h-8 px-2" onClick={() => { setShowMenuPicker(showMenuPicker === idx ? null : idx); setMenuSearchQuery(""); }}>
                        <Package className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {showMenuPicker === idx && (
                      <div className="rounded-md border bg-background p-2 space-y-1 max-h-40 overflow-y-auto">
                        <Input
                          value={menuSearchQuery}
                          onChange={(e) => setMenuSearchQuery(e.target.value)}
                          placeholder="Search menu items..."
                          className="h-7 text-xs"
                          autoFocus
                        />
                        {menuItems
                          .filter((m) => !menuSearchQuery || m.name.toLowerCase().includes(menuSearchQuery.toLowerCase()))
                          .slice(0, 20)
                          .map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
                              onClick={() => selectMenuItem(idx, m)}
                            >
                              {m.name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Qty Made</Label>
                      <Input
                        inputMode="numeric"
                        value={line.qty === 0 ? "" : String(line.qty)}
                        onChange={(e) => updateProdLine(idx, "qty", parseNonDecimalInt(e.target.value))}
                        placeholder="0"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Per Item Wage</Label>
                      <Input
                        inputMode="numeric"
                        value={line.perItemWage === 0 ? "" : String(line.perItemWage)}
                        onChange={(e) => updateProdLine(idx, "perItemWage", parseNonDecimalInt(e.target.value))}
                        placeholder="0"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  {line.lineTotal > 0 && (
                    <div className="text-xs text-right font-medium">
                      {line.qty} × {formatIntMoney(line.perItemWage)} = <span className="text-primary">{formatIntMoney(line.lineTotal)}</span>
                    </div>
                  )}
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addProdLine} className="gap-1 w-full">
                <Plus className="h-3.5 w-3.5" /> Add Another Item
              </Button>

              <div className="space-y-1">
                <Label className="text-xs">Note (optional)</Label>
                <Input value={prodNote} onChange={(e) => setProdNote(e.target.value)} placeholder="Optional note" className="h-8 text-sm" />
              </div>

              {prodTotal > 0 && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-center">
                  <div className="text-xs text-muted-foreground">Total Wage Earned</div>
                  <div className="text-lg font-bold text-primary">{formatIntMoney(prodTotal)}</div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setProdDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void saveProdRecord()} disabled={prodTotal <= 0}>
                Save Production — {formatIntMoney(prodTotal)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Labour list view
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold flex-1">Staff / Wages</h2>
        <Button size="sm" onClick={openAddLabour}>
          <Plus className="h-4 w-4 mr-1" /> Add Staff
        </Button>
      </div>

      {labours.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No staff/workers added yet. Tap "Add Staff" to get started.
          </CardContent>
        </Card>
      ) : (
        labours.map((l) => (
          <Card key={l.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setSelectedLabour(l)}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{l.name}</div>
                  {l.position && (
                    <div className="text-xs text-primary font-medium">{l.position}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {l.wagePeriod === "piece_rate" ? "Per Piece / Manufacturer" : `${wagePeriodLabel(l.wagePeriod)} • ${formatIntMoney(l.wageAmount)}`}
                    {l.hourlyRate ? ` • ${formatIntMoney(l.hourlyRate)}/hr` : ""}
                  </div>
                  {(l.contact || l.address) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {l.contact}{l.contact && l.address ? " • " : ""}{l.address}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  {l.advanceBalance > 0 && (
                    <span className="text-xs text-orange-500">Adv: {formatIntMoney(l.advanceBalance)}</span>
                  )}
                  {l.shortBalance > 0 && (
                    <span className="text-xs text-destructive">Short: {formatIntMoney(l.shortBalance)}</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 ml-2"
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(l); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {renderDialogs()}
    </div>
  );
}
