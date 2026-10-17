/* eslint-disable @typescript-eslint/no-explicit-any */
import db from "../db.server";

// GraphQL queries verified against Shopify Admin API 2026-07 schema
export const SHOP_DETAILS_QUERY = `#graphql
  query getShopDetails {
    shop {
      id
      name
      myshopifyDomain
      currencyCode
      ianaTimezone
    }
  }
`;

export const PRODUCTS_SYNC_QUERY = `#graphql
  query getProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        featuredMedia {
          ... on MediaImage {
            image {
              url
            }
          }
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
          }
        }
      }
    }
  }
`;

export const ORDERS_WITH_RETURNS_QUERY = `#graphql
  query getOrdersWithReturns($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        createdAt
        processedAt
        currencyCode
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        currentSubtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        displayFinancialStatus
        displayFulfillmentStatus
        lineItems(first: 50) {
          nodes {
            id
            title
            quantity
            sku
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            discountedTotalSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            product {
              id
            }
            variant {
              id
            }
          }
        }
        returns(first: 5) {
          nodes {
            id
            name
            status
            createdAt
            returnLineItems(first: 10) {
              nodes {
                ... on ReturnLineItem {
                  id
                  quantity
                  refundableQuantity
                  refundedQuantity
                  returnReason
                  returnReasonNote
                  returnReasonDefinition {
                    id
                    name
                    handle
                  }
                  fulfillmentLineItem {
                    lineItem {
                      id
                    }
                  }
                  totalWeight {
                    value
                    unit
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const ORDERS_FALLBACK_QUERY = `#graphql
  query getOrdersFallback($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        createdAt
        processedAt
        currencyCode
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        currentSubtotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalDiscountsSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        displayFinancialStatus
        displayFulfillmentStatus
        lineItems(first: 50) {
          nodes {
            id
            title
            quantity
            sku
            originalUnitPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            discountedTotalSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            product {
              id
            }
            variant {
              id
            }
          }
        }
      }
    }
  }
