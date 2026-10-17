import React, { useState } from "react";
import type { PreventionRecommendation } from "../services/recommendations.server";

interface RecommendationCardProps {
  recommendation: PreventionRecommendation;
  onCreateIntervention: (rec: PreventionRecommendation) => void;
  onKnowWhy?: (rec: PreventionRecommendation) => void;
  compact?: boolean;
}

export function RecommendationCard({
  recommendation: rec,
  onCreateIntervention,
  onKnowWhy,
  compact = false,
}: RecommendationCardProps) {
  const [showAssumptions, setShowAssumptions] = useState(false);

  // Preventability styling
  const isPotentially = rec.preventability === "Potentially preventable";
  const isPossibly = rec.preventability === "Possibly preventable";

  const prevBadgeStyle = isPotentially
    ? { bg: "#ECFDF5", text: "#065F46", border: "#A7F3D0", icon: "✓" }
    : isPossibly
    ? { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A", icon: "⚡" }
    : { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1", icon: "ℹ" };

  const priorityStyle =
    rec.priority === "High"
      ? { bg: "#FEF2F2", text: "#991B1B", border: "#FCA5A5" }
      : rec.priority === "Medium"
      ? { bg: "#EFF6FF", text: "#1E40AF", border: "#BFDBFE" }
      : { bg: "#F8FAFC", text: "#64748B", border: "#E2E8F0" };

  return (
    <div
      style={{
        borderRadius: 10,
        border: "1px solid var(--ut-border)",
        backgroundColor: "var(--ut-bg-card)",
        padding: compact ? "14px 16px" : "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        boxShadow: "var(--ut-shadow-sm)",
      }}
    >
      {/* Top Header: Title & Badges */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <h4
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: "var(--ut-text-primary)",
              lineHeight: 1.35,
            }}
          >
            {rec.title}
          </h4>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {/* Priority Badge */}
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 4,
                backgroundColor: priorityStyle.bg,
                color: priorityStyle.text,
                border: `1px solid ${priorityStyle.border}`,
              }}
            >
              {rec.priority} Priority
            </span>

            {/* Confidence indicator */}
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 500,
                padding: "2px 6px",
                borderRadius: 4,
                backgroundColor: "var(--ut-bg-subtle)",
                color: "var(--ut-text-secondary)",
                border: "1px solid var(--ut-border)",
              }}
              title={`Confidence level based on sample size and reason specificity (${rec.confidence})`}
            >
              {rec.confidence} confidence
            </span>
          </div>
        </div>

        {/* Preventability Assessment Pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11.5,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 6,
            backgroundColor: prevBadgeStyle.bg,
            color: prevBadgeStyle.text,
            border: `1px solid ${prevBadgeStyle.border}`,
            marginTop: 2,
          }}
        >
          <span>{prevBadgeStyle.icon}</span>
          <span>{rec.preventability}</span>
        </div>
      </div>

      {/* Preventability Rationale */}
      <div
        style={{
          fontSize: 12,
          color: "var(--ut-text-secondary)",
          lineHeight: 1.45,
          backgroundColor: "var(--ut-bg-subtle)",
          padding: "8px 10px",
          borderRadius: 6,
          borderLeft: `3px solid ${prevBadgeStyle.text}`,
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--ut-text-primary)" }}>Assessment: </span>
        {rec.preventabilityRationale}
      </div>

      {/* Pattern & Evidence */}
      <div style={{ fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: "var(--ut-text-primary)", marginBottom: 4 }}>
          Supporting Evidence:
        </div>
        <ul
          style={{
            margin: "0 0 6px 0",
            paddingLeft: 18,
            color: "var(--ut-text-secondary)",
            lineHeight: 1.45,
          }}
        >
          {rec.evidence.keySignals.map((signal, idx) => (
            <li key={idx} style={{ marginBottom: 2 }}>
              {signal}
            </li>
          ))}
        </ul>
      </div>

      {/* Financial Impact Comparison */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          backgroundColor: "var(--ut-bg-subtle)",
          border: "1px solid var(--ut-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ut-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
            Financial Impact Analysis
          </span>
          <button
            type="button"
            onClick={() => setShowAssumptions(!showAssumptions)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontSize: 10.5,
              color: "var(--ut-primary)",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {showAssumptions ? "Hide assumptions" : "View calculation assumptions"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--ut-text-muted)" }}>Actual Recorded Value</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ut-text-primary)" }}>
              {rec.financialImpact.actualRecordedValue}
            </div>
            <div style={{ fontSize: 10, color: "var(--ut-text-muted)" }}>Historical refunds / line totals</div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "var(--ut-text-muted)" }}>Estimated Preventable Loss</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ut-success)" }}>
              {rec.financialImpact.estimatedPreventableLoss}
            </div>
            <div style={{ fontSize: 10, color: "var(--ut-text-muted)" }}>Addressable via intervention</div>
          </div>
        </div>

        {showAssumptions && (
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: "1px dashed var(--ut-border)",
              fontSize: 11,
              color: "var(--ut-text-secondary)",
              lineHeight: 1.4,
            }}
          >
            <span style={{ fontWeight: 600 }}>Assumptions: </span>
            {rec.financialImpact.assumptions}
          </div>
        )}
      </div>

      {/* Suggested Action Box */}
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          backgroundColor: "#F0FDF4",
          border: "1px solid #BBF7D0",
          fontSize: 12,
        }}
      >
        <div style={{ fontWeight: 600, color: "#166534", marginBottom: 3 }}>
          Recommended Action:
        </div>
        <div style={{ color: "#14532D", lineHeight: 1.45, marginBottom: 6 }}>
          {rec.suggestedAction}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#15803D" }}>
          Expected outcome: {rec.expectedOutcome}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 2 }}>
        {onKnowWhy && (
          <button
            type="button"
            className="unturn-btn-secondary"
            onClick={() => onKnowWhy(rec)}
            style={{
              fontSize: 12,
              padding: "6px 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span>Why this matters</span>
            <span style={{ fontSize: 12, color: "var(--ut-text-muted)" }}>ⓘ</span>
          </button>
        )}
        <button
          type="button"
          className="unturn-btn-primary"
          onClick={() => onCreateIntervention(rec)}
          style={{
            fontSize: 12,
            padding: "7px 14px",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
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
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Create Intervention</span>
        </button>
      </div>
    </div>
  );
}
