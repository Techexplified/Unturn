import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useSearchParams, useNavigation, redirect } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { DonutChart } from "../components/DonutChart";
import { ProductThumb } from "../components/ProductThumb";
import { AllProductsDrawer } from "../components/AllProductsDrawer";
import { AllCausesDrawer } from "../components/AllCausesDrawer";
import { ProductDetailDrawer } from "../components/ProductDetailDrawer";
import { CauseDetailDrawer } from "../components/CauseDetailDrawer";
import { getSyncStatus, runShopSync, ensureShopRecord, type SyncStatusResult } from "../services/sync.server";
import { getOverviewAnalytics } from "../services/analytics.server";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  try {
    const { session, admin } = await authenticate.admin(request);
    const [shop, syncStatus] = await Promise.all([
      ensureShopRecord(session.shop, admin),
      getSyncStatus(session.shop),
    ]);

    const selectedRange = url.searchParams.get("range") || shop?.dateRangeAnalysis || "Last 90 days";

    // If new install (no store data or completed sync), guide merchant to Onboarding first
    const hasData = (syncStatus?.counts?.orders ?? 0) > 0 || (syncStatus?.counts?.products ?? 0) > 0;
    const completedJob = await db.syncJob.findFirst({
      where: { shop: { shopDomain: session.shop }, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
    });

    if (!hasData && !completedJob && !url.searchParams.get("skip_onboarding")) {
      const search = url.searchParams.toString();
      return redirect(search ? `/app/onboarding?${search}` : "/app/onboarding");
    }

    // Auto-sync: if no data yet, sync synchronously; otherwise trigger in background if older than 10 mins
    const isStale = !completedJob?.completedAt || (Date.now() - new Date(completedJob.completedAt).getTime() > 10 * 60_000);
    if (isStale && admin) {
      if (!hasData) {
        try {
          await runShopSync(session.shop, admin, { force: false });
        } catch (syncErr: any) {
          console.warn("[Overview Sync Warning]", syncErr?.message);
        }
      } else {
        // Non-blocking background sync so the page transition is instant
        runShopSync(session.shop, admin, { force: false }).catch((syncErr: any) => {
          console.warn("[Overview Background Sync Warning]", syncErr?.message);
        });
      }
    }

    const analytics = await getOverviewAnalytics(session.shop, selectedRange);

    return { shop: session.shop, syncStatus, analytics, selectedRange };
  } catch (err) {
    if (process.env.NODE_ENV === "development" && !new URL(request.url).searchParams.get("embedded")) {
      const firstShop = await db.shop.findFirst({ where: { isActive: true } });
      const shopDomain = firstShop?.shopDomain || "cartmend.myshopify.com";
      const selectedRange = url.searchParams.get("range") || firstShop?.dateRangeAnalysis || "Last 90 days";
      const syncStatus = await getSyncStatus(shopDomain);
      const analytics = await getOverviewAnalytics(shopDomain, selectedRange);
      return { shop: shopDomain, syncStatus, analytics, selectedRange };
    }
    throw err;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString() || "start";
  const force = intent === "retry";
  const result = await runShopSync(session.shop, admin, { force });
  const updatedStatus = await getSyncStatus(session.shop);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  const url = new URL(request.url);
  const selectedRange = url.searchParams.get("range") || shop?.dateRangeAnalysis || "Last 90 days";
  const analytics = await getOverviewAnalytics(session.shop, selectedRange);
  return { result, status: updatedStatus, analytics };
};

export default function OverviewPage() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const [isAllProductsOpen, setIsAllProductsOpen] = useState(false);
  const [isAllCausesOpen, setIsAllCausesOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedCauseName, setSelectedCauseName] = useState<string | null>(null);

  const isSubmitting = fetcher.state !== "idle";
  const isLoading = navigation.state === "loading";

  // Use latest analytics from refresh fetcher if available, fallback to loaderData
  const analytics = (fetcher.data as any)?.analytics || loaderData?.analytics;
  const metrics = analytics?.metrics;
  const currentRange = loaderData?.selectedRange || searchParams.get("range") || "Last 30 days";

  const handleTriggerSync = (intent: "start" | "retry") => {
    fetcher.submit({ intent }, { method: "post" });
  };

  const handleRangeChange = (newRange: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("range", newRange);
      return next;
    });
  };

  const top4Products = analytics?.topProducts ? analytics.topProducts.slice(0, 4) : [];
  const topCauses = analytics?.topCauses || [];
  const totalReturnsCount = metrics?.totalReturns ?? 0;

  return (
    <div>
      <PageHeader
        title="Return Overview"
        subtitle={`Here's how your returns look during ${metrics?.dateRangeLabel || currentRange}.`}
        selectedRange={currentRange}
        onRangeChange={handleRangeChange}
        extraControls={
          <button
            type="button"
            className="unturn-btn-secondary"
            onClick={() => handleTriggerSync("retry")}
            disabled={isSubmitting}
            title="Refresh returns and order data from Shopify"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                animation: isSubmitting ? "spin 1s linear infinite" : undefined,
              }}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{isSubmitting ? "Refreshing..." : "Refresh"}</span>
          </button>
        }
      />

      <div style={{ opacity: isLoading ? 0.6 : 1, transition: "opacity 0.15s ease" }}>
        {/* 4 Stat Cards */}
        <div className="unturn-stats-grid">
          <StatCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="5" x2="5" y2="19" />
                <circle cx="6.5" cy="6.5" r="2.5" />
                <circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
            }
            iconColor="blue"
            label="Return rate"
            infoTooltip={`Percentage of sold units returned (denominator: ${metrics?.returnRateDenominator || "units sold"}).`}
            value={metrics?.returnRate || "0.0%"}
            trendText={metrics?.returnRateTrend.text}
            trendColor={metrics?.returnRateTrend.color}
          />

          <StatCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            }
            iconColor="blue"
            label="Total returns"
            infoTooltip={`Total units returned (${metrics?.returnedOrders ?? 0} returned orders) during ${metrics?.dateRangeLabel || currentRange}.`}
            value={totalReturnsCount.toLocaleString()}
            trendText={metrics?.totalReturnsTrend.text}
            trendColor={metrics?.totalReturnsTrend.color}
          />

          <StatCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            }
            iconColor="blue"
            label="Estimated return cost"
            infoTooltip={metrics?.costAssumptions || "Calculated from refunded order line items and return totals."}
            value={metrics?.estimatedReturnCost || "₹0"}
            trendText={metrics?.estimatedReturnCostTrend.text}
            trendColor={metrics?.estimatedReturnCostTrend.color}
          />

          <StatCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            }
            iconColor="blue"
            label="Orders"
            infoTooltip={`Total volume of store orders placed during ${metrics?.dateRangeLabel || currentRange} (${metrics?.unitsSold ?? 0} units sold).`}
            value={(metrics?.totalOrders ?? 0).toLocaleString()}
            trendText={metrics?.totalOrdersTrend.text}
            trendColor={metrics?.totalOrdersTrend.color}
          />
        </div>

        {/* Main 2-column Grid */}
        <div className="unturn-grid-2col">
          {/* Left Card: Top products by return rate */}
          <div className="unturn-card">
            <div className="unturn-card-header">
              <div className="unturn-card-title-group">
                <h2 className="unturn-card-title">Top products by return rate</h2>
                <span className="unturn-info-icon" title="Products with the highest proportion of returns">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="unturn-card-body">
              <table className="unturn-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Return rate</th>
                    <th>Returns</th>
                    <th>Main issue</th>
                  </tr>
                </thead>
                <tbody>
                  {top4Products.length > 0 ? (
                    top4Products.map((p: any) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedProductId(p.id)}
                        style={{ cursor: "pointer" }}
                        title={`Click to view insights for ${p.name}`}
                      >
                        <td>
                          <div className="unturn-product-cell">
                            <ProductThumb src={p.image} alt={p.name} />
                            <div className="unturn-product-info">
                              <span className="unturn-product-name">{p.name}</span>
                              <span className="unturn-product-sku">{p.sku}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="unturn-rate-text">{p.returnRate}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 500 }}>{p.returns}</span>
                        </td>
                        <td>
                          <span className={`unturn-badge ${p.issueType}`}>
                            {p.mainIssue}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", padding: "40px 16px", color: "var(--ut-text-muted)" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 500, color: "var(--ut-text-secondary)" }}>No returned products recorded in this period</span>
                          <span style={{ fontSize: 12 }}>Items with customer returns will appear here once Shopify data is synced.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="unturn-card-footer">
              <button
                type="button"
                className="unturn-card-link"
                onClick={() => setIsAllProductsOpen(true)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span>View all products</span>
                <span>→</span>
              </button>
            </div>
          </div>

          {/* Right Card: Top return causes */}
          <div className="unturn-card">
            <div className="unturn-card-header">
              <div className="unturn-card-title-group">
                <h2 className="unturn-card-title">Top return causes</h2>
                <span className="unturn-info-icon" title="Primary customer-reported reasons for returns">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="unturn-card-body">
              <div className="unturn-donut-section">
                {/* Left Donut Chart */}
                <DonutChart causes={topCauses} total={totalReturnsCount} />

                {/* Right Breakdown List */}
                <div className="unturn-causes-breakdown">
                  <table className="unturn-causes-table">
                    <thead>
                      <tr>
                        <th>Cause</th>
                        <th>Returns</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCauses.length > 0 ? (
                        topCauses.map((cause: any) => (
                          <tr
                            key={cause.id}
                            onClick={() => setSelectedCauseName(cause.cause)}
                            style={{ cursor: "pointer" }}
                            title={`Click to view insights for ${cause.cause}`}
                          >
                            <td>
                              <div style={{ display: "flex", alignItems: "center" }}>
                                <span
                                  className="unturn-causes-dot"
                                  style={{ backgroundColor: cause.color }}
                                />
                                <span style={{ fontWeight: 500 }}>{cause.cause}</span>
                              </div>
                            </td>
                            <td>{cause.returns}</td>
                            <td style={{ fontWeight: 500 }}>{cause.share}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} style={{ textAlign: "center", padding: "40px 16px", color: "var(--ut-text-muted)" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                              <span style={{ fontWeight: 500, color: "var(--ut-text-secondary)" }}>No return causes recorded</span>
                              <span style={{ fontSize: 12 }}>Customer-reported return reasons will appear here once logged.</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="unturn-card-footer">
              <button
                type="button"
                className="unturn-card-link"
                onClick={() => setIsAllCausesOpen(true)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <span>View all causes</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <AllProductsDrawer
        isOpen={isAllProductsOpen}
        onClose={() => setIsAllProductsOpen(false)}
        products={analytics?.allProducts}
        onSelectProduct={(productId) => {
          setSelectedProductId(productId);
        }}
      />

      <AllCausesDrawer
        isOpen={isAllCausesOpen}
        onClose={() => setIsAllCausesOpen(false)}
        causes={analytics?.allCauses}
        onSelectCause={(causeName) => {
          setSelectedCauseName(causeName);
        }}
      />

      <ProductDetailDrawer
        isOpen={Boolean(selectedProductId)}
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        dateRange={currentRange}
        onSelectCause={(cause) => {
          setSelectedCauseName(cause);
        }}
      />

      <CauseDetailDrawer
        isOpen={Boolean(selectedCauseName)}
        causeName={selectedCauseName}
        onClose={() => setSelectedCauseName(null)}
        dateRange={currentRange}
        onSelectProduct={(prodId) => {
          setSelectedProductId(prodId);
        }}
      />
    </div>
  );
}
