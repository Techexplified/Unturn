/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import db from "../app/db.server";
import {
  evaluatePreventability,
  estimateFinancialImpact,
  generateProductRecommendations,
  generateCauseRecommendations,
} from "../app/services/recommendations.server";
import {
  getProductDetailAnalytics,
  getCauseDetailAnalytics,
} from "../app/services/analytics.server";

describe("Unturn Phase 4 — Preventability & Recommendations Engine", () => {
  const shopDomain = "recs-test.myshopify.com";

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

  describe("1. Return Preventability Analysis Rules", () => {
    it("classifies supported size/fit patterns with sufficient volume as Potentially preventable", () => {
      const result = evaluatePreventability("size-fit", "Size / Fit", 6, 25, 60);
      expect(result.classification).toBe("Potentially preventable");
      expect(result.confidence).toBe("High");
      expect(result.rationale).toContain("Size and fit issues represent a major portion of returns");
    });

    it("classifies expectation / not-as-expected issues as Potentially preventable", () => {
      const result = evaluatePreventability("not-as-expected", "Not as expected", 4, 20, 40);
      expect(result.classification).toBe("Potentially preventable");
      expect(result.confidence).toBe("Medium");
      expect(result.rationale).toContain("discrepancies can be directly resolved");
    });

    it("classifies damaged / transit defects as Possibly preventable (not 100% preventable)", () => {
      const result = evaluatePreventability("damaged", "Damaged / Defective", 5, 30, 20);
      expect(result.classification).toBe("Possibly preventable");
      expect(result.rationale).toContain("carrier handling remains an external variable");
    });

    it("classifies low return counts or units as Insufficient data to assess", () => {
      const result = evaluatePreventability("size-fit", "Size / Fit", 1, 2, 50);
      expect(result.classification).toBe("Insufficient data to assess");
      expect(result.confidence).toBe("Low");
      expect(result.rationale).toContain("Minimum sample size of at least 2 returned units");
    });

    it("does not classify buyer mind change or unspecified reasons as preventable", () => {
      const result = evaluatePreventability(
        "not-as-expected",
        "Customer mind change / Other",
        10,
        50,
        50
      );
      expect(result.classification).toBe("Insufficient data to assess");
      expect(result.rationale).toContain("buyer discretionary or unspecified");
    });
  });

  describe("2. Financial Impact Estimation", () => {
    it("distinguishes actual recorded value from estimated preventable loss and documents assumptions", () => {
      const actualRefund = 10000;
      const result = estimateFinancialImpact(
        actualRefund,
        "size-fit",
        "Potentially preventable",
        0.6,
        "INR"
      );

      expect(result.hasFinancialData).toBe(true);
      expect(result.actualRecordedValueNum).toBe(10000);
      expect(result.actualRecordedValue).toBe("₹10,000");

      // Preventable loss should be a defensible portion (~30% of the 60% share = 1800), NOT full 10,000
      expect(result.estimatedPreventableLossNum).toBe(1800);
      expect(result.estimatedPreventableLoss).toBe("₹1,800");

      // Documented assumptions
      expect(result.assumptions).toContain("avoiding full merchandise overcounting");
      expect(result.assumptions).toContain("30% return reduction");
    });

    it("handles missing financial data gracefully without errors", () => {
      const result = estimateFinancialImpact(0, "size-fit", "Potentially preventable", 1, "USD");
      expect(result.hasFinancialData).toBe(false);
      expect(result.estimatedPreventableLossNum).toBe(0);
      expect(result.assumptions).toContain("Financial impact undetermined due to missing price");
    });
  });

  describe("3. Prevention Recommendations Generation", () => {
    it("generates evidence-backed product recommendations with suggested actions and priority", () => {
      const recs = generateProductRecommendations(
        {
          id: "prod-1",
          title: "Heavyweight Boxy Hoodie",
          handle: "heavyweight-boxy-hoodie",
          sku: "HBH-001",
          imageUrl: "/products/hoodie.jpg",
          unitsSold: 40,
          returnedUnits: 12,
          returnRate: "30.0%",
          returnRateNum: 30.0,
          mainIssue: "Size / Fit",
          issueType: "size-fit",
          isOutlier: true,
          causesBreakdown: [{ cause: "Size / Fit", count: 12, share: "100.0%" }],
          variants: [
            {
              id: "v-1",
              title: "Size M",
              sku: "HBH-M",
              unitsSold: 20,
              returnedUnits: 10,
              returnRate: "50.0%",
            },
          ],
        },
        12000,
        "INR"
      );

      expect(recs.length).toBe(1);
      const rec = recs[0];
      expect(rec.title).toBe("Improve size chart & fit guidance");
      expect(rec.preventability).toBe("Potentially preventable");
      expect(rec.priority).toBe("High");
      expect(rec.suggestedAction).toContain("interactive size chart");
      expect(rec.expectedOutcome).toContain("reduction in size-related returns");
      expect(rec.evidence.keySignals.length).toBeGreaterThanOrEqual(2);
      expect(rec.financialImpact.actualRecordedValueNum).toBe(12000);
    });

    it("generates systemic cause recommendations", () => {
      const causeRecs = generateCauseRecommendations(
        {
          causeName: "Size / Fit",
          returnsCount: 25,
          share: "50.0%",
          shareNum: 50.0,
          color: "#1B59F8",
          topProducts: [
            {
              id: "prod-1",
              title: "Heavyweight Boxy Hoodie",
              sku: null,
              imageUrl: null,
              returnsCount: 15,
            },
          ],
        },
        50,
        25000,
        "INR"
      );

      expect(causeRecs.length).toBe(1);
      const rec = causeRecs[0];
      expect(rec.title).toContain("size guide");
      expect(rec.preventability).toBe("Potentially preventable");
      expect(rec.financialImpact.actualRecordedValueNum).toBe(25000);
    });
  });

  describe("4. End-to-End Analytics Integration with Database", () => {
    it("returns populated recommendations on product detail and cause detail queries", async () => {
      const shop = await db.shop.create({
        data: {
          shopDomain,
          currency: "USD",
          name: "Recs Integration Test Shop",
        },
      });

      const product = await db.product.create({
        data: {
          shopId: shop.id,
          shopifyProductId: "gid://shopify/Product/8801",
          title: "Slim Stretch Chino",
        },
      });

      const variant = await db.productVariant.create({
        data: {
          shopId: shop.id,
          productId: product.id,
          shopifyVariantId: "gid://shopify/ProductVariant/8801-1",
          title: "32 / Khaki",
          sku: "SSC-KHK-32",
          price: 80.0,
        },
      });

      // 10 sold, 4 returned for Size / Fit
      const order = await db.order.create({
        data: {
          shopId: shop.id,
          shopifyOrderId: "gid://shopify/Order/8801",
          totalPrice: 800.0,
          currency: "USD",
          processedAt: new Date("2026-07-10T12:00:00Z"),
        },
      });

      const lineItem = await db.orderLineItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          variantId: variant.id,
          shopifyLineItemId: "gid://shopify/LineItem/8801",
          title: "Slim Stretch Chino",
          quantity: 10,
          unitPrice: 80.0,
        },
      });

      const ret = await db.return.create({
        data: {
          shopId: shop.id,
          shopifyReturnId: "gid://shopify/Return/8801",
          orderId: order.id,
          totalRefundAmount: 320.0,
          currency: "USD",
          processedAt: new Date("2026-07-15T12:00:00Z"),
        },
      });

      await db.returnLineItem.create({
        data: {
          shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/8801",
          returnId: ret.id,
          orderLineItemId: lineItem.id,
          productId: product.id,
          variantId: variant.id,
          quantity: 4,
          returnReason: "SIZE_TOO_TIGHT",
          returnReasonNote: "Waist is way too tight",
        },
      });

      // Query product detail analytics
      const prodDetail = await getProductDetailAnalytics(
        shopDomain,
        product.id,
        "July 1 – August 31, 2026"
      );
      expect(prodDetail).not.toBeNull();
      expect(prodDetail?.recommendations).toBeDefined();
      expect(prodDetail?.recommendations?.length).toBe(1);
      expect(prodDetail?.recommendations?.[0].preventability).toBe("Potentially preventable");
      expect(prodDetail?.recommendations?.[0].suggestedAction).toBeDefined();

      // Query cause detail analytics
      const causeDetail = await getCauseDetailAnalytics(
        shopDomain,
        "Size / Fit",
        "July 1 – August 31, 2026"
      );
      expect(causeDetail).not.toBeNull();
      expect(causeDetail?.recommendations).toBeDefined();
      expect(causeDetail?.recommendations?.length).toBe(1);
      expect(causeDetail?.recommendations?.[0].targetType).toBe("cause");
    });
  });
});
