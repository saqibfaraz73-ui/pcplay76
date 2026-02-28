export type Category = {
  id: string;
  name: string;
  printerSection?: string; // custom printer section (e.g. "A", "B", "Kitchen")
  createdAt: number;
};

export type StockUnit = "pcs" | "kg" | "ltr" | "ft" | "m";

export const STOCK_UNITS: { value: StockUnit; label: string }[] = [
  { value: "pcs", label: "Pieces" },
  { value: "kg", label: "Kg" },
  { value: "ltr", label: "Liters" },
  { value: "ft", label: "Feet" },
  { value: "m", label: "Meters" },
];

export type ItemVariation = {
  name: string;
  price: number;
  buyingPrice?: number;
  stock?: number; // optional per-variant stock
};

// Per-item add-on (e.g. "Extra Cheese" for Pizza, "Gift Wrap" for a product)
export type ItemAddOn = {
  name: string;
  price: number;
};

export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  sku?: string; // optional SKU / barcode
  price: number;
  buyingPrice?: number; // optional cost/buying price (integers)
  imagePath?: string; // file reference (never store the image itself)
  trackInventory: boolean;
  stockUnit?: StockUnit; // optional unit of measurement
  expiryDate?: number; // optional expiry date as timestamp
  variations?: ItemVariation[]; // optional product variations (e.g. Small, Medium, Large)
  addOns?: ItemAddOn[]; // optional per-item add-ons (e.g. Extra Cheese, Gift Wrap)
  createdAt: number;
};

export type InventoryRow = {
  itemId: string;
  quantity: number;
  updatedAt: number;
};

export type InventoryAdjustmentType = "set" | "add" | "remove";

export type InventoryAdjustment = {
  id: string;
  itemId: string;
  type: InventoryAdjustmentType;
  delta: number; // positive number
  before: number;
  after: number;
  note?: string;
  createdAt: number;
};

export type CreditCustomer = {
  id: string;
  name: string;
  mobile?: string;
  createdAt: number;
};

// Delivery customer record (saved from delivery orders)
export type DeliveryCustomer = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  createdAt: number;
};

// Credit payment record for tracking deposits
export type CreditPayment = {
  id: string;
  customerId: string;
  amount: number;
  note?: string;
  createdAt: number;
};

export type OrderStatus = "completed" | "cancelled";
export type PaymentMethod = "cash" | "credit" | "delivery";

// Delivery person
export type DeliveryPerson = {
  id: string;
  name: string;
  phone?: string;
  createdAt: number;
};

export type OrderLine = {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  buyingPrice?: number; // cost price at time of sale (for accurate profit)
  subtotal: number;
  expiryDate?: number; // optional expiry date from item at time of sale
};

export type Discount =
  | { type: "none" }
  | { type: "amount"; value: number; reason?: string }
  | { type: "percent"; value: number; reason?: string };

export type Order = {
  id: string;
  receiptNo: number;
  cashier: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  creditCustomerId?: string;
  // Delivery fields
  deliveryPersonId?: string;
  deliveryCustomerName?: string;
  deliveryCustomerAddress?: string;
  deliveryCustomerPhone?: string;
  discount: Discount;
  lines: OrderLine[];
  subtotal: number;
  discountTotal: number;
  taxAmount: number; // calculated tax amount
  serviceChargeAmount: number; // calculated service charge amount
  total: number;
  cancelledReason?: string;
  workPeriodId?: string; // link order to a work period
  createdAt: number;
  updatedAt: number;
};

// Work period for cashier shift tracking
export type WorkPeriod = {
  id: string;
  cashier: string;
  startedAt: number;
  endedAt?: number;
  isClosed: boolean;
};

export type ReceiptSize = "2x2" | "2x3";

export const EXPENSE_PRESETS = [
  "Stationery",
  "Staff/Wages",
  "Utilities",
  "Transport",
  "Maintenance/Repairs",
  "Rent",
  "Food/Refreshments",
  "Equipment",
  "Miscellaneous",
];

export type Expense = {
  id: string;
  name: string;
  amount: number;
  note?: string;
  workPeriodId?: string;
  createdAt: number;
};

