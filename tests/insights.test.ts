/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import db from "../app/db.server";
import {
  getOverviewAnalytics,
  getProductDetailAnalytics,
  getCauseDetailAnalytics,
} from "../app/services/analytics.server";

describe("Unturn Phase 3 — Return Insights & Detail Analytics", () => {
  const shopDomain = "insights-test.myshopify.com";

  const cleanup = async () => {
    const shop = await db.shop.findUnique({ where: { shopDomain } });
    if (shop) {
      await db.returnLineItem.deleteMany({ where: { return: { shopId: shop.id } } });
      await db.return.deleteMany({ where: { shopId: shop.id } });
      await db.orderLineItem.deleteMany({ where: { order: { shopId: shop.id } } });
      await db.order.deleteMany({ where: { shopId: shop.id } });
      await db.productVariant.deleteMany({ where: { shopId: shop.id } });
      await db.product.deleteMany({ where: { shopId: shop.id } });
      await db.shop.delete({ where: { id: shop.id } });
    }
  };

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("calculates product detail analytics with variant breakdown and outlier detection", async () => {
    const shop = await db.shop.create({
      data: {
        shopDomain,
        currency: "USD",
        name: "Insights Test Shop",
      },
    });

    const product = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/901",
        title: "Heavyweight Boxy Hoodie",
        handle: "heavyweight-boxy-hoodie",
      },
    });

    const vSmall = await db.productVariant.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        shopifyVariantId: "gid://shopify/ProductVariant/901-S",
        title: "Small / Onyx",
        sku: "HBH-ONX-S",
        price: 90.0,
      },
    });

    const vLarge = await db.productVariant.create({
      data: {
        shopId: shop.id,
        productId: product.id,
        shopifyVariantId: "gid://shopify/ProductVariant/901-L",
        title: "Large / Onyx",
        sku: "HBH-ONX-L",
        price: 90.0,
      },
    });

    // 10 orders of Small (6 returned -> 60% return rate)
    const order1 = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/701",
        orderNumber: "701",
        totalPrice: 900.0,
        currency: "USD",
        processedAt: new Date("2026-07-10T10:00:00Z"),
      },
    });

    const li1 = await db.orderLineItem.create({
      data: {
        orderId: order1.id,
        productId: product.id,
        variantId: vSmall.id,
        shopifyLineItemId: "gid://shopify/LineItem/801",
        title: "Heavyweight Boxy Hoodie - Small",
        quantity: 10,
        unitPrice: 90.0,
      },
    });

    // 10 orders of Large (0 returned -> 0% return rate)
    const li2 = await db.orderLineItem.create({
      data: {
        orderId: order1.id,
        productId: product.id,
        variantId: vLarge.id,
        shopifyLineItemId: "gid://shopify/LineItem/802",
        title: "Heavyweight Boxy Hoodie - Large",
        quantity: 10,
        unitPrice: 90.0,
      },
    });

    const ret1 = await db.return.create({
      data: {
        shopId: shop.id,
        shopifyReturnId: "gid://shopify/Return/901",
        orderId: order1.id,
        processedAt: new Date("2026-07-20T10:00:00Z"),
      },
    });

    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/1001",
        returnId: ret1.id,
        orderLineItemId: li1.id,
        productId: product.id,
        variantId: vSmall.id,
        quantity: 6,
        returnReason: "SIZE_TOO_LARGE",
        returnReasonNote: "Drowns me in shoulders",
      },
    });

    // Verify product detail analytics
    const detail = await getProductDetailAnalytics(shopDomain, product.id, "July 1 – August 31, 2026");
    expect(detail).not.toBeNull();
    expect(detail?.title).toBe("Heavyweight Boxy Hoodie");
    expect(detail?.unitsSold).toBe(20);
    expect(detail?.returnedUnits).toBe(6);
    expect(detail?.returnRate).toBe("30.0%");
    expect(detail?.isOutlier).toBe(true); // 30% > 20% outlier threshold with >=5 sold

    // Variant breakdown checks
    expect(detail?.variants.length).toBe(2);
    const smallVar = detail?.variants.find((v) => v.id === vSmall.id);
    expect(smallVar?.unitsSold).toBe(10);
    expect(smallVar?.returnedUnits).toBe(6);
    expect(smallVar?.returnRate).toBe("60.0%");

    const largeVar = detail?.variants.find((v) => v.id === vLarge.id);
    expect(largeVar?.unitsSold).toBe(10);
    expect(largeVar?.returnedUnits).toBe(0);
    expect(largeVar?.returnRate).toBe("0.0%");

    // Causes breakdown for product
    expect(detail?.causesBreakdown.length).toBe(1);
    expect(detail?.causesBreakdown[0].cause).toBe("Size / Fit");
    expect(detail?.causesBreakdown[0].count).toBe(6);
  });

  it("calculates cause detail analytics with impacted products ranking", async () => {
    const shop = await db.shop.create({
      data: {
        shopDomain,
        currency: "USD",
        name: "Insights Test Shop",
      },
    });

    const p1 = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/902",
        title: "Silk Button-Down",
      },
    });

    const p2 = await db.product.create({
      data: {
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/903",
        title: "Wool Overcoat",
      },
    });

    const order = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/702",
        orderNumber: "702",
        totalPrice: 400.0,
        currency: "USD",
        processedAt: new Date("2026-07-15T12:00:00Z"),
      },
    });

    const li1 = await db.orderLineItem.create({
      data: {
        orderId: order.id,
        productId: p1.id,
        shopifyLineItemId: "gid://shopify/LineItem/803",
        title: "Silk Button-Down",
        quantity: 5,
        unitPrice: 40.0,
      },
    });

    const li2 = await db.orderLineItem.create({
      data: {
        orderId: order.id,
        productId: p2.id,
        shopifyLineItemId: "gid://shopify/LineItem/804",
        title: "Wool Overcoat",
        quantity: 2,
        unitPrice: 100.0,
      },
    });

    const ret = await db.return.create({
      data: {
        shopId: shop.id,
        shopifyReturnId: "gid://shopify/Return/902",
        orderId: order.id,
        processedAt: new Date("2026-07-25T12:00:00Z"),
      },
    });

    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/1002",
        returnId: ret.id,
        orderLineItemId: li1.id,
        productId: p1.id,
        quantity: 3,
        returnReason: "DEFECTIVE",
        returnReasonNote: "Seam ripped along cuff",
      },
    });

    await db.returnLineItem.create({
      data: {
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/1003",
        returnId: ret.id,
        orderLineItemId: li2.id,
        productId: p2.id,
        quantity: 1,
        returnReason: "DEFECTIVE",
        returnReasonNote: "Missing front button",
      },
    });

    const causeData = await getCauseDetailAnalytics(shopDomain, "Damaged / Defective", "July 1 – August 31, 2026");
    expect(causeData).not.toBeNull();
    expect(causeData?.causeName).toBe("Damaged / Defective");
    expect(causeData?.returnsCount).toBe(4);
    expect(causeData?.topProducts.length).toBe(2);
    expect(causeData?.topProducts[0].title).toBe("Silk Button-Down");
    expect(causeData?.topProducts[0].returnsCount).toBe(3);
    expect(causeData?.topProducts[1].title).toBe("Wool Overcoat");
    expect(causeData?.topProducts[1].returnsCount).toBe(1);
  });
});
