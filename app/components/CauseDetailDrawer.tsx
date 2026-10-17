import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import type { CauseDetailAnalytics } from "../services/analytics.server";
import { ProductThumb } from "./ProductThumb";
import { RecommendationCard } from "./RecommendationCard";
import {
  CreateInterventionModal,
  type CreateInterventionInitialData,
} from "./CreateInterventionModal";

interface CauseDetailDrawerProps {
  causeName: string | null;
  isOpen: boolean;
  onClose: () => void;
  dateRange?: string;
  onSelectProduct?: (productId: string) => void;
}

const CAUSE_EXPLANATIONS: Record<string, string> = {
  "Size / Fit":
    "Customers reported items being too tight, too loose, or differing from expected sizing charts.",
  "Not as expected":
    "Item style, color, or appearance differed from customer expectations based on online imagery or descriptions.",
  "Damaged / Defective":
    "Items arrived broken, ripped, or damaged in transit or manufacturing.",
  "Quality / Fabric":
    "Customer dissatisfaction with fabric weight, texture, durability, or material feel.",
  "Wrong item sent":
    "Fulfillment errors where an incorrect SKU, color, or variant was packaged.",
  "Customer mind change / Other":
    "Returns due to customer regret, late arrival, or unspecified buyer reasons.",
  "Unspecified / No reason":
    "Returns recorded without customer-provided reasons or notes.",
};

export function CauseDetailDrawer({
  causeName,
  isOpen,
  onClose,
  dateRange,
  onSelectProduct,
}: CauseDetailDrawerProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<CauseDetailAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createInitialData, setCreateInitialData] = useState<CreateInterventionInitialData | undefined>(undefined);

  // Fetch cause detail analytics when drawer opens
  useEffect(() => {
    if (!isOpen || !causeName) {
      setData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const rangeParam = dateRange ? `?range=${encodeURIComponent(dateRange)}` : "";
    fetch(`/api/analytics/cause/${encodeURIComponent(causeName)}${rangeParam}`)
      .then((res) => {
        if (!res.ok) throw new Error("Cause analytics not available");
        return res.json();
      })
      .then((json: any) => {
        if (isMounted) {
          setData(json.cause || json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load cause analytics");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, causeName, dateRange]);

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

  const explanation = (causeName && CAUSE_EXPLANATIONS[causeName]) || "Customer-reported return cause.";

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
            {data && (
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  backgroundColor: data.color || "#1B59F8",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
            )}
            <div>
              <h2 className="unturn-drawer-title">{causeName || "Return Cause Details"}</h2>
              <span style={{ fontSize: 11, color: "var(--ut-text-muted)" }}>
                Cause Analysis & Evidence
              </span>
            </div>
          </div>
          <button
            type="button"
            className="unturn-drawer-close"
            onClick={onClose}
            aria-label="Close cause detail drawer"
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
              <div style={{ fontSize: 13, fontWeight: 500 }}>Loading return cause analytics...</div>
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
              {/* Category Explanation Box */}
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  backgroundColor: "var(--ut-bg-subtle)",
                  border: "1px solid var(--ut-border)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ut-text-primary)", marginBottom: 4 }}>
                  Cause Definition
                </div>
                <div style={{ fontSize: 12, color: "var(--ut-text-secondary)", lineHeight: 1.45 }}>
                  {explanation}
                </div>
              </div>

              {/* Summary Metrics */}
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
                    backgroundColor: "var(--ut-bg-card)",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginBottom: 4 }}>
                    Total Units Returned
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ut-text-primary)" }}>
                    {data.returnsCount}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ut-text-secondary)", marginTop: 2 }}>
                    Attributed to this cause
                  </div>
                </div>

                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--ut-border)",
                    backgroundColor: "var(--ut-bg-card)",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginBottom: 4 }}>
                    Share of Total Returns
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: data.color || "var(--ut-primary)" }}>
                    {data.share}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ut-text-secondary)", marginTop: 2 }}>
                    Of all return requests
                  </div>
                </div>
              </div>

              {/* Top Impacted Products for this Cause */}
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
                  Top Impacted Products
                </h3>

                {data.topProducts.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {data.topProducts.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: 6,
                          backgroundColor: "var(--ut-bg-subtle)",
                          cursor: onSelectProduct ? "pointer" : "default",
                        }}
                        onClick={() => onSelectProduct && onSelectProduct(p.id)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <ProductThumb src={p.imageUrl} alt={p.title} size={32} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ut-text-primary)" }}>
                              {p.title}
                            </div>
                            <div style={{ fontSize: 10.5, color: "var(--ut-text-muted)" }}>
                              {p.sku || "SKU: —"}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ut-text-primary)" }}>
                            {p.returnsCount} returns
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--ut-text-muted)", textAlign: "center", padding: "12px 0" }}>
                    No products specifically associated with this return cause.
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
                    <span>Systemic Preventability & Recommendations</span>
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
                        onCreateIntervention={(r) => {
                          setCreateInitialData({
                            title: r.title,
                            description: r.suggestedAction,
                            cause: data.causeName,
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
                            baselineReturnedUnits: data.returnsCount,
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
                      No Systemic Prevention Patterns Detected
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ut-text-muted)", lineHeight: 1.4 }}>
                      This return cause is either buyer discretionary, lacks actionable root cause notes, or does not have sufficient volume to warrant an intervention.
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
            {data ? `Reported driver: ${data.causeName}` : ""}
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
    </div>
  );
}
