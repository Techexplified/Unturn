import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { getSyncStatus, runShopSync, ensureShopRecord } from "../services/sync.server";
import { getOverviewAnalytics } from "../services/analytics.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let shopDomain = "cartmend.myshopify.com";
  try {
    const { session, admin } = await authenticate.admin(request);
    await ensureShopRecord(session.shop, admin);
    shopDomain = session.shop;
  } catch (err) {
    if (process.env.NODE_ENV === "development" && !new URL(request.url).searchParams.get("embedded")) {
      const firstShop = await db.shop.findFirst({ where: { isActive: true } });
      shopDomain = firstShop?.shopDomain || "cartmend.myshopify.com";
    } else {
      throw err;
    }
  }

  const syncStatus = await getSyncStatus(shopDomain);
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  const analytics = await getOverviewAnalytics(shopDomain);

  return {
    shopDomain,
    shopName: shop?.name || shopDomain.replace(".myshopify.com", ""),
    syncStatus,
    analytics: {
      returnRate: analytics?.metrics?.returnRate ?? "0%",
      totalOrders: analytics?.metrics?.totalOrders ?? 0,
      totalReturns: analytics?.metrics?.totalReturns ?? 0,
      topCauses: analytics?.topCauses?.map((c) => c.cause) ?? [],
    },
    isConnected: Boolean(syncStatus?.isConnected),
    hasData: (syncStatus?.counts?.orders ?? 0) > 0 || (syncStatus?.counts?.products ?? 0) > 0,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  let shopDomain = "cartmend.myshopify.com";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let adminClient: any = null;

  try {
    const { session, admin } = await authenticate.admin(request);
    shopDomain = session.shop;
    adminClient = admin;
  } catch (err) {
    if (process.env.NODE_ENV === "development" && !new URL(request.url).searchParams.get("embedded")) {
      const firstShop = await db.shop.findFirst({ where: { isActive: true } });
      shopDomain = firstShop?.shopDomain || "cartmend.myshopify.com";
    } else {
      throw err;
    }
  }

  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "connect") {
    await ensureShopRecord(shopDomain, adminClient);
    const shop = await db.shop.findUnique({ where: { shopDomain } });
    const syncStatus = await getSyncStatus(shopDomain);
    return {
      success: true,
      phase: "connected",
      shopDomain,
      shopName: shop?.name || shopDomain.replace(".myshopify.com", ""),
      syncStatus,
    };
  }

  if (intent === "full_pipeline" || intent === "sync") {
    // 1. Ensure shop record exists
    await ensureShopRecord(shopDomain, adminClient);

    // 2. Actually trigger Shopify sync to import products, variants, orders, returns
    let syncResult: { success: boolean; message?: string } = { success: true, message: "Sync completed" };
    if (adminClient) {
      try {
        const res = await runShopSync(shopDomain, adminClient, { force: true });
        syncResult = { success: res.success, message: res.message || "Sync completed successfully" };
      } catch (syncErr: any) {
        console.warn("[Onboarding Sync Error]", syncErr?.message);
        syncResult = { success: false, message: syncErr?.message || "Sync encountered an error" };
      }
    }

    // 3. Retrieve updated sync status and run analytics
    const updatedStatus = await getSyncStatus(shopDomain);
    const analytics = await getOverviewAnalytics(shopDomain);

    return {
      success: syncResult.success,
      phase: "completed",
      message: syncResult.message || "Sync completed",
      syncStatus: updatedStatus,
      counts: {
        products: updatedStatus?.counts?.products ?? 0,
        orders: updatedStatus?.counts?.orders ?? 0,
        returns: updatedStatus?.counts?.returns ?? 0,
      },
      analytics: {
        returnRate: analytics?.metrics?.returnRate ?? "0%",
        totalOrders: analytics?.metrics?.totalOrders ?? 0,
        totalReturns: analytics?.metrics?.totalReturns ?? 0,
        topCauses: analytics?.topCauses?.map((c) => c.cause) ?? [],
      },
    };
  }

  return { success: true };
};