export type SupplierPaymentType = "cash" | "bank";

export type Supplier = {
  id: string;
  name: string;
  contact?: string;
  itemName?: string;
  stockUnit?: StockUnit;
  unitPrice?: number;
  totalBalance: number; // outstanding balance owed to supplier
  createdAt: number;
};

export type SupplierPayment = {
  id: string;
  supplierId: string;
  amount: number;
  paymentType?: SupplierPaymentType;
  note?: string;
  expenseId?: string; // links to Expense record
  createdAt: number;
};

// Record of a supply arrival/delivery from a supplier
export type SupplierArrival = {
  id: string;
  supplierId: string;
  receiptNo?: number;
  itemName: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  total: number;
  note?: string;
  cancelled?: boolean;
  cancelledReason?: string;
  createdAt: number;
};

// ─── Export Party (wholesale buyers) ────────────────────

export type ExportCustomer = {
  id: string;
  name: string;
  contact?: string;
  itemName?: string;
  stockUnit?: StockUnit;
  unitPrice?: number;
  totalBalance: number; // amount owed BY the buyer
  createdAt: number;
};

export type ExportSale = {
  id: string;
  customerId: string;
  receiptNo?: number;
  itemName: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  total: number;
  advancePayment?: number; // optional advance payment received
  discountAmount?: number; // optional discount on the sale
  note?: string;
  cancelled?: boolean;
  cancelledReason?: string;
  createdAt: number;
};

export type ExportPayment = {
  id: string;
  customerId: string;
  amount: number;
  paymentType?: SupplierPaymentType;
  note?: string;
  createdAt: number;
};

export type ChargeType = "percent" | "fixed";

