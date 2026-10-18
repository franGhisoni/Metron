import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { fetchYahooQuote, getYahooQuote, quoteSymbolFor } from "../dist/modules/investments/quotes.js";

const payload = (changes = {}) => ({ chart: { error: null, result: [{ meta: {
  symbol: "AAPL", currency: "USD", regularMarketPrice: 200,
  regularMarketTime: Math.floor(Date.now() / 1000), instrumentType: "EQUITY", ...changes,
} }] } });
const fetcher = (data) => async () => ({ ok: true, json: async () => data });

test("exact market symbols prevent substitution of a CEDEAR with its underlying", () => {
  assert.equal(quoteSymbolFor("aapl", "cedear"), null);
  assert.equal(quoteSymbolFor("aapl.ba", "cedear"), "AAPL.BA");
  assert.equal(quoteSymbolFor("BTC", "crypto"), null);
  assert.equal(quoteSymbolFor("btc-usd", "crypto"), "BTC-USD");
  assert.equal(quoteSymbolFor("GGAL.BA", "stock"), "GGAL.BA");
  for (const type of ["bond", "fci", "plazo_fijo", "other"]) {
    assert.equal(quoteSymbolFor("AAPL", type), null);
  }
  assert.equal(quoteSymbolFor("../AAPL?x=1", "stock"), null);
});

test("valid prices preserve the provider currency and market timestamp", async () => {
  const data = payload();
  const quote = await fetchYahooQuote("aapl", fetcher(data));
  assert.equal(quote.price, "200");
  assert.equal(quote.currency, "USD");
  assert.equal(quote.marketTime, new Date(data.chart.result[0].meta.regularMarketTime * 1000).toISOString());
  assert.equal((await fetchYahooQuote("AAPL", fetcher(payload({ currency: "ARS" })))).currency, "ARS");
});

test("invalid, unsupported, stale and mismatched quotes are rejected", async () => {
  for (const changes of [
    { regularMarketPrice: 0 }, { regularMarketPrice: -1 }, { regularMarketPrice: null },
    { currency: "EUR" }, { symbol: "MSFT" }, { instrumentType: "BOND" },
    { regularMarketTime: 1 }, { regularMarketTime: Math.floor(Date.now() / 1000) + 3600 },
  ]) await assert.rejects(fetchYahooQuote("AAPL", fetcher(payload(changes))));
  await assert.rejects(fetchYahooQuote("AAPL", async () => ({ ok: false })));
  await assert.rejects(fetchYahooQuote("AAPL", fetcher({ chart: { error: { code: "Not Found" }, result: null } })));
  await assert.rejects(fetchYahooQuote("AAPL", async () => { throw new Error("timeout"); }));
});

test("cached symbols avoid another provider request", async () => {
  const quote = { symbol: "AAPL", price: "200", currency: "USD", marketTime: new Date().toISOString(), source: "yahoo" };
  assert.deepEqual(await getYahooQuote({ get: async (key) => {
    assert.equal(key, "investment:quote:yahoo:AAPL");
    return JSON.stringify(quote);
  } }, "aapl"), quote);
});

// The route dependencies only need configuration, no external database or Redis.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost/test";
process.env.REDIS_URL ??= "redis://localhost:6379";
for (const name of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "COOKIE_SECRET"]) {
  process.env[name] ??= "test-secret-for-investment-tests";
}
const { default: investmentRoutes } = await import("../dist/modules/investments/routes.js");

const fixture = async () => {
  const writes = [];
  const quote = { symbol: "AAPL", price: "200", currency: "USD", marketTime: new Date().toISOString(), source: "yahoo" };
  const rows = [
    { id: "stock", symbol: "AAPL", assetType: "stock", updatedAt: new Date(), lastPriceUpdatedAt: null },
    { id: "manual", symbol: "FCI", assetType: "fci" },
    { id: "failed", symbol: "FAIL", assetType: "stock" },
    { id: "newer", symbol: "AAPL", assetType: "stock", lastPriceUpdatedAt: new Date(Date.now() + 10000) },
  ];
  const app = Fastify();
  app.decorate("authenticate", async (req, reply) => {
    if (req.headers.authorization !== "Bearer test") return reply.code(401).send();
    req.userId = "user-1";
  });
  app.decorate("prisma", { investment: {
    findMany: async ({ where }) => { assert.equal(where.userId, "user-1"); return rows; },
    updateMany: async (args) => { writes.push(args); return { count: 1 }; },
  } });
  app.decorate("redis", { get: async (key) => {
    if (key === "rate:blue:current") return JSON.stringify({ rate: "1000" });
    if (key.endsWith(":FAIL")) throw new Error("provider unavailable");
    return JSON.stringify(quote);
  } });
  await app.register(investmentRoutes, { prefix: "/api/investments" });
  return { app, writes };
};

test("refresh requires authentication", async () => {
  const { app, writes } = await fixture();
  try {
    assert.equal((await app.inject({ method: "POST", url: "/api/investments/refresh-prices" })).statusCode, 401);
    assert.equal(writes.length, 0);
  } finally { await app.close(); }
});

test("refresh converts with current blue, preserves newer/manual/failed values and scopes writes", async () => {
  const { app, writes } = await fixture();
  try {
    const response = await app.inject({ method: "POST", url: "/api/investments/refresh-prices", headers: { authorization: "Bearer test" } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().results.map((r) => r.status), ["updated", "skipped", "error", "skipped"]);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].where.userId, "user-1");
    assert.equal(writes[0].where.id, "stock");
    assert.ok(writes[0].where.updatedAt instanceof Date);
    assert.equal(writes[0].data.currentPriceArs.toString(), "200000");
    assert.equal(writes[0].data.currentPriceUsd.toString(), "200");
    assert.equal(writes[0].data.purchasePriceUsd, undefined);
  } finally { await app.close(); }
});
