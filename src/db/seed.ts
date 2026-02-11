import { db } from "./appDb";
import type { Category, MenuItem, Settings } from "./schema";

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export async function ensureSeedData() {
  const hasAnyCategory = (await db.categories.count()) > 0;
  if (!hasAnyCategory) {
    const now = Date.now();
    const catPizza: Category = { id: id("cat"), name: "Pizza", createdAt: now };
    const catDrinks: Category = { id: id("cat"), name: "Drinks", createdAt: now };
    const catRice: Category = { id: id("cat"), name: "Rice", createdAt: now };
    await db.categories.bulkAdd([catPizza, catDrinks, catRice]);

    const items: MenuItem[] = [
      {
        id: id("item"),
        categoryId: catPizza.id,
        name: "Chicken Pizza",
        price: 1200,
        trackInventory: true,
        createdAt: now,
      },
      {
        id: id("item"),
        categoryId: catPizza.id,
        name: "Veg Pizza",
        price: 1000,
        trackInventory: true,
        createdAt: now,
      },
      {
        id: id("item"),
        categoryId: catDrinks.id,
        name: "Cola",
        price: 200,
        trackInventory: true,
        createdAt: now,
      },
      {
        id: id("item"),
        categoryId: catRice.id,
        name: "Rice",
        price: 500,
        trackInventory: true,
        imagePath: "stock://rice.jpg",
        createdAt: now,
      },
    ];
    await db.items.bulkAdd(items);
    await db.inventory.bulkAdd(items.map((i) => ({ itemId: i.id, quantity: 20, updatedAt: now })));
  }

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
      updatedAt: now,
    };
    await db.settings.put(settings);
  }

  const hasReceiptCounter = (await db.counters.count()) > 0;
  if (!hasReceiptCounter) {
    await db.counters.put({ id: "receipt", next: 1 });
  }
}