export type Settings = {
  id: "app";
  restaurantName: string;
  address?: string;
  phone?: string;
  receiptLogoPath?: string;
  paperSize: "58" | "80";
  receiptSize?: ReceiptSize; // receipt paper size in inches (width x height)
  showAddress: boolean;
  showPhone: boolean;
  showLogo: boolean;
  posShowItemImages?: boolean; // optional; default true
  posAutoPrintReceipt?: boolean; // optional; default false
  printerConnection?: "bluetooth" | "usb" | "none";
  printerName?: string;
  printerAddress?: string; // Bluetooth MAC address for classic SPP printers
  subPrinterMode?: "own" | "main"; // "own" = sub prints locally, "main" = send to main device's printer
  subKotOnly?: boolean; // if true, sub app can only print KOT; receipt printing skipped, sale saved for main to print
  // Dual-printer support: configure both BT and USB independently
  btPrinterAddress?: string; // Bluetooth MAC address
  btPrinterName?: string; // Bluetooth printer friendly name
  usbDeviceName?: string; // USB device name/path
  usbPrinterLabel?: string; // USB printer friendly label
  // Section-based printer routing
  salesPrinterType?: "bluetooth" | "usb" | "none"; // which printer for Sales Dashboard
  tablePrinterType?: "bluetooth" | "usb" | "none"; // which printer for Table Management
  // Tax settings
  taxEnabled?: boolean;
  taxType?: ChargeType;
  taxValue?: number; // percent (e.g. 5 for 5%) or fixed amount
  taxLabel?: string; // custom label e.g. "VAT", "GST"
  // Service charge settings
  serviceChargeEnabled?: boolean;
  serviceChargeType?: ChargeType;
  serviceChargeValue?: number; // percent or fixed amount
  serviceChargeLabel?: string; // custom label e.g. "Service Fee"
  // Legacy fields (no longer used - auth moved to adminAccount/staffAccounts tables)
  cashierUsername?: string;
  cashierPassword?: string;
  adminPassword?: string;
  // Delivery settings
  deliveryEnabled?: boolean;
  deliveryShowCustomerName?: boolean;
  deliveryShowCustomerAddress?: boolean;
  deliveryShowCustomerPhone?: boolean;
  // Expiry date settings
  expiryDateEnabled?: boolean; // allow setting expiry dates on items
  showExpiryOnDashboard?: boolean; // show expiry under items in POS
  showExpiryOnReceipt?: boolean; // show expiry on printed receipts
  // Receipt style
  receiptStyle?: "classic" | "centered"; // classic = left-aligned, centered = kitchen-style
  showCreditItemsInReport?: boolean; // show credit customer item details in PDF reports
  // Table Management settings
  tableManagementEnabled?: boolean;
  waiterLoginEnabled?: boolean; // if true, waiters can log in separately
  tableSelectionDisabled?: boolean; // if true, skip table selection (waiter-only mode)
  showExportInReports?: boolean; // show export party sales in main reports
  // Advance/Booking settings
  advanceBookingEnabled?: boolean;
  showAdvanceBookingInReports?: boolean;
  // Recovery settings
  recoveryEnabled?: boolean;
  // Sync settings
  syncEnabled?: boolean; // if true, sync feature is available
  subWorkPeriodMode?: "own" | "main"; // "own" = sub uses its own work period, "main" = inherits from main app
  // Cashier permissions
  cashierReportsEnabled?: boolean; // if true, cashier can access reports section
  cashierCancelOrderEnabled?: boolean; // if true, cashier can cancel orders (default true)
  cashierEndWorkPeriodPendingCheck?: boolean; // if true, show pending table orders warning when cashier ends work period
  waiterMainAppEnabled?: boolean; // if true, waiters can set device as Main in sync
  waiterRestrictToOwnTables?: boolean; // if true, waiters can only take orders on their assigned tables
  supervisorPrinterEnabled?: boolean; // if true, supervisors can access printer settings
  waiterPrinterEnabled?: boolean; // if true, waiters can access printer settings
  recoveryPrinterEnabled?: boolean; // if true, recovery agents can access printer settings
  recoveryAgentAddCustomerEnabled?: boolean; // if true, recovery agents can add/edit/delete customers
  salesDashboardEnabled?: boolean; // if true, sales dashboard is shown (default true)
  skuSearchEnabled?: boolean; // if true, show SKU on POS items and allow search by SKU
  receiptQrEnabled?: boolean; // if true, print barcode on receipt for scanning
  showBusinessNameOnReceipt?: boolean; // if false, hide business name on receipt (default true)
  currencySymbol?: string; // e.g. "Rs", "$", "€", "£", "₹"
  // Default printer (universal fallback for all prints)
  defaultPrinterType?: "bluetooth" | "usb" | "none"; // dashboard default printer
  // Section-based printer routing (replaces salesPrinterType/tablePrinterType)
  printerSections?: string[]; // user-defined section names (e.g. ["A", "B", "Kitchen"])
  sectionPrinterMap?: Record<string, "bluetooth" | "usb" | "none">; // section → printer type
  // Dedicated label printer (separate from receipt printer)
  labelPrinterType?: "bluetooth" | "usb" | "none"; // connection type for label printer
  labelPrinterLanguage?: "zpl" | "tspl" | "escpos"; // command language
  labelBtAddress?: string; // Bluetooth MAC address for label printer
  labelBtName?: string; // Bluetooth friendly name for label printer
  labelUsbDevice?: string; // USB device name for label printer
  labelUsbLabel?: string; // USB friendly label for label printer
  updatedAt: number;
};

// Waiter staff member
export type Waiter = {
  id: string;
  name: string;
  password?: string; // optional password for waiter login
  defaultTableId?: string; // auto-assign this table when table selection is disabled
  assignedTableIds?: string[]; // tables this waiter is allowed to serve (when restricted)
  createdAt: number;
};

// Restaurant table
export type RestaurantTable = {
  id: string;
  tableNumber: string; // e.g. "1", "2", "A1"
  createdAt: number;
};

// Table order status
export type TableOrderStatus = "open" | "completed" | "cancelled";

// Individual order added to a table (multiple can be added before checkout)
export type TableOrderLine = {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
};