`;

export interface SyncStatusResult {
  shopDomain: string;
  isConnected: boolean;
  shop: {
    name: string | null;
    currency: string | null;
    ianaTimezone: string | null;
    installedAt: Date | null;
  } | null;
  currentJob: {
    id: string;
    status: string;
    syncType: string;
    startedAt: Date | null;
    completedAt: Date | null;
    productsSynced: number;
    ordersSynced: number;
    returnsSynced: number;
    errorSummary: string | null;
  } | null;
  counts: {
    products: number;
    variants: number;
    orders: number;
    returns: number;
    returnLineItems: number;
  };
  coverage: {
    totalReturns: number;
    returnsWithReasons: number;
    returnsUnknownReasons: number;
    reasonCoveragePercent: number;
    hasAccessibleReturnData: boolean;
    notes: string[];
  };
}

export interface ShopifyAdminClient {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> }
  ) => Promise<{
    json: () => Promise<GraphQLPayload>;
  }>;
}

interface GraphQLErrorPayload {
  message: string;
  extensions?: {
    code?: string;
  };
}

interface GraphQLPayload {
  data?: Record<string, unknown>;
  errors?: GraphQLErrorPayload[];
  extensions?: {
    cost?: {
      throttleStatus?: {
        maximumAvailable?: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

/**
 * Execute GraphQL query against Shopify Admin API with exponential backoff for throttling
 */
async function executeGraphQLWithRetry(
  admin: any,
  query: string,
  variables: Record<string, any> = {},
  retries = 3
): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await admin.graphql(query, { variables });
      const json = await response.json();

      if (json.errors && json.errors.length > 0) {
        const isThrottled = json.errors.some(
          (err: any) =>
            err.message?.includes("Throttled") ||
            err.extensions?.code === "THROTTLED"
        );
        if (isThrottled && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(json.errors.map((e: any) => e.message).join(", "));
      }

      // Handle query cost throttling extensions if available
      const throttleStatus = json.extensions?.cost?.throttleStatus;
      if (throttleStatus && throttleStatus.currentlyAvailable < 150) {
        const restoreNeeded = 150 - throttleStatus.currentlyAvailable;
        const waitMs = Math.ceil((restoreNeeded / (throttleStatus.restoreRate || 50)) * 1000);
        if (waitMs > 0 && waitMs < 10000) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }

      return json.data;
    } catch (err: any) {
      if (attempt === retries) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Ensure shop record exists in database and synchronize latest shop profile
 */
export async function ensureShopRecord(
  shopDomain: string,
  admin?: any
): Promise<{ id: string; shopDomain: string; dateRangeAnalysis?: string | null }> {
  let shop = await db.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await db.shop.create({
      data: {
        shopDomain,
        isActive: true,
      },
    });
  }

  if (admin) {
    try {
      const shopData = await executeGraphQLWithRetry(admin, SHOP_DETAILS_QUERY);
      if (shopData?.shop) {
        shop = await db.shop.update({
          where: { id: shop.id },
          data: {
            name: shopData.shop.name,
            currency: shopData.shop.currencyCode,
            ianaTimezone: shopData.shop.ianaTimezone,
            isActive: true,
          },
        });
      }
    } catch (err: any) {
      console.warn(`[Unturn Sync] Could not refresh shop details for ${shopDomain}:`, err?.message);
    }
  }

  return shop;
}



/**
 * Get comprehensive sync and coverage status for a merchant store
 */
export async function getSyncStatus(shopDomain: string): Promise<SyncStatusResult> {
  const shop = await db.shop.findUnique({
    where: { shopDomain },
    include: {
      syncJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const isConnected = Boolean(shop && shop.isActive);
  const currentJob = shop?.syncJobs[0] || null;

  if (!shop) {
    return {
      shopDomain,
      isConnected: false,
      shop: null,
      currentJob: null,
      counts: { products: 0, variants: 0, orders: 0, returns: 0, returnLineItems: 0 },
      coverage: {
        totalReturns: 0,
        returnsWithReasons: 0,
        returnsUnknownReasons: 0,
        reasonCoveragePercent: 0,
        hasAccessibleReturnData: false,
        notes: ["Shop not yet connected or registered."],
      },
    };
  }

  const [productsCount, variantsCount, ordersCount, returnsCount, returnLineItems] = await Promise.all([
    db.product.count({ where: { shopId: shop.id } }),
    db.productVariant.count({ where: { shopId: shop.id } }),
    db.order.count({ where: { shopId: shop.id } }),
    db.return.count({ where: { shopId: shop.id } }),
    db.returnLineItem.findMany({
      where: { return: { shopId: shop.id } },
      select: { returnReason: true, returnReasonNote: true },
    }),
  ]);

  let returnsWithReasons = 0;
  let returnsUnknownReasons = 0;

  for (const item of returnLineItems) {
    const hasKnownReason =
      item.returnReason &&
      item.returnReason !== "UNKNOWN" &&
      item.returnReason.trim() !== "";
    const hasNote = Boolean(item.returnReasonNote && item.returnReasonNote.trim() !== "");

    if (hasKnownReason || hasNote) {
      returnsWithReasons++;
    } else {
      returnsUnknownReasons++;
    }
  }

  const totalReturnItems = returnLineItems.length;
  const reasonCoveragePercent =
    totalReturnItems > 0 ? Math.round((returnsWithReasons / totalReturnItems) * 100) : 0;

  const notes: string[] = [];
  if (totalReturnItems === 0) {
    notes.push("No return records found in imported order history.");
  } else if (returnsUnknownReasons > 0) {
    notes.push(
      `${returnsUnknownReasons} of ${totalReturnItems} returned items lack structured customer return reasons in Shopify.`
    );
  } else {
    notes.push("100% of imported return records contain structured reasons.");
  }

  if (currentJob?.errorSummary?.includes("scope") || currentJob?.errorSummary?.includes("permission")) {
    notes.push("Return synchronization requires the 'read_returns' access scope from Shopify.");
  }

  return {
    shopDomain,
    isConnected,
    shop: {
      name: shop.name,
      currency: shop.currency,
      ianaTimezone: shop.ianaTimezone,
      installedAt: shop.installedAt,
    },
    currentJob: currentJob
      ? {
          id: currentJob.id,
          status: currentJob.status,
          syncType: currentJob.syncType,
          startedAt: currentJob.startedAt,
          completedAt: currentJob.completedAt,
          productsSynced: currentJob.productsSynced,
          ordersSynced: currentJob.ordersSynced,
          returnsSynced: currentJob.returnsSynced,
          errorSummary: currentJob.errorSummary,
        }
      : null,
    counts: {
      products: productsCount,
      variants: variantsCount,
      orders: ordersCount,
      returns: returnsCount,
      returnLineItems: totalReturnItems,
    },
    coverage: {
      totalReturns: returnsCount,
      returnsWithReasons,
      returnsUnknownReasons,
      reasonCoveragePercent,
      hasAccessibleReturnData: returnsCount > 0,
      notes,
    },
  };
}

import type { SyncJob } from "@prisma/client";

/**
 * Helper to compute the cutoff date from a date range setting string.
 * Returns null if "All time" or undefined.
 */
export function getDateCutoffForRange(
  rangeStr?: string | null,
  referenceDate: Date = new Date()
): Date | null {
  if (!rangeStr || rangeStr.toLowerCase() === "all time") {
    return null;
  }
  const match = rangeStr.match(/(\d+)\s*days?/i);
  if (match) {
    const days = parseInt(match[1], 10);
    return new Date(referenceDate.getTime() - days * 24 * 60 * 60 * 1000);
  }
  // Default fallback 90 days
  return new Date(referenceDate.getTime() - 90 * 24 * 60 * 60 * 1000);
}

/**
 * Prune orders and returns older than the given cutoff date for a specific shop.
 */
export async function pruneOldStoreData(
  shopId: string,
  cutoffDate: Date
): Promise<{ deletedOrders: number; deletedReturns: number }> {
  const oldOrders = await db.order.findMany({
    where: {
      shopId,
      processedAt: { lt: cutoffDate },
    },
    select: { id: true },
  });

  const oldOrderIds = oldOrders.map((o) => o.id);
  let deletedReturnsCount = 0;
  let deletedOrdersCount = 0;

  if (oldOrderIds.length > 0) {
    const resReturns = await db.return.deleteMany({
      where: {
        shopId,
        OR: [
          { orderId: { in: oldOrderIds } },
          { processedAt: { lt: cutoffDate } },
        ],
      },
    });
    deletedReturnsCount = resReturns.count;

    const resOrders = await db.order.deleteMany({
      where: { id: { in: oldOrderIds } },
    });
    deletedOrdersCount = resOrders.count;
  } else {
    const resReturns = await db.return.deleteMany({
      where: {
        shopId,
        processedAt: { lt: cutoffDate },
      },
    });
    deletedReturnsCount = resReturns.count;
  }

  return { deletedOrders: deletedOrdersCount, deletedReturns: deletedReturnsCount };
}

/**
 * Run historical store data synchronization
 */
export async function runShopSync(
  shopDomain: string,
  admin: any,
  options: {
    syncType?: string;
    force?: boolean;
    dateRange?: string;
    referenceDate?: Date;
  } = {}
): Promise<{ success: boolean; job: SyncJob; message?: string }> {
  const shop = await ensureShopRecord(shopDomain, admin);
  const effectiveRange = options.dateRange || shop.dateRangeAnalysis || "Last 90 days";
  const cutoffDate = getDateCutoffForRange(effectiveRange, options.referenceDate);

  // Prune any existing records that fall outside the store's configured retention window
  if (cutoffDate) {
    try {
      await pruneOldStoreData(shop.id, cutoffDate);
    } catch (pruneErr) {
      console.warn(`[Unturn Sync] Retention prune error for ${shopDomain}:`, pruneErr);
    }
  }

  // Prevent duplicate concurrent sync jobs
  const runningJob = await db.syncJob.findFirst({
    where: {
      shopId: shop.id,
      status: "RUNNING",
    },
    orderBy: { createdAt: "desc" },
  });

  if (runningJob) {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    if (runningJob.startedAt && runningJob.startedAt > tenMinutesAgo && !options.force) {
      return {
        success: false,
        job: runningJob,
        message: "A synchronization is already actively in progress for this store.",
      };
    } else {
      // Mark stale job as failed
      await db.syncJob.update({
        where: { id: runningJob.id },
        data: {
          status: "FAILED",
          errorSummary: "Job was interrupted or timed out. Superceded by new sync.",
          completedAt: new Date(),
        },
      });
    }
  }

  const syncType = options.syncType || "HISTORICAL";
  const job = await db.syncJob.create({
    data: {
      shopId: shop.id,
      syncType,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    let totalProductsSynced = 0;
    let totalOrdersSynced = 0;
    let totalReturnsSynced = 0;

    // Phase 1: Sync Products & Variants with pagination
    let hasNextProductPage = true;
    let productCursor: string | null = null;

    while (hasNextProductPage) {
      const productData = await executeGraphQLWithRetry(admin, PRODUCTS_SYNC_QUERY, {
        first: 50,
        after: productCursor,
      });

      const products = productData?.products?.nodes || [];
      const pageInfo = productData?.products?.pageInfo;

      for (const p of products) {
        const imageUrl = p.featuredMedia?.image?.url || null;

        const productRecord = await db.product.upsert({
          where: {
            shopId_shopifyProductId: {
              shopId: shop.id,
              shopifyProductId: p.id,
            },
          },
          create: {
            shopId: shop.id,
            shopifyProductId: p.id,
            title: p.title,
            handle: p.handle,
            status: p.status,
            imageUrl,
          },
          update: {
            title: p.title,
            handle: p.handle,
            status: p.status,
            ...(imageUrl ? { imageUrl } : {}),
          },
        });

        const variants = p.variants?.nodes || [];
        for (const v of variants) {
          const price = v.price ? parseFloat(v.price) : null;
          await db.productVariant.upsert({
            where: {
              shopId_shopifyVariantId: {
                shopId: shop.id,
                shopifyVariantId: v.id,
              },
            },
            create: {
              shopId: shop.id,
              productId: productRecord.id,
              shopifyVariantId: v.id,
              sku: v.sku,
              title: v.title,
              price: isNaN(price as number) ? null : price,
            },
            update: {
              sku: v.sku,
              title: v.title,
              price: isNaN(price as number) ? null : price,
            },
          });
        }

        totalProductsSynced++;
      }

      hasNextProductPage = Boolean(pageInfo?.hasNextPage);
      productCursor = pageInfo?.endCursor || null;

      // Update checkpoint progress
      await db.syncJob.update({
        where: { id: job.id },
        data: {
          productsSynced: totalProductsSynced,
          lastProcessedCursor: productCursor,
        },
      });
    }

    // Phase 2: Sync Orders, Line Items, and Returns
    let hasNextOrderPage = true;
    let orderCursor: string | null = null;
    let usesFallbackReturns = false;
    const orderQueryVariables: { first: number; after: string | null; query?: string } = {
      first: 20,
      after: orderCursor,
    };
    if (cutoffDate) {
      orderQueryVariables.query = `created_at:>=${cutoffDate.toISOString().split("T")[0]}`;
    }

    while (hasNextOrderPage) {
      orderQueryVariables.after = orderCursor;
      let orderData: any;
      try {
        if (!usesFallbackReturns) {
          orderData = await executeGraphQLWithRetry(admin, ORDERS_WITH_RETURNS_QUERY, orderQueryVariables);
        } else {
          orderData = await executeGraphQLWithRetry(admin, ORDERS_FALLBACK_QUERY, orderQueryVariables);
        }
      } catch (err: any) {
        // If returns query fails due to missing read_returns scope or permission, fall back to orders query
        if (
          !usesFallbackReturns &&
          (err.message?.includes("read_returns") ||
            err.message?.includes("access denied") ||
            err.message?.includes("Field 'returns'"))
        ) {
          console.warn("[Unturn Sync] Returns query unauthorized. Falling back to orders without returns.", err.message);
          usesFallbackReturns = true;
          orderData = await executeGraphQLWithRetry(admin, ORDERS_FALLBACK_QUERY, orderQueryVariables);
        } else {
          throw err;
        }
      }

      const orders = orderData?.orders?.nodes || [];
      const pageInfo = orderData?.orders?.pageInfo;

      for (const o of orders) {
        const processedAt = o.processedAt ? new Date(o.processedAt) : o.createdAt ? new Date(o.createdAt) : null;

        // Strictly enforce time set: stop pagination if we encounter orders past the cutoff date
        if (cutoffDate && processedAt && processedAt < cutoffDate) {
          hasNextOrderPage = false;
          break;
        }
        const totalPrice = o.currentTotalPriceSet?.shopMoney?.amount
          ? parseFloat(o.currentTotalPriceSet.shopMoney.amount)
          : null;
        const subtotalPrice = o.currentSubtotalPriceSet?.shopMoney?.amount
          ? parseFloat(o.currentSubtotalPriceSet.shopMoney.amount)
          : null;
        const totalDiscounts = o.totalDiscountsSet?.shopMoney?.amount
          ? parseFloat(o.totalDiscountsSet.shopMoney.amount)
          : null;

        const orderRecord = await db.order.upsert({
          where: {
            shopId_shopifyOrderId: {
              shopId: shop.id,
              shopifyOrderId: o.id,
            },
          },
          create: {
            shopId: shop.id,
            shopifyOrderId: o.id,
            orderNumber: o.name,
            processedAt,
            currency: o.currencyCode || "USD",
            totalPrice: isNaN(totalPrice as number) ? null : totalPrice,
            subtotalPrice: isNaN(subtotalPrice as number) ? null : subtotalPrice,
            totalDiscounts: isNaN(totalDiscounts as number) ? null : totalDiscounts,
            financialStatus: o.displayFinancialStatus || null,
            fulfillmentStatus: o.displayFulfillmentStatus || null,
          },
          update: {
            orderNumber: o.name,
            processedAt,
            financialStatus: o.displayFinancialStatus || null,
            fulfillmentStatus: o.displayFulfillmentStatus || null,
          },
        });

        // Map line items and build cache for fulfillmentLineItem matching
        const lineItemRecordMap = new Map<string, { id: string; productId: string | null; variantId: string | null }>();

        const lineItems = o.lineItems?.nodes || [];
        for (const item of lineItems) {
          const unitPrice = item.originalUnitPriceSet?.shopMoney?.amount
            ? parseFloat(item.originalUnitPriceSet.shopMoney.amount)
            : null;
          const lineTotal = item.discountedTotalSet?.shopMoney?.amount
            ? parseFloat(item.discountedTotalSet.shopMoney.amount)
            : null;

          // Find associated internal product and variant if available
          let productInternalId: string | null = null;
          let variantInternalId: string | null = null;

          if (item.product?.id) {
            const pRec = await db.product.findUnique({
              where: {
                shopId_shopifyProductId: {
                  shopId: shop.id,
                  shopifyProductId: item.product.id,
                },
              },
              select: { id: true },
            });
            productInternalId = pRec?.id || null;
          }

          if (item.variant?.id) {
            const vRec = await db.productVariant.findUnique({
              where: {
                shopId_shopifyVariantId: {
                  shopId: shop.id,
                  shopifyVariantId: item.variant.id,
                },
              },
              select: { id: true },
            });
            variantInternalId = vRec?.id || null;
          }

          const orderLineItem = await db.orderLineItem.upsert({
            where: {
              orderId_shopifyLineItemId: {
                orderId: orderRecord.id,
                shopifyLineItemId: item.id,
              },
            },
            create: {
              orderId: orderRecord.id,
              productId: productInternalId,
              variantId: variantInternalId,
              shopifyLineItemId: item.id,
              title: item.title,
              sku: item.sku || null,
              quantity: item.quantity || 1,
              unitPrice: isNaN(unitPrice as number) ? null : unitPrice,
              totalPrice: isNaN(lineTotal as number) ? null : lineTotal,
            },
            update: {
              title: item.title,
              sku: item.sku || null,
              quantity: item.quantity || 1,
              productId: productInternalId,
              variantId: variantInternalId,
            },
          });

          lineItemRecordMap.set(item.id, {
            id: orderLineItem.id,
            productId: productInternalId,
            variantId: variantInternalId,
          });
        }

        // Process Return records if available
        const returns = o.returns?.nodes || [];
        for (const ret of returns) {
          const returnRecord = await db.return.upsert({
            where: {
              shopId_shopifyReturnId: {
                shopId: shop.id,
                shopifyReturnId: ret.id,
              },
            },
            create: {
              shopId: shop.id,
              orderId: orderRecord.id,
              shopifyReturnId: ret.id,
              name: ret.name || null,
              status: ret.status || "OPEN",
              currency: o.currencyCode || "USD",
              processedAt: ret.createdAt ? new Date(ret.createdAt) : null,
            },
            update: {
              name: ret.name || null,
              status: ret.status || "OPEN",
              processedAt: ret.createdAt ? new Date(ret.createdAt) : undefined,
            },
          });

          const returnLineItems = ret.returnLineItems?.nodes || [];
          for (const rItem of returnLineItems) {
            const originalShopifyLineItemId = rItem.fulfillmentLineItem?.lineItem?.id;
            const lineItemInfo = originalShopifyLineItemId
              ? lineItemRecordMap.get(originalShopifyLineItemId) || null
              : null;

            // Normalize reason from definition or legacy reason field without fabrication
            let returnReason: string | null = null;
            if (rItem.returnReasonDefinition?.name) {
              returnReason = rItem.returnReasonDefinition.name;
            } else if (rItem.returnReasonDefinition?.handle) {
              returnReason = rItem.returnReasonDefinition.handle;
            } else if (rItem.returnReason && rItem.returnReason !== "UNKNOWN") {
              returnReason = rItem.returnReason;
            } else if (rItem.returnReasonNote) {
              returnReason = "Other Note";
            }

            const totalWeight = rItem.totalWeight?.value ? parseFloat(rItem.totalWeight.value) : null;

            await db.returnLineItem.upsert({
              where: {
                returnId_shopifyReturnLineItemId: {
                  returnId: returnRecord.id,
                  shopifyReturnLineItemId: rItem.id,
                },
              },
              create: {
                returnId: returnRecord.id,
                orderLineItemId: lineItemInfo?.id || null,
                productId: lineItemInfo?.productId || null,
                variantId: lineItemInfo?.variantId || null,
                shopifyReturnLineItemId: rItem.id,
                quantity: rItem.quantity || 1,
                refundableQuantity: rItem.refundableQuantity ?? null,
                refundedQuantity: rItem.refundedQuantity ?? null,
                returnReason,
                returnReasonNote: rItem.returnReasonNote || null,
                totalWeight: isNaN(totalWeight as number) ? null : totalWeight,
              },
              update: {
                orderLineItemId: lineItemInfo?.id || null,
                productId: lineItemInfo?.productId || null,
                variantId: lineItemInfo?.variantId || null,
                quantity: rItem.quantity || 1,
                returnReason,
                returnReasonNote: rItem.returnReasonNote || null,
              },
            });
          }

          totalReturnsSynced++;
        }

        totalOrdersSynced++;
      }

      if (hasNextOrderPage) {
        hasNextOrderPage = Boolean(pageInfo?.hasNextPage);
      }
      orderCursor = pageInfo?.endCursor || null;

      // Update checkpoint progress
      await db.syncJob.update({
        where: { id: job.id },
        data: {
          ordersSynced: totalOrdersSynced,
          returnsSynced: totalReturnsSynced,
          lastProcessedCursor: orderCursor,
        },
      });
    }

    // Mark job completed successfully
    const completedJob = await db.syncJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        productsSynced: totalProductsSynced,
        ordersSynced: totalOrdersSynced,
        returnsSynced: totalReturnsSynced,
        ...(usesFallbackReturns
          ? {
              errorSummary:
                "Completed with limited coverage: Return objects were not accessible (missing read_returns scope).",
            }
          : {}),
      },
    });

    return {
      success: true,
      job: completedJob,
      message: `Sync completed successfully. Imported ${totalProductsSynced} products, ${totalOrdersSynced} orders, and ${totalReturnsSynced} returns.`,
    };
  } catch (err: any) {
    const errorMsg = (err?.message || "Unknown error during sync").slice(0, 500);
    console.error(`[Unturn Sync Error for ${shopDomain}]:`, errorMsg);

    const failedJob = await db.syncJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorSummary: errorMsg,
      },
    });

    return {
      success: false,
      job: failedJob,
      message: `Sync failed: ${errorMsg}`,
    };
  }
}
