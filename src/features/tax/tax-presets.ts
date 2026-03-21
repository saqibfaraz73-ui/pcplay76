/** Multi-country tax presets for quick setup */

export type TaxPreset = {
  taxLabel: string;
  taxValue: number; // percentage
  department: string; // tax department name
};

export type CountryTaxConfig = {
  code: string; // ISO 2-letter
  name: string;
  flag: string;
  currency: string;
  currencySymbol: string;
  presets: TaxPreset[];
};

export const TAX_COUNTRIES: CountryTaxConfig[] = [
  {
    code: "PK",
    name: "Pakistan",
    flag: "🇵🇰",
    currency: "PKR",
    currencySymbol: "Rs",
    presets: [
      { taxLabel: "GST", taxValue: 17, department: "FBR (Federal Board of Revenue)" },
      { taxLabel: "GST", taxValue: 18, department: "FBR — Punjab" },
      { taxLabel: "GST", taxValue: 15, department: "FBR — Sindh" },
    ],
  },
  {
    code: "IN",
    name: "India",
    flag: "🇮🇳",
    currency: "INR",
    currencySymbol: "₹",
    presets: [
      { taxLabel: "GST", taxValue: 5, department: "GSTN — 5% (Food & Beverages)" },
      { taxLabel: "GST", taxValue: 12, department: "GSTN — 12% (Standard)" },
      { taxLabel: "GST", taxValue: 18, department: "GSTN — 18% (Services)" },
      { taxLabel: "GST", taxValue: 28, department: "GSTN — 28% (Luxury)" },
    ],
  },
  {
    code: "AE",
    name: "UAE",
    flag: "🇦🇪",
    currency: "AED",
    currencySymbol: "د.إ",
    presets: [
      { taxLabel: "VAT", taxValue: 5, department: "FTA (Federal Tax Authority)" },
    ],
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    flag: "🇸🇦",
    currency: "SAR",
    currencySymbol: "﷼",
    presets: [
      { taxLabel: "VAT", taxValue: 15, department: "ZATCA (Zakat, Tax & Customs Authority)" },
    ],
  },
  {
    code: "GB",
    name: "United Kingdom",
    flag: "🇬🇧",
    currency: "GBP",
    currencySymbol: "£",
    presets: [
      { taxLabel: "VAT", taxValue: 20, department: "HMRC — Standard 20%" },
      { taxLabel: "VAT", taxValue: 5, department: "HMRC — Reduced 5%" },
      { taxLabel: "VAT", taxValue: 0, department: "HMRC — Zero Rated" },
    ],
  },
  {
    code: "US",
    name: "United States",
    flag: "🇺🇸",
    currency: "USD",
    currencySymbol: "$",
    presets: [
      { taxLabel: "Sales Tax", taxValue: 0, department: "State — No Sales Tax (OR, NH, MT, DE, AK)" },
      { taxLabel: "Sales Tax", taxValue: 6, department: "State — ~6% (PA, MI, etc.)" },
      { taxLabel: "Sales Tax", taxValue: 7, department: "State — ~7% (NJ, IN, etc.)" },
      { taxLabel: "Sales Tax", taxValue: 8.25, department: "State — ~8.25% (TX, etc.)" },
    ],
  },
  {
    code: "BD",
    name: "Bangladesh",
    flag: "🇧🇩",
    currency: "BDT",
    currencySymbol: "৳",
    presets: [
      { taxLabel: "VAT", taxValue: 15, department: "NBR (National Board of Revenue)" },
      { taxLabel: "VAT", taxValue: 7.5, department: "NBR — Reduced" },
      { taxLabel: "VAT", taxValue: 5, department: "NBR — Trimmed" },
    ],
  },
  {
    code: "TR",
    name: "Turkey",
    flag: "🇹🇷",
    currency: "TRY",
    currencySymbol: "₺",
    presets: [
      { taxLabel: "KDV", taxValue: 20, department: "GİB — Standard 20%" },
      { taxLabel: "KDV", taxValue: 10, department: "GİB — Reduced 10%" },
      { taxLabel: "KDV", taxValue: 1, department: "GİB — Super Reduced 1%" },
    ],
  },
  {
    code: "MY",
    name: "Malaysia",
    flag: "🇲🇾",
    currency: "MYR",
    currencySymbol: "RM",
    presets: [
      { taxLabel: "SST", taxValue: 6, department: "RMCD — Service Tax 6%" },
      { taxLabel: "SST", taxValue: 10, department: "RMCD — Sales Tax 10%" },
    ],
  },
  {
    code: "ZA",
    name: "South Africa",
    flag: "🇿🇦",
    currency: "ZAR",
    currencySymbol: "R",
    presets: [
      { taxLabel: "VAT", taxValue: 15, department: "SARS (South African Revenue Service)" },
    ],
  },
];
