import { db } from "./appDb";
import type { Category, MenuItem, Settings } from "./schema";

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export async function ensureSeedData() {
  // Once seed has run at least once, never re-seed — even if user deletes all data
  const seedDone = localStorage.getItem("sangi_pos.seed_done");
  if (seedDone === "1") {
    // Still ensure settings & counter exist (they're essential)
    await ensureSettingsAndCounter();
    return;
  }

  const hasAnyCategory = (await db.categories.count()) > 0;
  if (!hasAnyCategory) {
    const now = Date.now();
    const catFastFood: Category = { id: id("cat"), name: "Fast Food", createdAt: now };
    const catGrocery: Category = { id: id("cat"), name: "Grocery", createdAt: now };
    const catDrinks: Category = { id: id("cat"), name: "Drinks", createdAt: now };
    await db.categories.bulkAdd([catFastFood, catGrocery, catDrinks]);

    const itemsWithStock: { item: MenuItem; stock: number }[] = [
      // Fast Food (6)
      { item: { id: id("item"), categoryId: catFastFood.id, name: "Burger", price: 500, buyingPrice: 300, trackInventory: true, imagePath: "stock://burger.jpg", createdAt: now }, stock: 50 },
      { item: { id: id("item"), categoryId: catFastFood.id, name: "Pizza", price: 1200, buyingPrice: 700, trackInventory: true, imagePath: "stock://pizza.jpg", createdAt: now }, stock: 30 },
      { item: { id: id("item"), categoryId: catFastFood.id, name: "French Fries", price: 300, buyingPrice: 150, trackInventory: true, imagePath: "stock://fries.jpg", createdAt: now }, stock: 80 },
      { item: { id: id("item"), categoryId: catFastFood.id, name: "Fried Chicken", price: 600, buyingPrice: 350, trackInventory: true, imagePath: "stock://fried-chicken.jpg", createdAt: now }, stock: 40 },
      { item: { id: id("item"), categoryId: catFastFood.id, name: "Hot Dog", price: 350, buyingPrice: 200, trackInventory: true, imagePath: "stock://hotdog.jpg", createdAt: now }, stock: 60 },
      { item: { id: id("item"), categoryId: catFastFood.id, name: "Nuggets", price: 450, buyingPrice: 250, trackInventory: true, imagePath: "stock://nuggets.jpg", createdAt: now }, stock: 45 },
      // Grocery (6)
      { item: { id: id("item"), categoryId: catGrocery.id, name: "Washing Powder", price: 250, buyingPrice: 180, trackInventory: true, imagePath: "stock://washing-powder.jpg", createdAt: now }, stock: 35 },
      { item: { id: id("item"), categoryId: catGrocery.id, name: "Shampoo", price: 350, buyingPrice: 220, trackInventory: true, imagePath: "stock://shampoo.jpg", createdAt: now }, stock: 25 },
      { item: { id: id("item"), categoryId: catGrocery.id, name: "Soap", price: 120, buyingPrice: 70, trackInventory: true, imagePath: "stock://soap.jpg", createdAt: now }, stock: 100 },
      { item: { id: id("item"), categoryId: catGrocery.id, name: "Toothpaste", price: 180, buyingPrice: 110, trackInventory: true, imagePath: "stock://toothpaste.jpg", createdAt: now }, stock: 55 },
      { item: { id: id("item"), categoryId: catGrocery.id, name: "Cooking Oil", price: 450, buyingPrice: 320, trackInventory: true, imagePath: "stock://cooking-oil.jpg", createdAt: now }, stock: 20 },
      { item: { id: id("item"), categoryId: catGrocery.id, name: "Dish Wash", price: 200, buyingPrice: 130, trackInventory: true, imagePath: "stock://dishwash.jpg", createdAt: now }, stock: 40 },
      // Drinks
      { item: { id: id("item"), categoryId: catDrinks.id, name: "Cola", price: 200, buyingPrice: 120, trackInventory: true, imagePath: "stock://coca-cola-bottle.jpg", createdAt: now }, stock: 70 },
    ];
    const items = itemsWithStock.map((x) => x.item);
    await db.items.bulkAdd(items);
    await db.inventory.bulkAdd(itemsWithStock.map((x) => ({ itemId: x.item.id, quantity: x.stock, updatedAt: now })));
  }

  // Mark seed as done so it never runs again
  localStorage.setItem("sangi_pos.seed_done", "1");

  const hasSettings = (await db.settings.count()) > 0;
  if (!hasSettings) {
    const now = Date.now();
    const settings: Settings = {
      id: "app",
      restaurantName: "SANGI POS",
      paperSize: "58",
      receiptSize: "2x3",
      showAddress: false,
      showPhone: false,
      showLogo: false,
      posShowItemImages: true,
      posAutoPrintReceipt: false,
      printerConnection: "none",
      printerName: undefined,
      printerAddress: undefined,
      // All sections enabled by default — user can disable from Settings
      deliveryEnabled: true,
      tableManagementEnabled: true,
      advanceBookingEnabled: true,
      recoveryEnabled: true,
      salesDashboardEnabled: true,
      syncEnabled: true,
      expiryDateEnabled: true,
      skuSearchEnabled: true,
      cashierReportsEnabled: true,
      cashierCancelOrderEnabled: true,
      cashierEndWorkPeriodPendingCheck: true,
      updatedAt: now,
    };
    await db.settings.put(settings);
  }

  const hasReceiptCounter = (await db.counters.count()) > 0;
  if (!hasReceiptCounter) {
    await db.counters.put({ id: "receipt", next: 1 });
  }
}
