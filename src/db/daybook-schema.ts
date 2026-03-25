export type DaybookAccountType = "cash" | "bank";

export type DaybookAccount = {
  id: string;
  name: string; // "Cash" or bank name
  type: DaybookAccountType;
  accountNumber?: string;
  iban?: string;
  balance: number; // current balance in integers
  createdAt: number;
};

export type DaybookEntryType = "payment" | "spending";

export type DaybookEntry = {
  id: string;
  type: DaybookEntryType; // payment = money added, spending = money deducted
  accountId: string; // which account this affects
  accountName?: string; // denormalized for display
  amount: number;
  comment?: string;
  createdAt: number;
};

export type DaybookImage = {
  id: string;
  entryId: string; // links to DaybookEntry
  dataUrl: string; // base64 data URL
  createdAt: number;
};

export type DaybookNote = {
  id: string;
  text: string;
  createdAt: number;
};