export default function OnboardingPage() {
  const loaderData = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<typeof action>();

  const initialCompleted = loaderData.hasData;
  const [currentStep, setCurrentStep] = useState<number>(initialCompleted ? 4 : 1);
  const [pipelinePhase, setPipelinePhase] = useState<"idle" | "connecting" | "syncing" | "analyzing" | "completed">(
    initialCompleted ? "completed" : "idle"
  );
  const [syncedCounts, setSyncedCounts] = useState<{
    products: number;
    orders: number;
    returns: number;
  }>({
    products: loaderData.syncStatus?.counts?.products ?? 0,
    orders: loaderData.syncStatus?.counts?.orders ?? 0,
    returns: loaderData.syncStatus?.counts?.returns ?? 0,
  });

  const [analyticsData, setAnalyticsData] = useState(loaderData.analytics);

  // Monitor fetcher data updates
  useEffect(() => {
    if (fetcher.data && fetcher.data.phase === "completed") {
      if (fetcher.data.counts) {
        setSyncedCounts(fetcher.data.counts);
      }
      if (fetcher.data.analytics) {
        setAnalyticsData(fetcher.data.analytics);
      }

      // Step 2 complete -> move to Step 3 (Analyze returns)
      setCurrentStep(3);
      setPipelinePhase("analyzing");

      const timer = setTimeout(() => {
        // Step 3 complete -> move to Step 4 (Get actionable insights)
        setCurrentStep(4);
        setPipelinePhase("completed");
      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [fetcher.data]);

  const handleConnectStore = () => {
    if (pipelinePhase === "connecting" || pipelinePhase === "syncing" || pipelinePhase === "analyzing") return;
    
    // Step 1: Connecting store
    setPipelinePhase("connecting");

    setTimeout(() => {
      // Step 2: Now sync store & fetch products and returns
      setCurrentStep(2);
      setPipelinePhase("syncing");
      fetcher.submit({ intent: "full_pipeline" }, { method: "post" });
    }, 500);
  };

  const handleStartSync = () => {
    if (pipelinePhase === "syncing" || pipelinePhase === "analyzing") return;
    setCurrentStep(2);
    setPipelinePhase("syncing");
    fetcher.submit({ intent: "full_pipeline" }, { method: "post" });
  };

  const handleGoToOverview = () => {
    navigate("/app");
  };

  const handleResetForTesting = () => {
    setCurrentStep(1);
    setPipelinePhase("idle");
  };

  const isWorking = pipelinePhase === "connecting" || pipelinePhase === "syncing" || pipelinePhase === "analyzing";

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "8px 0 24px 0" }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "var(--ut-text-primary)",
              margin: "0 0 6px 0",
              letterSpacing: "-0.02em",
            }}
          >
            Let's reduce your returns in just 4 simple steps
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--ut-text-secondary)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            We'll analyze your data and show you what's causing returns and what you can do about it.
          </p>
        </div>

        {/* Quick test control */}
        <button
          type="button"
          onClick={handleResetForTesting}
          className="unturn-btn-secondary"
          style={{ fontSize: 11, padding: "5px 10px", color: "var(--ut-text-muted)" }}
          title="Reset onboarding steps for demonstration"
        >
          Reset Demo
        </button>
      </div>

      {/* 4 Steps Container */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        {/* Dotted connecting line between steps */}
        <div
          style={{
            position: "absolute",
            top: 24,
            left: "12%",
            right: "12%",
            height: 2,
            borderTop: "2px dotted var(--ut-border)",
            zIndex: 0,
            pointerEvents: "none",
          }}
        />

        {/* 4 Step Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Step 1: Connect your store */}
          <div
            style={{
              backgroundColor: "var(--ut-bg-card)",
              border: `1px solid ${currentStep >= 1 ? "var(--ut-border)" : "var(--ut-border-light)"}`,
              borderRadius: 14,
              padding: "20px 16px 18px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              boxShadow: "var(--ut-shadow-sm)",
              position: "relative",
              minHeight: 280,
            }}
          >
            {/* Step Number Circle */}
            <div
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: "var(--ut-primary)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              1
            </div>

            {/* Icon Graphic */}
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                backgroundColor: "var(--ut-bg-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 18,
                marginBottom: 16,
                position: "relative",
              }}
            >
              {/* Shopify Bag Logo Image */}
              <img
                src="/shopify-logo.png"
                alt="Shopify"
                style={{
                  width: 38,
                  height: 42,
                  objectFit: "contain",
                }}
              />

              {/* Small link badge */}
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  right: -2,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  backgroundColor: "#ffffff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1b59f8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </div>
            </div>

            {/* Title & Desc */}
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px 0", color: "var(--ut-text-primary)" }}>
              Connect your store
            </h3>
            <p style={{ fontSize: 12, color: "var(--ut-text-secondary)", margin: "0 0 18px 0", lineHeight: 1.45 }}>
              Securely connect your Shopify store to get started.
            </p>

            {/* Button / Badge */}
            <div style={{ marginTop: "auto", width: "100%" }}>
              {pipelinePhase === "connecting" ? (
                <button
                  type="button"
                  className="unturn-btn-primary"
                  disabled
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: 12.5,
                    borderRadius: 7,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    opacity: 0.85,
                  }}
                >
                  <span className="unturn-spin">◌</span>
                  <span>Connecting...</span>
                </button>
              ) : currentStep > 1 ? (
                <button
                  type="button"
                  className="unturn-btn-primary"
                  onClick={handleConnectStore}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: 12.5,
                    borderRadius: 7,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <span>✓</span>
                  <span>Connected</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="unturn-btn-primary"
                  onClick={handleConnectStore}
                  disabled={isWorking}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: 12.5,
                    borderRadius: 7,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <span>Connect store</span>
                </button>
              )}

              {currentStep > 1 && (
                <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginTop: 6 }}>
                  {loaderData.shopName || loaderData.shopDomain}
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Sync your data */}
          <div
            style={{
              backgroundColor: "var(--ut-bg-card)",
              border: `1px solid ${currentStep >= 2 ? "var(--ut-border)" : "var(--ut-border-light)"}`,
              borderRadius: 14,
              padding: "20px 16px 18px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              boxShadow: "var(--ut-shadow-sm)",
              position: "relative",
              minHeight: 280,
              opacity: currentStep >= 1 ? 1 : 0.6,
            }}
          >
            {/* Step Number Circle */}
            <div
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: currentStep >= 2 ? "var(--ut-primary)" : "var(--ut-bg-subtle)",
                color: currentStep >= 2 ? "#ffffff" : "var(--ut-text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              2
            </div>

            {/* Icon Graphic */}
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                backgroundColor: "var(--ut-primary-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 18,
                marginBottom: 16,
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ut-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
                <path d="M12 12v9" />
                <path d="m8 17 4 4 4-4" />
              </svg>
            </div>

            {/* Title & Desc */}
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px 0", color: "var(--ut-text-primary)" }}>
              Sync your data
            </h3>
            <p style={{ fontSize: 12, color: "var(--ut-text-secondary)", margin: "0 0 18px 0", lineHeight: 1.45 }}>
              We'll import your orders, returns, products and reasons.
            </p>

            {/* Button / Status Pill */}
            <div style={{ marginTop: "auto", width: "100%" }}>
              {pipelinePhase === "syncing" ? (
                <div>
                  <button
                    type="button"
                    className="unturn-btn-primary"
                    disabled
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 12.5,
                      borderRadius: 7,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      opacity: 0.9,
                    }}
                  >
                    <span className="unturn-spin">◌</span>
                    <span>Syncing data...</span>
                  </button>
                  <div style={{ fontSize: 11, color: "var(--ut-primary)", marginTop: 6, fontWeight: 500 }}>
                    Fetching products & orders...
                  </div>
                </div>
              ) : currentStep > 2 ? (
                <div>
                  <div
                    style={{
                      padding: "7px 12px",
                      borderRadius: 20,
                      backgroundColor: "var(--ut-success-light)",
                      border: "1px solid var(--ut-success-border)",
                      color: "var(--ut-success)",
                      fontSize: 12,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <span>✓</span>
                    <span>Data synced</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginTop: 6 }}>
                    {syncedCounts.products > 0 || syncedCounts.orders > 0
                      ? `${syncedCounts.products} products • ${syncedCounts.orders} orders`
                      : "Store catalog & orders synced"}
                  </div>
                </div>
              ) : currentStep === 2 ? (
                <button
                  type="button"
                  className="unturn-btn-primary"
                  onClick={handleStartSync}
                  disabled={isWorking}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: 12.5,
                    borderRadius: 7,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <span>Start sync</span>
                </button>
              ) : (
                <div
                  style={{
                    padding: "7px 12px",
                    borderRadius: 20,
                    backgroundColor: "var(--ut-bg-subtle)",
                    color: "var(--ut-text-muted)",
                    fontSize: 12,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 10 }}>◌</span>
                  <span>Waiting for connection</span>
                </div>
              )}
            </div>
          </div>

          {/* Step 3: Analyze returns */}
          <div
            style={{
              backgroundColor: "var(--ut-bg-card)",
              border: `1px solid ${currentStep >= 3 ? "var(--ut-border)" : "var(--ut-border-light)"}`,
              borderRadius: 14,
              padding: "20px 16px 18px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              boxShadow: "var(--ut-shadow-sm)",
              position: "relative",
              minHeight: 280,
              opacity: currentStep >= 2 ? 1 : 0.6,
            }}
          >
            {/* Step Number Circle */}
            <div
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: currentStep >= 3 ? "var(--ut-primary)" : "var(--ut-bg-subtle)",
                color: currentStep >= 3 ? "#ffffff" : "var(--ut-text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              3
            </div>

            {/* Icon Graphic */}
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                backgroundColor: "var(--ut-primary-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 18,
                marginBottom: 16,
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ut-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>

            {/* Title & Desc */}
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px 0", color: "var(--ut-text-primary)" }}>
              Analyze returns
            </h3>
            <p style={{ fontSize: 12, color: "var(--ut-text-secondary)", margin: "0 0 18px 0", lineHeight: 1.45 }}>
              Our AI analyzes patterns and identifies the key drivers of returns.
            </p>

            {/* Status Pill */}
            <div style={{ marginTop: "auto", width: "100%" }}>
              {pipelinePhase === "analyzing" ? (
                <div>
                  <div
                    style={{
                      padding: "7px 12px",
                      borderRadius: 20,
                      backgroundColor: "var(--ut-primary-light)",
                      color: "var(--ut-primary)",
                      fontSize: 12,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <span className="unturn-spin">◌</span>
                    <span>AI analyzing...</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ut-primary)", marginTop: 6, fontWeight: 500 }}>
                    Identifying return drivers...
                  </div>
                </div>
              ) : currentStep > 3 ? (
                <div>
                  <div
                    style={{
                      padding: "7px 12px",
                      borderRadius: 20,
                      backgroundColor: "var(--ut-success-light)",
                      border: "1px solid var(--ut-success-border)",
                      color: "var(--ut-success)",
                      fontSize: 12,
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <span>✓</span>
                    <span>Patterns analyzed</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginTop: 6 }}>
                    {analyticsData?.topCauses && analyticsData.topCauses.length > 0
                      ? `${analyticsData.topCauses.length} return causes identified`
                      : "Return patterns & causes mapped"}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: "7px 12px",
                    borderRadius: 20,
                    backgroundColor: "var(--ut-bg-subtle)",
                    color: "var(--ut-text-muted)",
                    fontSize: 12,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>Pending</span>
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Get actionable insights */}
          <div
            style={{
              backgroundColor: "var(--ut-bg-card)",
              border: `1px solid ${currentStep >= 4 ? "var(--ut-border)" : "var(--ut-border-light)"}`,
              borderRadius: 14,
              padding: "20px 16px 18px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              boxShadow: "var(--ut-shadow-sm)",
              position: "relative",
              minHeight: 280,
              opacity: currentStep >= 3 ? 1 : 0.6,
            }}
          >
            {/* Step Number Circle */}
            <div
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                width: 24,
                height: 24,
                borderRadius: "50%",
                backgroundColor: currentStep >= 4 ? "var(--ut-primary)" : "var(--ut-bg-subtle)",
                color: currentStep >= 4 ? "#ffffff" : "var(--ut-text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              4
            </div>

            {/* Icon Graphic */}
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                backgroundColor: "var(--ut-primary-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 18,
                marginBottom: 16,
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ut-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>

            {/* Title & Desc */}
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px 0", color: "var(--ut-text-primary)" }}>
              Get actionable insights
            </h3>
            <p style={{ fontSize: 12, color: "var(--ut-text-secondary)", margin: "0 0 18px 0", lineHeight: 1.45 }}>
              See the top issues and recommended actions to reduce returns.
            </p>

            {/* Status Pill / Button */}
            <div style={{ marginTop: "auto", width: "100%" }}>
              {currentStep >= 4 ? (
                <div>
                  <button
                    type="button"
                    className="unturn-btn-primary"
                    onClick={handleGoToOverview}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 12.5,
                      borderRadius: 7,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <span>Ready! View Dashboard</span>
                    <span>→</span>
                  </button>
                  <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginTop: 6 }}>
                    Dashboard ready with live insights
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: "7px 12px",
                    borderRadius: 20,
                    backgroundColor: "var(--ut-bg-subtle)",
                    color: "var(--ut-text-muted)",
                    fontSize: 12,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>Pending</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Card 1: Your data is safe and secure */}
      <div
        style={{
          backgroundColor: "var(--ut-primary-light)",
          border: "1px solid var(--ut-primary-border)",
          borderRadius: 12,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            backgroundColor: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 1px 3px rgba(27, 89, 248, 0.15)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ut-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        </div>
        <div>
          <h4 style={{ margin: "0 0 2px 0", fontSize: 13.5, fontWeight: 700, color: "var(--ut-text-primary)" }}>
            Your data is safe and secure
          </h4>
          <p style={{ margin: 0, fontSize: 12, color: "var(--ut-text-secondary)", lineHeight: 1.4 }}>
            We only read the data required to generate return insights. You're in control.
          </p>
        </div>
      </div>

      {/* Bottom Card 2: That's it! Take you to your Overview dashboard */}
      <div
        onClick={handleGoToOverview}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleGoToOverview();
        }}
        style={{
          backgroundColor: "var(--ut-bg-card)",
          border: "1px solid var(--ut-border)",
          borderRadius: 12,
          padding: "14px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          boxShadow: "var(--ut-shadow-sm)",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              backgroundColor: "var(--ut-primary-light)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ut-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              <path d="M5 3v4" />
              <path d="M19 17v4" />
              <path d="M3 5h4" />
              <path d="M17 19h4" />
            </svg>
          </div>
          <div>
            <h4 style={{ margin: "0 0 2px 0", fontSize: 13.5, fontWeight: 700, color: "var(--ut-text-primary)" }}>
              That's it!
            </h4>
            <p style={{ margin: 0, fontSize: 12, color: "var(--ut-text-secondary)", lineHeight: 1.4 }}>
              Once all steps are completed, we'll take you to your Overview dashboard.
            </p>
          </div>
        </div>

        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            backgroundColor: "var(--ut-bg-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ut-primary)",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
