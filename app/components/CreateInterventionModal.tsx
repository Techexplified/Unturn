import React, { useState, useEffect } from "react";

export interface CreateInterventionInitialData {
  title?: string;
  description?: string;
  productName?: string;
  productId?: string;
  cause?: string;
  actionType?: string;
  expectedOutcome?: string;
  recommendationId?: string;
  baselineReturnRate?: string | number;
  baselineReturnedUnits?: number;
}

interface CreateInterventionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (created: any) => void;
  initialData?: CreateInterventionInitialData;
}

export function CreateInterventionModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: CreateInterventionModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [productName, setProductName] = useState("");
  const [cause, setCause] = useState("Size / Fit");
  const [actionType, setActionType] = useState("SIZE_GUIDE");
  const [expectedOutcome, setExpectedOutcome] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [targetCompletionDate, setTargetCompletionDate] = useState("");
  const [status, setStatus] = useState<"IN_PROGRESS" | "PLANNED">("IN_PROGRESS");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialData?.title || "");
      setDescription(initialData?.description || "");
      setProductName(initialData?.productName || "");
      setCause(initialData?.cause || "Size / Fit");
      setActionType(initialData?.actionType || "SIZE_GUIDE");
      setExpectedOutcome(
        initialData?.expectedOutcome || "Target 15%–20% reduction in returns within 30 days"
      );
      setStartDate(new Date().toISOString().split("T")[0]);
      setTargetCompletionDate("");
      setStatus("IN_PROGRESS");
      setNotes("");
      setError(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Please enter a title for the intervention.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          productId: initialData?.productId || productName.trim() || undefined,
          cause: cause.trim() || undefined,
          actionType,
          expectedOutcome: expectedOutcome.trim() || undefined,
          recommendationId: initialData?.recommendationId,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          targetCompletionDate: targetCompletionDate
            ? new Date(targetCompletionDate).toISOString()
            : undefined,
          status,
          notes: notes.trim() || undefined,
          baselinePeriod: "Baseline captured at intervention creation",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create intervention");
      }

      setIsSubmitting(false);
      if (onSuccess) {
        onSuccess(data.intervention);
      }
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || "Failed to create intervention.");
    }
  };

  return (
    <div className="unturn-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="unturn-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520,
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ut-text-primary)" }}>
              Create Return Intervention
            </h3>
            <span style={{ fontSize: 12, color: "var(--ut-text-muted)" }}>
              Configure and track changes to reduce future product returns.
            </span>
          </div>
          <button
            type="button"
            className="unturn-modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
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

        {/* Baseline Preview Banner if available */}
        {(initialData?.baselineReturnRate !== undefined || initialData?.productName) && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              backgroundColor: "var(--ut-primary-light)",
              border: "1px solid var(--ut-primary-border)",
              fontSize: 12,
              color: "var(--ut-primary-text)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 600 }}>
              📊 Baseline Metrics Snapshot
            </div>
            <div style={{ fontSize: 11.5, lineHeight: 1.4 }}>
              Unturn will record current metrics for{" "}
              <strong>{initialData.productName || initialData.cause || "this item"}</strong>{" "}
              {initialData.baselineReturnRate !== undefined && (
                <>(baseline return rate: <strong>{initialData.baselineReturnRate}%</strong>)</>
              )}{" "}
              to measure impact fairly over time.
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Title */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ut-text-primary)",
                marginBottom: 5,
              }}
            >
              Intervention Title <span style={{ color: "var(--ut-danger)" }}>*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Add interactive size chart and fit advice banner"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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

          {/* Product and Cause Linked */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--ut-text-primary)",
                  marginBottom: 5,
                }}
              >
                Related Product
              </label>
              <input
                type="text"
                placeholder="Product name or SKU"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
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

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--ut-text-primary)",
                  marginBottom: 5,
                }}
              >
                Targeted Return Cause
              </label>
              <select
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--ut-border)",
                  fontSize: 13,
                  backgroundColor: "var(--ut-bg-card)",
                  color: "var(--ut-text-primary)",
                  boxSizing: "border-box",
                }}
              >
                <option value="Size / Fit">Size / Fit</option>
                <option value="Not as expected">Not as expected</option>
                <option value="Wrong item sent">Wrong item sent</option>
                <option value="Damaged / Defective">Damaged / Defective</option>
                <option value="Quality / Fabric">Quality / Fabric</option>
                <option value="Other">Other / General</option>
              </select>
            </div>
          </div>

          {/* Action Type & Status */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--ut-text-primary)",
                  marginBottom: 5,
                }}
              >
                Action Type
              </label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--ut-border)",
                  fontSize: 13,
                  backgroundColor: "var(--ut-bg-card)",
                  color: "var(--ut-text-primary)",
                  boxSizing: "border-box",
                }}
              >
                <option value="SIZE_GUIDE">Size Guide / Fit Guidance</option>
                <option value="IMAGERY">Listing Imagery & Visuals</option>
                <option value="SPECIFICATIONS">Product Descriptions & Specs</option>
                <option value="VARIANT_LABEL">Variant Labeling & Swatches</option>
                <option value="PACKAGING">Packaging & Carrier Handling</option>
                <option value="OTHER">Other Intervention</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--ut-text-primary)",
                  marginBottom: 5,
                }}
              >
                Initial Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--ut-border)",
                  fontSize: 13,
                  backgroundColor: "var(--ut-bg-card)",
                  color: "var(--ut-text-primary)",
                  boxSizing: "border-box",
                }}
              >
                <option value="IN_PROGRESS">In Progress (Active Tracking)</option>
                <option value="PLANNED">Planned (Scheduled)</option>
              </select>
            </div>
          </div>

          {/* Start Date & Target Completion Date */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--ut-text-primary)",
                  marginBottom: 5,
                }}
              >
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
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

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--ut-text-primary)",
                  marginBottom: 5,
                }}
              >
                Target Completion Date (Optional)
              </label>
              <input
                type="date"
                value={targetCompletionDate}
                onChange={(e) => setTargetCompletionDate(e.target.value)}
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
          </div>

          {/* Expected Outcome */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ut-text-primary)",
                marginBottom: 5,
              }}
            >
              Expected Outcome / Target
            </label>
            <input
              type="text"
              placeholder="e.g. Target 15%–20% return rate reduction"
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
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

          {/* Description & Notes */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--ut-text-primary)",
                marginBottom: 5,
              }}
            >
              Action Details & Merchant Notes
            </label>
            <textarea
              rows={3}
              placeholder="Describe the exact changes applied on Shopify (e.g. updated product description, published revised sizing table)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--ut-border)",
                fontSize: 13,
                backgroundColor: "var(--ut-bg-card)",
                color: "var(--ut-text-primary)",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Footer Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 10,
              paddingTop: 12,
              borderTop: "1px solid var(--ut-border)",
            }}
          >
            <button
              type="button"
              className="unturn-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="unturn-btn-primary"
              disabled={isSubmitting}
              style={{ minWidth: 140, justifyContent: "center" }}
            >
              {isSubmitting ? "Saving..." : "Start Intervention"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
