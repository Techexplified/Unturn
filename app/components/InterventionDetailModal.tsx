/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import type { InterventionStatus } from "../services/interventions.server";
import type { InterventionImpactResult, ImpactTrendPoint } from "../services/impact.server";
import { ProductThumb } from "./ProductThumb";

interface InterventionDetailModalProps {
  intervention: any | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updated: any) => void;
  onDeleted: (id: string) => void;
}

function TrendChartVisual({
  points,
  baselineRate,
}: {
  points: ImpactTrendPoint[];
  baselineRate: number | null;
}) {
  if (!points || points.length === 0) return null;
  const width = 480;
  const height = 110;
  const paddingX = 40;
  const paddingY = 22;

  const rates = points.map((p) => p.returnRate);
  if (baselineRate !== null && baselineRate !== undefined) rates.push(baselineRate);
  const maxVal = Math.max(30, Math.ceil(Math.max(...rates) * 1.25));
  const minVal = 0;

  const getY = (val: number) => {
    return height - paddingY - ((val - minVal) / (maxVal - minVal)) * (height - 2 * paddingY);
  };

  const getX = (idx: number) => {
    if (points.length <= 1) return width / 2;
    return paddingX + (idx / (points.length - 1)) * (width - 2 * paddingX);
  };

  const baselineY = baselineRate !== null && baselineRate !== undefined ? getY(baselineRate) : null;
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(p.returnRate)}`)
    .join(" ");

  return (
    <div
      style={{
        backgroundColor: "var(--ut-bg-card)",
        borderRadius: 8,
        padding: "10px 14px",
        border: "1px solid var(--ut-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--ut-text-secondary)",
          marginBottom: 4,
        }}
      >
        <span>RETURN RATE TRAJECTORY</span>
        {baselineRate !== null && (
          <span style={{ color: "var(--ut-text-muted)" }}>
            Baseline Target: <strong>{baselineRate}%</strong>
          </span>
        )}
      </div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        {/* Baseline dashed marker */}
        {baselineY !== null && (
          <>
            <line
              x1={paddingX - 10}
              y1={baselineY}
              x2={width - paddingX + 10}
              y2={baselineY}
              stroke="var(--ut-border)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text x={paddingX - 14} y={baselineY + 3.5} textAnchor="end" fontSize="9" fill="var(--ut-text-muted)">
              {baselineRate}%
            </text>
          </>
        )}

        {/* Trend line */}
        {points.length > 1 && (
          <path
            d={pathD}
            fill="none"
            stroke="var(--ut-primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Nodes */}
        {points.map((p, i) => {
          const cx = getX(i);
          const cy = getY(p.returnRate);
          const isLowerThanBaseline = baselineRate !== null && p.returnRate < baselineRate;
          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r="4.5"
                fill={isLowerThanBaseline ? "var(--ut-success)" : "var(--ut-primary)"}
                stroke="#fff"
                strokeWidth="2"
              />
              <text
                x={cx}
                y={cy - 8}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={isLowerThanBaseline ? "var(--ut-success)" : "var(--ut-text-primary)"}
              >
                {p.returnRate}%
              </text>
              <text x={cx} y={height - 4} textAnchor="middle" fontSize="10" fill="var(--ut-text-muted)">
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function InterventionDetailModal({
  intervention,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
}: InterventionDetailModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<InterventionStatus>("IN_PROGRESS");
  const [actionType, setActionType] = useState("SIZE_GUIDE");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [targetCompletionDate, setTargetCompletionDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStatusUpdating, setIsStatusUpdating] = useState(false);
  const [statusSuccessMsg, setStatusSuccessMsg] = useState<string | null>(null);

  const [liveImpact, setLiveImpact] = useState<InterventionImpactResult | null>(
    intervention?.impact || null
  );

  useEffect(() => {
    if (intervention && isOpen) {
      setTitle(intervention.title || "");
      setDescription(intervention.description || "");
      setStatus(intervention.status || "IN_PROGRESS");
      setActionType(intervention.actionType || "SIZE_GUIDE");
      setExpectedOutcome(intervention.expectedOutcome || "");
      setTargetCompletionDate(
        intervention.targetCompletionDate
          ? new Date(intervention.targetCompletionDate).toISOString().split("T")[0]
          : ""
      );
      setNotes(intervention.notes || "");
      setShowConfirmDelete(false);
      setError(null);
      setLiveImpact(intervention.impact || null);
      setStatusSuccessMsg(null);

      // Fetch fresh impact data from dedicated API
      fetch(`/api/interventions/${intervention.id}/impact`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && !data.error) {
            setLiveImpact(data);
          }
        })
        .catch(() => {});
    }
  }, [intervention, isOpen]);

  if (!isOpen || !intervention) return null;

  const handleStatusChange = async (newStatus: InterventionStatus) => {
    setStatus(newStatus);
    setIsStatusUpdating(true);
    setError(null);

    try {
      const res = await fetch("/api/interventions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: intervention.id,
          status: newStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status in database");
      }

      const label =
        newStatus === "IN_PROGRESS"
          ? "In Progress"
          : newStatus === "COMPLETED"
          ? "Completed"
          : newStatus === "PAUSED"
          ? "Paused"
          : "Planned";

      setStatusSuccessMsg(`✓ Saved to DB: ${label}`);
      setTimeout(() => setStatusSuccessMsg(null), 3500);

      const merged = { ...intervention, ...data.intervention, status: newStatus };
      onUpdated(merged);
    } catch (err: any) {
      setError(err.message || "Failed to update status in database.");
    } finally {
      setIsStatusUpdating(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/interventions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: intervention.id,
          title: title.trim(),
          description: description.trim() || null,
          status,
          actionType,
          expectedOutcome: expectedOutcome.trim() || null,
          targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate).toISOString() : null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update intervention");
      }

      setIsSaving(false);
      onUpdated({ ...intervention, ...data.intervention, status, impact: liveImpact });
      onClose();
    } catch (err: any) {
      setIsSaving(false);
      setError(err.message || "Failed to update intervention.");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch("/api/interventions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: intervention.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete intervention");
      }

      setIsDeleting(false);
      onDeleted(intervention.id);
      onClose();
    } catch (err: any) {
      setIsDeleting(false);
      setError(err.message || "Failed to delete intervention.");
    }
  };

  const statusBadgeColor =
    status === "COMPLETED"
      ? { bg: "var(--ut-success-light)", text: "var(--ut-success)", border: "var(--ut-success-border)" }
      : status === "IN_PROGRESS"
      ? { bg: "var(--ut-primary-light)", text: "var(--ut-primary-text)", border: "var(--ut-primary-border)" }
      : status === "PAUSED"
      ? { bg: "var(--ut-warning-light)", text: "var(--ut-warning)", border: "var(--ut-warning-border)" }
      : { bg: "var(--ut-bg-subtle)", text: "var(--ut-text-secondary)", border: "var(--ut-border)" };

  // Fallback metrics if impact not loaded yet
  const impact = liveImpact || {
    metrics: {
      baselineReturnRateFormatted:
        intervention.baselineReturnRate !== null && intervention.baselineReturnRate !== undefined
          ? `${intervention.baselineReturnRate}%`
          : "—",
      baselineReturnedUnits: intervention.baselineReturnedUnits,
      baselineUnitsSold: intervention.baselineUnitsSold,
      postReturnRateFormatted: "Active Tracking",
      postReturnedUnits: 0,
      postUnitsSold: 0,
      changePercentagePointsFormatted: "—",
      relativeChangeFormatted: "—",
      isImprovement: false,
    },
    dataSufficiency: {
      status: "ACCUMULATING_DATA" as const,
      isSufficient: false,
      sampleUnitsSold: 0,
      sampleReturnedUnits: 0,
      thresholdUnitsNeeded: 5,
      message: "Unturn is monitoring incoming orders and return records post-implementation.",
    },
    financialImpact: {
      hasFinancialData: false,
      estimatedCostSavedFormatted: "$0",
      currency: "USD",
      assumptions: "Financial impact calculation requires accumulated order volume.",
    },
    causeShift: null,
    measurementWindows: {
      baselineWindow: intervention.baselinePeriod || "30 days prior to launch",
      postWindow: "Active tracking window",
    },
    trendChart: {
      points: [
        {
          label: "Baseline",
          returnRate: intervention.baselineReturnRate ?? 0,
          returnedUnits: intervention.baselineReturnedUnits ?? 0,
          unitsSold: intervention.baselineUnitsSold ?? 0,
        },
      ],
      baselineLineRate: intervention.baselineReturnRate,
      currentLineRate: null,
    },
    evaluation: {
      observedTrend: "accumulating" as const,
      trendBadge: "⚡ Active Tracking",
      summaryText: `Baseline captured at ${
        intervention.baselineReturnRate !== null && intervention.baselineReturnRate !== undefined
          ? `${intervention.baselineReturnRate}%`
          : "creation"
      }. Unturn is calculating observed impact against subsequent orders.`,
      attributionNote: "Observed performance change since intervention began. Note: other store factors may also contribute.",
    },
  };

  return (
    <div className="unturn-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="unturn-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 620,
          borderRadius: 18,
          padding: "24px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  backgroundColor: statusBadgeColor.bg,
                  color: statusBadgeColor.text,
                  border: `1px solid ${statusBadgeColor.border}`,
                  textTransform: "uppercase",
                }}
              >
                {status.replace("_", " ")}
              </span>
              <span style={{ fontSize: 11.5, color: "var(--ut-text-muted)" }}>
                ID: {intervention.id.slice(0, 10)}...
              </span>
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px 0", color: "var(--ut-text-primary)" }}>
              {intervention.title}
            </h3>

            {/* Target Product & Cause line */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ut-text-secondary)" }}>
              <ProductThumb src={intervention.product?.imageUrl} alt={intervention.title} size={24} />
              <span>
                Target: <strong>{intervention.product?.title || intervention.productId || "Store-wide"}</strong>
              </span>
              {intervention.cause && (
                <>
                  <span>•</span>
                  <span>
                    Cause: <strong>{intervention.cause}</strong>
                  </span>
                </>
              )}
            </div>
          </div>
          <button type="button" className="unturn-modal-close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 6,
              backgroundColor: "var(--ut-danger-light)",
              border: "1px solid var(--ut-danger-border)",
              color: "var(--ut-danger)",
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* 1. Observed Impact Summary Callout */}
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: impact.metrics.isImprovement ? "var(--ut-success-light)" : "var(--ut-bg-subtle)",
            border: `1px solid ${impact.metrics.isImprovement ? "var(--ut-success-border)" : "var(--ut-border)"}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 18 }}>{impact.metrics.isImprovement ? "📉" : "⚡"}</span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ut-text-primary)", lineHeight: 1.4 }}>
                {impact.evaluation.summaryText}
              </div>
              <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginTop: 3 }}>
                {impact.evaluation.attributionNote}
              </div>
            </div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 4,
              backgroundColor: impact.metrics.isImprovement ? "var(--ut-success)" : "var(--ut-bg-card)",
              color: impact.metrics.isImprovement ? "#fff" : "var(--ut-text-secondary)",
              border: `1px solid ${impact.metrics.isImprovement ? "var(--ut-success)" : "var(--ut-border)"}`,
              whiteSpace: "nowrap",
            }}
          >
            {impact.evaluation.trendBadge}
          </span>
        </div>

        {/* 2. Before vs. After 4-Metric Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
          }}
        >
          {/* Card 1: Return Rate */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              backgroundColor: "var(--ut-bg-card)",
              border: "1px solid var(--ut-border)",
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ut-text-muted)", textTransform: "uppercase" }}>
              Return Rate
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ut-text-primary)", marginTop: 3 }}>
              {impact.metrics.baselineReturnRateFormatted} →{" "}
              <span style={{ color: impact.metrics.isImprovement ? "var(--ut-success)" : "var(--ut-text-primary)" }}>
                {impact.metrics.postReturnRateFormatted}
              </span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: impact.metrics.isImprovement ? "var(--ut-success)" : "var(--ut-text-muted)", marginTop: 3 }}>
              {impact.metrics.changePercentagePointsFormatted !== "—" ? `${impact.metrics.changePercentagePointsFormatted} delta` : "Monitoring"}
            </div>
          </div>

          {/* Card 2: Returned Units */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              backgroundColor: "var(--ut-bg-card)",
              border: "1px solid var(--ut-border)",
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ut-text-muted)", textTransform: "uppercase" }}>
              Returns
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ut-text-primary)", marginTop: 3 }}>
              {impact.metrics.baselineReturnedUnits ?? "—"} → {impact.metrics.postReturnedUnits}
            </div>
            <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginTop: 3 }}>
              units recorded
            </div>
          </div>

          {/* Card 3: Units Sold */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              backgroundColor: "var(--ut-bg-card)",
              border: "1px solid var(--ut-border)",
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ut-text-muted)", textTransform: "uppercase" }}>
              Units Sold
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ut-text-primary)", marginTop: 3 }}>
              {impact.metrics.baselineUnitsSold ?? "—"} → {impact.metrics.postUnitsSold}
            </div>
            <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginTop: 3 }}>
              post-change sales
            </div>
          </div>

          {/* Card 4: Cost Avoided */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              backgroundColor: "var(--ut-bg-card)",
              border: "1px solid var(--ut-border)",
            }}
          >
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ut-text-muted)", textTransform: "uppercase" }}>
              Cost Avoided
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: impact.financialImpact.hasFinancialData ? "var(--ut-success)" : "var(--ut-text-primary)", marginTop: 3 }}>
              {impact.financialImpact.hasFinancialData ? impact.financialImpact.estimatedCostSavedFormatted : "—"}
            </div>
            <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginTop: 3 }}>
              {impact.financialImpact.hasFinancialData ? "Est. savings" : "Awaiting data"}
            </div>
          </div>
        </div>

        {/* 3. Return Rate Trend Visual Chart */}
        <TrendChartVisual
          points={impact.trendChart?.points || []}
          baselineRate={impact.trendChart?.baselineLineRate ?? null}
        />

        {/* 4. Cause-Specific Shift & Data Coverage Breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: impact.causeShift ? "1fr 1fr" : "1fr", gap: 10 }}>
          {/* Cause Shift */}
          {impact.causeShift && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                backgroundColor: "var(--ut-bg-subtle)",
                border: "1px solid var(--ut-border)",
                fontSize: 12,
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ut-text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
                Target Cause: {impact.causeShift.cause}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ color: "var(--ut-text-secondary)" }}>Before:</span>
                <strong>{impact.causeShift.baselineCount} returns ({impact.causeShift.baselineSharePct}%)</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "var(--ut-text-secondary)" }}>After:</span>
                <strong style={{ color: impact.causeShift.isReduced ? "var(--ut-success)" : "var(--ut-text-primary)" }}>
                  {impact.causeShift.postCount} returns ({impact.causeShift.postSharePct}%)
                </strong>
              </div>
              <div style={{ fontSize: 11, color: impact.causeShift.isReduced ? "var(--ut-success)" : "var(--ut-text-muted)", fontWeight: 500 }}>
                {impact.causeShift.isReduced ? "✓ Cause share decreased post-intervention" : "Cause frequency under active monitoring"}
              </div>
            </div>
          )}

          {/* Data Coverage & Window */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              backgroundColor: "var(--ut-bg-subtle)",
              border: "1px solid var(--ut-border)",
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ut-text-muted)", textTransform: "uppercase" }}>
                Data Coverage
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 4,
                  backgroundColor: impact.dataSufficiency.isSufficient ? "var(--ut-success-light)" : "var(--ut-primary-light)",
                  color: impact.dataSufficiency.isSufficient ? "var(--ut-success)" : "var(--ut-primary-text)",
                  border: `1px solid ${impact.dataSufficiency.isSufficient ? "var(--ut-success-border)" : "var(--ut-primary-border)"}`,
                }}
              >
                {impact.dataSufficiency.isSufficient ? "Sufficient Volume" : "Preliminary Data"}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ut-text-secondary)", lineHeight: 1.4 }}>
              {impact.dataSufficiency.message}
            </div>
            <div style={{ fontSize: 11, color: "var(--ut-text-muted)", marginTop: 6, borderTop: "1px dashed var(--ut-border)", paddingTop: 4 }}>
              Window: {impact.measurementWindows.postWindow}
            </div>
          </div>
        </div>

        {/* 5. Edit & Form Controls */}
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid var(--ut-border)", paddingTop: 14 }}>
          {/* Status selector & Target completion date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ut-text-primary)",
                  }}
                >
                  Intervention Status
                </label>
                {isStatusUpdating ? (
                  <span style={{ fontSize: 11, color: "var(--ut-primary)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--ut-primary)", display: "inline-block" }} />
                    Saving to DB...
                  </span>
                ) : statusSuccessMsg ? (
                  <span style={{ fontSize: 11, color: "var(--ut-success)", fontWeight: 600 }}>
                    {statusSuccessMsg}
                  </span>
                ) : null}
              </div>
              <select
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as InterventionStatus)}
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
              >
                <option value="IN_PROGRESS">In Progress (Active)</option>
                <option value="PLANNED">Planned</option>
                <option value="COMPLETED">Completed</option>
                <option value="PAUSED">Paused</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ut-text-primary)",
                  marginBottom: 4,
                }}
              >
                Target Completion Date
              </label>
              <input
                type="date"
                value={targetCompletionDate}
                onChange={(e) => setTargetCompletionDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--ut-border)",
                  fontSize: 12.5,
                  backgroundColor: "var(--ut-bg-card)",
                  color: "var(--ut-text-primary)",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ut-text-primary)",
                marginBottom: 4,
              }}
            >
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Add detailed size guide"
              style={{
                width: "100%",
                padding: "7px 10px",
                borderRadius: 6,
                border: "1px solid var(--ut-border)",
                fontSize: 13,
                backgroundColor: "var(--ut-bg-card)",
                color: "var(--ut-text-primary)",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ut-text-primary)",
                marginBottom: 4,
              }}
            >
              Description of Changes Made
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What changes were applied in Shopify..."
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
                resize: "vertical",
              }}
            />
          </div>

          {/* Notes */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--ut-text-primary)",
                marginBottom: 4,
              }}
            >
              Merchant Notes & Observations
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ongoing observations on return changes..."
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
                resize: "vertical",
              }}
            />
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 4,
              paddingTop: 10,
              borderTop: "1px solid var(--ut-border)",
            }}
          >
            <div>
              {!showConfirmDelete ? (
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(true)}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    color: "var(--ut-danger)",
                    fontSize: 12,
                    cursor: "pointer",
                    padding: "4px 8px",
                  }}
                >
                  Delete Intervention
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    style={{
                      backgroundColor: "var(--ut-danger)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      fontSize: 11.5,
                      padding: "4px 10px",
                      cursor: "pointer",
                    }}
                  >
                    {isDeleting ? "Deleting..." : "Confirm Delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(false)}
                    className="unturn-btn-secondary"
                    style={{ fontSize: 11, padding: "4px 8px" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                className="unturn-btn-secondary"
                onClick={onClose}
                style={{ fontSize: 12.5, padding: "6px 14px" }}
              >
                Close
              </button>
              <button
                type="submit"
                className="unturn-btn-primary"
                disabled={isSaving}
                style={{ fontSize: 12.5, padding: "6px 16px" }}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
