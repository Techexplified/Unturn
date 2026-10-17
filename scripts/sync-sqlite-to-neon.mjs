import { PrismaClient as SqliteClient } from "@prisma/client";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { PrismaClient: NeonClient } = require(path.join(__dirname, "../node_modules/@prisma/neon-client"));

const sqlite = new SqliteClient();
const neon = new NeonClient();

async function syncData() {
  console.log("Starting SQLite -> Neon database data sync...");

  // 1. Sync Sessions
  const sessions = await sqlite.session.findMany();
  console.log(`Syncing ${sessions.length} sessions...`);
  for (const session of sessions) {
    await neon.session.upsert({
      where: { id: session.id },
      update: session,
      create: session,
    });
  }

  // 2. Sync Shops
  const shops = await sqlite.shop.findMany();
  console.log(`Syncing ${shops.length} shops...`);
  for (const s of shops) {
    const { id, shopDomain, name, currency, ianaTimezone, isActive, installedAt, uninstalledAt, createdAt, updatedAt } = s;
    await neon.shop.upsert({
      where: { shopDomain },
      update: { name, currency, ianaTimezone, isActive, installedAt, uninstalledAt, updatedAt },
      create: { id, shopDomain, name, currency, ianaTimezone, isActive, installedAt, uninstalledAt, createdAt, updatedAt },
    });
  }

  // 3. Sync Products
  const products = await sqlite.product.findMany();
  console.log(`Syncing ${products.length} products...`);
  for (const p of products) {
    await neon.product.upsert({
      where: { shopId_shopifyProductId: { shopId: p.shopId, shopifyProductId: p.shopifyProductId } },
      update: { title: p.title, handle: p.handle, status: p.status, imageUrl: p.imageUrl, updatedAt: p.updatedAt },
      create: p,
    });
  }

  // 4. Sync Variants
  const variants = await sqlite.productVariant.findMany();
  console.log(`Syncing ${variants.length} variants...`);
  for (const v of variants) {
    await neon.productVariant.upsert({
      where: { shopId_shopifyVariantId: { shopId: v.shopId, shopifyVariantId: v.shopifyVariantId } },
      update: { sku: v.sku, title: v.title, price: v.price, updatedAt: v.updatedAt },
      create: v,
    });
  }

  // 5. Sync Orders
  const orders = await sqlite.order.findMany();
  console.log(`Syncing ${orders.length} orders...`);
  for (const o of orders) {
    await neon.order.upsert({
      where: { shopId_shopifyOrderId: { shopId: o.shopId, shopifyOrderId: o.shopifyOrderId } },
      update: {
        orderNumber: o.orderNumber,
        processedAt: o.processedAt,
        currency: o.currency,
        totalPrice: o.totalPrice,
        subtotalPrice: o.subtotalPrice,
        totalDiscounts: o.totalDiscounts,
        financialStatus: o.financialStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        updatedAt: o.updatedAt,
      },
      create: o,
    });
  }

  // 6. Sync Order Line Items
  const orderItems = await sqlite.orderLineItem.findMany();
  console.log(`Syncing ${orderItems.length} order line items...`);
  for (const item of orderItems) {
    await neon.orderLineItem.upsert({
      where: { orderId_shopifyLineItemId: { orderId: item.orderId, shopifyLineItemId: item.shopifyLineItemId } },
      update: {
        productId: item.productId,
        variantId: item.variantId,
        title: item.title,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        updatedAt: item.updatedAt,
      },
      create: item,
    });
  }

  // 7. Sync Returns
  const returns = await sqlite.return.findMany();
  console.log(`Syncing ${returns.length} returns...`);
  for (const r of returns) {
    await neon.return.upsert({
      where: { shopId_shopifyReturnId: { shopId: r.shopId, shopifyReturnId: r.shopifyReturnId } },
      update: {
        name: r.name,
        status: r.status,
        totalRefundAmount: r.totalRefundAmount,
        currency: r.currency,
        processedAt: r.processedAt,
        updatedAt: r.updatedAt,
      },
      create: r,
    });
  }

  // 8. Sync Return Line Items
  const returnItems = await sqlite.returnLineItem.findMany();
  console.log(`Syncing ${returnItems.length} return line items...`);
  for (const item of returnItems) {
    await neon.returnLineItem.upsert({
      where: { returnId_shopifyReturnLineItemId: { returnId: item.returnId, shopifyReturnLineItemId: item.shopifyReturnLineItemId } },
      update: {
        orderLineItemId: item.orderLineItemId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        refundableQuantity: item.refundableQuantity,
        refundedQuantity: item.refundedQuantity,
        returnReason: item.returnReason,
        returnReasonNote: item.returnReasonNote,
        totalWeight: item.totalWeight,
        updatedAt: item.updatedAt,
      },
      create: item,
    });
  }

  // 9. Sync SyncJobs
  const syncJobs = await sqlite.syncJob.findMany();
  console.log(`Syncing ${syncJobs.length} sync jobs...`);
  for (const job of syncJobs) {
    await neon.syncJob.upsert({
      where: { id: job.id },
      update: job,
      create: job,
    });
  }

  // 10. Sync Interventions
  const interventions = await sqlite.intervention.findMany();
  console.log(`Syncing ${interventions.length} interventions...`);
  for (const inv of interventions) {
    await neon.intervention.upsert({
      where: { id: inv.id },
      update: inv,
      create: inv,
    });
  }

  console.log("Data sync from SQLite to Neon completed successfully!");
}

syncData()
  .catch(console.error)
  .finally(async () => {
    await sqlite.$disconnect();
    await neon.$disconnect();
  });
