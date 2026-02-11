import { db } from "./appDb";
import type { Category, MenuItem, Settings } from "./schema";

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export async function ensureSeedData() {
  const hasAnyCategory = (await db.categories.count()) > 0;
  if (!hasAnyCategory) {
    const now = Date.now();
    const catFastFood: Category = { id: id("cat"), name: "Fast Food", createdAt: now };
    const catGrocery: Category = { id: id("cat"), name: "Grocery", createdAt: now };
    const catDrinks: Category = { id: id("cat"), name: "Drinks", createdAt: now };
    await db.categories.bulkAdd([catFastFood, catGrocery, catDrinks]);

    const items: MenuItem[] = [
      // Fast Food (6)
      { id: id("item"), categoryId: catFastFood.id, name: "Burger", price: 500, trackInventory: true, imagePath: "stock://burger.jpg", createdAt: now },
      { id: id("item"), categoryId: catFastFood.id, name: "Pizza", price: 1200, trackInventory: true, imagePath: "stock://pizza.jpg", createdAt: now },
      { id: id("item"), categoryId: catFastFood.id, name: "French Fries", price: 300, trackInventory: true, imagePath: "stock://fries.jpg", createdAt: now },
      { id: id("item"), categoryId: catFastFood.id, name: "Fried Chicken", price: 600, trackInventory: true, imagePath: "stock://fried-chicken.jpg", createdAt: now },
      { id: id("item"), categoryId: catFastFood.id, name: "Hot Dog", price: 350, trackInventory: true, imagePath: "stock://hotdog.jpg", createdAt: now },
      { id: id("item"), categoryId: catFastFood.id, name: "Nuggets", price: 450, trackInventory: true, imagePath: "stock://nuggets.jpg", createdAt: now },
      // Grocery (6)
      { id: id("item"), categoryId: catGrocery.id, name: "Washing Powder", price: 250, trackInventory: true, imagePath: "stock://washing-powder.jpg", createdAt: now },
      { id: id("item"), categoryId: catGrocery.id, name: "Shampoo", price: 350, trackInventory: true, imagePath: "stock://shampoo.jpg", createdAt: now },
      { id: id("item"), categoryId: catGrocery.id, name: "Soap", price: 120, trackInventory: true, imagePath: "stock://soap.jpg", createdAt: now },
      { id: id("item"), categoryId: catGrocery.id, name: "Toothpaste", price: 180, trackInventory: true, imagePath: "stock://toothpaste.jpg", createdAt: now },
      { id: id("item"), categoryId: catGrocery.id, name: "Cooking Oil", price: 450, trackInventory: true, imagePath: "stock://cooking-oil.jpg", createdAt: now },
      { id: id("item"), categoryId: catGrocery.id, name: "Dish Wash", price: 200, trackInventory: true, imagePath: "stock://dishwash.jpg", createdAt: now },
      // Drinks
      { id: id("item"), categoryId: catDrinks.id, name: "Cola", price: 200, trackInventory: true, imagePath: "stock://coca-cola-bottle.jpg", createdAt: now },
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
