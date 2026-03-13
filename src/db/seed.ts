import { db } from "./appDb";
import type { Category, MenuItem, Settings } from "./schema";

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export async function ensureSeedData() {
  const seedVersion = localStorage.getItem("sangi_pos.seed_version");
  const CURRENT_SEED_VERSION = "2"; // bump this when adding new seed data

  if (seedVersion === CURRENT_SEED_VERSION) {
    await ensureSettingsAndCounter();
    return;
  }

  // If v1 was done but not v2, add only the new categories/items
  if (seedVersion === "1" || localStorage.getItem("sangi_pos.seed_done") === "1") {
    await addV2SeedData();
    localStorage.setItem("sangi_pos.seed_version", CURRENT_SEED_VERSION);
    localStorage.setItem("sangi_pos.seed_done", "1");
    await ensureSettingsAndCounter();
    return;
  }

  const hasAnyCategory = (await db.categories.count()) > 0;
  if (!hasAnyCategory) {
    const now = Date.now();
    const catFastFood: Category = { id: id("cat"), name: "Fast Food", createdAt: now };
    const catGrocery: Category = { id: id("cat"), name: "Grocery", createdAt: now };
    const catDrinks: Category = { id: id("cat"), name: "Drinks", createdAt: now };
    const catClothing: Category = { id: id("cat"), name: "Clothing", createdAt: now };
    const catElectronics: Category = { id: id("cat"), name: "Electronics", createdAt: now };
    const catPharmacy: Category = { id: id("cat"), name: "Pharmacy", createdAt: now };
    const catBakery: Category = { id: id("cat"), name: "Bakery", createdAt: now };
    const catStationery: Category = { id: id("cat"), name: "Stationery", createdAt: now };
    const catFootwear: Category = { id: id("cat"), name: "Footwear & Accessories", createdAt: now };
    await db.categories.bulkAdd([catFastFood, catGrocery, catDrinks, catClothing, catElectronics, catPharmacy, catBakery, catStationery, catFootwear]);

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
      { item: { id: id("item"), categoryId: catDrinks.id, name: "Juice", price: 150, buyingPrice: 80, trackInventory: true, imagePath: "stock://juice.jpg", createdAt: now }, stock: 60 },
      // Clothing
      { item: { id: id("item"), categoryId: catClothing.id, name: "T-Shirt", price: 1500, buyingPrice: 800, trackInventory: true, imagePath: "stock://tshirt.jpg", createdAt: now }, stock: 30 },
      { item: { id: id("item"), categoryId: catClothing.id, name: "Jeans", price: 3500, buyingPrice: 2000, trackInventory: true, imagePath: "stock://jeans.jpg", createdAt: now }, stock: 20 },
      // Electronics
      { item: { id: id("item"), categoryId: catElectronics.id, name: "Smartphone", price: 45000, buyingPrice: 35000, trackInventory: true, imagePath: "stock://smartphone.jpg", createdAt: now }, stock: 10 },
      { item: { id: id("item"), categoryId: catElectronics.id, name: "Earbuds", price: 5000, buyingPrice: 3000, trackInventory: true, imagePath: "stock://earbuds.jpg", createdAt: now }, stock: 25 },
      // Pharmacy
      { item: { id: id("item"), categoryId: catPharmacy.id, name: "Medicine Tablets", price: 150, buyingPrice: 80, trackInventory: true, imagePath: "stock://medicine-tablets.jpg", createdAt: now }, stock: 200 },
      { item: { id: id("item"), categoryId: catPharmacy.id, name: "Cough Syrup", price: 300, buyingPrice: 180, trackInventory: true, imagePath: "stock://cough-syrup.jpg", createdAt: now }, stock: 50 },
      // Bakery
      { item: { id: id("item"), categoryId: catBakery.id, name: "Chocolate Cake", price: 2500, buyingPrice: 1200, trackInventory: true, imagePath: "stock://cake.jpg", createdAt: now }, stock: 10 },
      { item: { id: id("item"), categoryId: catBakery.id, name: "Croissant", price: 250, buyingPrice: 120, trackInventory: true, imagePath: "stock://croissant.jpg", createdAt: now }, stock: 40 },
      // Stationery
      { item: { id: id("item"), categoryId: catStationery.id, name: "Notebook", price: 200, buyingPrice: 100, trackInventory: true, imagePath: "stock://notebook.jpg", createdAt: now }, stock: 100 },
      { item: { id: id("item"), categoryId: catStationery.id, name: "Pen Pack", price: 150, buyingPrice: 70, trackInventory: true, imagePath: "stock://pens.jpg", createdAt: now }, stock: 80 },
      // Footwear & Accessories
      { item: { id: id("item"), categoryId: catFootwear.id, name: "Sports Shoes", price: 4500, buyingPrice: 2500, trackInventory: true, imagePath: "stock://shoes.jpg", createdAt: now }, stock: 15 },
      { item: { id: id("item"), categoryId: catFootwear.id, name: "Handbag", price: 3000, buyingPrice: 1500, trackInventory: true, imagePath: "stock://handbag.jpg", createdAt: now }, stock: 20 },
    ];
    const items = itemsWithStock.map((x) => x.item);
    await db.items.bulkAdd(items);
    await db.inventory.bulkAdd(itemsWithStock.map((x) => ({ itemId: x.item.id, quantity: x.stock, updatedAt: now })));
  }

  // Mark seed as done
  localStorage.setItem("sangi_pos.seed_done", "1");
  localStorage.setItem("sangi_pos.seed_version", CURRENT_SEED_VERSION);

  await ensureSettingsAndCounter();
}

