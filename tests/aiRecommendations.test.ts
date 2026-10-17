/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import db from "../app/db.server";
import {
  fetchProductAnalyticsContext,
  generateProductAIInsights,
  synthesizeFallbackResponse,
} from "../app/services/aiRecommendations.server";
import { loader as apiLoader } from "../app/routes/api.ai.recommendation.$id";

describe("Unturn — Product-Specific AI Recommendation & Impact Modal", () => {
  const shopDomain = "ai-test-store.myshopify.com";

  const cleanup = async () => {
    const shops = await db.shop.findMany({
      where: { shopDomain: { in: [shopDomain, "demo.myshopify.com"] } },
    });
    for (const shop of shops) {
      await db.returnLineItem.deleteMany({ where: { return: { shopId: shop.id } } });
      await db.return.deleteMany({ where: { shopId: shop.id } });
      await db.orderLineItem.deleteMany({ where: { order: { shopId: shop.id } } });
      await db.order.deleteMany({ where: { shopId: shop.id } });
      await db.productVariant.deleteMany({ where: { shopId: shop.id } });
      await db.product.deleteMany({ where: { shopId: shop.id } });
    }
    await db.shop.deleteMany({
      where: { shopDomain: { in: [shopDomain, "demo.myshopify.com"] } },
    });
  };

  const seedDemoStore = async () => {
    const shop = await db.shop.create({
      data: {
        shopDomain: "demo.myshopify.com",
        name: "Demo Store",
        currency: "INR",
        isActive: true,
      },
    });

    const now = new Date();
    const orderDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 10, 12, 0, 0));
    const returnDate = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0));

    // 1. Oversized Hoodie (p1) - 203 sold, 50 returned (24.6% return rate)
    // 31 size/fit returns (62% share)
    const hoodie = await db.product.create({
      data: {
        id: "p1",
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/1001",
        title: "Oversized Hoodie",
        handle: "oversized-hoodie",
        imageUrl: "/products/hoodie.jpg",
      },
    });

    const hoodieOrder = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/1001",
        orderNumber: "#1001",
        processedAt: orderDate,
        currency: "INR",
      },
    });

    const hoodieLineItem = await db.orderLineItem.create({
      data: {
        orderId: hoodieOrder.id,
        productId: hoodie.id,
        shopifyLineItemId: "gid://shopify/LineItem/1001",
        title: "Oversized Hoodie - M",
        quantity: 203,
        unitPrice: 980,
      },
    });

    const hoodieReturn = await db.return.create({
      data: {
        shopId: shop.id,
        orderId: hoodieOrder.id,
        shopifyReturnId: "gid://shopify/Return/1001",
        totalRefundAmount: 49000,
        currency: "INR",
        processedAt: returnDate,
      },
    });

    await db.returnLineItem.create({
      data: {
        returnId: hoodieReturn.id,
        productId: hoodie.id,
        orderLineItemId: hoodieLineItem.id,
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/1001-1",
        quantity: 31,
        returnReason: "TOO_LARGE",
        returnReasonNote: "The sleeves cover my whole hands and the torso is way too baggy compared to the photos.",
      },
    });

    await db.returnLineItem.create({
      data: {
        returnId: hoodieReturn.id,
        productId: hoodie.id,
        orderLineItemId: hoodieLineItem.id,
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/1001-2",
        quantity: 19,
        returnReason: "DEFECTIVE",
        returnReasonNote: "Fabric feels different than expected.",
      },
    });

    // 2. Classic Shirt (p2) - 275 sold, 50 returned (18.2% return rate)
    // 27 not as expected returns (54% share)
    const shirt = await db.product.create({
      data: {
        id: "p2",
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/1002",
        title: "Classic Shirt",
        handle: "classic-shirt",
        imageUrl: "/products/shirt.jpg",
      },
    });

    const shirtOrder = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/1002",
        orderNumber: "#1002",
        processedAt: orderDate,
        currency: "INR",
      },
    });

    const shirtLineItem = await db.orderLineItem.create({
      data: {
        orderId: shirtOrder.id,
        productId: shirt.id,
        shopifyLineItemId: "gid://shopify/LineItem/1002",
        title: "Classic Shirt - L",
        quantity: 275,
        unitPrice: 850,
      },
    });

    const shirtReturn = await db.return.create({
      data: {
        shopId: shop.id,
        orderId: shirtOrder.id,
        shopifyReturnId: "gid://shopify/Return/1002",
        totalRefundAmount: 42500,
        currency: "INR",
        processedAt: returnDate,
      },
    });

    await db.returnLineItem.create({
      data: {
        returnId: shirtReturn.id,
        productId: shirt.id,
        orderLineItemId: shirtLineItem.id,
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/1002-1",
        quantity: 27,
        returnReason: "STYLE",
        returnReasonNote: "Color is significantly darker in person than on product listing photography.",
      },
    });

    await db.returnLineItem.create({
      data: {
        returnId: shirtReturn.id,
        productId: shirt.id,
        orderLineItemId: shirtLineItem.id,
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/1002-2",
        quantity: 23,
        returnReason: "DEFECTIVE",
        returnReasonNote: "Button loose on sleeve.",
      },
    });

    // 3. Balance store volume so storeReturnRate is exactly 12.1%
    // Current sold: 203 + 275 = 478. Current returns: 50 + 50 = 100.
    // Target: 121 returns out of 1000 sold (12.1%).
    const otherProduct = await db.product.create({
      data: {
        id: "p3",
        shopId: shop.id,
        shopifyProductId: "gid://shopify/Product/1003",
        title: "Standard Chino Pants",
        handle: "standard-chino-pants",
      },
    });

    const otherOrder = await db.order.create({
      data: {
        shopId: shop.id,
        shopifyOrderId: "gid://shopify/Order/1003",
        orderNumber: "#1003",
        processedAt: orderDate,
        currency: "INR",
      },
    });

    const otherLineItem = await db.orderLineItem.create({
      data: {
        orderId: otherOrder.id,
        productId: otherProduct.id,
        shopifyLineItemId: "gid://shopify/LineItem/1003",
        title: "Chino Pants",
        quantity: 522,
        unitPrice: 1200,
      },
    });

    const otherReturn = await db.return.create({
      data: {
        shopId: shop.id,
        orderId: otherOrder.id,
        shopifyReturnId: "gid://shopify/Return/1003",
        totalRefundAmount: 25200,
        currency: "INR",
        processedAt: returnDate,
      },
    });

    await db.returnLineItem.create({
      data: {
        returnId: otherReturn.id,
        productId: otherProduct.id,
        orderLineItemId: otherLineItem.id,
        shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/1003-1",
        quantity: 21,
        returnReason: "SIZE_TOO_SMALL",
      },
    });
  };

  beforeEach(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  describe("1. Distinct Analytics & AI Insights for Products with Different Patterns", () => {
    it("generates distinct, evidence-based content for Size/Fit product vs Not-as-expected product", async () => {
      await seedDemoStore();

      // Product 1: Oversized Hoodie (Size / Fit driven)
      const ctxHoodie = await fetchProductAnalyticsContext("demo.myshopify.com", "p1");
      const resHoodie = await generateProductAIInsights(ctxHoodie, false);

      // Product 2: Classic Shirt (Not as expected driven)
      const ctxShirt = await fetchProductAnalyticsContext("demo.myshopify.com", "p2");
      const resShirt = await generateProductAIInsights(ctxShirt, false);

      // 1. Verify different product identities
      expect(resHoodie.productTitle).toBe("Oversized Hoodie");
      expect(resShirt.productTitle).toBe("Classic Shirt");

      // 2. Verify accurate metrics match respective product data
      expect(resHoodie.metrics.productReturnRate).toBe("24.6%");
      expect(resHoodie.metrics.topCause).toBe("Size / Fit");
      expect(resHoodie.metrics.topCauseShare).toBe("62%");
      expect(resHoodie.metrics.storeReturnRate).toBe("12.1%");
      expect(resHoodie.metrics.diffPercentagePoints).toBe("+12.5 percentage points");

      expect(resShirt.metrics.productReturnRate).toBe("18.2%");
      expect(resShirt.metrics.topCause).toBe("Not as expected");
      expect(resShirt.metrics.topCauseShare).toBe("54%");
      expect(resShirt.metrics.storeReturnRate).toBe("12.1%");
      expect(resShirt.metrics.diffPercentagePoints).toBe("+6.1 percentage points");

      // 3. Verify explanations are completely different and product-specific
      expect(resHoodie.explanation).not.toBe(resShirt.explanation);
      expect(resHoodie.explanation.toLowerCase()).toContain("hoodie");
      expect(resShirt.explanation.toLowerCase()).toContain("shirt");

      // 4. Verify 3 dynamic impact items exist for both
      expect(resHoodie.impactItems).toHaveLength(3);
      expect(resShirt.impactItems).toHaveLength(3);
      expect(resHoodie.impactItems[0]).not.toBe(resShirt.impactItems[0]);

      // 5. Verify customer feedback quotes are specific to product category
      expect(resHoodie.customerFeedbackSample[0]).toContain("sleeves");
      expect(resShirt.customerFeedbackSample[0]).toContain("Color");
    });

    it("synthesizes deterministic, defensible impact numbers without hallucination", () => {
      const mockContext: any = {
        productId: "prod-abc",
        productTitle: "Linen Trousers",
        unitsSold: 200,
        returnedUnits: 30,
        productReturnRateNum: 15.0,
        productReturnRate: "15.0%",
        storeReturnRateNum: 10.0,
        storeReturnRate: "10.0%",
        diffPercentagePointsNum: 5.0,
        diffPercentagePoints: "+5.0 percentage points",
        primaryCause: {
          cause: "Size / Fit",
          issueType: "size-fit",
          count: 20,
          shareNum: 66.7,
          share: "66.7%",
        },
        causesBreakdown: [
          { cause: "Size / Fit", issueType: "size-fit", count: 20, shareNum: 66.7, share: "66.7%" },
        ],
        customerComments: ["Waist fits tight"],
        variants: [],
        actualReturnCostNum: 30000,
        actualReturnCost: "₹30,000",
        currency: "INR",
        hasFinancialData: true,
        preventability: "Potentially preventable",
        preventabilityRationale: "Sizing guidance can mitigate fit discrepancies.",
        isSampleReliable: true,
        defensibleReductionPct: 20,
        defensibleTargetRate: "12.0%",
        defensibleSavingsNum: 6000,
        defensibleSavings: "₹6,000",
        activeInterventionsCount: 0,
        interventionTitles: [],
      };

      const result = synthesizeFallbackResponse(mockContext);

      // Verify explanation accurately articulates comparison to store average
      expect(result.explanation).toContain("Linen Trousers");
      expect(result.explanation).toContain("15.0%");
      expect(result.explanation).toContain("+5.0 percentage points higher than your store average (10.0%)");
      expect(result.explanation).toContain("Size / Fit");

      // Verify Impact Item 1 specifies defensible reduction
      expect(result.impactItems[0]).toBe("Reduce return rate by up to 20% (targeting ~12.0%)");

      // Verify Impact Item 2 specifies defensible savings
      expect(result.impactItems[1]).toBe("Save an estimated ₹6,000 in return costs");

      // Verify Impact Item 3 specifies secondary benefit
      expect(result.impactItems[2]).toContain("sizing confidence");
    });

    it("displays appropriate limitations when sample size is insufficient", () => {
      const insufficientContext: any = {
        productId: "prod-rare",
        productTitle: "Silk Kimono",
        unitsSold: 2,
        returnedUnits: 1,
        productReturnRateNum: 50.0,
        productReturnRate: "50.0%",
        storeReturnRateNum: 12.0,
        storeReturnRate: "12.0%",
        diffPercentagePointsNum: 38.0,
        diffPercentagePoints: "+38.0 percentage points",
        primaryCause: {
          cause: "Not as expected",
          issueType: "not-as-expected",
          count: 1,
          shareNum: 100,
          share: "100.0%",
        },
        causesBreakdown: [
          { cause: "Not as expected", issueType: "not-as-expected", count: 1, shareNum: 100, share: "100.0%" },
        ],
        customerComments: [],
        variants: [],
        actualReturnCostNum: 0,
        actualReturnCost: "₹0",
        currency: "INR",
        hasFinancialData: false,
        preventability: "Insufficient data to assess",
        preventabilityRationale: "Insufficient returns to detect pattern.",
        isSampleReliable: false,
        defensibleReductionPct: 0,
        defensibleTargetRate: "50.0%",
        defensibleSavingsNum: 0,
        defensibleSavings: "₹0",
        activeInterventionsCount: 0,
        interventionTitles: [],
      };

      const result = synthesizeFallbackResponse(insufficientContext);

      // Must explain data limitations
      expect(result.explanation).toContain("Additional order and return volume is needed");
      expect(result.metrics.isEstimatedReliable).toBe(false);
      expect(result.metrics.sampleSizeMessage).toContain("too low for high-confidence predictions");

      // Must NOT present an unsupported prediction as a guaranteed result
      expect(result.impactItems[0]).toContain("Target 10%–15% return rate stabilization with expanded sample tracking");
      expect(result.impactItems[1]).toContain("Establish baseline return-cost tracking once refund amounts are recorded");
    });
  });

  describe("2. Database Multi-Tenant Isolation with Real Store Orders", () => {
    it("fetches live product return reasons and customer notes from database", async () => {
      // 1. Create a shop
      const shop = await db.shop.create({
        data: {
          shopDomain,
          name: "AI Test Store",
          currency: "INR",
        },
      });

      // 2. Create Product A (High Sizing returns with customer verbatim)
      const prodA = await db.product.create({
        data: {
          shopId: shop.id,
          shopifyProductId: "gid://shopify/Product/9901",
          title: "Winter Parka Coat",
          handle: "winter-parka-coat",
        },
      });

      // 3. Create Orders and Returns for Product A
      const orderA1 = await db.order.create({
        data: {
          shopId: shop.id,
          shopifyOrderId: "gid://shopify/Order/99011",
          orderNumber: "#99011",
          processedAt: new Date("2026-07-15T00:00:00Z"),
          currency: "INR",
        },
      });

      const orderLineA1 = await db.orderLineItem.create({
        data: {
          orderId: orderA1.id,
          productId: prodA.id,
          shopifyLineItemId: "gid://shopify/LineItem/990111",
          title: "Winter Parka Coat - L",
          quantity: 10,
          unitPrice: 4500,
        },
      });

      const returnA = await db.return.create({
        data: {
          shopId: shop.id,
          orderId: orderA1.id,
          shopifyReturnId: "gid://shopify/Return/99011",
          totalRefundAmount: 13500,
          currency: "INR",
          processedAt: new Date("2026-07-20T00:00:00Z"),
        },
      });

      await db.returnLineItem.create({
        data: {
          returnId: returnA.id,
          productId: prodA.id,
          orderLineItemId: orderLineA1.id,
          shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/990111",
          quantity: 3,
          returnReason: "TOO_LARGE",
          returnReasonNote: "Coat fits one size larger than normal heavy coats",
        },
      });

      // 4. Fetch context for this live DB product
      const context = await fetchProductAnalyticsContext(shopDomain, prodA.id);

      expect(context.productTitle).toBe("Winter Parka Coat");
      expect(context.unitsSold).toBe(10);
      expect(context.returnedUnits).toBe(3);
      expect(context.productReturnRateNum).toBe(30);
      expect(context.productReturnRate).toBe("30.0%");
      expect(context.actualReturnCostNum).toBe(13500);
      expect(context.primaryCause?.cause).toBe("Size / Fit");
      expect(context.customerComments).toContain("Coat fits one size larger than normal heavy coats");

      // 5. Generate AI insights
      const insights = await generateProductAIInsights(context, false);
      expect(insights.productTitle).toBe("Winter Parka Coat");
      expect(insights.metrics.productReturnRate).toBe("30.0%");
      expect(insights.metrics.topCause).toBe("Size / Fit");
      expect(insights.impactItems).toHaveLength(3);
    });
  });

  describe("3. API Route Integration", () => {
    it("serves structured JSON for API route GET /api/ai/recommendation/:id", async () => {
      await seedDemoStore();
      const request = new Request("http://localhost:3000/api/ai/recommendation/p1");
      const response = await apiLoader({
        request,
        params: { id: "p1" },
        context: {},
      } as any);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("application/json");

      const body = await response.json();
      expect(body.productTitle).toBe("Oversized Hoodie");
      expect(body.explanation).toBeTruthy();
      expect(Array.isArray(body.impactItems)).toBe(true);
      expect(body.impactItems).toHaveLength(3);
      expect(body.metrics.productReturnRate).toBe("24.6%");
    });
  });
});
