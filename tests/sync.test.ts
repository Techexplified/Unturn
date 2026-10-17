/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import db from "../app/db.server";
import {
  runShopSync,
  getSyncStatus,
  ensureShopRecord,
} from "../app/services/sync.server";

// Helper to create mock admin client with controlled GraphQL responses
function createMockAdmin(responses: Record<string, any> | ((query: string, vars?: any) => any)) {
  return {
    graphql: async (query: string, options: { variables?: any } = {}) => {
      let data: any;
      if (typeof responses === "function") {
        data = await responses(query, options.variables);
      } else {
        // Match query by key
        if (query.includes("getShopDetails")) {
          data = responses.shopDetails || {
            shop: {
              id: "gid://shopify/Shop/101",
              name: "Test Store",
              myshopifyDomain: "test-shop.myshopify.com",
              currencyCode: "USD",
              ianaTimezone: "America/New_York",
            },
          };
        } else if (query.includes("getProducts")) {
          data = responses.products || {
            products: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          };
        } else if (query.includes("getOrdersWithReturns")) {
          if (responses.throwReturnsScopeError) {
            return {
              json: async () => ({
                errors: [{ message: "Field 'returns' requires read_returns access scope" }],
              }),
            };
          }
          data = responses.orders || {
            orders: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          };
        } else if (query.includes("getOrdersFallback")) {
          data = responses.ordersFallback || {
            orders: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          };
        } else {
          data = {};
        }
      }

      return {
        json: async () => ({ data }),
      };
    },
  };
}

