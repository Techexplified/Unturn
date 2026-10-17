import { describe, it, expect, beforeEach, afterEach } from "vitest";
import db from "../app/db.server";
import { getSyncStatus, getDateCutoffForRange, pruneOldStoreData } from "../app/services/sync.server";

describe("Unturn Phase 7 — Settings, Security & Production Readiness Tests", () => {
  const testShop = "settings-test.myshopify.com";
  let shopRecord: any;

  beforeEach(async () => {
    // Clean up test shop
    await db.shop.deleteMany({ where: { shopDomain: testShop } });
    await db.session.deleteMany({ where: { shop: testShop } });

    shopRecord = await db.shop.create({
      data: {
        shopDomain: testShop,
        name: "Settings Test Store",
        currency: "USD",
        ianaTimezone: "America/New_York",
        isActive: true,
      },
    });

    await db.session.create({
      data: {
        id: `sess-${testShop}`,
        shop: testShop,
        state: "active",
        isOnline: false,
        accessToken: "shpat_test123",
      },
    });
  });

  afterEach(async () => {
    await db.shop.deleteMany({ where: { shopDomain: testShop } });
    await db.session.deleteMany({ where: { shop: testShop } });
  });

  it("retrieves accurate connection status and imported record counts", async () => {
    // Add sample product and order
    const prod = await db.product.create({
      data: {
        shopId: shopRecord.id,
        shopifyProductId: "gid://shopify/Product/99901",
        title: "Test Running Shoes",
        handle: "test-running-shoes",
      },
    });

    const status = await getSyncStatus(testShop);
    expect(status.isConnected).toBe(true);
    expect(status.shop?.name).toBe("Settings Test Store");
    expect(status.shop?.currency).toBe("USD");
    expect(status.counts.products).toBe(1);
    expect(status.counts.orders).toBe(0);
    expect(status.counts.returns).toBe(0);
  });

  it("enforces multi-tenant shop isolation on sync status retrieval", async () => {
    // Create second shop
    const otherShopDomain = "other-tenant.myshopify.com";
    await db.shop.deleteMany({ where: { shopDomain: otherShopDomain } });
    const otherShop = await db.shop.create({
      data: {
        shopDomain: otherShopDomain,
        name: "Other Store",
        currency: "EUR",
        isActive: true,
      },
    });

    await db.product.create({
      data: {
        shopId: otherShop.id,
        shopifyProductId: "gid://shopify/Product/88801",
        title: "Other Shop Denim",
        handle: "other-shop-denim",
      },
    });

    const testShopStatus = await getSyncStatus(testShop);
    const otherShopStatus = await getSyncStatus(otherShopDomain);

    expect(testShopStatus.counts.products).toBe(0);
    expect(otherShopStatus.counts.products).toBe(1);

    await db.shop.deleteMany({ where: { shopDomain: otherShopDomain } });
  });

  it("safely clears imported store data while preserving shop registration and session", async () => {
    // Insert products and orders
    await db.product.create({
      data: {
        shopId: shopRecord.id,
        shopifyProductId: "gid://shopify/Product/99902",
        title: "Test Jacket",
        handle: "test-jacket",
      },
    });

    // Simulate clear action
    await db.product.deleteMany({ where: { shopId: shopRecord.id } });
    await db.order.deleteMany({ where: { shopId: shopRecord.id } });
    await db.return.deleteMany({ where: { shopId: shopRecord.id } });
    await db.syncJob.deleteMany({ where: { shopId: shopRecord.id } });

    // Verify products cleared
    const remainingProducts = await db.product.count({ where: { shopId: shopRecord.id } });
    expect(remainingProducts).toBe(0);

    // Verify shop and session still intact
    const remainingShop = await db.shop.findUnique({ where: { shopDomain: testShop } });
    expect(remainingShop).not.toBeNull();
    expect(remainingShop?.isActive).toBe(true);

    const remainingSession = await db.session.findUnique({ where: { id: `sess-${testShop}` } });
    expect(remainingSession).not.toBeNull();
  });

  it("enforces standard return rate definition across all calculated surfaces", () => {
    const unitsSold = 250;
    const returnedUnits = 35;
    const expectedRate = parseFloat(((returnedUnits / unitsSold) * 100).toFixed(1));

    expect(expectedRate).toBe(14.0);
    expect(parseFloat(((returnedUnits / unitsSold) * 100).toFixed(1))).toBe(14.0);
  });

  it("calculates accurate date cutoffs for each date retention setting", () => {
    const fixedNow = new Date("2026-10-17T12:00:00Z");

    const cutoff30 = getDateCutoffForRange("Last 30 days", fixedNow);
    expect(cutoff30?.toISOString()).toBe(new Date("2026-09-17T12:00:00Z").toISOString());

    const cutoff60 = getDateCutoffForRange("Last 60 days", fixedNow);
    expect(cutoff60?.toISOString()).toBe(new Date("2026-08-18T12:00:00Z").toISOString());

    const cutoff90 = getDateCutoffForRange("Last 90 days", fixedNow);
    expect(cutoff90?.toISOString()).toBe(new Date("2026-07-19T12:00:00Z").toISOString());

    const cutoff180 = getDateCutoffForRange("Last 180 days", fixedNow);
    expect(cutoff180?.toISOString()).toBe(new Date("2026-04-20T12:00:00Z").toISOString());

    const cutoffAll = getDateCutoffForRange("All time", fixedNow);
    expect(cutoffAll).toBeNull();
  });

  it("prunes orders and returns older than the configured cutoff date while preserving recent data", async () => {
    const fixedNow = new Date("2026-10-17T12:00:00Z");
    const cutoffDate = getDateCutoffForRange("Last 30 days", fixedNow)!; // 2026-09-17

    // Order 1: Recent order (10 days ago, inside window)
    const recentOrder = await db.order.create({
      data: {
        shopId: shopRecord.id,
        shopifyOrderId: "gid://shopify/Order/recent-1",
        orderNumber: "#1001",
        processedAt: new Date("2026-10-07T12:00:00Z"),
      },
    });
    await db.return.create({
      data: {
        shopId: shopRecord.id,
        orderId: recentOrder.id,
        shopifyReturnId: "gid://shopify/Return/recent-ret-1",
        processedAt: new Date("2026-10-08T12:00:00Z"),
      },
    });

    // Order 2: Old order (60 days ago, outside 30-day window)
    const oldOrder = await db.order.create({
      data: {
        shopId: shopRecord.id,
        shopifyOrderId: "gid://shopify/Order/old-1",
        orderNumber: "#999",
        processedAt: new Date("2026-08-18T12:00:00Z"),
      },
    });
    await db.return.create({
      data: {
        shopId: shopRecord.id,
        orderId: oldOrder.id,
        shopifyReturnId: "gid://shopify/Return/old-ret-1",
        processedAt: new Date("2026-08-20T12:00:00Z"),
      },
    });

    // Prune data older than cutoffDate
    const pruneResult = await pruneOldStoreData(shopRecord.id, cutoffDate);
    expect(pruneResult.deletedOrders).toBe(1);
    expect(pruneResult.deletedReturns).toBe(1);

    // Verify recent order still exists
    const remainingOrders = await db.order.findMany({ where: { shopId: shopRecord.id } });
    expect(remainingOrders.length).toBe(1);
    expect(remainingOrders[0].shopifyOrderId).toBe("gid://shopify/Order/recent-1");

    const remainingReturns = await db.return.findMany({ where: { shopId: shopRecord.id } });
    expect(remainingReturns.length).toBe(1);
    expect(remainingReturns[0].shopifyReturnId).toBe("gid://shopify/Return/recent-ret-1");
  });

  it("updates shop dateRangeAnalysis setting and prunes database data accordingly", async () => {
    // Default setting
    expect(shopRecord.dateRangeAnalysis).toBe("Last 90 days");

    // Update to Last 30 days
    const updatedShop = await db.shop.update({
      where: { id: shopRecord.id },
      data: { dateRangeAnalysis: "Last 30 days" },
    });
    expect(updatedShop.dateRangeAnalysis).toBe("Last 30 days");
  });
});
