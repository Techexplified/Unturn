import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import db from "../app/db.server";
import { sendWeeklySummaryReport, getFromEmail } from "../app/services/email.server";
import { loader as cronLoader } from "../app/routes/api.cron.weekly-summary";

describe("Unturn Email Service — Weekly Summary Engine", () => {
  const testShopA = "email-test-a.myshopify.com";
  const testShopB = "email-test-b.myshopify.com";

  beforeEach(async () => {
    await db.shop.deleteMany({ where: { shopDomain: { in: [testShopA, testShopB] } } });
    await db.session.deleteMany({ where: { shop: { in: [testShopA, testShopB] } } });

    // Shop A: emailSummary enabled (true)
    await db.shop.create({
      data: {
        shopDomain: testShopA,
        name: "Test Email Brand A",
        currency: "USD",
        isActive: true,
        emailSummary: true,
      },
    });

    // Shop B: emailSummary disabled (false)
    await db.shop.create({
      data: {
        shopDomain: testShopB,
        name: "Test Email Brand B",
        currency: "USD",
        isActive: true,
        emailSummary: false,
      },
    });
  });

  afterEach(async () => {
    await db.shop.deleteMany({ where: { shopDomain: { in: [testShopA, testShopB] } } });
    await db.session.deleteMany({ where: { shop: { in: [testShopA, testShopB] } } });
  });

  it("reads configured sender email correctly from environment", () => {
    const from = getFromEmail();
    expect(from).toContain("alerts@shopify.explified.com");
  });

  it("generates and dispatches a live weekly return summary report email via Resend", async () => {
    const res = await sendWeeklySummaryReport(testShopA, "alerts@shopify.explified.com");
    expect(res.success).toBe(true);
    expect(res.data?.id).toBeDefined();
  }, 15000);

  it("respects the emailSummary toggle: only shops with emailSummary=true are included in weekly dispatch", async () => {
    const req = new Request(`http://localhost/api/cron/weekly-summary?shop=${testShopB}`);
    const res = await cronLoader({ request: req, params: {}, context: {} } as any);
    const json = await (res as Response).json();

    // Shop B has emailSummary: false, so it must NOT be eligible
    expect(json.totalEligibleShops).toBe(0);
    expect(json.dispatchedCount).toBe(0);
  });
});