describe("Unturn Phase 1 — Data Foundation & Shopify Integration Tests", () => {
  const shopDomainA = "test-store-alpha.myshopify.com";
  const shopDomainB = "test-store-beta.myshopify.com";

  beforeEach(async () => {
    // Clean up test shops
    const shops = await db.shop.findMany({
      where: { shopDomain: { in: [shopDomainA, shopDomainB] } },
    });
    for (const s of shops) {
      await db.product.deleteMany({ where: { shopId: s.id } });
      await db.order.deleteMany({ where: { shopId: s.id } });
      await db.return.deleteMany({ where: { shopId: s.id } });
      await db.syncJob.deleteMany({ where: { shopId: s.id } });
    }
    await db.shop.deleteMany({
      where: { shopDomain: { in: [shopDomainA, shopDomainB] } },
    });
  });

  afterAll(async () => {
    // Final cleanup of test data
    await db.shop.deleteMany({
      where: { shopDomain: { in: [shopDomainA, shopDomainB] } },
    });
  });

  it("enforces store isolation between multiple merchants", async () => {
    const shopA = await db.shop.create({
      data: { shopDomain: shopDomainA, name: "Shop Alpha", currency: "USD" },
    });
    const shopB = await db.shop.create({
      data: { shopDomain: shopDomainB, name: "Shop Beta", currency: "EUR" },
    });

    // Create product in Shop A
    const prodA = await db.product.create({
      data: {
        shopId: shopA.id,
        shopifyProductId: "gid://shopify/Product/999",
        title: "Alpha Hoodie",
      },
    });

    // Verify product exists for Shop A but count for Shop B is zero
    const countA = await db.product.count({ where: { shopId: shopA.id } });
    const countB = await db.product.count({ where: { shopId: shopB.id } });
    expect(countA).toBe(1);
    expect(countB).toBe(0);

    // Creating the same shopifyProductId in Shop B must succeed because of store isolation @@unique([shopId, shopifyProductId])
    const prodB = await db.product.create({
      data: {
        shopId: shopB.id,
        shopifyProductId: "gid://shopify/Product/999",
        title: "Beta Item Same ID",
      },
    });
    expect(prodB.id).not.toBe(prodA.id);
  });

  it("executes idempotent imports without creating duplicates on repeated syncs", async () => {
    const mockAdmin = createMockAdmin({
      shopDetails: {
        shop: {
          id: "gid://shopify/Shop/1",
          name: "Alpha Apparel",
          myshopifyDomain: shopDomainA,
          currencyCode: "USD",
          ianaTimezone: "UTC",
        },
      },
      products: {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: "gid://shopify/Product/1001",
              title: "Linen Shirt",
              handle: "linen-shirt",
              status: "ACTIVE",
              featuredMedia: null,
              variants: {
                nodes: [
                  {
                    id: "gid://shopify/ProductVariant/2001",
                    title: "Small",
                    sku: "LS-S",
                    price: "45.00",
                  },
                  {
                    id: "gid://shopify/ProductVariant/2002",
                    title: "Medium",
                    sku: "LS-M",
                    price: "45.00",
                  },
                ],
              },
            },
          ],
        },
      },
      orders: {
        orders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: "gid://shopify/Order/3001",
              name: "#1001",
              createdAt: "2026-08-01T12:00:00Z",
              processedAt: "2026-08-01T12:00:00Z",
              currencyCode: "USD",
              currentTotalPriceSet: { shopMoney: { amount: "90.00", currencyCode: "USD" } },
              currentSubtotalPriceSet: { shopMoney: { amount: "90.00", currencyCode: "USD" } },
              totalDiscountsSet: { shopMoney: { amount: "0.00", currencyCode: "USD" } },
              displayFinancialStatus: "PAID",
              displayFulfillmentStatus: "FULFILLED",
              lineItems: {
                nodes: [
                  {
                    id: "gid://shopify/LineItem/4001",
                    title: "Linen Shirt - Small",
                    quantity: 2,
                    sku: "LS-S",
                    originalUnitPriceSet: { shopMoney: { amount: "45.00", currencyCode: "USD" } },
                    discountedTotalSet: { shopMoney: { amount: "90.00", currencyCode: "USD" } },
                    product: { id: "gid://shopify/Product/1001" },
                    variant: { id: "gid://shopify/ProductVariant/2001" },
                  },
                ],
              },
              returns: {
                nodes: [
                  {
                    id: "gid://shopify/Return/5001",
                    name: "#1001-R1",
                    status: "CLOSED",
                    createdAt: "2026-08-05T10:00:00Z",
                    returnLineItems: {
                      nodes: [
                        {
                          id: "gid://shopify/ReturnLineItem/6001",
                          quantity: 1,
                          refundableQuantity: 1,
                          refundedQuantity: 1,
                          returnReason: "SIZE_TOO_LARGE",
                          returnReasonNote: "Customer ordered wrong size",
                          returnReasonDefinition: {
                            id: "gid://shopify/ReturnReasonDefinition/1",
                            name: "Size was too large",
                            handle: "size-too-large",
                          },
                          fulfillmentLineItem: {
                            lineItem: { id: "gid://shopify/LineItem/4001" },
                          },
                          totalWeight: { value: 0.5, unit: "KILOGRAMS" },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    // Run First Sync
    const res1 = await runShopSync(shopDomainA, mockAdmin);
    expect(res1.success).toBe(true);

    const status1 = await getSyncStatus(shopDomainA);
    expect(status1.counts.products).toBe(1);
    expect(status1.counts.variants).toBe(2);
    expect(status1.counts.orders).toBe(1);
    expect(status1.counts.returns).toBe(1);
    expect(status1.counts.returnLineItems).toBe(1);
    expect(status1.coverage.reasonCoveragePercent).toBe(100);

    // Verify relationship between ReturnLineItem and OrderLineItem was preserved
    const returnItem = await db.returnLineItem.findFirst({
      where: { shopifyReturnLineItemId: "gid://shopify/ReturnLineItem/6001" },
      include: { orderLineItem: true },
    });
    expect(returnItem?.orderLineItem?.shopifyLineItemId).toBe("gid://shopify/LineItem/4001");

    // Run Second Sync (Idempotency test)
    const res2 = await runShopSync(shopDomainA, mockAdmin, { force: true });
    expect(res2.success).toBe(true);

    const status2 = await getSyncStatus(shopDomainA);
    expect(status2.counts.products).toBe(1);
    expect(status2.counts.variants).toBe(2);
    expect(status2.counts.orders).toBe(1);
    expect(status2.counts.returns).toBe(1);
    expect(status2.counts.returnLineItems).toBe(1);
  });

  it("handles pagination across multiple pages of products and orders", async () => {
    let productPage = 0;
    const mockAdmin = createMockAdmin((query, vars) => {
      if (query.includes("getShopDetails")) {
        return {
          shop: {
            id: "gid://shopify/Shop/1",
            name: "Paginated Store",
            myshopifyDomain: shopDomainA,
            currencyCode: "USD",
            ianaTimezone: "UTC",
          },
        };
      }
      if (query.includes("getProducts")) {
        productPage++;
        if (productPage === 1) {
          return {
            products: {
              pageInfo: { hasNextPage: true, endCursor: "cursor-prod-page-1" },
              nodes: [
                {
                  id: "gid://shopify/Product/1",
                  title: "Product 1",
                  handle: "p1",
                  status: "ACTIVE",
                  variants: { nodes: [] },
                },
              ],
            },
          };
        } else {
          return {
            products: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [
                {
                  id: "gid://shopify/Product/2",
                  title: "Product 2",
                  handle: "p2",
                  status: "ACTIVE",
                  variants: { nodes: [] },
                },
              ],
            },
          };
        }
      }
      if (query.includes("getOrders")) {
        return {
          orders: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [],
          },
        };
      }
      return {};
    });

    const res = await runShopSync(shopDomainA, mockAdmin);
    expect(res.success).toBe(true);
    expect(productPage).toBe(2); // Confirms pagination loop proceeded to page 2

    const status = await getSyncStatus(shopDomainA);
    expect(status.counts.products).toBe(2);
  });

  it("prevents duplicate concurrent sync requests", async () => {
    const shop = await ensureShopRecord(shopDomainA);

    // Simulate an actively running job started 1 minute ago
    await db.syncJob.create({
      data: {
        shopId: shop.id,
        status: "RUNNING",
        startedAt: new Date(Date.now() - 60 * 1000),
      },
    });

    const mockAdmin = createMockAdmin({});
    const attempt = await runShopSync(shopDomainA, mockAdmin, { force: false });

    expect(attempt.success).toBe(false);
    expect(attempt.message).toContain("already actively in progress");
  });

  it("gracefully handles empty stores and records coverage without fabricating return reasons", async () => {
    const mockAdmin = createMockAdmin({
      products: {
        products: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [],
        },
      },
      orders: {
        orders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: "gid://shopify/Order/7001",
              name: "#2001",
              createdAt: "2026-08-01T12:00:00Z",
              processedAt: "2026-08-01T12:00:00Z",
              currencyCode: "USD",
              lineItems: { nodes: [] },
              returns: {
                nodes: [
                  {
                    id: "gid://shopify/Return/8001",
                    name: "#2001-R1",
                    status: "OPEN",
                    createdAt: "2026-08-02T10:00:00Z",
                    returnLineItems: {
                      nodes: [
                        {
                          id: "gid://shopify/ReturnLineItem/9001",
                          quantity: 1,
                          returnReason: "UNKNOWN",
                          returnReasonNote: null,
                          returnReasonDefinition: null,
                          fulfillmentLineItem: null,
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    const res = await runShopSync(shopDomainA, mockAdmin);
    expect(res.success).toBe(true);

    const status = await getSyncStatus(shopDomainA);
    expect(status.counts.products).toBe(0);
    expect(status.counts.orders).toBe(1);
    expect(status.counts.returns).toBe(1);
    // Unspecified reason must NOT be fabricated; reasonCoveragePercent must be 0%
    expect(status.coverage.returnsWithReasons).toBe(0);
    expect(status.coverage.returnsUnknownReasons).toBe(1);
    expect(status.coverage.reasonCoveragePercent).toBe(0);
    expect(status.coverage.notes.some((n) => n.includes("lack structured customer return reasons"))).toBe(true);
  });

  it("handles missing read_returns scope gracefully by falling back to orders", async () => {
    const mockAdmin = createMockAdmin({
      throwReturnsScopeError: true,
      ordersFallback: {
        orders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: "gid://shopify/Order/9901",
              name: "#FallbackOrder",
              createdAt: "2026-08-01T12:00:00Z",
              processedAt: "2026-08-01T12:00:00Z",
              currencyCode: "USD",
              lineItems: { nodes: [] },
            },
          ],
        },
      },
    });

    const res = await runShopSync(shopDomainA, mockAdmin);
    expect(res.success).toBe(true);
    expect(res.job.status).toBe("COMPLETED");
    expect(res.job.errorSummary).toContain("missing read_returns scope");

    const status = await getSyncStatus(shopDomainA);
    expect(status.counts.orders).toBe(1);
    expect(status.counts.returns).toBe(0);
    expect(status.coverage.notes.some((n) => n.includes("read_returns"))).toBe(true);
  });

  it("recovers from transient network/throttling errors with retry", async () => {
    let callCount = 0;
    const mockAdmin = {
      graphql: async (query: string) => {
        if (query.includes("getProducts")) {
          callCount++;
          if (callCount === 1) {
            // First attempt throttled
            return {
              json: async () => ({
                errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
              }),
            };
          }
        }
        // Subsequent attempts succeed
        return {
          json: async () => ({
            data: {
              shop: { id: "1", name: "S", myshopifyDomain: shopDomainA, currencyCode: "USD" },
              products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
              orders: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
            },
          }),
        };
      },
    };

    const res = await runShopSync(shopDomainA, mockAdmin);
    expect(res.success).toBe(true);
    expect(callCount).toBeGreaterThan(1); // Confirmed retry happened
  });

  it("stores data strictly within the configured time set and halts pagination on older orders", async () => {
    // Setup shop with Last 30 days retention
    await db.shop.create({
      data: {
        shopDomain: shopDomainA,
        name: "Shop Alpha",
        currency: "USD",
        dateRangeAnalysis: "Last 30 days",
      },
    });

    const mockAdmin = createMockAdmin({
      shopDetails: {
        shop: {
          id: "gid://shopify/Shop/1",
          name: "Shop Alpha",
          myshopifyDomain: shopDomainA,
          currencyCode: "USD",
          ianaTimezone: "UTC",
        },
      },
      orders: {
        orders: {
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          nodes: [
            {
              id: "gid://shopify/Order/recent-101",
              name: "#101",
              createdAt: "2026-10-05T12:00:00Z",
              processedAt: "2026-10-05T12:00:00Z", // Inside 30 days from Oct 17
              currencyCode: "USD",
              lineItems: { nodes: [] },
              returns: { nodes: [] },
            },
            {
              id: "gid://shopify/Order/old-102",
              name: "#102",
              createdAt: "2026-08-01T12:00:00Z",
              processedAt: "2026-08-01T12:00:00Z", // Outside 30 days (77 days ago)
              currencyCode: "USD",
              lineItems: { nodes: [] },
              returns: { nodes: [] },
            },
          ],
        },
      },
    });

    const fixedDate = new Date("2026-10-17T12:00:00Z");
    const syncRes = await runShopSync(shopDomainA, mockAdmin, {
      referenceDate: fixedDate,
    });
    expect(syncRes.success).toBe(true);

    const storedOrders = await db.order.findMany({
      where: { shop: { shopDomain: shopDomainA } },
    });

    // Only the recent order should be stored in the database
    expect(storedOrders.length).toBe(1);
    expect(storedOrders[0].shopifyOrderId).toBe("gid://shopify/Order/recent-101");

    // The older order must NOT be stored
    const oldStoredOrder = await db.order.findFirst({
      where: { shopifyOrderId: "gid://shopify/Order/old-102" },
    });
    expect(oldStoredOrder).toBeNull();
  });
});
