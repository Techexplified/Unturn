import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import type { ProductDetailAnalytics } from "../services/analytics.server";
import { ProductThumb } from "./ProductThumb";
import { RecommendationCard } from "./RecommendationCard";
import type { PreventionRecommendation } from "../services/recommendations.server";
import {
  CreateInterventionModal,
  type CreateInterventionInitialData,
} from "./CreateInterventionModal";
import { KnowWhyModal } from "./ActionModals";

interface ProductDetailDrawerProps {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
  dateRange?: string;
  onSelectCause?: (causeName: string) => void;
}

export function ProductDetailDrawer({
  productId,
  isOpen,
  onClose,
  dateRange,
  onSelectCause,
}: ProductDetailDrawerProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<ProductDetailAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createInitialData, setCreateInitialData] = useState<CreateInterventionInitialData | undefined>(undefined);
  const [activeWhyRec, setActiveWhyRec] = useState<any | null>(null);

  // Fetch product detail analytics when drawer opens
  useEffect(() => {
    if (!isOpen || !productId) {
      setData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const rangeParam = dateRange ? `?range=${encodeURIComponent(dateRange)}` : "";
    fetch(`/api/analytics/product/${encodeURIComponent(productId)}${rangeParam}`)
      .then((res) => {
        if (!res.ok) throw new Error("Product analytics not available");
        return res.json();
      })
      .then((json: any) => {
        if (isMounted) {
          setData(json.product || json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load product analytics");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, productId, dateRange]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scrolling when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="unturn-drawer-backdrop"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="unturn-drawer"
        style={{ maxWidth: 540 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="unturn-drawer-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {data && <ProductThumb src={data.imageUrl} alt={data.title} size={36} />}
            <div>
              <h2 className="unturn-drawer-title">{data?.title || "Product Return Analytics"}</h2>
              <span style={{ fontSize: 11, color: "var(--ut-text-muted)" }}>
                {data?.sku ? `SKU: ${data.sku}` : "Product Details"}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="unturn-drawer-close"
            onClick={onClose}
            aria-label="Close product detail drawer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="unturn-drawer-body" style={{ padding: "18px 20px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--ut-text-muted)" }}>
              <div
                style={{
                  display: "inline-block",
                  width: 28,
                  height: 28,
                  border: "2px solid var(--ut-border)",
                  borderTopColor: "var(--ut-primary)",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  marginBottom: 12,
                }}
              />
              <div style={{ fontSize: 13, fontWeight: 500 }}>Loading product return analytics...</div>
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                padding: "16px",
                borderRadius: 8,
                backgroundColor: "#FEF2F2",
                border: "1px solid #FCA5A5",
                color: "#991B1B",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              <p style={{ margin: 0, fontWeight: 500 }}>{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="unturn-btn-secondary"
                style={{ marginTop: 12, fontSize: 12 }}
              >
                Close Drawer
              </button>
            </div>
          )}

          {!loading && !error && data && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Outlier Warning Banner */}
              {data.isOutlier && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    borderRadius: 8,
                    backgroundColor: "#FFFBEB",
                    border: "1px solid #FDE68A",
                    color: "#92400E",
                    fontSize: 12,
                  }}
                >
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <div>
                    <span style={{ fontWeight: 600 }}>High Return Rate:</span> This item has an elevated return rate of{" "}
                    <strong>{data.returnRate}</strong>, significantly exceeding normal return thresholds.
                  </div>
                </div>
              )}

              {/* 4 Supporting Metrics Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--ut-border)",
                    backgroundColor: "var(--ut-bg-subtle)",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginBottom: 4 }}>
                    Unit Return Rate
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ut-text-primary)" }}>
                    {data.returnRate}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ut-text-secondary)", marginTop: 2 }}>
                    {data.returnedUnits} returned / {data.unitsSold} sold
                  </div>
                </div>

                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--ut-border)",
                    backgroundColor: "var(--ut-bg-subtle)",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginBottom: 4 }}>
                    Primary Return Cause
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ut-text-primary)" }}>
                    <span className={`unturn-badge ${data.issueType}`}>{data.mainIssue}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ut-text-secondary)", marginTop: 4 }}>
                    Top customer driver
                  </div>
                </div>
              </div>

              {/* Return Reasons Breakdown for this Product */}
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ut-border)",
                  backgroundColor: "var(--ut-bg-card)",
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    margin: "0 0 12px 0",
                    color: "var(--ut-text-primary)",
                  }}
                >
                  Return Reasons for this Product
                </h3>

                {data.causesBreakdown.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {data.causesBreakdown.map((item) => (
                      <div
                        key={item.cause}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 8px",
                          borderRadius: 6,
                          backgroundColor: "var(--ut-bg-subtle)",
                          cursor: onSelectCause ? "pointer" : "default",
                        }}
                        onClick={() => onSelectCause && onSelectCause(item.cause)}
                      >
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ut-text-primary)" }}>
                          {item.cause}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 12, color: "var(--ut-text-secondary)" }}>
                            {item.count} units
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ut-text-primary)", minWidth: 42, textAlign: "right" }}>
                            {item.share}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--ut-text-muted)", textAlign: "center", padding: "12px 0" }}>
                    No return reasons recorded for this product.
                  </div>
                )}
              </div>

              {/* Variant Performance Breakdown */}
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--ut-border)",
                  backgroundColor: "var(--ut-bg-card)",
                }}
              >
                <h3
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    margin: "0 0 10px 0",
                    color: "var(--ut-text-primary)",
                  }}
                >
                  Variant Performance
                </h3>

                {data.variants.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--ut-border)" }}>
                        <th style={{ textAlign: "left", padding: "6px 4px", color: "var(--ut-text-muted)" }}>
                          Variant
                        </th>
                        <th style={{ textAlign: "right", padding: "6px 4px", color: "var(--ut-text-muted)" }}>
                          Units Sold
                        </th>
                        <th style={{ textAlign: "right", padding: "6px 4px", color: "var(--ut-text-muted)" }}>
                          Returns
                        </th>
                        <th style={{ textAlign: "right", padding: "6px 4px", color: "var(--ut-text-muted)" }}>
                          Return Rate
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.variants.map((v) => (
                        <tr key={v.id} style={{ borderBottom: "1px solid var(--ut-border-light)" }}>
                          <td style={{ padding: "8px 4px", fontWeight: 500 }}>
                            <div>{v.title}</div>
                            {v.sku && <div style={{ fontSize: 10, color: "var(--ut-text-muted)" }}>{v.sku}</div>}
                          </td>
                          <td style={{ textAlign: "right", padding: "8px 4px" }}>{v.unitsSold}</td>
                          <td style={{ textAlign: "right", padding: "8px 4px", fontWeight: 500 }}>
                            {v.returnedUnits}
                          </td>
                          <td style={{ textAlign: "right", padding: "8px 4px", fontWeight: 600 }}>
                            {v.returnRate}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--ut-text-muted)", textAlign: "center", padding: "12px 0" }}>
                    No variant breakdown available.
                  </div>
                )}
              </div>

              {/* Preventability & Recommendations (Phase 4) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      margin: 0,
                      color: "var(--ut-text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>Return Preventability & Actions</span>
                    {data.recommendations && data.recommendations.length > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: "var(--ut-primary-light)",
                          color: "var(--ut-primary-text)",
                          padding: "1px 6px",
                          borderRadius: 999,
                        }}
                      >
                        {data.recommendations.length}
                      </span>
                    )}
                  </h3>
                </div>

                {data.recommendations && data.recommendations.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {data.recommendations.map((rec) => (
                      <RecommendationCard
                        key={rec.id}
                        recommendation={rec}
                        onKnowWhy={(r) => {
                          setActiveWhyRec({
                            id: 1,
                            productId: data.id,
                            targetId: data.id,
                            title: r.title,
                            productName: data.title,
                            category: `${data.title} • ${r.cause}`,
                            cause: r.cause,
                            description: r.patternExplanation,
                            productImage: data.imageUrl || "/products/shirt.jpg",
                            returns: r.evidence.returnedUnits,
                            estSavings: r.financialImpact.estimatedPreventableLoss,
                            returnShare: r.evidence.causeShare,
                            whyThisMatters: {
                              explanation: `${r.preventability}: ${r.preventabilityRationale}`,
                              impactItems: [
                                r.expectedOutcome,
                                r.financialImpact.assumptions,
                                ...r.evidence.keySignals,
                              ],
                            },
                            reasoning: {
                              overview: r.patternExplanation,
                              customerVerbatim: r.evidence.keySignals,
                              topDriver: `${r.cause} (${r.evidence.causeShare} share)`,
                              suggestedAction: r.suggestedAction,
                            },
                          });
                        }}
                        onCreateIntervention={(r) => {
                          setCreateInitialData({
                            title: r.title,
                            description: r.suggestedAction,
                            productName: data.title,
                            productId: data.id,
                            cause: r.cause,
                            actionType:
                              r.issueType === "size-fit"
                                ? "SIZE_GUIDE"
                                : r.issueType === "damaged"
                                ? "PACKAGING"
                                : r.issueType === "not-as-expected"
                                ? "IMAGERY"
                                : "OTHER",
                            expectedOutcome: r.expectedOutcome,
                            recommendationId: r.id,
                            baselineReturnRate: data.returnRateNum,
                            baselineReturnedUnits: data.returnedUnits,
                          });
                          setIsCreateModalOpen(true);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: 8,
                      backgroundColor: "var(--ut-bg-subtle)",
                      border: "1px solid var(--ut-border)",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ut-text-primary)", marginBottom: 4 }}>
                      No Preventable Return Patterns Detected
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ut-text-muted)", lineHeight: 1.4 }}>
                      Returns for this product are either minimal, discretionary (e.g. buyer mind change), or lack the minimum sample size required to generate a defensible recommendation.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="unturn-drawer-footer">
          <span style={{ fontSize: 12, color: "var(--ut-text-muted)" }}>
            {data ? `Product ID: ${data.id.slice(0, 14)}...` : ""}
          </span>
          <button type="button" className="unturn-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <CreateInterventionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setIsCreateModalOpen(false);
          onClose();
          navigate("/app/interventions");
        }}
        initialData={createInitialData}
      />

      <KnowWhyModal
        rec={activeWhyRec}
        productId={activeWhyRec?.productId || data?.id}
        productTitle={data?.title}
        onClose={() => setActiveWhyRec(null)}
      />
    </div>
  );
}
