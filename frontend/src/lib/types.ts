export type Currency = "ARS" | "USD";

export type AccountType =
  | "checking"
  | "savings"
  | "cash"
  | "credit_card"
  | "investment"
  | "crypto_wallet"
  | "other";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: string;
  closingDay: number | null;
  dueDaysAfterClosing: number | null;
  creditLimit: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TxType = "income" | "expense" | "transfer";
export type TxStatus = "paid" | "pending" | "scheduled";
export type RecurringRule = "weekly" | "biweekly" | "monthly" | "yearly";

export type Transaction = {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: TxType;
  amountArs: string;
  amountUsd: string;
  exchangeRate: string;
  currency: Currency;
  description: string | null;
  paymentMethod: string | null;
  transactionDate: string;
  dueDate: string | null;
  status: TxStatus;
  isRecurring: boolean;
  recurringRule: RecurringRule | null;
  recurringParentId: string | null;
  linkedTransactionId: string | null;
  installmentTotal: number | null;
  installmentCurrent: number | null;
  createdAt: string;
};

export type Category = {
  id: string;
  userId: string;
  name: string;
  type: "income" | "expense";
  color: string;
  icon: string;
  parentId: string | null;
};

export type Rates = { blue: string; oficial: string; mep: string };

export type MonthlySummary = {
  year: number;
  month: number;
  income: { ars: string; usd: string };
  expense: { ars: string; usd: string };
  net: { ars: string; usd: string };
  savingsRate: number | null;
  byCategory: Array<{ categoryId: string | null; ars: string; usd: string }>;
};

export type CreditCardStatus = {
  accountId: string;
  currency: Currency;
  creditLimit: string | null;
  closingDay: number;
  dueDaysAfterClosing: number;
  previousCloseDate: string;
  currentCloseDate: string;
  currentDueDate: string;
  nextCloseDate: string;
  nextDueDate: string;
  currentStatement: { ars: string; usd: string };
  nextStatement: { ars: string; usd: string };
  utilization: number | null;
};
