import { z } from "zod";
import type { Redis } from "ioredis";

export const QuoteSymbol = z.string().trim().toUpperCase().min(1).max(30)
  .regex(/^[A-Z0-9^][A-Z0-9.^=-]*$/);

const ChartResponse = z.object({
  chart: z.object({
    error: z.unknown().nullable(),
    result: z.array(z.object({ meta: z.object({
      symbol: z.string(),
      currency: z.enum(["ARS", "USD"]),
      regularMarketPrice: z.number().finite().positive(),
      regularMarketTime: z.number().int().positive(),
      instrumentType: z.enum(["EQUITY", "ETF", "CRYPTOCURRENCY"]),
    }) })).min(1),
  }),
});

export type MarketQuote = {
  symbol: string;
  price: string;
  currency: "ARS" | "USD";
  marketTime: string;
  source: "yahoo";
};

// Only exact Yahoo symbols: never replace a local security with its US underlying.
export const quoteSymbolFor = (symbol: string, assetType: string): string | null => {
  const parsed = QuoteSymbol.safeParse(symbol);
  if (!parsed.success) return null;
  if (assetType === "cedear") return parsed.data.endsWith(".BA") ? parsed.data : null;
  if (assetType === "crypto") return parsed.data.endsWith("-USD") ? parsed.data : null;
  return assetType === "stock" ? parsed.data : null;
};

export const fetchYahooQuote = async (
  symbol: string,
  fetcher: typeof fetch = fetch
): Promise<MarketQuote> => {
  const ticker = QuoteSymbol.parse(symbol);
  const response = await fetcher(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!response.ok) throw new Error("quote_unavailable");
  const parsed = ChartResponse.parse(await response.json());
  if (parsed.chart.error) throw new Error("quote_unavailable");
  const meta = parsed.chart.result[0]!.meta;
  if (meta.symbol.toUpperCase() !== ticker) throw new Error("quote_symbol_mismatch");
  const marketTime = new Date(meta.regularMarketTime * 1000);
  if (!Number.isFinite(marketTime.getTime()) || marketTime.getTime() > Date.now() + 60000) {
    throw new Error("invalid_quote_time");
  }
  if (Date.now() - marketTime.getTime() > 7 * 24 * 60 * 60 * 1000) {
    throw new Error("stale_quote");
  }
  return {
    symbol: ticker,
    price: String(meta.regularMarketPrice),
    currency: meta.currency,
    marketTime: marketTime.toISOString(),
    source: "yahoo",
  };
};

export const getYahooQuote = async (redis: Redis, symbol: string): Promise<MarketQuote> => {
  const ticker = QuoteSymbol.parse(symbol);
  const key = `investment:quote:yahoo:${ticker}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as MarketQuote;
  const quote = await fetchYahooQuote(ticker);
  await redis.set(key, JSON.stringify(quote), "EX", 15 * 60);
  return quote;
};
