import React, { useState, useMemo } from "react";
import { getAvailableDateRanges, getDefaultDateRange } from "../utils/dateUtils";

interface PageHeaderProps {
  title: string;
  subtitle: string;
  showFilters?: boolean;
  extraControls?: React.ReactNode;
  selectedRange?: string;
  onRangeChange?: (range: string) => void;
  exportData?: {
    filename?: string;
    products?: Array<{
      name: string;
      sku: string;
      returnRate: string;
      returns: number;
      mainIssue: string;
    }>;
    causes?: Array<{
      cause: string;
      returns: number;
      share: string;
    }>;
  };
}

export function PageHeader({
  title,
  subtitle,
  showFilters = true,
  extraControls,
  selectedRange: externalSelectedRange,
  onRangeChange,
  exportData,
}: PageHeaderProps) {
  const dynamicDateRanges = useMemo(() => getAvailableDateRanges(), []);
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [internalSelectedRange, setInternalSelectedRange] = useState(defaultRange);
  const selectedRange = externalSelectedRange ?? internalSelectedRange;
  const [isOpen, setIsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // If the active selected range is not in the preset list (e.g. custom or historical), include it at the top
  const dateRanges = useMemo(() => {
    if (selectedRange && !dynamicDateRanges.includes(selectedRange)) {
      return [selectedRange, ...dynamicDateRanges];
    }
    return dynamicDateRanges;
  }, [selectedRange, dynamicDateRanges]);

  const handleSelectRange = (range: string) => {
    setInternalSelectedRange(range);
    setIsOpen(false);
    if (onRangeChange) {
      onRangeChange(range);
    }
  };

  const handleExport = () => {
    let csvContent = "data:text/csv;charset=utf-8,Product,SKU,Return Rate,Returns Count,Main Issue\n";
    if (exportData?.causes && exportData.causes.length > 0 && (!exportData.products || exportData.products.length === 0)) {
      csvContent = "data:text/csv;charset=utf-8,Cause,Returned Units,Share\n";
      csvContent += exportData.causes
        .map((c) => `"${c.cause.replace(/"/g, '""')}",${c.returns},"${c.share}"`)
        .join("\n") + "\n";
    } else if (exportData?.products && exportData.products.length > 0) {
      csvContent += exportData.products
        .map(
          (p) =>
            `"${p.name.replace(/"/g, '""')}","${p.sku.replace(/"/g, '""')}",${p.returnRate},${p.returns},"${p.mainIssue.replace(/"/g, '""')}"`
        )
        .join("\n") + "\n";
    } else {
      csvContent +=
        "Oversized Hoodie,OH-GRN,24.6%,62,Size / Fit\n" +
        "Classic Shirt,CS-BLU,18.2%,41,Not as expected\n" +
        "Slim Jeans,SJ-BLU-32,16.8%,37,Size / Fit\n" +
        "Relaxed Tee,RT-BGE,12.4%,31,Quality / Fabric\n" +
        "Canvas Sneakers,SN-WHT-9,9.7%,24,Damaged / Defective\n";
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = exportData?.filename || `unturn_returns_${selectedRange.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setToastMessage("Report exported successfully!");
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <>
      <div className="unturn-page-header">
        <div className="unturn-page-title-group">
          <h1>{title}</h1>
          <p className="unturn-page-subtitle">{subtitle}</p>
        </div>

        {showFilters && (
          <div className="unturn-page-actions">
            {extraControls}

            {/* Date range picker dropdown */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="unturn-btn-secondary"
                onClick={() => setIsOpen(!isOpen)}
                aria-haspopup="true"
                aria-expanded={isOpen}
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
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>{selectedRange}</span>
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
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.15s ease",
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: 6,
                    backgroundColor: "var(--ut-bg-card)",
                    border: "1px solid var(--ut-border)",
                    borderRadius: 8,
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                    width: 250,
                    zIndex: 60,
                    padding: 4,
                  }}
                >
                  {dateRanges.map((range) => (
                    <button
                      key={range}
                      type="button"
                      onClick={() => handleSelectRange(range)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: 13,
                        textAlign: "left",
                        background:
                          selectedRange === range
                            ? "var(--ut-primary-light)"
                            : "transparent",
                        color:
                          selectedRange === range
                            ? "var(--ut-primary)"
                            : "var(--ut-text-primary)",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontWeight: selectedRange === range ? 600 : 400,
                      }}
                    >
                      <span>{range}</span>
                      {selectedRange === range && (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Export button */}
            <button
              type="button"
              className="unturn-btn-secondary"
              onClick={handleExport}
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export</span>
            </button>
          </div>
        )}
      </div>

      {toastMessage && (
        <div className="unturn-toast">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
