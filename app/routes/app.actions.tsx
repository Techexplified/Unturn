import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useState, useEffect } from "react";
import { useNavigate, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { ProductThumb } from "../components/ProductThumb";
import type { Recommendation } from "../data/mockData";
import { KnowWhyModal, TakeActionModal } from "../components/ActionModals";
import { getAllStoreRecommendations } from "../services/recommendations.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let shopDomain = "cartmend.myshopify.com";
  try {
    const { session } = await authenticate.admin(request);
    shopDomain = session.shop;
  } catch (err) {
    if (process.env.NODE_ENV === "development" && !new URL(request.url).searchParams.get("embedded")) {
      const firstShop = await db.shop.findFirst({ where: { isActive: true } });
      shopDomain = firstShop?.shopDomain || "cartmend.myshopify.com";
    } else {
      throw err;
    }
  }

  // 1. Fetch active interventions so we exclude products currently being managed
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  const activeProductKeys = new Set<string>();

  const [activeInterventions, lastSyncJob, liveRecs] = shop
    ? await Promise.all([
        db.intervention.findMany({
          where: {
            shopId: shop.id,
            status: { in: ["IN_PROGRESS", "PLANNED"] },
          },
          include: { product: true },
        }),
        db.syncJob.findFirst({
          where: { shopId: shop.id },
          orderBy: { createdAt: "desc" },
        }),
        getAllStoreRecommendations(shopDomain),
      ])
    : [[], null, []];

  const activeInterventionsCount = activeInterventions.length;
  for (const item of activeInterventions) {
    if (item.productId) activeProductKeys.add(item.productId.toLowerCase());
    if (item.product?.id) activeProductKeys.add(item.product.id.toLowerCase());
    if (item.product?.title) activeProductKeys.add(item.product.title.toLowerCase());
    if (item.product?.handle) activeProductKeys.add(item.product.handle.toLowerCase());
    if (item.recommendationId) activeProductKeys.add(item.recommendationId.toLowerCase());
  }

  const isPcdError = Boolean(
    lastSyncJob?.errorSummary?.includes("Order object") ||
    lastSyncJob?.errorSummary?.includes("protected-customer-data")
  );

  const currencySymbol = shop?.currency === "INR" ? "₹" : shop?.currency === "EUR" ? "€" : "$";

  let rawRecommendations: Recommendation[] = [];

  if (liveRecs.length > 0) {
    rawRecommendations = liveRecs.map((rec, index) => ({
      id: index + 1,
      productId: rec.targetId,
      targetId: rec.targetId,
      title: rec.title,
      priority: rec.priority === "High" ? "High Priority" : "Medium Priority",
      productName: rec.targetName,
      category: rec.category,
      cause: rec.cause,
      description: rec.patternExplanation,
      productImage: rec.imageUrl || "/products/shirt.jpg",
      returns: rec.evidence.returnedUnits,
      returnRate: rec.evidence.returnRate,
      estSavings: rec.financialImpact.estimatedPreventableLoss,
      returnShare: rec.evidence.causeShare,
      whyThisMatters: {
        explanation: `${rec.preventability}: ${rec.preventabilityRationale}`,
        impactItems: [
          rec.expectedOutcome,
          rec.financialImpact.assumptions,
          ...rec.evidence.keySignals,
        ],
      },
      reasoning: {
        overview: rec.patternExplanation,
        customerVerbatim: rec.evidence.keySignals,
        topDriver: `${rec.cause} (${rec.evidence.causeShare} share)`,
        suggestedAction: rec.suggestedAction,
      },
    }));
  }

  // Filter out any recommendation whose product is actively managed in Interventions
  const recommendations = rawRecommendations.filter((rec) => {
    const pId = rec.productId?.toLowerCase();
    const tId = rec.targetId?.toLowerCase();
    const pName = rec.productName?.toLowerCase();
    const rId = `rec-${rec.id}`.toLowerCase();
    return !(
      (pId && activeProductKeys.has(pId)) ||
      (tId && activeProductKeys.has(tId)) ||
      (pName && activeProductKeys.has(pName)) ||
      activeProductKeys.has(rId)
    );
  });

  const totalReturnsReducible = recommendations.reduce(
    (acc, r) => acc + Math.max(1, Math.round(r.returns * 0.25)),
    0
  );
  const highImpactCount = recommendations.filter((r) => r.priority === "High Priority").length;

  // Live preventable cost savings calculation
  const totalEstSavingsNum =
    liveRecs.length > 0
      ? liveRecs.reduce((acc, r) => acc + (r.financialImpact.estimatedPreventableLossNum || 0), 0)
      : recommendations.reduce((acc, r) => {
          const num = parseInt(r.estSavings.replace(/[^0-9]/g, ""), 10) || 0;
          return acc + num;
        }, 0);

  const costSavingsFormatted = `${currencySymbol}${Math.round(totalEstSavingsNum).toLocaleString()}`;

  const totalStoreReturns = shop
    ? await db.return.count({ where: { shopId: shop.id } })
    : 0;
  const reductionPercent = totalStoreReturns > 0
    ? `-${Math.round((totalReturnsReducible / totalStoreReturns) * 100)}% of total returns`
    : recommendations.length > 0
    ? "-18% of total returns"
    : "0% of total returns";

  return {
    recommendations,
    highImpactCount,
    totalReturnsReducible,
    costSavingsFormatted,
    activeInterventionsCount,
    reductionPercent,
    isPcdError,
    lastSyncError: lastSyncJob?.errorSummary || null,
    shopCurrency: shop?.currency || "USD",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "reset_test_interventions") {
    const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
    if (shop) {
      await db.intervention.deleteMany({
        where: { shopId: shop.id },
      });
    }
    return { ok: true, reset: true };
  }
  return { ok: false };
};

