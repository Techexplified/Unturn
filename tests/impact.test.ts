/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import db from "../app/db.server";
import { createIntervention, updateIntervention } from "../app/services/interventions.server";
import { calculateInterventionImpact } from "../app/services/impact.server";

describe("Unturn Phase 6 — Intervention Impact Tracking", () => {
  const shopAlpha = "impact-alpha.myshopify.com";
  const shopBeta = "impact-beta.myshopify.com";

  const cleanup = async () => {
    const shops = await db.shop.findMany({
      where: { shopDomain: { in: [shopAlpha, shopBeta] } },
    });
    for (const s of shops) {
      await db.intervention.deleteMany({ where: { shopId: s.id } });
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

  it("calculates accurate before/after impact metrics with percentage points and relative change", async () => {
    const shop = await db.shop.create({
      data: {
        shopDomain: shopAlpha,
        currency: "USD",
        name: "Shop Alpha",
      },
    });

    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/6001",
        title: "Thermal Knit Beanie",
      },
    });

    const startDate = new Date("2026-07-01T00:00:00Z");

    // Baseline: 25% return rate (10 returned out of 40 sold)
    const intervention = await createIntervention(shopAlpha, {
      title: "Improve Beanie Sizing & Fit Guidance",
      productId: product.id,
      cause: "Size / Fit",
      actionType: "SIZE_GUIDE",
      status: "IN_PROGRESS",
      startDate,
      baselineReturnRate: 25.0,
      baselineReturnedUnits: 10,
      baselineUnitsSold: 40,
      baselinePeriod: "30 days prior to launch",
    });

    // Post-implementation orders: 50 units sold at $30
    const postOrder = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/6001-post",
        totalPrice: 1500.0,
        currency: "USD",
        processedAt: new Date("2026-07-15T00:00:00Z"),
      },
    });

    const lineItem = await db.orderLineItem.create({
      data: {
        orderId: postOrder.id,
        productId: product.id,
        shopifyLineItemId: "gid://shopify/LineItem/6001-post",
        title: "Thermal Knit Beanie",
        quantity: 50,
        unitPrice: 30.0,
      },
    });

    // Post-implementation returns: only 5 returned (10.0% return rate)
    const postReturn = await db.return.create({
      data: {
        shopId: shop.id,
        shopifyReturnId: "gid://shopify/Return/6001-post",
        orderId: postOrder.id,
        totalRefundAmount: 150.0,
        currency: "USD",
        processedAt: new Date("2026-07-20T00:00:00Z"),
      },
    });

    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/6001-post",
        returnId: postReturn.id,
        orderLineItemId: lineItem.id,
        productId: product.id,
        quantity: 5,
        returnReason: "SIZE_TOO_SMALL",
      },
    });

    const impact = await calculateInterventionImpact(shopAlpha, intervention.id);
    expect(impact).not.toBeNull();

    // 1. Return rates
    expect(impact!.metrics.baselineReturnRate).toBe(25.0);
    expect(impact!.metrics.postReturnRate).toBe(10.0);
    expect(impact!.metrics.baselineReturnRateFormatted).toBe("25%");
    expect(impact!.metrics.postReturnRateFormatted).toBe("10%");

    // 2. Deltas: absolute percentage points and relative percentage
    // 10% - 25% = -15.0 percentage points
    expect(impact!.metrics.changePercentagePoints).toBe(-15.0);
    expect(impact!.metrics.changePercentagePointsFormatted).toBe("-15 pp");
    // (10 - 25) / 25 * 100 = -60.0% relative reduction
    expect(impact!.metrics.relativeChangePct).toBe(-60.0);
    expect(impact!.metrics.relativeChangeFormatted).toBe("-60%");
    expect(impact!.metrics.isImprovement).toBe(true);

    // 3. Units
    expect(impact!.metrics.baselineReturnedUnits).toBe(10);
    expect(impact!.metrics.postReturnedUnits).toBe(5);
    expect(impact!.metrics.returnedUnitsDelta).toBe(-5);
    expect(impact!.metrics.postUnitsSold).toBe(50);

    // 4. Data sufficiency
    expect(impact!.dataSufficiency.isSufficient).toBe(true);
    expect(impact!.dataSufficiency.status).toBe("SUFFICIENT_DATA");

    // 5. Evaluation and non-causal attribution framing
    expect(impact!.evaluation.observedTrend).toBe("improved");
    expect(impact!.evaluation.trendBadge).toContain("60%");
    expect(impact!.evaluation.attributionNote).toContain("Observed performance change");

    // 6. Financial impact: 50 * 25% = 12.5 expected returns; 5 actual => 7.5 returns avoided * $30 = $225
    expect(impact!.financialImpact.hasFinancialData).toBe(true);
    expect(impact!.financialImpact.estimatedCostSavedNum).toBeGreaterThan(0);
  });

  it("identifies insufficient data when post-implementation order volume is below threshold", async () => {
    const shop = await db.shop.create({
      data: {
        shopDomain: shopAlpha,
        currency: "USD",
        name: "Shop Alpha",
      },
    });

    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/6002",
        title: "Wool Socks",
      },
    });

    const startDate = new Date("2026-08-01T00:00:00Z");

    const intervention = await createIntervention(shopAlpha, {
      title: "Update Sock Sizing Chart",
      productId: product.id,
      cause: "Size / Fit",
      status: "IN_PROGRESS",
      startDate,
      baselineReturnRate: 20.0,
      baselineReturnedUnits: 4,
      baselineUnitsSold: 20,
    });

    // Only 2 units sold post-implementation (threshold is >= 5 units)
    const order = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/6002-small",
        totalPrice: 40.0,
        currency: "USD",
        processedAt: new Date("2026-08-05T00:00:00Z"),
      },
    });

    await db.orderLineItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        shopifyLineItemId: "gid://shopify/LineItem/6002-small",
        title: "Wool Socks",
        quantity: 2,
        unitPrice: 20.0,
      },
    });

    const impact = await calculateInterventionImpact(shopAlpha, intervention.id);
    expect(impact).not.toBeNull();

    expect(impact!.dataSufficiency.isSufficient).toBe(false);
    expect(impact!.dataSufficiency.status).toBe("ACCUMULATING_DATA");
    expect(impact!.dataSufficiency.sampleUnitsSold).toBe(2);
    expect(impact!.dataSufficiency.thresholdUnitsNeeded).toBe(5);
    expect(impact!.evaluation.observedTrend).toBe("accumulating");
    expect(impact!.evaluation.trendBadge).toContain("Accumulating data");
  });

  it("tracks targeted return cause frequency shifts", async () => {
    const shop = await db.shop.create({
      data: {
        shopDomain: shopAlpha,
        currency: "USD",
        name: "Shop Alpha",
      },
    });

    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/6003",
        title: "Leather Boots",
      },
    });

    const startDate = new Date("2026-07-01T00:00:00Z");

    // Baseline: 8 returns specifically for Size / Fit out of 10 total returns
    const intervention = await createIntervention(shopAlpha, {
      title: "Add Width & Arch Measurements to Boot Page",
      productId: product.id,
      cause: "Size / Fit",
      status: "IN_PROGRESS",
      startDate,
      baselineReturnRate: 20.0,
      baselineReturnedUnits: 10,
      baselineUnitsSold: 50,
      baselineCauseFrequency: 8,
    });

    // Post-launch: 20 sold, 2 returned (only 1 for Size / Fit)
    const order = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/6003-post",
        totalPrice: 4000.0,
        currency: "USD",
        processedAt: new Date("2026-07-10T00:00:00Z"),
      },
    });

    const lineItem = await db.orderLineItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        shopifyLineItemId: "gid://shopify/LineItem/6003-post",
        title: "Leather Boots",
        quantity: 20,
        unitPrice: 200.0,
      },
    });

    const ret = await db.return.create({
      data: {
        shopId: shop.id,
        shopifyReturnId: "gid://shopify/Return/6003-post",
        orderId: order.id,
        totalRefundAmount: 400.0,
        currency: "USD",
        processedAt: new Date("2026-07-15T00:00:00Z"),
      },
    });

    // 1 size return, 1 damaged return
    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/6003-1",
        returnId: ret.id,
        orderLineItemId: lineItem.id,
        productId: product.id,
        quantity: 1,
        returnReason: "SIZE_TOO_LARGE",
      },
    });
    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/6003-2",
        returnId: ret.id,
        orderLineItemId: lineItem.id,
        productId: product.id,
        quantity: 1,
        returnReason: "DAMAGED_IN_TRANSIT",
      },
    });

    const impact = await calculateInterventionImpact(shopAlpha, intervention.id);
    expect(impact).not.toBeNull();
    expect(impact!.causeShift).not.toBeNull();

    expect(impact!.causeShift!.cause).toBe("Size / Fit");
    expect(impact!.causeShift!.baselineCount).toBe(8);
    expect(impact!.causeShift!.postCount).toBe(1);
    expect(impact!.causeShift!.isReduced).toBe(true);
  });

  it("enforces multi-tenant shop isolation strictly on impact queries", async () => {
    const shopA = await db.shop.create({
      data: { shopDomain: shopAlpha, name: "Shop Alpha" },
    });
    await db.shop.create({
      data: { shopDomain: shopBeta, name: "Shop Beta" },
    });

    const interventionA = await createIntervention(shopAlpha, {
      title: "Alpha Secret Strategy",
      status: "IN_PROGRESS",
    });

    // Shop Beta cannot access Shop Alpha's intervention impact
    const crossFetch = await calculateInterventionImpact(shopBeta, interventionA.id);
    expect(crossFetch).toBeNull();

    // Shop Alpha can access its own intervention impact
    const ownFetch = await calculateInterventionImpact(shopAlpha, interventionA.id);
    expect(ownFetch).not.toBeNull();
    expect(ownFetch!.interventionId).toBe(interventionA.id);
  });

  it("preserves intervention status when completed or paused while calculating historical impact", async () => {
    await db.shop.create({
      data: { shopDomain: shopAlpha, name: "Shop Alpha" },
    });

    const intervention = await createIntervention(shopAlpha, {
      title: "Completed Project Tracking",
      status: "IN_PROGRESS",
      baselineReturnRate: 22.0,
      baselineReturnedUnits: 22,
      baselineUnitsSold: 100,
    });

    // Mark as COMPLETED
    const completed = await updateIntervention(shopAlpha, intervention.id, {
      status: "COMPLETED",
    });
    expect(completed.status).toBe("COMPLETED");

    // Impact continues calculating without altering status
    const impact = await calculateInterventionImpact(shopAlpha, intervention.id);
    expect(impact).not.toBeNull();
    expect(impact!.status).toBe("COMPLETED");

    // Status remains COMPLETED in database
    const fetched = await db.intervention.findUnique({ where: { id: intervention.id } });
    expect(fetched!.status).toBe("COMPLETED");
  });
});
