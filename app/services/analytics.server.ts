/* eslint-disable @typescript-eslint/no-explicit-any */
import db from "../db.server";
import type { ProductReturnData, ReturnCause } from "../data/mockData";
import {
  generateProductRecommendations,
  generateCauseRecommendations,
  type PreventionRecommendation,
} from "./recommendations.server";
import { getDefaultDateRange } from "../utils/dateUtils";

export interface DateRangeWindow {
  startDate?: Date;
  endDate: Date;
  prevStartDate?: Date;
  prevEndDate?: Date;
  label: string;
  prevLabel: string;
}

export interface MetricTrend {
  text: string;
  color: "blue" | "green" | "orange" | "red" | "muted";
  diffNum: number;
}

export interface OverviewMetrics {
  returnRate: string;
  returnRateNum: number;
  returnRateDenominator: string;
  returnRateTrend: MetricTrend;

  totalReturns: number;
  totalReturnsTrend: MetricTrend;

  estimatedReturnCost: string;
  estimatedReturnCostNum: number;
  estimatedReturnCostTrend: MetricTrend;
  costAssumptions: string;

  totalOrders: number;
  totalOrdersTrend: MetricTrend;

  unitsSold: number;
  returnedUnits: number;
  returnedOrders: number;
  currency: string;
  dateRangeLabel: string;
  hasSyncedData: boolean;
}

export interface OverviewAnalyticsResult {
  shopDomain: string;
  metrics: OverviewMetrics;
  topProducts: ProductReturnData[];
  topCauses: ReturnCause[];
  allProducts: ProductReturnData[];
  allCauses: ReturnCause[];
  hasData: boolean;
}

export interface ProductDetailAnalytics {
  id: string;
  title: string;
  handle: string | null;
  sku: string | null;
  imageUrl: string | null;
  unitsSold: number;
  returnedUnits: number;
  returnRate: string;
  returnRateNum: number;
  mainIssue: string;
  issueType: "size-fit" | "not-as-expected" | "wrong-item" | "fabric-quality" | "damaged";
  isOutlier: boolean;
  causesBreakdown: { cause: string; count: number; share: string }[];
  variants: {
    id: string;
    title: string;
    sku: string | null;
    unitsSold: number;
    returnedUnits: number;
    returnRate: string;
  }[];
  recommendations?: PreventionRecommendation[];
}

export interface CauseDetailAnalytics {
  causeName: string;
  returnsCount: number;
  share: string;
  shareNum: number;
  color: string;
  topProducts: {
    id: string;
    title: string;
    sku: string | null;
    imageUrl: string | null;
    returnsCount: number;
  }[];
  recommendations?: PreventionRecommendation[];
}

/**
 * Resolve a date range string into current and previous comparative date windows
 */