/** Add new categories/items introduced in seed v2 for existing users */
async function addV2SeedData() {
  const now = Date.now();
  const existingCatNames = new Set((await db.categories.toArray()).map(c => c.name));

  const newCats: { cat: Category; items: { item: Omit<MenuItem, "categoryId">; stock: number }[] }[] = [
    {
      cat: { id: id("cat"), name: "Clothing", createdAt: now },
      items: [
        { item: { id: id("item"), name: "T-Shirt", price: 1500, buyingPrice: 800, trackInventory: true, imagePath: "stock://tshirt.jpg", createdAt: now }, stock: 30 },
        { item: { id: id("item"), name: "Jeans", price: 3500, buyingPrice: 2000, trackInventory: true, imagePath: "stock://jeans.jpg", createdAt: now }, stock: 20 },
      ],
    },
    {
      cat: { id: id("cat"), name: "Electronics", createdAt: now },
      items: [
        { item: { id: id("item"), name: "Smartphone", price: 45000, buyingPrice: 35000, trackInventory: true, imagePath: "stock://smartphone.jpg", createdAt: now }, stock: 10 },
        { item: { id: id("item"), name: "Earbuds", price: 5000, buyingPrice: 3000, trackInventory: true, imagePath: "stock://earbuds.jpg", createdAt: now }, stock: 25 },
      ],
    },
    {
      cat: { id: id("cat"), name: "Pharmacy", createdAt: now },
      items: [
        { item: { id: id("item"), name: "Medicine Tablets", price: 150, buyingPrice: 80, trackInventory: true, imagePath: "stock://medicine-tablets.jpg", createdAt: now }, stock: 200 },
        { item: { id: id("item"), name: "Cough Syrup", price: 300, buyingPrice: 180, trackInventory: true, imagePath: "stock://cough-syrup.jpg", createdAt: now }, stock: 50 },
      ],
    },
    {
      cat: { id: id("cat"), name: "Bakery", createdAt: now },
      items: [
        { item: { id: id("item"), name: "Chocolate Cake", price: 2500, buyingPrice: 1200, trackInventory: true, imagePath: "stock://cake.jpg", createdAt: now }, stock: 10 },
        { item: { id: id("item"), name: "Croissant", price: 250, buyingPrice: 120, trackInventory: true, imagePath: "stock://croissant.jpg", createdAt: now }, stock: 40 },
      ],
    },
    {
      cat: { id: id("cat"), name: "Stationery", createdAt: now },
      items: [
        { item: { id: id("item"), name: "Notebook", price: 200, buyingPrice: 100, trackInventory: true, imagePath: "stock://notebook.jpg", createdAt: now }, stock: 100 },
        { item: { id: id("item"), name: "Pen Pack", price: 150, buyingPrice: 70, trackInventory: true, imagePath: "stock://pens.jpg", createdAt: now }, stock: 80 },
      ],
    },
    {
      cat: { id: id("cat"), name: "Footwear & Accessories", createdAt: now },
      items: [
        { item: { id: id("item"), name: "Sports Shoes", price: 4500, buyingPrice: 2500, trackInventory: true, imagePath: "stock://shoes.jpg", createdAt: now }, stock: 15 },
        { item: { id: id("item"), name: "Handbag", price: 3000, buyingPrice: 1500, trackInventory: true, imagePath: "stock://handbag.jpg", createdAt: now }, stock: 20 },
      ],
    },
  ];

  for (const { cat, items } of newCats) {
    if (existingCatNames.has(cat.name)) continue; // skip if already exists
    await db.categories.add(cat);
    const menuItems: MenuItem[] = items.map(x => ({ ...x.item, categoryId: cat.id }));
    await db.items.bulkAdd(menuItems);
    await db.inventory.bulkAdd(items.map((x, i) => ({ itemId: menuItems[i].id, quantity: x.stock, updatedAt: now })));
  }

  // Also add Juice to Drinks if missing
  const drinksCat = (await db.categories.toArray()).find(c => c.name === "Drinks");
  if (drinksCat) {
    const existingItems = await db.items.where("categoryId").equals(drinksCat.id).toArray();
    if (!existingItems.some(i => i.name === "Juice")) {
      const juiceItem: MenuItem = { id: id("item"), categoryId: drinksCat.id, name: "Juice", price: 150, buyingPrice: 80, trackInventory: true, imagePath: "stock://juice.jpg", createdAt: now };
      await db.items.add(juiceItem);
      await db.inventory.add({ itemId: juiceItem.id, quantity: 60, updatedAt: now });
    }
  }
}

async function ensureSettingsAndCounter() {
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
