import { useState, useEffect, useMemo } from "react";
import type { ReturnCause } from "../data/mockData";

interface AllCausesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCause?: (causeName: string) => void;
  causes?: ReturnCause[];
}

export function AllCausesDrawer({
  isOpen,
  onClose,
  onSelectCause,
  causes,
}: AllCausesDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("returns-desc");
  const [selectedCauseId, setSelectedCauseId] = useState<string | null>(null);

  const sourceCauses = causes || [];

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

  // Prevent background scrolling when drawer is open
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

  // Filter and sort causes
  const filteredCauses = useMemo(() => {
    let result = [...sourceCauses];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((c) => c.cause.toLowerCase().includes(q));
    }

    if (sortBy === "returns-desc") {
      result.sort((a, b) => b.returns - a.returns);
    } else if (sortBy === "returns-asc") {
      result.sort((a, b) => a.returns - b.returns);
    } else if (sortBy === "share-desc") {
      result.sort((a, b) => b.shareNum - a.shareNum);
    } else if (sortBy === "name-asc") {
      result.sort((a, b) => a.cause.localeCompare(b.cause));
    }

    return result;
  }, [searchQuery, sortBy, sourceCauses]);

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
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="unturn-drawer-header">
          <h2 className="unturn-drawer-title">All Causes</h2>
          <button
            type="button"
            className="unturn-drawer-close"
            onClick={onClose}
            aria-label="Close All Causes Drawer"
          >
            ✕
          </button>
        </div>

        {/* Search Input */}
        <div className="unturn-drawer-search-wrap">
          <div className="unturn-drawer-search-box">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94A3B8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="unturn-drawer-search-input"
              placeholder="Search causes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#94A3B8",
                  padding: 0,
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Sort and Filter controls */}
        <div className="unturn-drawer-controls">
          <select
            className="unturn-drawer-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="returns-desc">Sort by: Returns</option>
            <option value="share-desc">Sort by: Share %</option>
            <option value="name-asc">Sort by: Cause Name</option>
          </select>

          <button
            type="button"
            className="unturn-drawer-filter-btn"
            onClick={() => setSearchQuery("")}
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
            <span>Filter</span>
          </button>
        </div>

        {/* Causes Table Body */}
        <div className="unturn-drawer-body">
          <table className="unturn-drawer-table">
            <thead>
              <tr>
                <th style={{ width: "56%" }}>Cause</th>
                <th className="num-col" style={{ width: "22%" }}>
                  Returns
                </th>
                <th className="num-col" style={{ width: "22%" }}>
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCauses.length > 0 ? (
                filteredCauses.map((cause) => {
                  const isSelected = selectedCauseId === cause.id;
                  return (
                    <tr
                      key={cause.id}
                      onClick={() => {
                        setSelectedCauseId(isSelected ? null : cause.id);
                        if (onSelectCause) onSelectCause(cause.cause);
                      }}
                      style={{
                        cursor: "pointer",
                        backgroundColor: isSelected
                          ? "var(--ut-primary-light)"
                          : undefined,
                      }}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span
                            className="unturn-causes-dot"
                            style={{ backgroundColor: cause.color }}
                          />
                          <span
                            style={{
                              fontWeight: 500,
                              color: isSelected
                                ? "var(--ut-primary)"
                                : "var(--ut-text-primary)",
                            }}
                          >
                            {cause.cause}
                          </span>
                        </div>
                      </td>
                      <td className="num-col">
                        <span style={{ fontWeight: 600 }}>{cause.returns}</span>
                      </td>
                      <td className="num-col">
                        <span style={{ fontWeight: 600 }}>{cause.share}</span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", padding: "36px 20px" }}>
                    <div style={{ color: "var(--ut-text-muted)", fontSize: 13 }}>
                      {searchQuery
                        ? `No causes found matching "${searchQuery}"`
                        : "No return causes recorded in this time range"}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Tip / Guidance Banner matching the screenshot */}
          <div style={{ padding: "20px 24px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                backgroundColor: "var(--ut-bg-subtle)",
                border: "1px solid var(--ut-border)",
                borderRadius: 10,
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: "var(--ut-primary-light)",
                  color: "var(--ut-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                💡
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "var(--ut-text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                Click on any cause to see detailed insights, impacted products, and recommended actions.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="unturn-drawer-footer">
          <div className="unturn-drawer-count">
            <span>
              Showing {filteredCauses.length > 0 ? `1-${filteredCauses.length} of ${filteredCauses.length}` : "0 of 0"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
