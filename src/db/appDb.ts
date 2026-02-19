import Dexie, { type Table } from "dexie";
import type {
  AdminAccount,
  Category,
  Counter, CounterId,
  CreditCustomer,
  CreditPayment,
  DeliveryCustomer,
  DeliveryPerson,
  Expense,
  ExportCustomer,
  ExportPayment,
  ExportSale,
  InventoryAdjustment,
  InventoryRow,
  Labour,
  LabourAttendance,
  LabourTransaction,
  MenuItem,
  Order,
  RecoveryCustomer,
  RecoveryPayment,
  RestaurantTable,
  Settings,
  StaffAccount,
  Supplier,
  SupplierArrival,
  SupplierPayment,
  TableOrder,
  Waiter,
  WorkPeriod,
} from "./schema";
import type { AdvanceOrder, BookableItem, BookingOrder } from "./booking-schema";
import type { LicenseRecord } from "@/features/licensing/licensing-db";

export class SangiPosDb extends Dexie {
  categories!: Table<Category, string>;
  items!: Table<MenuItem, string>;
  inventory!: Table<InventoryRow, string>;
  inventoryAdjustments!: Table<InventoryAdjustment, string>;
  customers!: Table<CreditCustomer, string>;
  creditPayments!: Table<CreditPayment, string>;
  orders!: Table<Order, string>;
  workPeriods!: Table<WorkPeriod, string>;
  expenses!: Table<Expense, string>;
  suppliers!: Table<Supplier, string>;
  supplierPayments!: Table<SupplierPayment, string>;
  supplierArrivals!: Table<SupplierArrival, string>;
  exportCustomers!: Table<ExportCustomer, string>;
  exportSales!: Table<ExportSale, string>;
  exportPayments!: Table<ExportPayment, string>;
  deliveryPersons!: Table<DeliveryPerson, string>;
  deliveryCustomers!: Table<DeliveryCustomer, string>;
  waiters!: Table<Waiter, string>;
  restaurantTables!: Table<RestaurantTable, string>;
  tableOrders!: Table<TableOrder, string>;
  adminAccount!: Table<AdminAccount, "admin">;
  staffAccounts!: Table<StaffAccount, string>;
  license!: Table<LicenseRecord, "license">;
  advanceOrders!: Table<AdvanceOrder, string>;
  bookableItems!: Table<BookableItem, string>;
  bookingOrders!: Table<BookingOrder, string>;
  settings!: Table<Settings, "app">;
  counters!: Table<Counter, CounterId>;
  recoveryCustomers!: Table<RecoveryCustomer, string>;
  recoveryPayments!: Table<RecoveryPayment, string>;
  labours!: Table<Labour, string>;
  labourTransactions!: Table<LabourTransaction, string>;
  labourAttendance!: Table<LabourAttendance, string>;

