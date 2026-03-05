import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, ClipboardList, DollarSign, Users, Truck, UtensilsCrossed, CalendarCheck, Shield, Wifi, BarChart3, Printer, Settings, Package, Home, Info, Tags, Briefcase, FileText, ArrowLeft } from "lucide-react";

const features = [
  {
    icon: Home,
    title: "Dashboard Overview",
    description: "A central hub showing today's sales summary, total orders, and quick-access tiles to all major sections of the app.",
  },
  {
    icon: ShoppingCart,
    title: "Sales / Billing",
    description: "Process sales quickly with a category-based product grid. Add items to cart, apply discounts (amount or percentage), choose payment method (cash, credit, or delivery), and generate receipts. Supports barcode/SKU scanning, item variations, tax and service charge calculations. Works for any shop, store, or service business.",
  },
  {
    icon: ClipboardList,
    title: "Orders",
    description: "View and manage all completed and cancelled orders. Search by receipt number, review order details, reprint receipts, and cancel orders with a reason. Orders are linked to work periods for shift-based tracking.",
  },
  {
    icon: DollarSign,
    title: "Expenses",
    description: "Record daily business expenses with preset categories like Staff/Wages, Utilities, Rent, Transport, and more. Track spending per work period and include notes for reference.",
  },
  {
    icon: Briefcase,
    title: "Staff Wages & Attendance",
    description: "Manage staff/workers with job positions, daily/weekly/monthly wage periods, and optional hourly rates. Mark daily attendance (present, absent, half-day) with a calendar view. When paying salary, absent days are auto-calculated from attendance records to deduct accordingly. Track advance balances, short salary, and generate wage log PDFs.",
  },
  {
    icon: Users,
    title: "Credit Lodge",
    description: "Manage credit customers who buy on account. Add customers, track outstanding balances, record payments, and view transaction history. Credit sales are linked to specific customers for easy follow-up.",
  },
  {
    icon: Truck,
    title: "Party Lodge (Suppliers)",
    description: "Track supplier relationships, record supply arrivals with quantities and pricing, manage outstanding balances, and log payments. Includes receipt numbers for supplier deliveries and supports cash/bank payment types.",
  },
  {
    icon: UtensilsCrossed,
    title: "Table / Counter Management",
    description: "Assign orders to tables or counters with staff tracking. Staff can add items, and cashiers handle final checkout. Supports multiple orders per table, order ticket printing, and pending order badges. Useful for restaurants, salons, service counters, and more.",
  },
  {
    icon: CalendarCheck,
    title: "Booking / Appointments",
    description: "Accept advance bookings and appointments with customer details. Track booking status, collect advance payments, and manage upcoming reservations. Suitable for any business that takes appointments or reservations.",
  },
  {
    icon: Shield,
    title: "Payments Recovery",
    description: "Manage recurring bill collection from customers. Assign recovery agents, set billing frequencies (daily/weekly/monthly), track outstanding balances, and record payments with receipt numbers.",
  },
  {
    icon: Wifi,
    title: "Device Sync",
    description: "Synchronize data between multiple devices on the same local network. Configure main and sub devices, sync products, orders, inventory, and settings in real time.",
  },
  {
    icon: BarChart3,
    title: "Reports",
    description: "Generate detailed sales reports by date range. View breakdowns by payment method, top-selling items, and daily trends. Export reports as PDF including credit lodge and advance booking summaries.",
  },
  {
    icon: Printer,
    title: "Printer Setup",
    description: "Configure receipt printing via Bluetooth or USB thermal printers. Set paper size (58mm/80mm), customize receipt layout with logo, address, and phone. Supports dual-printer routing for sales and secondary printing needs.",
  },
  {
    icon: Tags,
    title: "Print Barcodes / Labels",
    description: "Generate and print barcode labels for products. Select items from your product list, enter manually, or import from Excel/CSV/PDF files. Supports A4 PDF, ZPL (Zebra), TSPL (TSC/Xprinter), and direct ESC/POS thermal printing.",
  },
  {
    icon: FileText,
    title: "Custom Print",
    description: "Build custom receipts with optional logo, business name, title, and metadata like bill number, prepared by, and payment method. Also supports uploading and printing existing PDF or image files directly via thermal printer.",
  },
  {
    icon: Package,
    title: "Inventory & Expiry Tracking",
    description: "Track stock levels for items with inventory enabled. Adjust quantities (set/add/remove) with audit logs. Items with expiry dates are highlighted — expired items in red, expiring soon in yellow — sorted by nearest expiry.",
  },
  {
    icon: Settings,
    title: "Admin Settings",
    description: "Configure business name, tax/service charges, receipt style, staff accounts (cashier/staff/supervisor/recovery), manage categories and products, import/export product data, enable/disable features, and handle backup/restore.",
  },
];

export default function AboutApp() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 pb-20 pt-2">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/home")} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Info className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">About SANGI POS</h1>
          <p className="text-sm text-muted-foreground">All-in-one offline POS for any business</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">App Features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex gap-3 rounded-lg border p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{f.title}</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{f.description}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="text-center text-xs text-muted-foreground select-none cursor-default space-y-1">
        <p>SANGI POS &mdash; Offline POS System &mdash; v2.5</p>
        <a href="/privacy-policy" className="text-primary underline">Privacy Policy</a>
        <span className="mx-1">•</span>
        <a href="/delete-data" className="text-primary underline">Delete Your Data</a>
      </div>
    </div>
  );
}

