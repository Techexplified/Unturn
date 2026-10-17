import React, { useState } from "react";

export interface StatCardProps {
  icon: React.ReactNode;
  iconColor?: "blue" | "orange" | "green" | "purple";
  label: string;
  infoTooltip?: string;
  value: string;
  trendText?: string;
  trendColor?: "blue" | "green" | "orange" | "red" | "muted";
  subtext?: string;
}

export function StatCard({
  icon,
  iconColor = "blue",
  label,
  infoTooltip,
  value,
  trendText,
  trendColor = "blue",
  subtext,
}: StatCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="unturn-stat-card">
      <div className="unturn-stat-top">
        <div className={`unturn-stat-icon ${iconColor}`}>{icon}</div>
        <div className="unturn-stat-label-group">
          <span className="unturn-stat-label">{label}</span>
          {infoTooltip && (
            <div style={{ position: "relative", display: "inline-flex" }}>
              <button
                type="button"
                className="unturn-info-icon"
                onClick={() => setShowTooltip(!showTooltip)}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
                aria-label={`Info for ${label}`}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
              {showTooltip && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: "50%",
                    transform: "translateX(-50%) translateY(-6px)",
                    backgroundColor: "#1e293b",
                    color: "#f8fafc",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 400,
                    whiteSpace: "normal",
                    width: 200,
                    zIndex: 50,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    lineHeight: 1.4,
                  }}
                >
                  {infoTooltip}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="unturn-stat-value">{value}</div>

      {trendText && (
        <div className={`unturn-stat-trend ${trendColor}`}>
          <span>{trendText}</span>
        </div>
      )}

      {subtext && !trendText && (
        <div className="unturn-stat-trend muted">
          <span>{subtext}</span>
        </div>
      )}
    </div>
  );
}
