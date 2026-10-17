/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import db from "../app/db.server";
import {
  getOverviewAnalytics,
  getProductDetailAnalytics,
  getCauseDetailAnalytics,
  resolveDateRange,
  normalizeReturnReason,
} from "../app/services/analytics.server";

describe("Unturn Phase 2 — Analytics Engine Tests", () => {
  const shopAlpha = "analytics-alpha.myshopify.com";
  const shopBeta = "analytics-beta.myshopify.com";

  const cleanup = async () => {
    const shops = await db.shop.findMany({
      where: { shopDomain: { in: [shopAlpha, shopBeta] } },
    });
    for (const s of shops) {
      await db.returnLineItem.deleteMany({ where: { return: { shopId: s.id } } });
      await db.return.deleteMany({ where: { shopId: s.id } });
      await db.orderLineItem.deleteMany({ where: { order: { shopId: s.id } } });
      await db.order.deleteMany({ where: { shopId: s.id } });
      await db.productVariant.deleteMany({ where: { shopId: s.id } });
      await db.product.deleteMany({ where: { shopId: s.id } });
    }
    await db.shop.deleteMany({
      where: { shopDomain: { in: [shopAlpha, shopBeta] } },
    });
  };

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("calculates accurate unit return rates with unitsSold as denominator", async () => {
    const shop = await db.shop.create({
      data: {
        shopDomain: shopAlpha,
        currency: "USD",
        ianaTimezone: "UTC",
        name: "Shop Alpha",
      },
    });

    // Seed product and variants for Shop Alpha
    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/1001",
        title: "Performance Running Shoes",
        handle: "performance-running-shoes",
      },
    });

    const variant = await db.productVariant.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        shopifyVariantId: "gid://shopify/ProductVariant/2001",
        title: "Size 10 / Red",
        sku: "RUN-RED-10",
        price: 120.0,
      },
    });

    // Seed 2 orders within July 2026: total 10 units sold
    const order1 = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/3001",
        orderNumber: "1001",
        totalPrice: 480.0,
        currency: "USD",
        processedAt: new Date("2026-07-15T12:00:00Z"),
        financialStatus: "PAID",
      },
    });
    const lineItem1 = await db.orderLineItem.create({
      data: {
        orderId: order1.id,
        productId: product.id,
        variantId: variant.id,
        shopifyLineItemId: "gid://shopify/LineItem/4001",
        title: "Performance Running Shoes",
        sku: "RUN-RED-10",
        quantity: 4,
        unitPrice: 120.0,
      },
    });

    const order2 = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/3002",
        orderNumber: "1002",
        totalPrice: 720.0,
        currency: "USD",
        processedAt: new Date("2026-07-20T12:00:00Z"),
        financialStatus: "PAID",
      },
    });
    await db.orderLineItem.create({
      data: {
        orderId: order2.id,
        productId: product.id,
        variantId: variant.id,
        shopifyLineItemId: "gid://shopify/LineItem/4002",
        title: "Performance Running Shoes",
        sku: "RUN-RED-10",
        quantity: 6,
        unitPrice: 120.0,
      },
    });

    // Seed 1 return on order1 with 2 units returned
    const returnRecord = await db.return.create({
      data: {
        shopId: shop.id,
        orderId: order1.id,
        shopifyReturnId: "gid://shopify/Return/5001",
        status: "OPEN",
        totalRefundAmount: 240.0,
        currency: "USD",
        processedAt: new Date("2026-07-22T10:00:00Z"),
      },
    });
    await db.returnLineItem.create({
      data: {
        returnId: returnRecord.id,
        orderLineItemId: lineItem1.id,
        productId: product.id,
        variantId: variant.id,
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/6001",
        quantity: 2,
        returnReason: "SIZE_TOO_SMALL",
        returnReasonNote: "Too tight around the toes",
      },
    });

    const result = await getOverviewAnalytics(shopAlpha, "July 1 – August 31, 2026");

    expect(result.hasData).toBe(true);
    expect(result.metrics.totalOrders).toBe(2);
    expect(result.metrics.unitsSold).toBe(10);
    expect(result.metrics.returnedUnits).toBe(2);
    expect(result.metrics.returnedOrders).toBe(1);

    // Primary Return Rate: 2 returned units / 10 units sold = 20.0%
    expect(result.metrics.returnRate).toBe("20.0%");
    expect(result.metrics.returnRateNum).toBe(20.0);
    expect(result.metrics.returnRateDenominator).toContain("10 units sold");

    // Product ranking
    expect(result.topProducts.length).toBe(1);
    expect(result.topProducts[0].name).toBe("Performance Running Shoes");
    expect(result.topProducts[0].returns).toBe(2);
    expect(result.topProducts[0].returnRate).toBe("20.0%");
    expect(result.topProducts[0].mainIssue).toBe("Size / Fit");
  });

  it("handles date range filtering properly and isolates excluded windows", async () => {
    const shop = await db.shop.create({
      data: {
        shopDomain: shopAlpha,
        currency: "USD",
        ianaTimezone: "UTC",
        name: "Shop Alpha",
      },
    });

    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/1002",
        title: "Wool Beanie",
      },
    });

    // Order in June 2026 (outside July-August 2026 window)
    const orderOld = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/3003",
        orderNumber: "999",
        totalPrice: 50.0,
        currency: "USD",
        processedAt: new Date("2026-06-15T12:00:00Z"),
      },
    });
    await db.orderLineItem.create({
      data: {
        orderId: orderOld.id,
        productId: product.id,
        shopifyLineItemId: "gid://shopify/LineItem/4003",
        title: "Wool Beanie",
        quantity: 2,
        unitPrice: 25.0,
      },
    });

    // Query July 1 – August 31, 2026
    const result = await getOverviewAnalytics(shopAlpha, "July 1 – August 31, 2026");

    // June order should not be included in July-August window
    expect(result.metrics.totalOrders).toBe(0);
    expect(result.metrics.unitsSold).toBe(0);
    expect(result.metrics.returnedUnits).toBe(0);
    expect(result.metrics.returnRate).toBe("0.0%");
  });

  it("normalizes return reasons and handles unspecified reasons without fabrication", () => {
    // Standard Shopify reasons
    expect(normalizeReturnReason("SIZE_TOO_LARGE").cause).toBe("Size / Fit");
    expect(normalizeReturnReason("SIZE_TOO_SMALL").cause).toBe("Size / Fit");
    expect(normalizeReturnReason("STYLE").cause).toBe("Not as expected");
    expect(normalizeReturnReason("DEFECTIVE").cause).toBe("Damaged / Defective");
    expect(normalizeReturnReason("WRONG_ITEM").cause).toBe("Wrong item sent");
    expect(normalizeReturnReason("QUALITY_ISSUE").cause).toBe("Quality / Fabric");

    // Customer notes fallback
    expect(normalizeReturnReason(null, "The material feels cheap and tore quickly").cause).toBe("Quality / Fabric");
    expect(normalizeReturnReason(null, "Arrived broken with cracked screen").cause).toBe("Damaged / Defective");

    // Unspecified / Missing reasons
    expect(normalizeReturnReason(null, null).cause).toBe("Unspecified / No reason");
    expect(normalizeReturnReason("", "").cause).toBe("Unspecified / No reason");
    expect(normalizeReturnReason("UNKNOWN", "").cause).toBe("Customer mind change / Other");
  });

  it("identifies outlier products with elevated return rates", async () => {
    const shop = await db.shop.create({
      data: {
        shopDomain: shopAlpha,
        currency: "USD",
        ianaTimezone: "UTC",
        name: "Shop Alpha",
      },
    });

    // Seed 2 products: 1 baseline (10% return rate), 1 extreme outlier (60% return rate)
    const productA = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/1003",
        title: "Baseline T-Shirt",
      },
    });
    const productB = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/1004",
        title: "High Return Dress",
      },
    });

    // Order for A: 10 units, 1 returned (10%)
    const orderA = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/3004",
        orderNumber: "1004",
        totalPrice: 200.0,
        currency: "USD",
        processedAt: new Date("2026-07-10T12:00:00Z"),
      },
    });
    const liA = await db.orderLineItem.create({
      data: {
        orderId: orderA.id,
        productId: productA.id,
        shopifyLineItemId: "gid://shopify/LineItem/4004",
        title: "Baseline T-Shirt",
        quantity: 10,
        unitPrice: 20.0,
      },
    });
    const retA = await db.return.create({
      data: {
        shopId: shop.id,
        shopifyReturnId: "gid://shopify/Return/5004",
        orderId: orderA.id,
        processedAt: new Date("2026-07-12T12:00:00Z"),
      },
    });
    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/6004",
        returnId: retA.id,
        orderLineItemId: liA.id,
        productId: productA.id,
        quantity: 1,
        returnReason: "SIZE_TOO_LARGE",
      },
    });

    // Order for B: 10 units, 6 returned (60%)
    const orderB = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/3005",
        orderNumber: "1005",
        totalPrice: 600.0,
        currency: "USD",
        processedAt: new Date("2026-07-11T12:00:00Z"),
      },
    });
    const liB = await db.orderLineItem.create({
      data: {
        orderId: orderB.id,
        productId: productB.id,
        shopifyLineItemId: "gid://shopify/LineItem/4005",
        title: "High Return Dress",
        quantity: 10,
        unitPrice: 60.0,
      },
    });
    const retB = await db.return.create({
      data: {
        shopId: shop.id,
        shopifyReturnId: "gid://shopify/Return/5005",
        orderId: orderB.id,
        processedAt: new Date("2026-07-13T12:00:00Z"),
      },
    });
    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/6005",
        returnId: retB.id,
        orderLineItemId: liB.id,
        productId: productB.id,
        quantity: 6,
        returnReason: "DEFECTIVE",
      },
    });

    const detailB = await getProductDetailAnalytics(shopAlpha, productB.id, "July 1 – August 31, 2026");
    expect(detailB).not.toBeNull();
    expect(detailB?.returnRate).toBe("60.0%");
    expect(detailB?.isOutlier).toBe(true);

    const detailA = await getProductDetailAnalytics(shopAlpha, productA.id, "July 1 – August 31, 2026");
    expect(detailA).not.toBeNull();
    expect(detailA?.returnRate).toBe("10.0%");
    expect(detailA?.isOutlier).toBe(false);
  });

  it("enforces multi-tenant shop isolation strictly", async () => {
    const shopA = await db.shop.create({
      data: {
        shopDomain: shopAlpha,
        currency: "USD",
        ianaTimezone: "UTC",
        name: "Shop Alpha",
      },
    });

    const shopB = await db.shop.create({
      data: {
        shopDomain: shopBeta,
        currency: "EUR",
        ianaTimezone: "UTC",
        name: "Shop Beta",
      },
    });

    // Product in Shop Alpha
    const productAlpha = await db.product.create({
      data: {
        shopId: shopA.id,
        shopifyProductId: "gid://shopify/Product/1005",
        title: "Alpha Exclusive Jacket",
      },
    });
    const orderAlpha = await db.order.create({
      data: {
        shopId: shopA.id,
        shopifyOrderId: "gid://shopify/Order/3006",
        orderNumber: "1006",
        totalPrice: 150.0,
        currency: "USD",
        processedAt: new Date("2026-07-05T12:00:00Z"),
      },
    });
    await db.orderLineItem.create({
      data: {
        orderId: orderAlpha.id,
        productId: productAlpha.id,
        shopifyLineItemId: "gid://shopify/LineItem/4006",
        title: "Alpha Exclusive Jacket",
        quantity: 1,
        unitPrice: 150.0,
      },
    });

    // Product in Shop Beta
    const productBeta = await db.product.create({
      data: {
        shopId: shopB.id,
        shopifyProductId: "gid://shopify/Product/1006",
        title: "Beta Secret Pants",
      },
    });
    const orderBeta = await db.order.create({
      data: {
        shopId: shopB.id,
        shopifyOrderId: "gid://shopify/Order/3007",
        orderNumber: "2001",
        totalPrice: 90.0,
        currency: "EUR",
        processedAt: new Date("2026-07-05T12:00:00Z"),
      },
    });
    await db.orderLineItem.create({
      data: {
        orderId: orderBeta.id,
        productId: productBeta.id,
        shopifyLineItemId: "gid://shopify/LineItem/4007",
        title: "Beta Secret Pants",
        quantity: 1,
        unitPrice: 90.0,
      },
    });

    // Overview query for Alpha should only see Alpha data
    const overviewAlpha = await getOverviewAnalytics(shopAlpha, "July 1 – August 31, 2026");
    expect(overviewAlpha.metrics.totalOrders).toBe(1);
    expect(overviewAlpha.topProducts.some((p) => p.name === "Beta Secret Pants")).toBe(false);

    // Overview query for Beta should only see Beta data
    const overviewBeta = await getOverviewAnalytics(shopBeta, "July 1 – August 31, 2026");
    expect(overviewBeta.metrics.totalOrders).toBe(1);
    expect(overviewBeta.topProducts.some((p) => p.name === "Alpha Exclusive Jacket")).toBe(false);

    // Shop Beta requesting detail for Shop Alpha's product should return null (no data leak)
    const leakedDetail = await getProductDetailAnalytics(shopBeta, productAlpha.id);
    expect(leakedDetail).toBeNull();
  });

  it("resolves date ranges correctly for presets and custom strings", () => {
    const r1 = resolveDateRange("July 1 – August 31, 2026");
    expect(r1.label).toBe("July 1 – August 31, 2026");
    expect(r1.startDate).toBeInstanceOf(Date);
    expect(r1.endDate).toBeInstanceOf(Date);

    // "Last 30 days" must not include dates in parentheses
    const r2 = resolveDateRange("Last 30 days");
    expect(r2.label).toBe("Last 30 days");
    expect(r2.label).not.toContain("(");

    const r3 = resolveDateRange("Last 90 days");
    expect(r3.label).toBe("Last 90 days");

    // Dynamic resolution according to today / reference date:
    // When in mid-September (e.g. 2026-09-15), last month option must show August 1 – 31, 2026
    const midSeptDate = new Date("2026-09-15T12:00:00Z");
    const rMidSept = resolveDateRange(undefined, midSeptDate);
    expect(rMidSept.label).toBe("August 1 – 31, 2026");
    expect(rMidSept.prevLabel).toBe("July 1 – 31, 2026");

    // When in October (e.g. 2026-10-15), last month option must show September 1 – 30, 2026
    const midOctDate = new Date("2026-10-15T12:00:00Z");
    const rMidOct = resolveDateRange(undefined, midOctDate);
    expect(rMidOct.label).toBe("September 1 – 30, 2026");
    expect(rMidOct.prevLabel).toBe("August 1 – 31, 2026");

    // Explicit "Last month" keyword
    const rLastMonth = resolveDateRange("Last month", midOctDate);
    expect(rLastMonth.label).toBe("September 1 – 30, 2026");

    // Quarter calculation
    const rQ4 = resolveDateRange("Q4 2026");
    expect(rQ4.label).toBe("Q4 2026");
    expect(rQ4.prevLabel).toBe("Q3 2026");
  });

  it("calculates cause detail analytics properly", async () => {
    const shop = await db.shop.create({
      data: {
        shopDomain: shopAlpha,
        currency: "USD",
        ianaTimezone: "UTC",
        name: "Shop Alpha",
      },
    });

    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/1007",
        title: "Test Cause Sneaker",
      },
    });

    const order = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/3008",
        orderNumber: "3008",
        totalPrice: 100.0,
        currency: "USD",
        processedAt: new Date("2026-07-15T12:00:00Z"),
      },
    });

    const li = await db.orderLineItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        shopifyLineItemId: "gid://shopify/LineItem/4008",
        title: "Test Cause Sneaker",
        quantity: 2,
        unitPrice: 50.0,
      },
    });

    const ret = await db.return.create({
      data: {
        shopId: shop.id,
        shopifyReturnId: "gid://shopify/Return/5008",
        orderId: order.id,
        processedAt: new Date("2026-07-20T12:00:00Z"),
      },
    });

    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/6008",
        returnId: ret.id,
        orderLineItemId: li.id,
        productId: product.id,
        quantity: 2,
        returnReason: "SIZE_TOO_SMALL",
      },
    });

    const causeDetail = await getCauseDetailAnalytics(shopAlpha, "Size / Fit", "July 1 – August 31, 2026");
    expect(causeDetail).not.toBeNull();
    expect(causeDetail?.causeName).toBe("Size / Fit");
    expect(causeDetail?.returnsCount).toBe(2);
    expect(causeDetail?.topProducts.length).toBe(1);
    expect(causeDetail?.topProducts[0].title).toBe("Test Cause Sneaker");
  });
});
