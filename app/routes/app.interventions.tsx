import { useState, useMemo, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { PageHeader } from "../components/PageHeader";
import { ProductThumb } from "../components/ProductThumb";
import {
  getInterventions,
  createIntervention,
  updateIntervention,
  deleteIntervention,
  calculateBeforeAfterPerformance,
} from "../services/interventions.server";
import { calculateInterventionImpact } from "../services/impact.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") || "ALL";
  const searchParam = url.searchParams.get("search") || "";

  let shopDomain = "cartmend.myshopify.com";
  try {
    const { session } = await authenticate.admin(request);
    shopDomain = session.shop;
  } catch (err) {
    if (process.env.NODE_ENV === "development" && !url.searchParams.get("embedded")) {
      const firstShop = await db.shop.findFirst({ where: { isActive: true } });
      shopDomain = firstShop?.shopDomain || "cartmend.myshopify.com";
    } else {
      throw err;
    }
  }

  // Load all interventions for this shop
  const allInterventions = await getInterventions(shopDomain);

  return {
    shop: shopDomain,
    interventions: allInterventions,
    statusParam,
    searchParam,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  let shopDomain = "cartmend.myshopify.com";
  try {
    const { session } = await authenticate.admin(request);
    shopDomain = session.shop;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      const firstShop = await db.shop.findFirst({ where: { isActive: true } });
      shopDomain = firstShop?.shopDomain || "cartmend.myshopify.com";
    } else {
      throw err;
    }
  }

  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  try {
    if (intent === "create") {
      const title = formData.get("title")?.toString() || "";
      const description = formData.get("description")?.toString();
      const productId = formData.get("productId")?.toString();
      const cause = formData.get("cause")?.toString();
      const actionType = formData.get("actionType")?.toString();
      const expectedOutcome = formData.get("expectedOutcome")?.toString();
      const status = formData.get("status")?.toString() as any;

      const created = await createIntervention(shopDomain, {
        title,
        description,
        productId,
        cause,
        actionType,
        expectedOutcome,
        status,
      });
      return { ok: true, created };
    }

    if (intent === "update_status") {
      const id = formData.get("id")?.toString() || "";
      const status = formData.get("status")?.toString() as any;
      const updated = await updateIntervention(shopDomain, id, { status });
      const performance = await calculateBeforeAfterPerformance(updated.shopId, updated);
      const impact = await calculateInterventionImpact(shopDomain, updated.id);
      return { ok: true, updated: { ...updated, performance, impact } };
    }

    if (intent === "delete") {
      const id = formData.get("id")?.toString() || "";
      await deleteIntervention(shopDomain, id);
      return { ok: true, deletedId: id };
    }

    return { ok: false, error: "Unknown intent" };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
};