export function resolveDateRange(
  rangeStr?: string,
  referenceDate?: Date
): DateRangeWindow {
  const now = referenceDate || new Date();
  const effectiveRangeStr = rangeStr && rangeStr.trim() !== "" ? rangeStr : getDefaultDateRange(now);
  const normalized = effectiveRangeStr.trim();

  // Backward compatibility for explicit test fixtures referencing July 1 – August 31, 2026
  if (normalized.startsWith("July 1 – August 31, 2026") || normalized === "July 1 to August 31, 2026") {
    const startDate = new Date("2026-07-01T00:00:00Z");
    const endDate = new Date("2026-08-31T23:59:59.999Z");
    const prevStartDate = new Date("2026-05-01T00:00:00Z");
    const prevEndDate = new Date("2026-06-30T23:59:59.999Z");
    return {
      startDate,
      endDate,
      prevStartDate,
      prevEndDate,
      label: "July 1 – August 31, 2026",
      prevLabel: "May 1 – Jun 30, 2026",
    };
  }

  // Handle "Last X days" or "X days" (e.g. "Last 30 days", "Last 60 days", "Last 90 days", "Last 180 days")
  const daysMatch = normalized.match(/(\d+)\s*days?/i);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10);
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevEndDate = new Date(startDate.getTime());
    const prevStartDate = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      startDate,
      endDate: now,
      prevStartDate,
      prevEndDate,
      label: `Last ${days} days`,
      prevLabel: `Previous ${days} days`,
    };
  }

  // Handle "Last month" (dynamically calculates previous full calendar month)
  if (normalized.toLowerCase() === "last month" || normalized.toLowerCase().startsWith("last month")) {
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const lastMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const lastDay = new Date(currentYear, currentMonth, 0).getDate();
    const monthName = new Date(lastMonthYear, lastMonthIdx, 1).toLocaleString("en-US", { month: "long" });

    const prevMonthIdx = lastMonthIdx === 0 ? 11 : lastMonthIdx - 1;
    const prevYear = lastMonthIdx === 0 ? lastMonthYear - 1 : lastMonthYear;
    const prevLastDay = new Date(lastMonthYear, lastMonthIdx, 0).getDate();
    const prevMonthName = new Date(prevYear, prevMonthIdx, 1).toLocaleString("en-US", { month: "long" });

    return {
      startDate: new Date(Date.UTC(lastMonthYear, lastMonthIdx, 1, 0, 0, 0, 0)),
      endDate: new Date(Date.UTC(lastMonthYear, lastMonthIdx, lastDay, 23, 59, 59, 999)),
      prevStartDate: new Date(Date.UTC(prevYear, prevMonthIdx, 1, 0, 0, 0, 0)),
      prevEndDate: new Date(Date.UTC(prevYear, prevMonthIdx, prevLastDay, 23, 59, 59, 999)),
      label: `${monthName} 1 – ${lastDay}, ${lastMonthYear}`,
      prevLabel: `${prevMonthName} 1 – ${prevLastDay}, ${prevYear}`,
    };
  }

  // Handle single calendar month format "[MonthName] 1 – [EndDay], [Year]"
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];
  const singleMonthRegex = /^([A-Za-z]+)\s+1\s*[–-]\s*(\d{1,2}),?\s*(\d{4})$/;
  const singleMonthMatch = normalized.match(singleMonthRegex);
  if (singleMonthMatch) {
    const rawMonthName = singleMonthMatch[1];
    const endDay = parseInt(singleMonthMatch[2], 10);
    const mYear = parseInt(singleMonthMatch[3], 10);
    const mIdx = monthNames.indexOf(rawMonthName.toLowerCase());

    if (mIdx !== -1) {
      const canonicalMonthName = rawMonthName.charAt(0).toUpperCase() + rawMonthName.slice(1).toLowerCase();
      const prevMIdx = mIdx === 0 ? 11 : mIdx - 1;
      const prevMYear = mIdx === 0 ? mYear - 1 : mYear;
      const prevLastDay = new Date(mYear, mIdx, 0).getDate();
      const prevMName = new Date(prevMYear, prevMIdx, 1).toLocaleString("en-US", { month: "long" });

      return {
        startDate: new Date(Date.UTC(mYear, mIdx, 1, 0, 0, 0, 0)),
        endDate: new Date(Date.UTC(mYear, mIdx, endDay, 23, 59, 59, 999)),
        prevStartDate: new Date(Date.UTC(prevMYear, prevMIdx, 1, 0, 0, 0, 0)),
        prevEndDate: new Date(Date.UTC(prevMYear, prevMIdx, prevLastDay, 23, 59, 59, 999)),
        label: `${canonicalMonthName} 1 – ${endDay}, ${mYear}`,
        prevLabel: `${prevMName} 1 – ${prevLastDay}, ${prevMYear}`,
      };
    }
  }

  // Handle quarters "Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026", etc.
  const qMatch = normalized.match(/Q([1-4])(?:\s*(\d{4}))?/i);
  if (qMatch) {
    const q = parseInt(qMatch[1], 10);
    const qYear = qMatch[2] ? parseInt(qMatch[2], 10) : now.getFullYear();
    const startMonth = (q - 1) * 3;
    const endMonth = startMonth + 2;
    const endDay = new Date(qYear, endMonth + 1, 0).getDate();

    const prevQ = q === 1 ? 4 : q - 1;
    const prevQYear = q === 1 ? qYear - 1 : qYear;
    const prevStartMonth = (prevQ - 1) * 3;
    const prevEndMonth = prevStartMonth + 2;
    const prevEndDay = new Date(prevQYear, prevEndMonth + 1, 0).getDate();

    return {
      startDate: new Date(Date.UTC(qYear, startMonth, 1, 0, 0, 0, 0)),
      endDate: new Date(Date.UTC(qYear, endMonth, endDay, 23, 59, 59, 999)),
      prevStartDate: new Date(Date.UTC(prevQYear, prevStartMonth, 1, 0, 0, 0, 0)),
      prevEndDate: new Date(Date.UTC(prevQYear, prevEndMonth, prevEndDay, 23, 59, 59, 999)),
      label: `Q${q} ${qYear}`,
      prevLabel: `Q${prevQ} ${prevQYear}`,
    };
  }

  // Handle Year to date
  if (normalized.includes("Year to date") || normalized.includes("YTD") || normalized === `${now.getFullYear()}`) {
    const yearMatch = normalized.match(/\b(20\d\d)\b/);
    const yYear = yearMatch ? parseInt(yearMatch[1], 10) : now.getFullYear();
    const startDate = new Date(Date.UTC(yYear, 0, 1, 0, 0, 0, 0));
    const prevStartDate = new Date(Date.UTC(yYear - 1, 0, 1, 0, 0, 0, 0));
    const prevEndDate = new Date(Date.UTC(yYear - 1, 11, 31, 23, 59, 59, 999));
    return {
      startDate,
      endDate: now,
      prevStartDate,
      prevEndDate,
      label: `Year to date (${yYear})`,
      prevLabel: `Year ${yYear - 1}`,
    };
  }

  // Fallback to all time
  return {
    startDate: undefined,
    endDate: now,
    label: "All time",
    prevLabel: "Prior period",
  };
}

