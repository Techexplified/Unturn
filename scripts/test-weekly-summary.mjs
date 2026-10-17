import dotenv from "dotenv";
dotenv.config();

import db from "../app/db.server.js";
import { sendWeeklySummaryReport } from "../app/services/email.server.js";

console.log("Verifying Weekly Summary Report Engine...");

// Find first active shop in database
let shop = await db.shop.findFirst({ where: { isActive: true } });

if (!shop) {
  console.log("Creating temporary test shop for verification...");
  shop = await db.shop.create({
    data: {
      shopDomain: "test-weekly-digest.myshopify.com",
      name: "Weekly Test Brand",
      currency: "USD",
      emailSummary: true,
      isActive: true,
    },
  });
}

console.log(`Testing weekly report generation for shop: ${shop.shopDomain} (emailSummary: ${shop.emailSummary})`);

// Recipient from .env
const rawFrom = process.env.RESEND_FROM_EMAIL || "alerts@shopify.explified.com";
const match = rawFrom.match(/<([^>]+)>/);
const recipient = match ? match[1] : rawFrom;

console.log(`Sending live weekly summary report to: ${recipient}...`);

const result = await sendWeeklySummaryReport(shop.shopDomain, recipient);
console.log("Result:", JSON.stringify(result, null, 2));

process.exit(result.success ? 0 : 1);
