/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import db from "../app/db.server";
import {
  createIntervention,
  getInterventions,
  getInterventionById,
  updateIntervention,
  deleteIntervention,
} from "../app/services/interventions.server";

describe("Unturn Phase 5 — Intervention Management & Baseline Tracking", () => {
  const shopAlpha = "interventions-alpha.myshopify.com";
  const shopBeta = "interventions-beta.myshopify.com";

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

  it("creates an intervention with captured baseline metrics from historical product data", async () => {
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
        shopifyProductId: "gid://shopify/Product/5501",
        title: "Oversized Flannel Shirt",
      },
    });

    const variant = await db.productVariant.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        shopifyVariantId: "gid://shopify/ProductVariant/5501-L",
        title: "Large / Plaid",
        price: 75.0,
      },
    });

    // 20 sold, 5 returned for Size / Fit (25% return rate)
    const order = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/5501",
        totalPrice: 1500.0,
        currency: "USD",
        processedAt: new Date("2026-07-01T10:00:00Z"),
      },
    });

    const lineItem = await db.orderLineItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        variantId: variant.id,
        shopifyLineItemId: "gid://shopify/LineItem/5501",
        title: "Oversized Flannel Shirt",
        quantity: 20,
        unitPrice: 75.0,
      },
    });

    const ret = await db.return.create({
      data: {
        shopId: shop.id,
        shopifyReturnId: "gid://shopify/Return/5501",
        orderId: order.id,
        totalRefundAmount: 375.0,
        currency: "USD",
        processedAt: new Date("2026-07-10T10:00:00Z"),
      },
    });

    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/5501",
        returnId: ret.id,
        orderLineItemId: lineItem.id,
        productId: product.id,
        variantId: variant.id,
        quantity: 5,
        returnReason: "SIZE_TOO_LARGE",
        returnReasonNote: "Drowns in shoulders",
      },
    });

    // Create intervention for this product
    const intervention = await createIntervention(shopAlpha, {
      title: "Improve Flannel Size Chart & Fit Guide",
      description: "Add chest width and shoulder drop dimensions.",
      productId: product.id,
      cause: "Size / Fit",
      actionType: "SIZE_GUIDE",
      expectedOutcome: "Target 15% reduction in size-related returns",
      status: "IN_PROGRESS",
    });

    expect(intervention).toBeDefined();
    expect(intervention.title).toBe("Improve Flannel Size Chart & Fit Guide");
    expect(intervention.status).toBe("IN_PROGRESS");
    expect(intervention.productId).toBe(product.id);
    expect(intervention.baselineUnitsSold).toBe(20);
    expect(intervention.baselineReturnedUnits).toBe(5);
    expect(intervention.baselineReturnRate).toBe(25.0);
    expect(intervention.baselineCauseFrequency).toBe(5);
    expect(intervention.baselineReliable).toBe(true);
    expect(intervention.completedAt).toBeNull();
  });

  it("handles missing baseline data gracefully by recording limitation instead of fabricating", async () => {
    await db.shop.create({
      data: {
        shopDomain: shopAlpha,
        currency: "USD",
        name: "Shop Alpha",
      },
    });

    const intervention = await createIntervention(shopAlpha, {
      title: "General Store Packaging Overhaul",
      description: "Upgrade bubble wrap and tape for all outgoing boxes.",
      actionType: "PACKAGING",
      status: "PLANNED",
    });

    expect(intervention.baselineReliable).toBe(false);
    expect(intervention.baselineReturnRate).toBeNull();
    expect(intervention.baselineNotes).toContain("No specific product or cause linked");
  });

  it("enforces multi-tenant shop isolation strictly on read, update, and delete", async () => {
    const shopA = await db.shop.create({
      data: { shopDomain: shopAlpha, name: "Shop Alpha" },
    });
    const shopB = await db.shop.create({
      data: { shopDomain: shopBeta, name: "Shop Beta" },
    });

    // Create intervention belonging to Shop A
    const intA = await createIntervention(shopAlpha, {
      title: "Alpha Secret Intervention",
      status: "IN_PROGRESS",
    });

    // Shop B should NOT see Shop A's intervention
    const shopBList = await getInterventions(shopBeta);
    expect(shopBList.find((i) => i.id === intA.id)).toBeUndefined();

    // Shop B cannot fetch Shop A's intervention by ID
    const crossFetch = await getInterventionById(shopBeta, intA.id);
    expect(crossFetch).toBeNull();

    // Shop B cannot update Shop A's intervention
    await expect(
      updateIntervention(shopBeta, intA.id, { title: "Malicious Tamper" })
    ).rejects.toThrow(/Intervention not found or access denied/);

    // Shop B cannot delete Shop A's intervention
    await expect(deleteIntervention(shopBeta, intA.id)).rejects.toThrow(
      /Intervention not found or access denied/
    );

    // Shop A can update its own intervention
    const updated = await updateIntervention(shopAlpha, intA.id, {
      title: "Alpha Updated Intervention",
      notes: "Added review notes.",
    });
    expect(updated.title).toBe("Alpha Updated Intervention");
    expect(updated.notes).toBe("Added review notes.");
  });

  it("records completedAt timestamp when marked COMPLETED and clears it on status revert", async () => {
    await db.shop.create({
      data: { shopDomain: shopAlpha, name: "Shop Alpha" },
    });

    const intervention = await createIntervention(shopAlpha, {
      title: "Audit Product Descriptions",
      status: "IN_PROGRESS",
    });

    expect(intervention.completedAt).toBeNull();

    // Mark completed
    const completed = await updateIntervention(shopAlpha, intervention.id, {
      status: "COMPLETED",
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).not.toBeNull();
    expect(completed.completedAt instanceof Date).toBe(true);

    // Revert status to PAUSED
    const paused = await updateIntervention(shopAlpha, intervention.id, {
      status: "PAUSED",
    });
    expect(paused.status).toBe("PAUSED");
    expect(paused.completedAt).toBeNull();
  });

  it("preserves explicit baseline metrics passed from Take Action recommendation modal", async () => {
    await db.shop.create({
      data: { shopDomain: shopAlpha, name: "Shop Alpha" },
    });

    const intervention = await createIntervention(shopAlpha, {
      title: "Add Size & Fit Chart to Eco Fleece Hoodie",
      description: "High returns due to sizing ambiguity.",
      productId: "Eco Fleece Hoodie",
      cause: "Size / Fit",
      actionType: "SIZE_GUIDE",
      status: "IN_PROGRESS",
      baselineReturnRate: 24.6,
      baselineReturnedUnits: 62,
      baselineUnitsSold: 252,
      baselinePeriod: "Baseline locked at intervention start",
    });

    expect(intervention.baselineReturnRate).toBe(24.6);
    expect(intervention.baselineReturnedUnits).toBe(62);
    expect(intervention.baselineUnitsSold).toBe(252);
    expect(intervention.baselineReliable).toBe(true);

    // Verify getInterventions populates performance before/after calculations
    const list = await getInterventions(shopAlpha);
    const item = list.find((i) => i.id === intervention.id);
    expect(item).toBeDefined();
    expect(item?.performance).toBeDefined();
    expect(item?.performance.baselineReturnRateFormatted).toBe("24.6%");
    expect(item?.performance.isLower).toBe(true);
    expect(item?.performance.trendBadge).toContain("Returns dropped");
    expect(item?.performance.summaryText).toContain("Returns have dropped from 24.6%");
  });

  it("calculates live before vs after performance from post-intervention orders and returns", async () => {
    const shop = await db.shop.create({
      data: { shopDomain: shopAlpha, name: "Shop Alpha" },
    });

    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/9991",
        title: "Standard Canvas Tote",
      },
    });

    const startDate = new Date("2026-08-01T00:00:00Z");

    // Create intervention started on Aug 1 with baseline return rate of 30%
    const intervention = await createIntervention(shopAlpha, {
      title: "Reinforce Canvas Tote Seams",
      productId: product.id,
      cause: "Damaged / Defective",
      actionType: "PACKAGING",
      status: "IN_PROGRESS",
      baselineReturnRate: 30.0,
      baselineReturnedUnits: 30,
      baselineUnitsSold: 100,
      startDate,
    });

    // After Aug 1: 50 units sold, only 5 returned (10% return rate)
    const postOrder = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/post-1",
        totalPrice: 1250.0,
        currency: "USD",
        processedAt: new Date("2026-08-15T12:00:00Z"),
      },
    });

    const lineItem = await db.orderLineItem.create({
      data: {
        orderId: postOrder.id,
        productId: product.id,
        shopifyLineItemId: "gid://shopify/LineItem/post-1",
        title: "Standard Canvas Tote",
        quantity: 50,
        unitPrice: 25.0,
      },
    });

    const postReturn = await db.return.create({
      data: {
        shopId: shop.id,
        shopifyReturnId: "gid://shopify/Return/post-1",
        orderId: postOrder.id,
        totalRefundAmount: 125.0,
        currency: "USD",
        processedAt: new Date("2026-08-20T12:00:00Z"),
      },
    });

    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/post-1",
        returnId: postReturn.id,
        orderLineItemId: lineItem.id,
        productId: product.id,
        quantity: 5,
        returnReason: "DEFECTIVE",
      },
    });

    const fetched = await getInterventionById(shopAlpha, intervention.id);
    expect(fetched).toBeDefined();
    expect(fetched?.performance).toBeDefined();

    const perf = fetched!.performance;
    expect(perf.baselineReturnRate).toBe(30.0);
    expect(perf.currentReturnRate).toBe(10.0);
    expect(perf.changePoints).toBe(-20.0);
    expect(perf.changePointsFormatted).toBe("-20 pp");
    expect(perf.isLower).toBe(true);
    expect(perf.relativeReductionPct).toBe(66.7);
    expect(perf.trend).toBe("positive");
    expect(perf.trendBadge).toContain("Returns dropped");
    expect(perf.summaryText).toContain("Returns dropped from 30% to 10%");
  });
});