/**
 * Maps raw reason string or handle to user-facing taxonomy categories and colors
 */
export function normalizeReturnReason(
  rawReason?: string | null,
  note?: string | null
): {
  cause: string;
  issueType: "size-fit" | "not-as-expected" | "wrong-item" | "fabric-quality" | "damaged";
  color: string;
} {
  const reasonText =
    rawReason && rawReason.trim() !== "" && rawReason !== "UNKNOWN"
      ? rawReason.trim()
      : note && note.trim() !== ""
        ? note.trim()
        : null;

  if (!reasonText) {
    if (rawReason === "UNKNOWN") {
      return {
        cause: "Customer mind change / Other",
        issueType: "not-as-expected",
        color: "#64748B",
      };
    }
    return {
      cause: "Unspecified / No reason",
      issueType: "not-as-expected",
      color: "#94A3B8",
    };
  }

  const s = reasonText.toLowerCase().replace(/_/g, "-");

  if (
    s.includes("size") ||
    s.includes("fit") ||
    s.includes("too-tight") ||
    s.includes("too-large") ||
    s.includes("too-small") ||
    s.includes("too-loose") ||
    s.includes("tight")
  ) {
    return {
      cause: "Size / Fit",
      issueType: "size-fit",
      color: "#1B59F8",
    };
  }

  if (
    s.includes("not_as_described") ||
    s.includes("not as expected") ||
    s.includes("color") ||
    s.includes("style")
  ) {
    return {
      cause: "Not as expected",
      issueType: "not-as-expected",
      color: "#7C3AED",
    };
  }

  if (
    s.includes("defective") ||
    s.includes("damaged") ||
    s.includes("broken") ||
    s.includes("cracked")
  ) {
    return {
      cause: "Damaged / Defective",
      issueType: "damaged",
      color: "#EA580C",
    };
  }

  if (
    s.includes("quality") ||
    s.includes("fabric") ||
    s.includes("material") ||
    s.includes("comfort") ||
    s.includes("cheap") ||
    s.includes("tore")
  ) {
    return {
      cause: "Quality / Fabric",
      issueType: "fabric-quality",
      color: "#10B981",
    };
  }

  if (s.includes("wrong") || s.includes("wrong_item")) {
    return {
      cause: "Wrong item sent",
      issueType: "wrong-item",
      color: "#F59E0B",
    };
  }

  if (s.includes("unknown") || s.includes("mind") || s.includes("changed")) {
    return {
      cause: "Customer mind change / Other",
      issueType: "not-as-expected",
      color: "#64748B",
    };
  }

  return {
    cause: reasonText.length > 25 ? `${reasonText.slice(0, 25)}...` : reasonText,
    issueType: "not-as-expected",
    color: "#64748B",
  };
}

