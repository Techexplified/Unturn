import { useState, useEffect, useMemo } from "react";
import type { ProductReturnData } from "../data/mockData";
import { ProductThumb } from "./ProductThumb";

interface AllProductsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  products?: ProductReturnData[];
  onSelectProduct?: (productId: string) => void;
}

export function AllProductsDrawer({
  isOpen,
  onClose,
  products,
  onSelectProduct,
}: AllProductsDrawerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("return-rate");
  const [selectedIssue, setSelectedIssue] = useState<string>("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const sourceProducts = products || [];

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

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let result = [...sourceProducts];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.mainIssue.toLowerCase().includes(q)
      );
    }

    if (selectedIssue !== "all") {
      result = result.filter((p) => p.mainIssue === selectedIssue);
    }

    if (sortBy === "return-rate") {
      result.sort((a, b) => parseFloat(b.returnRate) - parseFloat(a.returnRate));
    } else if (sortBy === "returns-desc") {
      result.sort((a, b) => b.returns - a.returns);
    } else if (sortBy === "returns-asc") {
      result.sort((a, b) => a.returns - b.returns);
    } else if (sortBy === "name-asc") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [searchQuery, selectedIssue, sortBy, sourceProducts]);

  const totalPages = Math.ceil(filteredProducts.length / pageSize) || 1;
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage]);

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, filteredProducts.length);

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
          <h2 className="unturn-drawer-title">All Products</h2>
          <button
            type="button"
            className="unturn-drawer-close"
            onClick={onClose}
            aria-label="Close All Products Drawer"
          >
            ✕
          </button>
        </div>

        {/* Search input */}
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
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
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
            <option value="return-rate">Sort by: Return rate</option>
            <option value="returns-desc">Sort by: Returns (High to Low)</option>
            <option value="returns-asc">Sort by: Returns (Low to High)</option>
            <option value="name-asc">Sort by: Product Name (A-Z)</option>
          </select>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              className={`unturn-drawer-filter-btn ${
                selectedIssue !== "all" ? "active" : ""
              }`}
              onClick={() => setShowFilterMenu(!showFilterMenu)}
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
              <span>Filter{selectedIssue !== "all" ? ` (${selectedIssue})` : ""}</span>
            </button>

            {showFilterMenu && (
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
                  width: 180,
                  zIndex: 70,
                  padding: 4,
                }}
              >
                {[
                  { label: "All issues", val: "all" },
                  { label: "Size / Fit", val: "Size / Fit" },
                  { label: "Not as expected", val: "Not as expected" },
                  { label: "Quality / Fabric", val: "Quality / Fabric" },
                  { label: "Damaged / Defective", val: "Damaged / Defective" },
                  { label: "Wrong item / Variant", val: "Wrong item / Variant" },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => {
                      setSelectedIssue(item.val);
                      setShowFilterMenu(false);
                      setCurrentPage(1);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: 12,
                      textAlign: "left",
                      background:
                        selectedIssue === item.val
                          ? "var(--ut-primary-light)"
                          : "transparent",
                      color:
                        selectedIssue === item.val
                          ? "var(--ut-primary)"
                          : "var(--ut-text-primary)",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontWeight: selectedIssue === item.val ? 600 : 400,
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Product Table Body */}
        <div className="unturn-drawer-body">
          <table className="unturn-drawer-table">
            <thead>
              <tr>
                <th style={{ width: "55%" }}>Product</th>
                <th className="num-col" style={{ width: "23%" }}>
                  Return rate
                </th>
                <th className="num-col" style={{ width: "22%" }}>
                  Returns
                </th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length > 0 ? (
                currentItems.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onSelectProduct && onSelectProduct(p.id)}
                    style={{ cursor: onSelectProduct ? "pointer" : "default" }}
                  >
                    <td>
                      <div className="unturn-product-cell">
                        <ProductThumb src={p.image} alt={p.name} />
                        <div className="unturn-product-info">
                          <span className="unturn-product-name">{p.name}</span>
                          <span className="unturn-product-sku">{p.sku}</span>
                        </div>
                      </div>
                    </td>
                    <td className="num-col">
                      <span style={{ fontWeight: 600, color: "var(--ut-text-primary)" }}>
                        {p.returnRate}
                      </span>
                    </td>
                    <td className="num-col">
                      <span style={{ fontWeight: 600, color: "var(--ut-text-primary)" }}>
                        {p.returns}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", padding: "36px 20px" }}>
                    <div style={{ color: "var(--ut-text-muted)", fontSize: 13 }}>
                      {searchQuery
                        ? `No products found matching "${searchQuery}"`
                        : "No products available in this time range"}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with pagination */}
        <div className="unturn-drawer-footer">
          <div className="unturn-drawer-count">
            {filteredProducts.length > 0 ? (
              <span>
                Showing {startIdx}-{endIdx} of {filteredProducts.length}
              </span>
            ) : (
              <span>0 products</span>
            )}
          </div>

          <div className="unturn-drawer-pagination">
            <button
              type="button"
              className="unturn-page-btn"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              ‹
            </button>

            {Array.from({ length: Math.min(3, totalPages) }, (_, idx) => {
              const pageNum = idx + 1;
              return (
                <button
                  key={pageNum}
                  type="button"
                  className={`unturn-page-btn ${
                    currentPage === pageNum ? "active" : ""
                  }`}
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              className="unturn-page-btn"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
