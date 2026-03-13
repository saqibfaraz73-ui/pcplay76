import riceImg from "@/assets/stock-images/rice.jpg";
import teaImg from "@/assets/stock-images/tea.jpg";
import cocaColaBottleImg from "@/assets/stock-images/coca-cola-bottle.jpg";
import pizzaImg from "@/assets/stock-images/pizza.jpg";
import cocaColaGlassImg from "@/assets/stock-images/coca-cola-glass.png";
import parathaImg from "@/assets/stock-images/paratha.png";
import pepsiImg from "@/assets/stock-images/pepsi.jpg";
import chickenTikkaImg from "@/assets/stock-images/chicken-tikka.jpg";
import chickenKebabImg from "@/assets/stock-images/chicken-kebab.jpg";
import karahiImg from "@/assets/stock-images/karahi.jpg";
import seekhKebabImg from "@/assets/stock-images/seekh-kebab.jpg";
import biryaniImg from "@/assets/stock-images/biryani.jpg";
import burgerImg from "@/assets/stock-images/burger.jpg";
import friesImg from "@/assets/stock-images/fries.jpg";
import naanImg from "@/assets/stock-images/naan.jpg";
import juiceImg from "@/assets/stock-images/juice.jpg";
import waterImg from "@/assets/stock-images/water.jpg";
import friedChickenImg from "@/assets/stock-images/fried-chicken.jpg";
import saladImg from "@/assets/stock-images/salad.jpg";
import hotdogImg from "@/assets/stock-images/hotdog.jpg";
import shawarmaImg from "@/assets/stock-images/shawarma.jpg";
import nuggetsImg from "@/assets/stock-images/nuggets.jpg";
import iceCreamImg from "@/assets/stock-images/ice-cream.jpg";
import chipsImg from "@/assets/stock-images/chips.jpg";
import sandwichImg from "@/assets/stock-images/sandwich.jpg";
import dalImg from "@/assets/stock-images/dal.jpg";
import washingPowderImg from "@/assets/stock-images/washing-powder.jpg";
import shampooImg from "@/assets/stock-images/shampoo.jpg";
import soapImg from "@/assets/stock-images/soap.jpg";
import toothpasteImg from "@/assets/stock-images/toothpaste.jpg";
import cookingOilImg from "@/assets/stock-images/cooking-oil.jpg";
import dishwashImg from "@/assets/stock-images/dishwash.jpg";
import tshirtImg from "@/assets/stock-images/tshirt.jpg";
import jeansImg from "@/assets/stock-images/jeans.jpg";
import smartphoneImg from "@/assets/stock-images/smartphone.jpg";
import earbudsImg from "@/assets/stock-images/earbuds.jpg";
import medicineTabletsImg from "@/assets/stock-images/medicine-tablets.jpg";
import coughSyrupImg from "@/assets/stock-images/cough-syrup.jpg";
import cakeImg from "@/assets/stock-images/cake.jpg";
import croissantImg from "@/assets/stock-images/croissant.jpg";
import notebookImg from "@/assets/stock-images/notebook.jpg";
import pensImg from "@/assets/stock-images/pens.jpg";
import shoesImg from "@/assets/stock-images/shoes.jpg";
import handbagImg from "@/assets/stock-images/handbag.jpg";

export type StockImage = { key: string; label: string; src: string };

export const STOCK_IMAGES: StockImage[] = [
  { key: "stock://biryani.jpg", label: "Biryani", src: biryaniImg },
  { key: "stock://burger.jpg", label: "Burger", src: burgerImg },
  { key: "stock://chicken-kebab.jpg", label: "Chicken Kebab", src: chickenKebabImg },
  { key: "stock://chicken-tikka.jpg", label: "Chicken Tikka", src: chickenTikkaImg },
  { key: "stock://chips.jpg", label: "Chips / Snacks", src: chipsImg },
  { key: "stock://coca-cola-bottle.jpg", label: "Coca-Cola Bottle", src: cocaColaBottleImg },
  { key: "stock://coca-cola-glass.png", label: "Coca-Cola Glass", src: cocaColaGlassImg },
  { key: "stock://cooking-oil.jpg", label: "Cooking Oil", src: cookingOilImg },
  { key: "stock://dal.jpg", label: "Dal / Lentils", src: dalImg },
  { key: "stock://dishwash.jpg", label: "Dish Wash", src: dishwashImg },
  { key: "stock://fried-chicken.jpg", label: "Fried Chicken", src: friedChickenImg },
  { key: "stock://fries.jpg", label: "French Fries", src: friesImg },
  { key: "stock://hotdog.jpg", label: "Hot Dog", src: hotdogImg },
  { key: "stock://ice-cream.jpg", label: "Ice Cream", src: iceCreamImg },
  { key: "stock://juice.jpg", label: "Juice", src: juiceImg },
  { key: "stock://karahi.jpg", label: "Karahi", src: karahiImg },
  { key: "stock://naan.jpg", label: "Naan", src: naanImg },
  { key: "stock://nuggets.jpg", label: "Nuggets", src: nuggetsImg },
  { key: "stock://paratha.png", label: "Paratha / Chapati", src: parathaImg },
  { key: "stock://pepsi.jpg", label: "Pepsi", src: pepsiImg },
  { key: "stock://pizza.jpg", label: "Pizza", src: pizzaImg },
  { key: "stock://rice.jpg", label: "Rice", src: riceImg },
  { key: "stock://salad.jpg", label: "Salad", src: saladImg },
  { key: "stock://sandwich.jpg", label: "Sandwich", src: sandwichImg },
  { key: "stock://seekh-kebab.jpg", label: "Seekh Kebab", src: seekhKebabImg },
  { key: "stock://shampoo.jpg", label: "Shampoo", src: shampooImg },
  { key: "stock://shawarma.jpg", label: "Shawarma / Wrap", src: shawarmaImg },
  { key: "stock://soap.jpg", label: "Soap", src: soapImg },
  { key: "stock://tea.jpg", label: "Tea / Coffee", src: teaImg },
  { key: "stock://toothpaste.jpg", label: "Toothpaste", src: toothpasteImg },
  { key: "stock://washing-powder.jpg", label: "Washing Powder", src: washingPowderImg },
  { key: "stock://water.jpg", label: "Water Bottle", src: waterImg },
];

/** Resolve a stock:// path to an importable src URL */
export function resolveStockImage(path: string): string | null {
  const entry = STOCK_IMAGES.find((s) => s.key === path);
  return entry?.src ?? null;
}
