import React, { useState, useEffect } from "react";
import type { Recommendation } from "../data/mockData";
import { ProductThumb } from "./ProductThumb";

interface DynamicAIData {
  explanation: string;
  impactItems: string[];
  metrics?: {
    productReturnRate?: string;
    storeReturnRate?: string;
    diffPercentagePoints?: string;
    returnedUnits?: number;
    unitsSold?: number;
    topCause?: string;
    topCauseShare?: string;
    estimatedSavings?: string;
    actualReturnCost?: string;
    isEstimatedReliable?: boolean;
  };
  suggestedAction?: string;
  measurableTarget?: string;
  source?: "ai" | "fallback";
}

interface KnowWhyModalProps {
  rec: Recommendation | null;
  productId?: string | null;
  productTitle?: string | null;
  onClose: () => void;
  onTakeAction?: (rec: Recommendation) => void;
}

export function KnowWhyModal({
  rec,
  productId,
  productTitle,
  onClose,
  onTakeAction,
}: KnowWhyModalProps) {
  const [dynamicData, setDynamicData] = useState<DynamicAIData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rec && !productId) {
      setDynamicData(null);
      setLoading(false);
      return;
    }

    // Set initial baseline from rec if present so user sees instant content
    if (rec?.whyThisMatters?.explanation && rec?.whyThisMatters?.impactItems?.length) {
      setDynamicData({
        explanation: rec.whyThisMatters.explanation,
        impactItems: rec.whyThisMatters.impactItems,
      });
    } else {
      setDynamicData(null);
    }

    const targetIdentifier =
      productId ||
      rec?.productId ||
      rec?.targetId ||
      rec?.productName;

    if (!targetIdentifier) return;

    let isMounted = true;
    setLoading(true);

    fetch(`/api/ai/recommendation/${encodeURIComponent(targetIdentifier)}`)
      .then((res) => {
        if (!res.ok) throw new Error("AI service unavailable");
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          if (data && data.explanation && Array.isArray(data.impactItems)) {
            setDynamicData({
              explanation: data.explanation,
              impactItems: data.impactItems,
              metrics: data.metrics,
              suggestedAction: data.suggestedAction,
              measurableTarget: data.measurableTarget,
              source: data.source,
            });
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          // Graceful fallback already populated from initial state
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [rec, productId]);

  if (!rec && !productId) return null;

  const currentExplanation =
    dynamicData?.explanation ||
    rec?.whyThisMatters?.explanation ||
    rec?.reasoning?.overview ||
    "Loading product insights...";

  const currentImpactItems =
    dynamicData?.impactItems && dynamicData.impactItems.length > 0
      ? dynamicData.impactItems
      : rec?.whyThisMatters?.impactItems || [
          "Target return rate reduction with evidence-based listing improvements",
          "Save on addressable return processing and shipping costs",
          "Improve customer satisfaction and purchase confidence",
        ];

  return (
    <div className="unturn-modal-backdrop" onClick={onClose}>
      <div
        className="unturn-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440,
          borderRadius: 16,
          padding: "24px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "var(--ut-text-primary)",
                margin: 0,
              }}
            >
              Why this matters
            </h3>
            {loading && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ut-text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: "var(--ut-primary)",
                    display: "inline-block",
                  }}
                />
                Updating insights...
              </span>
            )}
          </div>
          <button
            type="button"
            className="unturn-modal-close"
            onClick={onClose}
            style={{ fontSize: 18, padding: 4 }}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 13.5,
            color: "var(--ut-text-secondary)",
            lineHeight: 1.55,
          }}
        >
          {currentExplanation}
        </p>

        <div
          style={{
            backgroundColor: "var(--ut-primary-light)",
            borderRadius: 12,
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <h4
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: "var(--ut-text-primary)",
            }}
          >
            Impact if addressed
          </h4>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {currentImpactItems.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--ut-text-primary)",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ flexShrink: 0 }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="#DCFCE7"
                    stroke="#22C55E"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M8 12l2.5 2.5L16 9.5"
                    stroke="#16A34A"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 4,
          }}
        >
          <button
            type="button"
            className="unturn-btn-primary"
            onClick={onClose}
            style={{
              padding: "8px 24px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

interface TakeActionModalProps {
  rec: Recommendation | null;
  onClose: () => void;
  onConfirm: (rec: Recommendation, notes: string, customTitle?: string) => void;
}

export function TakeActionModal({
  rec,
  onClose,
  onConfirm,
}: TakeActionModalProps) {
  const [actionTitle, setActionTitle] = useState(rec?.title || "");
  const [actionNotes, setActionNotes] = useState("");

  useEffect(() => {
    if (rec) {
      setActionTitle(rec.title || "");
      setActionNotes("");
    }
  }, [rec]);

  if (!rec) return null;

  // Extract baseline metrics
  const baselineReturnRate = (rec as any).returnRate || (rec as any).metrics?.productReturnRate || "19.3%";
  const baselineReturns = rec.returns;

  return (
    <div className="unturn-modal-backdrop" onClick={onClose}>
      <div
        className="unturn-modal unturn-no-scrollbar"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480,
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <div className="unturn-modal-header" style={{ padding: "14px 22px" }}>
          <div>
            <h3 style={{ fontSize: 16 }}>Configure Intervention</h3>
            <span style={{ fontSize: 12, color: "var(--ut-text-muted)" }}>
              {rec.title} for {rec.productName}
            </span>
          </div>
          <button
            type="button"
            className="unturn-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div
          className="unturn-modal-body unturn-no-scrollbar"
          style={{
            padding: "14px 22px",
            overflow: "hidden",
          }}
        >
          {/* Baseline Before-Change Snapshot */}
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              backgroundColor: "var(--ut-bg-subtle)",
              border: "1px solid var(--ut-border)",
              marginBottom: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "var(--ut-text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Recorded Baseline (Before Changes)
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ut-text-muted)",
                }}
              >
                Snapshot at launch
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--ut-text-muted)" }}>Return Rate</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ut-text-primary)" }}>
                  {baselineReturnRate}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ut-text-muted)" }}>Pre-change Returns</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ut-text-primary)" }}>
                  {baselineReturns} units
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ut-text-muted)" }}>Primary Cause</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ut-text-primary)" }}>
                  {rec.cause}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 10.5, color: "var(--ut-text-muted)", borderTop: "1px dashed var(--ut-border)", paddingTop: 5, lineHeight: 1.35 }}>
              Unturn will lock these baseline figures and track all orders and returns placed after your changes to calculate before-and-after performance.
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ut-text-primary)",
                marginBottom: 4,
              }}
            >
              Intervention Action Summary
            </label>
            <input
              type="text"
              value={actionTitle}
              onChange={(e) => setActionTitle(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--ut-border)",
                fontSize: 12.5,
                backgroundColor: "var(--ut-bg-card)",
                color: "var(--ut-text-primary)",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ut-text-primary)",
                marginBottom: 4,
              }}
            >
              Changes applied or notes
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Added sizing chart popup and fit note indicating item runs 1 size large."
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--ut-border)",
                fontSize: 12.5,
                backgroundColor: "var(--ut-bg-card)",
                color: "var(--ut-text-primary)",
                boxSizing: "border-box",
                fontFamily: "inherit",
                resize: "none",
              }}
            />
          </div>

          <div
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--ut-success-light)",
              border: "1px solid var(--ut-success-border)",
              borderRadius: 6,
              fontSize: 11.5,
              color: "var(--ut-success)",
              lineHeight: 1.4,
            }}
          >
            ✓ Taking action will remove {rec.productName} from <strong>Recommended Actions</strong> and transfer it to <strong>Interventions</strong> with active before-and-after tracking enabled.
          </div>
        </div>

        <div className="unturn-modal-footer" style={{ padding: "12px 22px" }}>
          <button
            type="button"
            className="unturn-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="unturn-btn-primary"
            onClick={() => onConfirm(rec, actionNotes, actionTitle)}
          >
            Start Tracking Intervention
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteDataModal({
  isOpen,
  onClose,
  onConfirm,
}: DeleteDataModalProps) {
  const [confirmText, setConfirmText] = useState("");

  if (!isOpen) return null;

  return (
    <div className="unturn-modal-backdrop" onClick={onClose}>
      <div
        className="unturn-modal unturn-no-scrollbar"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 460,
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <div className="unturn-modal-header" style={{ padding: "16px 22px" }}>
          <h3 style={{ fontSize: 16, color: "var(--ut-danger)" }}>
            Delete All Unturn Data
          </h3>
          <button
            type="button"
            className="unturn-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div
          className="unturn-modal-body unturn-no-scrollbar"
          style={{ padding: "16px 22px", overflow: "hidden" }}
        >
          <p style={{ marginTop: 0 }}>
            This will permanently erase all cached return metrics, intervention history, and recommendation logs for this store.
          </p>
          <p style={{ fontSize: 13, color: "var(--ut-text-muted)" }}>
            To confirm, please type <strong>DELETE</strong> below:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid var(--ut-border)",
              fontSize: 13,
              backgroundColor: "var(--ut-bg-card)",
              color: "var(--ut-text-primary)",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div className="unturn-modal-footer" style={{ padding: "14px 22px" }}>
          <button
            type="button"
            className="unturn-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="unturn-btn-danger-outline"
            disabled={confirmText !== "DELETE"}
            onClick={() => {
              if (confirmText === "DELETE") {
                onConfirm();
                onClose();
              }
            }}
            style={{
              opacity: confirmText === "DELETE" ? 1 : 0.5,
              cursor: confirmText === "DELETE" ? "pointer" : "not-allowed",
            }}
          >
            Permanently Delete
          </button>
        </div>
      </div>
    </div>
  );
}