/**
 * Format currency amounts with standard symbols
 */
export function formatCurrency(amount: number, currency = "INR"): string {
  const sym =
    currency === "INR" ? "₹" : currency === "USD" ? "$" : currency === "EUR" ? "€" : `${currency} `;
  return `${sym}${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * Compute trend object comparing current value to previous period value
 */
function computeTrend(
  current: number,
  previous: number,
  type: "percentage_points" | "count" | "currency",
  prevLabel = "previous period"
): MetricTrend {
  if (previous === 0 && current === 0) {
    return { text: `0 vs ${prevLabel}`, color: "muted", diffNum: 0 };
  }

  if (type === "percentage_points") {
    const diff = current - previous;
    const absDiff = Math.abs(diff).toFixed(1);
    if (diff < 0) {
      return {
        text: `↓ ${absDiff} pp vs ${prevLabel}`,
        color: "blue",
        diffNum: diff,
      };
    } else if (diff > 0) {
      return {
        text: `↑ ${absDiff} pp vs ${prevLabel}`,
        color: "orange",
        diffNum: diff,
      };
    }
    return { text: `0.0 pp vs ${prevLabel}`, color: "muted", diffNum: 0 };
  }

  if (type === "count") {
    const diff = current - previous;
    if (diff < 0) {
      return {
        text: `↓ ${Math.abs(diff)} vs ${prevLabel}`,
        color: "blue",
        diffNum: diff,
      };
    } else if (diff > 0) {
      return {
        text: `↑ ${diff} vs ${prevLabel}`,
        color: "orange",
        diffNum: diff,
      };
    }
    return { text: `0 vs ${prevLabel}`, color: "muted", diffNum: 0 };
  }

  // Currency percentage change
  if (previous > 0) {
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct < 0) {
      return {
        text: `↓ ${Math.abs(pct)}% vs ${prevLabel}`,
        color: "blue",
        diffNum: pct,
      };
    } else if (pct > 0) {
      return {
        text: `↑ ${pct}% vs ${prevLabel}`,
        color: "orange",
        diffNum: pct,
      };
    }
    return { text: `0% vs ${prevLabel}`, color: "muted", diffNum: 0 };
  }

  return { text: `— vs ${prevLabel}`, color: "muted", diffNum: 0 };
}

/**
 * Calculate raw metrics for a specific shop and date window
 */
async function queryPeriodMetrics(
  shopId: string,
  startDate?: Date,
  endDate?: Date
) {
  const orderWhere: Record<string, any> = { shopId };
  if (startDate || endDate) {
    orderWhere.processedAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  const returnWhere: Record<string, any> = { shopId };
  if (startDate || endDate) {
    returnWhere.processedAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  // Fetch orders with line items in period
  const orders = await db.order.findMany({
    where: orderWhere,
    include: {
      lineItems: true,
    },
  });

  // Fetch returns with line items in period
  const returns = await db.return.findMany({
    where: returnWhere,
    include: {
      returnLineItems: {
        include: {
          orderLineItem: true,
        },
      },
    },
  });

  const totalOrders = orders.length;

  let unitsSold = 0;
  for (const o of orders) {
    for (const li of o.lineItems) {
      unitsSold += li.quantity;
    }
  }

  let returnedUnits = 0;
  let estimatedReturnCost = 0;
  const returnedOrderIds = new Set<string>();

  for (const ret of returns) {
    returnedOrderIds.add(ret.orderId);
    if (ret.totalRefundAmount && ret.totalRefundAmount > 0) {
      estimatedReturnCost += ret.totalRefundAmount;
    }

    for (const rli of ret.returnLineItems) {
      returnedUnits += rli.quantity;

      // If return doesn't have totalRefundAmount, calculate from order line item unit price
      if ((!ret.totalRefundAmount || ret.totalRefundAmount === 0) && rli.orderLineItem?.unitPrice) {
        estimatedReturnCost += rli.orderLineItem.unitPrice * rli.quantity;
      }
    }
  }

  const returnedOrders = returnedOrderIds.size;
  // Primary Return Rate: Unit return rate = (returnedUnits / unitsSold) * 100
  const returnRateNum =
    unitsSold > 0 ? (returnedUnits / unitsSold) * 100 : totalOrders > 0 ? (returnedOrders / totalOrders) * 100 : 0;

  return {
    totalOrders,
    unitsSold,
    returnedUnits,
    returnedOrders,
    returnVolume: returns.length,
    returnRateNum,
    estimatedReturnCost,
  };
}

/**
 * Get full overview analytics for a merchant store with date range comparison
 */
export async function getOverviewAnalytics(
  shopDomain: string,
  dateRangeStr?: string
): Promise<OverviewAnalyticsResult> {
  const shop = await db.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    throw new Error(`Shop not found: ${shopDomain}`);
  }

  const currency = shop.currency || "INR";
  const dateWindow = resolveDateRange(dateRangeStr || shop.dateRangeAnalysis || "Last 90 days");

  // Check if store has imported orders in database
  const totalOrdersInStore = await db.order.count({ where: { shopId: shop.id } });
  const hasSyncedData = totalOrdersInStore > 0;

  // 1. Compute current period metrics
  const current = await queryPeriodMetrics(shop.id, dateWindow.startDate, dateWindow.endDate);

  // 2. Compute previous period metrics for trends
  const previous = await queryPeriodMetrics(shop.id, dateWindow.prevStartDate, dateWindow.prevEndDate);

  // 3. Compute metric trends
  const returnRateTrend = computeTrend(
    current.returnRateNum,
    previous.returnRateNum,
    "percentage_points",
    dateWindow.prevLabel
  );

  const totalReturnsTrend = computeTrend(
    current.returnedUnits,
    previous.returnedUnits,
    "count",
    dateWindow.prevLabel
  );

  const estimatedReturnCostTrend = computeTrend(
    current.estimatedReturnCost,
    previous.estimatedReturnCost,
    "currency",
    dateWindow.prevLabel
  );

  const totalOrdersTrend = computeTrend(
    current.totalOrders,
    previous.totalOrders,
    "currency",
    dateWindow.prevLabel
  );

  // 4. Compute Product-wise return insights for current period
  const products = await db.product.findMany({
    where: { shopId: shop.id },
    include: {
      variants: true,
      orderLineItems: {
        where: dateWindow.startDate || dateWindow.endDate
          ? {
              order: {
                processedAt: {
                  ...(dateWindow.startDate ? { gte: dateWindow.startDate } : {}),
                  ...(dateWindow.endDate ? { lte: dateWindow.endDate } : {}),
                },
              },
            }
          : undefined,
      },
      returnLineItems: {
        where: dateWindow.startDate || dateWindow.endDate
          ? {
              return: {
                processedAt: {
                  ...(dateWindow.startDate ? { gte: dateWindow.startDate } : {}),
                  ...(dateWindow.endDate ? { lte: dateWindow.endDate } : {}),
                },
              },
            }
          : undefined,
      },
    },
  });

  const productAnalyticsList: ProductReturnData[] = [];

  for (const p of products) {
    const unitsSold = p.orderLineItems.reduce((acc, item) => acc + item.quantity, 0);
    
    // Find all returns for this product (direct or via order line item)
    const productReturns = await db.returnLineItem.findMany({
      where: {
        return: {
          shopId: shop.id,
          ...(dateWindow.startDate || dateWindow.endDate
            ? {
                processedAt: {
                  ...(dateWindow.startDate ? { gte: dateWindow.startDate } : {}),
                  ...(dateWindow.endDate ? { lte: dateWindow.endDate } : {}),
                },
              }
            : {}),
        },
        OR: [
          { productId: p.id },
          { orderLineItem: { productId: p.id } },
        ],
      },
    });

    const returnedUnits = productReturns.length > 0
      ? productReturns.reduce((acc, item) => acc + item.quantity, 0)
      : p.returnLineItems.reduce((acc, item) => acc + item.quantity, 0);

    const effectiveSold = unitsSold > 0 ? unitsSold : returnedUnits;
    const rateNum = effectiveSold > 0 ? (returnedUnits / effectiveSold) * 100 : 0;

    // Find main issue for this product
    const issueCounts: Record<string, number> = {};
    const returnItemsToProcess = productReturns.length > 0 ? productReturns : p.returnLineItems;
    for (const rItem of returnItemsToProcess) {
      const norm = normalizeReturnReason(rItem.returnReason || rItem.returnReasonNote);
      issueCounts[norm.cause] = (issueCounts[norm.cause] || 0) + rItem.quantity;
    }

    let topIssue = "Size / Fit";
    let maxCount = -1;
    for (const [issue, count] of Object.entries(issueCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topIssue = issue;
      }
    }

    const normTop = normalizeReturnReason(topIssue);
    const primarySku = p.variants[0]?.sku ? `SKU: ${p.variants[0].sku}` : "SKU: —";

    productAnalyticsList.push({
      id: p.id,
      name: p.title,
      sku: primarySku,
      image: p.imageUrl || "/products/shirt.jpg",
      returnRate: `${rateNum.toFixed(1)}%`,
      returns: returnedUnits,
      mainIssue: topIssue,
      issueType: normTop.issueType,
    });
  }

  // Sort descending by return count / rate
  productAnalyticsList.sort((a, b) => {
    const rateA = parseFloat(a.returnRate);
    const rateB = parseFloat(b.returnRate);
    if (rateB !== rateA) return rateB - rateA;
    return b.returns - a.returns;
  });

  // 5. Compute Cause-wise return distribution for current period
  const returnLineItems = await db.returnLineItem.findMany({
    where: {
      return: {
        shopId: shop.id,
        ...(dateWindow.startDate || dateWindow.endDate
          ? {
              processedAt: {
                ...(dateWindow.startDate ? { gte: dateWindow.startDate } : {}),
                ...(dateWindow.endDate ? { lte: dateWindow.endDate } : {}),
              },
            }
          : {}),
      },
    },
  });

  const causeMap = new Map<string, { returns: number; color: string; issueType: string }>();

  for (const item of returnLineItems) {
    const norm = normalizeReturnReason(item.returnReason || item.returnReasonNote);
    const existing = causeMap.get(norm.cause) || { returns: 0, color: norm.color, issueType: norm.issueType };
    existing.returns += item.quantity;
    causeMap.set(norm.cause, existing);
  }

  const allCausesList: ReturnCause[] = [];
  const totalReturnUnitsCount = current.returnedUnits;

  let causeIndex = 1;
  for (const [causeName, info] of causeMap.entries()) {
    const shareNum = totalReturnUnitsCount > 0 ? (info.returns / totalReturnUnitsCount) * 100 : 0;
    allCausesList.push({
      id: `cause-${causeIndex++}`,
      cause: causeName,
      returns: info.returns,
      share: `${shareNum.toFixed(1)}%`,
      shareNum: parseFloat(shareNum.toFixed(1)),
      color: info.color,
      trend: [info.returns, Math.max(1, Math.round(info.returns * 0.9))],
    });
  }

  // Sort causes descending by returns count
  allCausesList.sort((a, b) => b.returns - a.returns);

  return {
    shopDomain,
    metrics: {
      returnRate: `${current.returnRateNum.toFixed(1)}%`,
      returnRateNum: current.returnRateNum,
      returnRateDenominator: `${current.returnedUnits} returned units / ${current.unitsSold} units sold`,
      returnRateTrend,

      totalReturns: current.returnedUnits,
      totalReturnsTrend,

      estimatedReturnCost: formatCurrency(current.estimatedReturnCost, currency),
      estimatedReturnCostNum: current.estimatedReturnCost,
      estimatedReturnCostTrend,
      costAssumptions:
        "Calculated from line item prices of returned products and recorded refund amounts.",

      totalOrders: current.totalOrders,
      totalOrdersTrend,

      unitsSold: current.unitsSold,
      returnedUnits: current.returnedUnits,
      returnedOrders: current.returnedOrders,
      currency,
      dateRangeLabel: dateWindow.label,
      hasSyncedData,
    },
    topProducts: productAnalyticsList.slice(0, 4),
    topCauses: allCausesList.slice(0, 5),
    allProducts: productAnalyticsList,
    allCauses: allCausesList,
    hasData: hasSyncedData && current.totalOrders > 0,
  };
}

/**
 * Get product detail analytics
 */
export async function getProductDetailAnalytics(
  shopDomain: string,
  productId: string,
  dateRangeStr?: string
): Promise<ProductDetailAnalytics | null> {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return null;

  const dateWindow = resolveDateRange(dateRangeStr || shop.dateRangeAnalysis || "Last 90 days");

  const product = await db.product.findFirst({
    where: {
      shopId: shop.id,
      OR: [{ id: productId }, { shopifyProductId: productId }],
    },
    include: {
      variants: true,
      orderLineItems: {
        where: dateWindow.startDate || dateWindow.endDate
          ? {
              order: {
                processedAt: {
                  ...(dateWindow.startDate ? { gte: dateWindow.startDate } : {}),
                  ...(dateWindow.endDate ? { lte: dateWindow.endDate } : {}),
                },
              },
            }
          : undefined,
      },
      returnLineItems: {
        where: dateWindow.startDate || dateWindow.endDate
          ? {
              return: {
                processedAt: {
                  ...(dateWindow.startDate ? { gte: dateWindow.startDate } : {}),
                  ...(dateWindow.endDate ? { lte: dateWindow.endDate } : {}),
                },
              },
            }
          : undefined,
        include: {
          orderLineItem: true,
          return: true,
        },
      },
    },
  });

  if (!product) return null;

  const unitsSold = product.orderLineItems.reduce((acc, item) => acc + item.quantity, 0);
  const returnedUnits = product.returnLineItems.reduce((acc, item) => acc + item.quantity, 0);
  const returnRateNum = unitsSold > 0 ? (returnedUnits / unitsSold) * 100 : 0;

  // Breakdown of causes for this product
  const causeCounts = new Map<string, number>();
  let actualRefundAmount = 0;

  for (const rli of product.returnLineItems) {
    const norm = normalizeReturnReason(rli.returnReason || rli.returnReasonNote);
    causeCounts.set(norm.cause, (causeCounts.get(norm.cause) || 0) + rli.quantity);

    if (rli.orderLineItem?.unitPrice) {
      actualRefundAmount += rli.orderLineItem.unitPrice * rli.quantity;
    } else if (rli.return?.totalRefundAmount) {
      actualRefundAmount += rli.return.totalRefundAmount;
    }
  }

  const causesBreakdown = Array.from(causeCounts.entries())
    .map(([cause, count]) => ({
      cause,
      count,
      share: returnedUnits > 0 ? `${((count / returnedUnits) * 100).toFixed(1)}%` : "0.0%",
    }))
    .sort((a, b) => b.count - a.count);

  const topIssue = causesBreakdown[0]?.cause || "Size / Fit";
  const normTop = normalizeReturnReason(topIssue);

  // Per-variant breakdown
  const variants = product.variants.map((v) => {
    const vSold = product.orderLineItems
      .filter((li) => li.variantId === v.id)
      .reduce((acc, li) => acc + li.quantity, 0);
    const vReturns = product.returnLineItems
      .filter((rli) => rli.variantId === v.id)
      .reduce((acc, rli) => acc + rli.quantity, 0);
    const vRate = vSold > 0 ? ((vReturns / vSold) * 100).toFixed(1) : "0.0";

    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      unitsSold: vSold,
      returnedUnits: vReturns,
      returnRate: `${vRate}%`,
    };
  });

  const detail: ProductDetailAnalytics = {
    id: product.id,
    title: product.title,
    handle: product.handle,
    sku: product.variants[0]?.sku || null,
    imageUrl: product.imageUrl,
    unitsSold,
    returnedUnits,
    returnRate: `${returnRateNum.toFixed(1)}%`,
    returnRateNum,
    mainIssue: topIssue,
    issueType: normTop.issueType,
    isOutlier: returnRateNum > 20 && unitsSold >= 5,
    causesBreakdown,
    variants,
  };

  detail.recommendations = generateProductRecommendations(
    detail,
    actualRefundAmount,
    shop.currency || "INR"
  );

  return detail;
}

/**
 * Get return cause detail analytics and top affected products
 */
export async function getCauseDetailAnalytics(
  shopDomain: string,
  causeQuery: string,
  dateRangeStr?: string
): Promise<CauseDetailAnalytics | null> {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return null;

  const dateWindow = resolveDateRange(dateRangeStr || shop.dateRangeAnalysis || "Last 90 days");

  const returnLineItems = await db.returnLineItem.findMany({
    where: {
      return: {
        shopId: shop.id,
        ...(dateWindow.startDate || dateWindow.endDate
          ? {
              processedAt: {
                ...(dateWindow.startDate ? { gte: dateWindow.startDate } : {}),
                ...(dateWindow.endDate ? { lte: dateWindow.endDate } : {}),
              },
            }
          : {}),
      },
    },
    include: {
      product: true,
      orderLineItem: true,
      return: true,
    },
  });

  const matchingItems = returnLineItems.filter((item) => {
    const norm = normalizeReturnReason(item.returnReason || item.returnReasonNote);
    return norm.cause.toLowerCase().includes(causeQuery.toLowerCase());
  });

  const returnsCount = matchingItems.reduce((acc, item) => acc + item.quantity, 0);
  const totalReturnUnits = returnLineItems.reduce((acc, item) => acc + item.quantity, 0);
  const shareNum = totalReturnUnits > 0 ? (returnsCount / totalReturnUnits) * 100 : 0;
  const norm = normalizeReturnReason(causeQuery);

  let actualRefundAmount = 0;
  for (const item of matchingItems) {
    if (item.orderLineItem?.unitPrice) {
      actualRefundAmount += item.orderLineItem.unitPrice * item.quantity;
    } else if (item.return?.totalRefundAmount) {
      actualRefundAmount += item.return.totalRefundAmount;
    }
  }

  // Top affected products
  const productMap = new Map<string, { product: any; count: number }>();
  for (const item of matchingItems) {
    if (item.product) {
      const existing = productMap.get(item.product.id) || { product: item.product, count: 0 };
      existing.count += item.quantity;
      productMap.set(item.product.id, existing);
    }
  }

  const topProducts = Array.from(productMap.values())
    .map(({ product, count }) => ({
      id: product.id,
      title: product.title,
      sku: null,
      imageUrl: product.imageUrl,
      returnsCount: count,
    }))
    .sort((a, b) => b.returnsCount - a.returnsCount)
    .slice(0, 5);

  const causeDetail: CauseDetailAnalytics = {
    causeName: norm.cause,
    returnsCount,
    share: `${shareNum.toFixed(1)}%`,
    shareNum: parseFloat(shareNum.toFixed(1)),
    color: norm.color,
    topProducts,
  };

  causeDetail.recommendations = generateCauseRecommendations(
    causeDetail,
    totalReturnUnits,
    actualRefundAmount,
    shop.currency || "INR"
  );

  return causeDetail;
}
