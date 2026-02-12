// ─── Advance / Booking Orders ────────────────────

export type AdvanceOrderStatus = "pending" | "completed" | "cancelled";

export type AdvanceOrderLine = {
  itemId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
  unit?: string;
};

export type AdvanceOrder = {
  id: string;
  receiptNo: number;
  status: AdvanceOrderStatus;
  lines: AdvanceOrderLine[];
  subtotal: number;
  discountAmount: number;
  total: number;
  advancePayment: number;
  remainingPayment: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryDate?: string;   // optional delivery date "YYYY-MM-DD"
  deliveryTime?: string;   // optional delivery time "HH:mm"
  cancelledReason?: string;
  cashier?: string;
  workPeriodId?: string;
  createdAt: number;
  updatedAt: number;
};

// Bookable item (configured by admin in settings)
export type BookableItem = {
  id: string;
  name: string;
  price: number;
  createdAt: number;
};

export type BookingOrderStatus = "pending" | "completed" | "cancelled";

export type BookingOrder = {
  id: string;
  receiptNo: number;
  bookableItemId: string;
  bookableItemName: string;
  status: BookingOrderStatus;
  date: number; // date as timestamp (start of day)
  startTime: string; // e.g. "09:00"
  durationHours: number; // e.g. 1.5
  endTime: string; // e.g. "10:30"
  price: number;
  discountAmount: number;
  total: number; // price - discount
  advancePayment: number;
  remainingPayment: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  cancelledReason?: string;
  cashier?: string;
  workPeriodId?: string;
  createdAt: number;
  updatedAt: number;
};