// Table order - represents items added to a table before final checkout
export type TableOrder = {
  id: string;
  tableId: string;
  waiterId: string;
  waiterName?: string; // denormalized for reports (avoid ID lookups)
  tableNumber?: string; // denormalized for reports (avoid ID lookups)
  status: TableOrderStatus;
  lines: TableOrderLine[];
  subtotal: number;
  discountTotal: number;
  taxAmount: number;
  serviceChargeAmount: number;
  total: number;
  // Final checkout info
  paymentMethod?: PaymentMethod;
  creditCustomerId?: string;
  cashier?: string;
  receiptNo?: number;
  cancelledReason?: string;
  workPeriodId?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
};

// Admin account (created on first app launch via registration)
export type AdminAccount = {
  id: "admin";
  name: string;
  phone: string;
  password: string;
  securityQuestion: string;
  securityAnswer: string; // stored lowercase trimmed for comparison
  createdAt: number;
};

// Staff account (cashier or waiter, created by admin)
export type StaffAccount = {
  id: string;
  name: string;
  phone?: string; // optional mobile number for login
  role: "cashier" | "waiter" | "supervisor" | "recovery";
  pin: string; // 4-digit PIN
  defaultTableId?: string;
  createdAt: number;
};

export type CounterId = "receipt" | "arrival" | "exportSale" | "advanceOrder" | "bookingOrder" | "recoveryPayment";

// ─── Recovery (bill collection) ────────────────────

export type BillingFrequency = "daily" | "weekly" | "monthly";

export const BILLING_FREQUENCIES: { value: BillingFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export type RecoveryCustomer = {
  id: string;
  agentId?: string; // staff account id of assigned recovery agent
  agentName?: string; // denormalized agent name for display
  name: string;
  contact?: string;
  address?: string;
  pkg?: string; // package name
  monthlyBill: number; // bill amount per cycle (daily/weekly/monthly)
  billingFrequency?: BillingFrequency; // billing cycle; default "monthly"
  lastBillingAt?: number; // timestamp of last auto-billing
  balance: number; // outstanding balance
  createdAt: number;
};

export type RecoveryPaymentStatus = "paid" | "unpaid";

export type RecoveryPayment = {
  id: string;
  customerId: string;
  receiptNo?: number;
  amount: number;
  status: RecoveryPaymentStatus;
  agentName: string; // recovery agent who processed
  note?: string;
  month: string; // e.g. "2026-02" for which month this payment is for
  createdAt: number;
};

// ─── Labour / Wages ────────────────────

export type WagePeriod = "daily" | "weekly" | "monthly" | "piece_rate";

export const WAGE_PERIODS: { value: WagePeriod; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "piece_rate", label: "Per Piece / Manufacturer" },
];

export type Labour = {
  id: string;
  name: string;
  position?: string; // optional job position/role in company
  contact?: string;
  address?: string;
  wagePeriod: WagePeriod;
  wageAmount: number; // base wage per period
  hourlyRate?: number; // optional hourly rate (alternative to fixed wage)
  advanceBalance: number; // total advance given (positive = worker owes)
  shortBalance: number; // total short/unpaid wages (positive = employer owes)
  createdAt: number;
};

export type LabourTransactionType = "wage" | "advance" | "short" | "deduct_advance" | "deduct_short";

export type LabourTransaction = {
  id: string;
  labourId: string;
  type: LabourTransactionType;
  amount: number;
  note?: string;
  expenseId?: string; // linked expense record
  workPeriodId?: string;
  createdAt: number;
};

// Daily attendance record for a labourer
export type AttendanceStatus = "present" | "absent" | "half";

export type LabourAttendance = {
  id: string; // labourId_YYYY-MM-DD (compound key for uniqueness)
  labourId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  note?: string;
  createdAt: number;
};

// Production record for piece-rate / manufacturer labourers
export type LabourProductionLine = {
  itemId?: string;      // optional link to menu item
  itemName: string;     // item name (custom or from menu)
  qty: number;          // quantity manufactured
  perItemWage: number;  // wage per item
  lineTotal: number;    // qty * perItemWage
};

export type LabourProduction = {
  id: string;
  labourId: string;
  lines: LabourProductionLine[];
  total: number;        // sum of all line totals
  paid: number;         // amount paid so far against this record
  note?: string;
  workPeriodId?: string;
  createdAt: number;
};

export type Counter = {
  id: CounterId;
  next: number;
};