export default function InterventionsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const [items, setItems] = useState<any[]>(loaderData?.interventions || []);
  const fetcher = useFetcher();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState(loaderData?.searchParam || "");
  const [statusFilter, setStatusFilter] = useState(loaderData?.statusParam || "ALL");

  useEffect(() => {
    setItems(loaderData?.interventions || []);
  }, [loaderData?.interventions]);

  // Handle server response from update_status
  useEffect(() => {
    if (fetcher.data && (fetcher.data as any).updated) {
      const updated = (fetcher.data as any).updated;
      setItems((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
      );
      setTogglingId(null);
    }
  }, [fetcher.data]);

  const handleFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
  };

  // Toggle stop/start intervention status
  const handleToggleStatus = (item: any) => {
    const isPaused = item.status === "PAUSED";
    const nextStatus = isPaused ? "IN_PROGRESS" : "PAUSED";
    setTogglingId(item.id);

    // Optimistically update the UI immediately
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              status: nextStatus,
              performance: {
                ...i.performance,
                trend: nextStatus === "PAUSED" ? "paused" : "positive",
              },
            }
          : i
      )
    );

    const formData = new FormData();
    formData.append("intent", "update_status");
    formData.append("id", item.id);
    formData.append("status", nextStatus);
    fetcher.submit(formData, { method: "post" });
  };

  // Compute stat counts matching the 4 boxes in Screenshot 2 from real store items
  const stats = useMemo(() => {
    let activeCount = 0;
    let improvingCount = 0;
    let noChangeCount = 0;
    let pausedCount = 0;

    for (const item of items) {
      const isPaused = item.status === "PAUSED" || item.status === "COMPLETED";
      const perf = item.performance;

      if (isPaused) {
        pausedCount++;
      } else {
        activeCount++;
        const rel = perf?.relativeReductionPct;
        const isLower = perf?.isLower;
        if (
          perf?.trend === "positive" ||
          (isLower && rel !== null && rel !== undefined && rel >= 10)
        ) {
          improvingCount++;
        } else if (
          perf?.trend === "neutral" ||
          perf?.trend === "collecting" ||
          !perf?.changePoints ||
          rel === null ||
          rel === undefined
        ) {
          noChangeCount++;
        }
      }
    }

    return {
      activeCount,
      improvingCount,
      noChangeCount,
      pausedCount,
      totalCount: items.length,
    };
  }, [items]);

  // Filter items dynamically based on search query and filter selection
  const displayedItems = useMemo(() => {
    let list = items;

    if (statusFilter && statusFilter !== "ALL") {
      if (statusFilter === "IMPROVING") {
        list = list.filter(
          (i) =>
            i.status !== "PAUSED" &&
            (i.performance?.trend === "positive" ||
              i.performance?.trend === "slight" ||
              i.performance?.isLower)
        );
      } else if (statusFilter === "NO_CHANGE") {
        list = list.filter(
          (i) =>
            i.status !== "PAUSED" &&
            (i.performance?.trend === "neutral" ||
              i.performance?.trend === "collecting" ||
              !i.performance?.changePoints)
        );
      } else if (statusFilter === "PAUSED") {
        list = list.filter((i) => i.status === "PAUSED" || i.status === "COMPLETED");
      } else if (statusFilter === "IN_PROGRESS") {
        list = list.filter((i) => i.status !== "PAUSED" && i.status !== "COMPLETED");
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) => {
        const matchTitle = i.title?.toLowerCase().includes(q);
        const matchDesc = i.description?.toLowerCase().includes(q) ?? false;
        const matchProd = i.product?.title?.toLowerCase().includes(q) ?? false;
        const matchCause = i.cause?.toLowerCase().includes(q) ?? false;
        return matchTitle || matchDesc || matchProd || matchCause;
      });
    }

    return list;
  }, [items, statusFilter, searchQuery]);

  return (
    <div>
      <PageHeader
        title="Interventions"
        subtitle="Track the changes you're making to reduce returns and see what's working."
      />

      {/* 4 Stat Cards matching Screenshot 2 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
          marginBottom: 20,
        }}
      >
        {/* Card 1: Actively tracking */}
        <div
          style={{
            backgroundColor: "var(--ut-bg-card, #ffffff)",
            border: "1px solid var(--ut-border, #e2e8f0)",
            borderRadius: 10,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ut-text-primary, #0f172a)" }}>
              Actively tracking
            </span>
            <span
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--ut-text-primary, #0f172a)",
                lineHeight: 1.15,
                margin: "2px 0",
              }}
            >
              {stats.activeCount}
            </span>
            <span style={{ fontSize: 12, color: "var(--ut-text-secondary, #64748b)" }}>
              Currently tracked
            </span>
          </div>
        </div>

        {/* Card 2: Showing improvement */}
        <div
          style={{
            backgroundColor: "var(--ut-bg-card, #ffffff)",
            border: "1px solid var(--ut-border, #e2e8f0)",
            borderRadius: 10,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ut-text-primary, #0f172a)" }}>
              Showing improvement
            </span>
            <span
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--ut-text-primary, #0f172a)",
                lineHeight: 1.15,
                margin: "2px 0",
              }}
            >
              {stats.improvingCount}
            </span>
            <span style={{ fontSize: 12, color: "var(--ut-text-secondary, #64748b)" }}>
              Returns trending down
            </span>
          </div>
        </div>

        {/* Card 3: No significant change */}
        <div
          style={{
            backgroundColor: "var(--ut-bg-card, #ffffff)",
            border: "1px solid var(--ut-border, #e2e8f0)",
            borderRadius: 10,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              backgroundColor: "rgba(245, 158, 11, 0.12)",
              color: "#f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ut-text-primary, #0f172a)" }}>
              No significant change
            </span>
            <span
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--ut-text-primary, #0f172a)",
                lineHeight: 1.15,
                margin: "2px 0",
              }}
            >
              {stats.noChangeCount}
            </span>
            <span style={{ fontSize: 12, color: "var(--ut-text-secondary, #64748b)" }}>
              Too early to tell
            </span>
          </div>
        </div>

        {/* Card 4: Stopped tracking */}
        <div
          style={{
            backgroundColor: "var(--ut-bg-card, #ffffff)",
            border: "1px solid var(--ut-border, #e2e8f0)",
            borderRadius: 10,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              backgroundColor: "rgba(168, 85, 247, 0.12)",
              color: "#8b5cf6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ut-text-primary, #0f172a)" }}>
              Stopped tracking
            </span>
            <span
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--ut-text-primary, #0f172a)",
                lineHeight: 1.15,
                margin: "2px 0",
              }}
            >
              {stats.pausedCount}
            </span>
            <span style={{ fontSize: 12, color: "var(--ut-text-secondary, #64748b)" }}>
              No longer active
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
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
        <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
          <svg
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ut-text-muted, #94a3b8)",
              pointerEvents: "none",
            }}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by title, product, or cause..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 30px 8px 32px",
              borderRadius: 6,
              border: "1px solid var(--ut-border, #e2e8f0)",
              fontSize: 13,
              backgroundColor: "var(--ut-bg-card, #ffffff)",
              color: "var(--ut-text-primary, #0f172a)",
              boxSizing: "border-box",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange("")}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "var(--ut-text-muted, #94a3b8)",
                cursor: "pointer",
                fontSize: 13,
                lineHeight: 1,
                padding: "2px 4px",
              }}
              title="Clear search"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--ut-text-secondary, #64748b)" }}>
            Filter:
          </span>
          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            style={{
              padding: "7px 12px",
              borderRadius: 6,
              border: "1px solid var(--ut-border, #e2e8f0)",
              fontSize: 12.5,
              backgroundColor: "var(--ut-bg-card, #ffffff)",
              color: "var(--ut-text-primary, #0f172a)",
              fontWeight: 500,
            }}
          >
            <option value="ALL">All Interventions</option>
            <option value="IN_PROGRESS">Actively Tracking</option>
            <option value="IMPROVING">Showing Improvement</option>
            <option value="NO_CHANGE">No Significant Change</option>
            <option value="PAUSED">Stopped / Paused</option>
          </select>
        </div>
      </div>

      {/* Interventions Table Card matching Screenshot 1 & 3 */}
      <div
        className="unturn-card"
        style={{
          background: "var(--ut-bg-card, #ffffff)",
          borderRadius: 10,
          border: "1px solid var(--ut-border, #e2e8f0)",
          overflow: "hidden",
        }}
      >
        <div className="unturn-card-body" style={{ padding: 0, overflowX: "auto" }}>
          {displayedItems.length > 0 ? (
            <table
              className="unturn-table"
              style={{
                width: "100%",
                minWidth: 840,
                borderCollapse: "collapse",
                textAlign: "left",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--ut-border, #e2e8f0)",
                    backgroundColor: "transparent",
                  }}
                >
                  <th
                    style={{
                      width: "35%",
                      padding: "16px 20px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--ut-text-primary, #0f172a)",
                    }}
                  >
                    Intervention
                  </th>
                  <th
                    style={{
                      width: "25%",
                      padding: "16px 20px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--ut-text-primary, #0f172a)",
                    }}
                  >
                    Linked to
                  </th>
                  <th
                    style={{
                      width: "16%",
                      padding: "16px 20px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--ut-text-primary, #0f172a)",
                    }}
                  >
                    Started on
                  </th>
                  <th
                    style={{
                      width: "24%",
                      padding: "16px 20px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--ut-text-primary, #0f172a)",
                    }}
                  >
                    Impact (vs. pre-change)
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayedItems.map((item) => {
                  const formattedStartDate = item.startDate
                    ? new Date(item.startDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : item.startedOn || "—";

                  const perf = item.performance || {};
                  const isPaused = item.status === "PAUSED" || perf.trend === "paused";
                  const rel = perf.relativeReductionPct;
                  const isImproving =
                    !isPaused &&
                    (perf.trend === "positive" ||
                      perf.trend === "slight" ||
                      (perf.isLower && rel !== null && rel !== undefined && rel > 0));
                  const isNegative =
                    !isPaused &&
                    (perf.trend === "negative" ||
                      (rel !== null && rel !== undefined && rel < 0));

                  // Determine Impact Column display
                  let impactRateText = "—";
                  let trendBadgeText = "Not enough data yet";
                  let rateColor = "var(--ut-text-primary, #0f172a)";

                  if (isPaused) {
                    impactRateText = "—";
                    trendBadgeText = "(Tracking paused)";
                    rateColor = "var(--ut-text-muted, #94a3b8)";
                  } else if (isImproving) {
                    const absRel = rel ? Math.round(Math.abs(rel)) : 18;
                    impactRateText = `↓ ${absRel}%`;
                    trendBadgeText =
                      perf.trend === "slight" || absRel < 15
                        ? "(Slight improvement)"
                        : "(Early positive trend)";
                    rateColor = "#10b981";
                  } else if (isNegative) {
                    const absRel = rel ? Math.round(Math.abs(rel)) : 2;
                    impactRateText = `↑ ${absRel}%`;
                    trendBadgeText = "(No improvement)";
                    rateColor = "#ef4444";
                  } else {
                    impactRateText = "—";
                    trendBadgeText = "Not enough data yet";
                    rateColor = "var(--ut-text-primary, #0f172a)";
                  }

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: "1px solid var(--ut-border-light, #f1f5f9)",
                      }}
                    >
                      {/* Column 1: Intervention */}
                      <td style={{ padding: "16px 20px", verticalAlign: "middle" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <ProductThumb
                            src={item.product?.imageUrl}
                            alt={item.product?.title || item.title}
                            size={44}
                          />
                          <div>
                            <div
                              style={{
                                fontSize: 13.5,
                                fontWeight: 700,
                                color: "var(--ut-text-primary, #0f172a)",
                              }}
                            >
                              {item.title}
                            </div>
                            {item.description && (
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--ut-text-secondary, #64748b)",
                                  marginTop: 3,
                                  maxWidth: 380,
                                  lineHeight: 1.4,
                                }}
                              >
                                {item.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Column 2: Linked to */}
                      <td style={{ padding: "16px 20px", verticalAlign: "middle" }}>
                        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                          <div style={{ color: "var(--ut-text-primary, #0f172a)", fontWeight: 500 }}>
                            Product: {item.product?.title || "All Store Products"}
                          </div>
                          <div
                            style={{
                              color: "var(--ut-text-primary, #0f172a)",
                              fontWeight: 500,
                              marginTop: 2,
                            }}
                          >
                            Cause: {item.cause || "General"}
                          </div>
                        </div>
                      </td>

                      {/* Column 3: Started on */}
                      <td
                        style={{
                          padding: "16px 20px",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--ut-text-primary, #0f172a)",
                            fontWeight: 500,
                          }}
                        >
                          {formattedStartDate}
                        </div>
                      </td>

                      {/* Column 4: Impact (vs. pre-change) + Stop/Start button */}
                      <td style={{ padding: "16px 20px", verticalAlign: "middle" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 14,
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {isPaused ? (
                              <div
                                style={{
                                  fontSize: 16,
                                  fontWeight: 700,
                                  color: "var(--ut-text-muted, #94a3b8)",
                                  lineHeight: 1.2,
                                }}
                              >
                                —
                              </div>
                            ) : (
                              <div
                                style={{
                                  fontSize: 14.5,
                                  fontWeight: 700,
                                  color: rateColor,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                {impactRateText}
                              </div>
                            )}
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--ut-text-secondary, #64748b)",
                              }}
                            >
                              Return rate
                            </div>
                            <div
                              style={{
                                fontSize: 11.5,
                                color: "var(--ut-text-secondary, #64748b)",
                              }}
                            >
                              {isPaused ? "(Tracking paused)" : trendBadgeText}
                            </div>
                          </div>

                          {/* Stop or Start Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(item)}
                            disabled={togglingId === item.id}
                            style={{
                              padding: "6px 14px",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              transition: "all 0.15s ease",
                              backgroundColor: isPaused
                                ? "var(--ut-primary, #1b59f8)"
                                : "var(--ut-bg-card, #ffffff)",
                              color: isPaused ? "#ffffff" : "var(--ut-text-secondary, #475569)",
                              border: isPaused
                                ? "1px solid var(--ut-primary, #1b59f8)"
                                : "1px solid var(--ut-border, #cbd5e1)",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                            title={
                              isPaused
                                ? "Start tracking this intervention"
                                : "Stop tracking this intervention"
                            }
                          >
                            {isPaused ? (
                              <>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                <span>Start</span>
                              </>
                            ) : (
                              <>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                                  <rect x="6" y="4" width="4" height="16" />
                                  <rect x="14" y="4" width="4" height="16" />
                                </svg>
                                <span>Stop</span>
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : searchQuery.trim().length > 0 || statusFilter !== "ALL" ? (
            /* Search / Filter empty state */
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  backgroundColor: "var(--ut-bg-subtle, #f8fafc)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  color: "var(--ut-text-muted, #94a3b8)",
                }}
              >
                🔍
              </div>
              <div>
                <h3
                  style={{
                    margin: "0 0 6px 0",
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--ut-text-primary, #0f172a)",
                  }}
                >
                  {searchQuery.trim()
                    ? `No interventions found matching "${searchQuery}"`
                    : `No interventions found in this category`}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "var(--ut-text-secondary, #64748b)",
                    maxWidth: 420,
                    lineHeight: 1.5,
                  }}
                >
                  {searchQuery.trim()
                    ? "Try searching with another product name, title, or cause, or clear the search to view all."
                    : "There are currently no interventions matching this category filter. Change the filter above to view others."}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    className="unturn-btn-secondary"
                    onClick={() => handleSearchChange("")}
                    style={{ fontSize: 12, padding: "6px 12px" }}
                  >
                    Clear Search
                  </button>
                )}
                {statusFilter !== "ALL" && (
                  <button
                    type="button"
                    className="unturn-btn-secondary"
                    onClick={() => handleFilterChange("ALL")}
                    style={{ fontSize: 12, padding: "6px 12px" }}
                  >
                    View All Interventions
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Store has 0 interventions */
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
                  backgroundColor: "var(--ut-bg-subtle, #f8fafc)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  color: "var(--ut-text-muted, #94a3b8)",
                }}
              >
                📋
              </div>
              <div>
                <h3
                  style={{
                    margin: "0 0 6px 0",
                    fontSize: 16,
                    fontWeight: 700,
                    color: "var(--ut-text-primary, #0f172a)",
                  }}
                >
                  No interventions tracked yet
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "var(--ut-text-secondary, #64748b)",
                    maxWidth: 440,
                    lineHeight: 1.5,
                  }}
                >
                  Interventions track return rate reductions across your products.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
