import Decimal from "decimal.js";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Currency } from "./types";

type CurrencyState = {
  displayCurrency: Currency;
  setDisplayCurrency: (currency: Currency) => void;
  toggleDisplayCurrency: () => void;
};

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      displayCurrency: "ARS",
      setDisplayCurrency: (currency) => set({ displayCurrency: currency }),
      toggleDisplayCurrency: () =>
        set((state) => ({
          displayCurrency: state.displayCurrency === "ARS" ? "USD" : "ARS",
        })),
    }),
    {
      name: "metron:display-currency",
    }
  )
);

export const convertStoredAmount = (
  amount: string,
  amountCurrency: Currency,
  targetCurrency: Currency,
  blueRate: string
) => {
  const value = new Decimal(amount);
  const rate = new Decimal(blueRate);

  if (targetCurrency === amountCurrency) return value.toString();
  if (targetCurrency === "ARS") return value.mul(rate).toString();
  return value.div(rate).toString();
};

export const getPreferredAmountFromDual = (
  amounts: { ars: string; usd: string },
  targetCurrency: Currency
) => (targetCurrency === "ARS" ? amounts.ars : amounts.usd);

export const getDualAmountForDisplay = (
  amount: string,
  amountCurrency: Currency,
  targetCurrency: Currency,
  blueRate: string
) => convertStoredAmount(amount, amountCurrency, targetCurrency, blueRate);