export default function RecommendedActionsPage() {
  const navigate = useNavigate();
  const loaderData = useLoaderData<typeof loader>();
  const [prioritySort, setPrioritySort] = useState<"high-low" | "low-high">("high-low");
  const [activeWhyRec, setActiveWhyRec] = useState<Recommendation | null>(null);
  const [activeActionRec, setActiveActionRec] = useState<Recommendation | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const [recsList, setRecsList] = useState<Recommendation[]>(
    loaderData?.recommendations || []
  );

  useEffect(() => {
    setRecsList(loaderData?.recommendations || []);
  }, [loaderData?.recommendations]);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      const formData = new FormData();
      formData.append("intent", "retry");
      const res = await fetch("/api/sync", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage("Sync complete! Refreshing store data...");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setToastMessage(data.message || "Sync attempt recorded. Check diagnostics.");
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      setToastMessage("Failed to reach sync endpoint.");
    } finally {
      setIsSyncing(false);
    }
  };

  const sortedRecs = [...recsList].sort((a, b) => {
    if (prioritySort === "high-low") {
      return a.id - b.id;
    } else {
      return b.id - a.id;
    }
  });

  const handleConfirmAction = async (rec: Recommendation, notes: string, customTitle?: string) => {
    setActiveActionRec(null);

    // 1. Immediately remove from the recommended actions list in the UI
    setRecsList((prev) => prev.filter((r) => r.id !== rec.id && r.productName !== rec.productName));

    // Parse baseline rate
    const parsedRate = rec.returnRate
      ? parseFloat(rec.returnRate.replace("%", ""))
      : rec.whyThisMatters?.explanation.match(/(\d+\.?\d*)%/)?.[1]
      ? parseFloat(rec.whyThisMatters.explanation.match(/(\d+\.?\d*)%/)?.[1] || "19.3")
      : 19.3;

    try {
      await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: customTitle || rec.title,
          description: rec.description,
          productId: rec.productId || rec.targetId || rec.productName,
          cause: rec.cause,
          actionType: rec.cause.toLowerCase().includes("size")
            ? "SIZE_GUIDE"
            : rec.cause.toLowerCase().includes("damage")
            ? "PACKAGING"
            : rec.cause.toLowerCase().includes("expect")
            ? "IMAGERY"
            : "OTHER",
          notes: notes || undefined,
          status: "IN_PROGRESS",
          expectedOutcome: rec.whyThisMatters?.impactItems?.[0] || undefined,
          baselineReturnRate: parsedRate,
          baselineReturnedUnits: rec.returns,
          baselineUnitsSold: Math.round(rec.returns / (parsedRate / 100)),
          baselineCauseFrequency: Math.round(rec.returns * 0.62),
          baselinePeriod: "Baseline locked at intervention start",
        }),
      });
    } catch {
      // Continue navigation even if offline
    }

    setToastMessage(`Intervention launched for ${rec.productName}! Transferred to Interventions.`);
    setTimeout(() => {
      setToastMessage(null);
      navigate("/app/interventions");
    }, 1200);
  };

  return (
    <div>
      <PageHeader
        title="Recommended Actions"
        subtitle="System-generated recommendations to help you reduce future returns."
      />

      {/* Sub-header sort/filter bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="unturn-btn-secondary"
            onClick={handleTriggerSync}
            disabled={isSyncing}
            style={{ fontSize: 12, gap: 6, padding: "6px 12px", display: "inline-flex", alignItems: "center" }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>{isSyncing ? "Syncing..." : "Sync Store Returns"}</span>
          </button>
        </div>

        <button
          type="button"
          className="unturn-btn-secondary"
          onClick={() =>
            setPrioritySort(prioritySort === "high-low" ? "low-high" : "high-low")
          }
          style={{ fontSize: 12, gap: 6, padding: "6px 12px" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span>
            Priority: {prioritySort === "high-low" ? "High to Low" : "Low to High"}
          </span>
        </button>
      </div>

      {/* Protected Customer Data (PCD) Access Diagnostic Alert */}
      {loaderData?.isPcdError && (
        <div
          style={{
            padding: "16px 20px",
            marginBottom: 16,
            borderRadius: 10,
            backgroundColor: "var(--ut-warning-light)",
            border: "1px solid var(--ut-warning-border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: "0 0 4px 0", fontSize: 14, fontWeight: 700, color: "var(--ut-warning)" }}>
                Action Required: Shopify Protected Customer Data Approval Needed
              </h4>
              <p style={{ margin: "0 0 8px 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--ut-text-primary)" }}>
                Store products have synced successfully, but Shopify blocked reading orders and returns because this app needs Protected Customer Data approval in your Partner Dashboard:
              </p>
              <div
                style={{
                  fontSize: 11.5,
                  padding: "6px 10px",
                  borderRadius: 6,
                  backgroundColor: "rgba(0,0,0,0.05)",
                  fontFamily: "monospace",
                  marginBottom: 10,
                  wordBreak: "break-word",
                }}
              >
                {loaderData.lastSyncError}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ut-text-secondary)" }}>
                <strong>How to enable (instant for development stores):</strong>
                <ol style={{ margin: "4px 0 8px 18px", padding: 0 }}>
                  <li>Open <strong>Shopify Partner Dashboard → Apps → Unturn</strong>.</li>
                  <li>Click <strong>API access</strong> → <strong>Protected customer data</strong>.</li>
                  <li>Click <strong>Request access</strong> for <strong>Orders</strong> data (reason: return prevention & analytics).</li>
                  <li>Once requested, click <strong>Sync Store Returns</strong> above to pull live returns.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4 Stat Cards */}
      <div className="unturn-stats-grid">
        <StatCard
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          }
          iconColor="orange"
          label="High impact opportunities"
          value={String(loaderData?.highImpactCount ?? 0)}
          subtext="Actions to reduce returns"
        />

        <StatCard
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="8 12 12 16 16 12" />
              <line x1="12" y1="8" x2="12" y2="16" />
            </svg>
          }
          iconColor="green"
          label="Potential returns reducible"
          value={String(loaderData?.totalReturnsReducible ?? 0)}
          subtext={loaderData?.reductionPercent ?? "0% of total returns"}
        />

        <StatCard
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 7v10" />
              <path d="M9 10h6" />
              <path d="M9 13h4" />
            </svg>
          }
          iconColor="purple"
          label="Potential cost savings"
          value={loaderData?.costSavingsFormatted ?? "$0"}
          subtext="Estimated in selected period"
        />

        <StatCard
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="7 14 11 10 14 13 18 9" />
              <polyline points="14 9 18 9 18 13" />
            </svg>
          }
          iconColor="blue"
          label="Active changes tracking"
          value={String(loaderData?.activeInterventionsCount ?? 0)}
          subtext="You've started taking action"
        />
      </div>

      {/* Recommendations Table Card */}
      <div className="unturn-card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "9px 16px",
            borderBottom: "1px solid var(--ut-border-light)",
            display: "flex",
            alignItems: "center",
            fontSize: 11.5,
            fontWeight: 500,
            color: "var(--ut-text-secondary)",
            backgroundColor: "var(--ut-bg-card)",
            position: "sticky",
            top: 0,
            zIndex: 5,
          }}
        >
          <div style={{ flex: 1.3 }}>Recommendation</div>
          <div style={{ flex: 1, paddingLeft: 32 }}>Impact (in selected period)</div>
          <div style={{ width: 220, textAlign: "right" }}>Your action</div>
        </div>

        <div
          className="unturn-card-body unturn-table-scroll-container"
          style={{
            maxHeight: 480,
            overflowY: "auto",
            overflowX: "hidden",
            padding: 0,
          }}
        >
          {sortedRecs.length > 0 ? (
            sortedRecs.map((rec, index) => (
            <div key={rec.id} className="unturn-rec-row">
              {/* Left Details */}
              <div className="unturn-rec-details">
                <div className="unturn-rec-num">{index + 1}</div>
                <ProductThumb src={rec.productImage} alt={rec.productName} />
                <div className="unturn-rec-text">
                  <div className="unturn-rec-header-line">
                    <span className="unturn-rec-title">{rec.title}</span>
                    <span
                      className={`unturn-badge ${
                        rec.priority === "High Priority"
                          ? "high-priority"
                          : "medium-priority"
                      }`}
                    >
                      {rec.priority}
                    </span>
                  </div>
                  <span className="unturn-rec-sub">{rec.category}</span>
                  <p className="unturn-rec-desc">{rec.description}</p>
                </div>
              </div>

              {/* Middle Impact */}
              <div className="unturn-rec-impact">
                {/* Returns count */}
                <div className="unturn-impact-stat">
                  <div className="unturn-impact-stat-top">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="unturn-impact-pkg-icon"
                    >
                      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
                      <path d="M12 22V12" />
                      <polyline points="3.29 7 12 12 20.71 7" />
                      <path d="m7.5 4.27 9 5.15" />
                    </svg>
                    <span className="unturn-impact-stat-val">{rec.returns}</span>
                  </div>
                  <span className="unturn-impact-stat-lbl">Returns</span>
                </div>

                {/* Est savings */}
                <div className="unturn-impact-stat">
                  <div className="unturn-impact-stat-top">
                    <span className="unturn-impact-stat-val">{rec.estSavings}</span>
                  </div>
                  <span className="unturn-impact-stat-lbl">Est. savings</span>
                </div>

                {/* Return share */}
                <div className="unturn-impact-stat">
                  <div className="unturn-impact-stat-top">
                    <span className="unturn-impact-share-badge">{rec.returnShare}</span>
                  </div>
                  <span className="unturn-impact-stat-lbl">Return share</span>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="unturn-rec-actions">
                <button
                  type="button"
                  className="unturn-btn-secondary"
                  onClick={() => setActiveWhyRec(rec)}
                >
                  <span>Know why</span>
                  <span style={{ fontSize: 13, color: "var(--ut-text-muted)" }}>ⓘ</span>
                </button>
                <button
                  type="button"
                  className="unturn-btn-primary"
                  onClick={() => setActiveActionRec(rec)}
                >
                  Take Action
                </button>
              </div>
            </div>
          ))
        ) : (
          <div
            style={{
              padding: "60px 24px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                backgroundColor: loaderData?.activeInterventionsCount ? "var(--ut-success-light)" : "var(--ut-bg-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                color: loaderData?.activeInterventionsCount ? "var(--ut-success)" : "var(--ut-text-muted)",
              }}
            >
              {loaderData?.activeInterventionsCount ? "✓" : "📦"}
            </div>
            <div>
              <h3 style={{ margin: "0 0 6px 0", fontSize: 16, fontWeight: 700, color: "var(--ut-text-primary)" }}>
                {loaderData?.activeInterventionsCount
                  ? "All recommendations are being actively tracked!"
                  : "No return recommendations available yet"}
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "var(--ut-text-secondary)", maxWidth: 460 }}>
                {loaderData?.activeInterventionsCount
                  ? `You have active interventions currently tracking before vs. after performance. Visit the Interventions page to inspect return drops, trajectories, and cause shifts.`
                  : loaderData?.isPcdError
                  ? "Unturn needs Protected Customer Data approval in your Shopify Partner Dashboard to sync orders and returns. Once enabled, recommendations will appear here automatically."
                  : "Unturn continuously analyzes your store orders and returns to generate evidence-based return prevention recommendations. As returns are recorded, actionable recommendations will appear here."}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
              {loaderData?.activeInterventionsCount ? (
                <button
                  type="button"
                  className="unturn-btn-primary"
                  onClick={() => navigate("/app/interventions")}
                  style={{ fontSize: 13 }}
                >
                  View Active Interventions →
                </button>
              ) : (
                <button
                  type="button"
                  className="unturn-btn-primary"
                  onClick={handleTriggerSync}
                  disabled={isSyncing}
                  style={{ fontSize: 13 }}
                >
                  {isSyncing ? "Syncing Store Data..." : "↻ Run Return Data Sync"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

      {/* Interactive Modals */}
      <KnowWhyModal
        rec={activeWhyRec}
        productId={activeWhyRec?.productId || activeWhyRec?.targetId || activeWhyRec?.productName}
        productTitle={activeWhyRec?.productName}
        onClose={() => setActiveWhyRec(null)}
        onTakeAction={(rec) => setActiveActionRec(rec)}
      />

      <TakeActionModal
        rec={activeActionRec}
        onClose={() => setActiveActionRec(null)}
        onConfirm={handleConfirmAction}
      />

      {toastMessage && (
        <div className="unturn-toast">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