  constructor() {
    super("sangi_pos_db_v1");
    // ... keep existing code (versions 1-12)
    this.version(1).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      customers: "id, name, createdAt",
      orders: "id, receiptNo, status, paymentMethod, createdAt",
      settings: "id",
      counters: "id",
    });

    this.version(2).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      orders: "id, receiptNo, status, paymentMethod, createdAt",
      settings: "id",
      counters: "id",
    });

    this.version(3).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      orders: "id, receiptNo, status, paymentMethod, createdAt",
      settings: "id",
      counters: "id",
    });

    this.version(4).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      settings: "id",
      counters: "id",
    });

    this.version(5).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      settings: "id",
      counters: "id",
    });

    this.version(6).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      settings: "id",
      counters: "id",
    });

    this.version(7).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      deliveryPersons: "id, name, createdAt",
      settings: "id",
      counters: "id",
    });

    this.version(8).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      settings: "id",
      counters: "id",
    });

    this.version(9).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      settings: "id",
      counters: "id",
    });

    this.version(10).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      settings: "id",
      counters: "id",
    });

    this.version(11).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      adminAccount: "id",
      staffAccounts: "id, name, role, createdAt",
      settings: "id",
      counters: "id",
    });

    this.version(12).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      adminAccount: "id",
      staffAccounts: "id, name, role, createdAt",
      license: "id",
      settings: "id",
      counters: "id",
    });

    // v13: add export party (wholesale buyers)
    this.version(13).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, createdAt",
      exportCustomers: "id, name, createdAt",
      exportSales: "id, customerId, createdAt",
      exportPayments: "id, customerId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      adminAccount: "id",
      staffAccounts: "id, name, role, createdAt",
      license: "id",
      settings: "id",
      counters: "id",
    });

    // v14: add receiptNo to supplierArrivals and exportSales
    this.version(14).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, receiptNo, createdAt",
      exportCustomers: "id, name, createdAt",
      exportSales: "id, customerId, receiptNo, createdAt",
      exportPayments: "id, customerId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      adminAccount: "id",
      staffAccounts: "id, name, role, createdAt",
      license: "id",
      settings: "id",
      counters: "id",
    });

    // v15: add advance/booking orders
    this.version(15).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, receiptNo, createdAt",
      exportCustomers: "id, name, createdAt",
      exportSales: "id, customerId, receiptNo, createdAt",
      exportPayments: "id, customerId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      adminAccount: "id",
      staffAccounts: "id, name, role, createdAt",
      license: "id",
      advanceOrders: "id, status, createdAt",
      bookableItems: "id, name, createdAt",
      bookingOrders: "id, bookableItemId, status, date, createdAt",
      settings: "id",
      counters: "id",
    });

    // v16: add receiptNo index to advance/booking orders
    this.version(16).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, receiptNo, createdAt",
      exportCustomers: "id, name, createdAt",
      exportSales: "id, customerId, receiptNo, createdAt",
      exportPayments: "id, customerId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      adminAccount: "id",
      staffAccounts: "id, name, role, createdAt",
      license: "id",
      advanceOrders: "id, receiptNo, status, createdAt",
      bookableItems: "id, name, createdAt",
      bookingOrders: "id, receiptNo, bookableItemId, status, date, createdAt",
      settings: "id",
      counters: "id",
    });
    // v17: add recovery module
    this.version(17).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, receiptNo, createdAt",
      exportCustomers: "id, name, createdAt",
      exportSales: "id, customerId, receiptNo, createdAt",
      exportPayments: "id, customerId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      adminAccount: "id",
      staffAccounts: "id, name, role, createdAt",
      license: "id",
      advanceOrders: "id, receiptNo, status, createdAt",
      bookableItems: "id, name, createdAt",
      bookingOrders: "id, receiptNo, bookableItemId, status, date, createdAt",
      recoveryCustomers: "id, name, createdAt",
      recoveryPayments: "id, customerId, receiptNo, agentName, month, createdAt",
      settings: "id",
      counters: "id",
    });
    // v18: add agentId index to recoveryCustomers
    this.version(18).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, receiptNo, createdAt",
      exportCustomers: "id, name, createdAt",
      exportSales: "id, customerId, receiptNo, createdAt",
      exportPayments: "id, customerId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      adminAccount: "id",
      staffAccounts: "id, name, role, createdAt",
      license: "id",
      advanceOrders: "id, receiptNo, status, createdAt",
      bookableItems: "id, name, createdAt",
      bookingOrders: "id, receiptNo, bookableItemId, status, date, createdAt",
      recoveryCustomers: "id, agentId, name, createdAt",
      recoveryPayments: "id, customerId, receiptNo, agentName, month, createdAt",
      settings: "id",
      counters: "id",
    });

    // v19: add labour/wages management
    this.version(19).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, receiptNo, createdAt",
      exportCustomers: "id, name, createdAt",
      exportSales: "id, customerId, receiptNo, createdAt",
      exportPayments: "id, customerId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      adminAccount: "id",
      staffAccounts: "id, name, role, createdAt",
      license: "id",
      advanceOrders: "id, receiptNo, status, createdAt",
      bookableItems: "id, name, createdAt",
      bookingOrders: "id, receiptNo, bookableItemId, status, date, createdAt",
      recoveryCustomers: "id, agentId, name, createdAt",
      recoveryPayments: "id, customerId, receiptNo, agentName, month, createdAt",
      labours: "id, name, createdAt",
      labourTransactions: "id, labourId, type, createdAt",
      settings: "id",
      counters: "id",
    });

    // v20: add daily attendance tracking for labour
    this.version(20).stores({
      categories: "id, name, createdAt",
      items: "id, categoryId, name, price, createdAt",
      inventory: "itemId, quantity, updatedAt",
      inventoryAdjustments: "id, itemId, createdAt",
      customers: "id, name, createdAt",
      creditPayments: "id, customerId, createdAt",
      orders: "id, receiptNo, status, paymentMethod, workPeriodId, deliveryPersonId, createdAt",
      workPeriods: "id, cashier, startedAt, isClosed",
      expenses: "id, name, createdAt, workPeriodId",
      suppliers: "id, name, createdAt",
      supplierPayments: "id, supplierId, createdAt",
      supplierArrivals: "id, supplierId, receiptNo, createdAt",
      exportCustomers: "id, name, createdAt",
      exportSales: "id, customerId, receiptNo, createdAt",
      exportPayments: "id, customerId, createdAt",
      deliveryPersons: "id, name, createdAt",
      deliveryCustomers: "id, name, createdAt",
      waiters: "id, name, createdAt",
      restaurantTables: "id, tableNumber, createdAt",
      tableOrders: "id, tableId, waiterId, status, createdAt, completedAt",
      adminAccount: "id",
      staffAccounts: "id, name, role, createdAt",
      license: "id",
      advanceOrders: "id, receiptNo, status, createdAt",
      bookableItems: "id, name, createdAt",
      bookingOrders: "id, receiptNo, bookableItemId, status, date, createdAt",
      recoveryCustomers: "id, agentId, name, createdAt",
      recoveryPayments: "id, customerId, receiptNo, agentName, month, createdAt",
      labours: "id, name, createdAt",
      labourTransactions: "id, labourId, type, createdAt",
      labourAttendance: "id, labourId, date, status, createdAt",
      settings: "id",
      counters: "id",
    });
  }
}

export const db = new SangiPosDb();
