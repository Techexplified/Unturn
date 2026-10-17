import { useEffect, useState } from "react";
import type { SyncStatusResult } from "../services/sync.server";

interface SyncStatusBarProps {
  syncStatus: SyncStatusResult | null;
  onTriggerSync?: (intent: "start" | "retry") => void;
  isSubmitting?: boolean;
}

export function SyncStatusBar({
  syncStatus,
  onTriggerSync,
  isSubmitting = false,
}: SyncStatusBarProps) {
  const [statusData, setStatusData] = useState<SyncStatusResult | null>(syncStatus);

  useEffect(() => {
    setStatusData(syncStatus);
  }, [syncStatus]);

  // Poll status while job is RUNNING
  useEffect(() => {
    if (!statusData?.currentJob || statusData.currentJob.status !== "RUNNING") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/sync");
        if (res.ok) {
          const data: SyncStatusResult = await res.json();
          setStatusData(data);
        }
      } catch (err) {
        console.warn("Polling sync error:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [statusData?.currentJob]);

  if (!statusData) {
    return null;
  }

  const { isConnected, shopDomain, currentJob, counts, coverage } = statusData;
  const isRunning = currentJob?.status === "RUNNING" || isSubmitting;
  const isFailed = currentJob?.status === "FAILED";
  const isCompleted = currentJob?.status === "COMPLETED";
  const isPending = !currentJob || currentJob.status === "PENDING";

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Never";
    const d = new Date(date);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      style={{
        backgroundColor: "var(--ut-bg-card)",
        border: "1px solid var(--ut-border)",
        borderRadius: "var(--ut-radius-md)",
        padding: "12px 16px",
        marginBottom: 14,
        boxShadow: "var(--ut-shadow-sm)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {/* Left Info Column */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* Connection Pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: "var(--ut-radius-full)",
              fontSize: 12,
              fontWeight: 500,
              backgroundColor: isConnected ? "var(--ut-success-light)" : "var(--ut-bg-subtle)",
              color: isConnected ? "var(--ut-success)" : "var(--ut-text-secondary)",
              border: `1px solid ${isConnected ? "var(--ut-success-border)" : "var(--ut-border)"}`,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: isConnected ? "var(--ut-success)" : "var(--ut-text-muted)",
              }}
            />
            <span>{isConnected ? `Connected: ${shopDomain}` : "Shopify disconnected"}</span>
          </div>

          {/* Sync Status Badge */}
          {isRunning && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: "var(--ut-radius-full)",
                fontSize: 12,
                fontWeight: 600,
                backgroundColor: "var(--ut-primary-light)",
                color: "var(--ut-primary)",
                border: "1px solid var(--ut-primary-border)",
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
                style={{
                  animation: "spin 1.2s linear infinite",
                }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>
                Syncing data ({currentJob?.productsSynced ?? 0} products, {currentJob?.ordersSynced ?? 0} orders, {currentJob?.returnsSynced ?? 0} returns)...
              </span>
            </div>
          )}

          {isCompleted && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: "var(--ut-radius-full)",
                fontSize: 12,
                fontWeight: 500,
                backgroundColor: "var(--ut-success-light)",
                color: "var(--ut-success)",
                border: "1px solid var(--ut-success-border)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Synchronized (Last: {formatDate(currentJob?.completedAt)})</span>
            </div>
          )}

          {isFailed && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: "var(--ut-radius-full)",
                fontSize: 12,
                fontWeight: 500,
                backgroundColor: "var(--ut-danger-light)",
                color: "var(--ut-danger)",
                border: "1px solid var(--ut-danger-border)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>Sync failed: {currentJob?.errorSummary || "Error during import"}</span>
            </div>
          )}

          {isPending && (
            <span style={{ fontSize: 13, color: "var(--ut-text-secondary)" }}>
              Historical data not yet synced. Import store history to begin return analysis.
            </span>
          )}
        </div>

        {/* Right Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isCompleted && (
            <div
              style={{
                fontSize: 12,
                color: "var(--ut-text-secondary)",
                marginRight: 6,
              }}
            >
              <strong>{counts.products}</strong> products • <strong>{counts.orders}</strong> orders • <strong>{counts.returns}</strong> returns
            </div>
          )}

          {onTriggerSync && (
            <button
              type="button"
              className={isPending || isFailed ? "unturn-btn-primary" : "unturn-btn-secondary"}
              disabled={isRunning}
              onClick={() => onTriggerSync(isFailed ? "retry" : "start")}
              style={{
                opacity: isRunning ? 0.6 : 1,
                cursor: isRunning ? "not-allowed" : "pointer",
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>
                {isRunning
                  ? "Sync in progress..."
                  : isFailed
                  ? "Retry Sync"
                  : isCompleted
                  ? "Re-sync Store Data"
                  : "Sync Store Data"}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Coverage or Limitations Banner if relevant */}
      {coverage && coverage.notes.length > 0 && isCompleted && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid var(--ut-border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--ut-text-secondary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--ut-text-muted)" }}>Data coverage:</span>
            <span>{coverage.notes.join(" ")}</span>
          </div>
          <div>
            <span style={{ fontWeight: 600 }}>{coverage.reasonCoveragePercent}%</span> reason coverage
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
