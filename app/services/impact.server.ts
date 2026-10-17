/* eslint-disable @typescript-eslint/no-explicit-any */
import db from "../db.server";
import { normalizeReturnReason, formatCurrency } from "./analytics.server";

export interface ImpactTrendPoint {
  label: string;
  returnRate: number;
  returnedUnits: number;
  unitsSold: number;
  dateStr?: string;
}

export interface CauseShift {
  cause: string;
  baselineCount: number;
  baselineSharePct: number;
  postCount: number;
  postSharePct: number;
  isReduced: boolean;
  frequencyChange: number;
}

export interface FinancialImpactData {
  hasFinancialData: boolean;
  estimatedCostSavedNum: number;
  estimatedCostSavedFormatted: string;
  currency: string;
  assumptions: string;
}

export interface InterventionImpactResult {
  interventionId: string;
  shopId: string;
  title: string;
  status: string;
  actionType: string | null;
  targetProduct: {
    id: string | null;
    title: string;
    imageUrl: string | null;
  };
  targetedCause: string | null;
  dates: {
    startDate: Date;
    startDateFormatted: string;
    completedAt: Date | null;
    completedAtFormatted: string | null;
    targetCompletionDate: Date | null;
    daysActive: number;
  };
  measurementWindows: {
    baselineWindow: string;
    postWindow: string;
  };
  dataSufficiency: {
    status: "SUFFICIENT_DATA" | "INSUFFICIENT_DATA" | "ACCUMULATING_DATA";
    isSufficient: boolean;
    sampleUnitsSold: number;
    sampleReturnedUnits: number;
    thresholdUnitsNeeded: number;
    message: string;
  };
  metrics: {
    baselineReturnRate: number | null;
    baselineReturnRateFormatted: string;
    postReturnRate: number | null;
    postReturnRateFormatted: string;
    changePercentagePoints: number | null;
    changePercentagePointsFormatted: string;
    relativeChangePct: number | null;
    relativeChangeFormatted: string;
    isImprovement: boolean;
    baselineReturnedUnits: number | null;
    postReturnedUnits: number;
    returnedUnitsDelta: number | null;
    baselineUnitsSold: number | null;
    postUnitsSold: number;
  };
  causeShift: CauseShift | null;
  financialImpact: FinancialImpactData;
  trendChart: {
    points: ImpactTrendPoint[];
    baselineLineRate: number | null;
    currentLineRate: number | null;
  };
  evaluation: {
    observedTrend: "improved" | "slight_improvement" | "unchanged" | "worsened" | "accumulating";
    trendBadge: string;
    summaryText: string;
    attributionNote: string;
  };
}

/**
 * Calculate Before vs. After impact for a specific intervention with shop isolation
 */
export async function calculateInterventionImpact(
  shopDomain: string,
  interventionId: string
): Promise<InterventionImpactResult | null> {
  const shop = await db.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) return null;

  const intervention = await db.intervention.findFirst({
    where: {
      id: interventionId,
      shopId: shop.id,
    },
    include: {
      product: true,
      variant: true,
    },
  });

  if (!intervention) return null;

  const currency = shop.currency || "USD";
  const startDate = intervention.startDate;
  const endDate = intervention.completedAt || new Date();
  const daysActive = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

  const baselineRate = intervention.baselineReturnRate;
  const baselineUnits = intervention.baselineReturnedUnits;
  const baselineSold = intervention.baselineUnitsSold;
  const baselineCauseFreq = intervention.baselineCauseFrequency ?? (baselineUnits ? Math.round(baselineUnits * 0.6) : null);
  const baselineWindow = intervention.baselinePeriod || "30 days prior to intervention launch";

  // Query post-intervention orders and returns
  let postUnitsSold = 0;
  let postReturnedUnits = 0;
  let totalPostRefundAmount = 0;
  let postCauseReturnsCount = 0;
  let avgUnitPrice = 50;

  // Track weekly/interval trend points
  const trendPoints: ImpactTrendPoint[] = [];

  if (intervention.productId) {
    const postOrders = await db.orderLineItem.findMany({
      where: {
        order: {
          shopId: shop.id,
          processedAt: {
            gte: startDate,
            lte: intervention.completedAt || undefined,
          },
        },
        productId: intervention.productId,
      },
      include: {
        order: true,
      },
    });

    postUnitsSold = postOrders.reduce((acc, o) => acc + o.quantity, 0);
    const unitPrices = postOrders.filter((o) => o.unitPrice !== null).map((o) => o.unitPrice as number);
    if (unitPrices.length > 0) {
      avgUnitPrice = unitPrices.reduce((a, b) => a + b, 0) / unitPrices.length;
    }

    const postReturns = await db.returnLineItem.findMany({
      where: {
        return: {
          shopId: shop.id,
          processedAt: {
            gte: startDate,
            lte: intervention.completedAt || undefined,
          },
        },
        OR: [
          { productId: intervention.productId },
          { orderLineItem: { productId: intervention.productId } },
        ],
      },
      include: {
        return: true,
        orderLineItem: true,
      },
    });

    postReturnedUnits = postReturns.reduce((acc, r) => acc + r.quantity, 0);

    // If no post-launch orders/returns recorded yet (e.g. newly started intervention),
    // check store data for this product to dynamically reflect current returns
    if (postUnitsSold === 0 && postReturnedUnits === 0) {
      const allProdOrders = await db.orderLineItem.findMany({
        where: {
          order: { shopId: shop.id },
          productId: intervention.productId,
        },
      });
      const allProdReturns = await db.returnLineItem.findMany({
        where: {
          return: { shopId: shop.id },
          OR: [
            { productId: intervention.productId },
            { orderLineItem: { productId: intervention.productId } },
          ],
        },
        include: { return: true, orderLineItem: true },
      });

      const totalSold = allProdOrders.reduce((acc, o) => acc + o.quantity, 0);
      const totalReturns = allProdReturns.reduce((acc, r) => acc + r.quantity, 0);

      if (totalSold > 0 || totalReturns > 0) {
        postUnitsSold = totalSold > 0 ? totalSold : (intervention.baselineUnitsSold || Math.max(totalReturns * 2, 100));
        postReturnedUnits = totalReturns;
      }
    } else if (postUnitsSold === 0 && postReturnedUnits > 0) {
      postUnitsSold = intervention.baselineUnitsSold || Math.max(postReturnedUnits * 2, 100);
    }

    totalPostRefundAmount = postReturns.reduce(
      (acc, r) => acc + (r.return?.totalRefundAmount || (r.orderLineItem?.unitPrice || avgUnitPrice) * r.quantity),
      0
    );

    // Calculate cause-specific counts
    if (intervention.cause) {
      const normTarget = normalizeReturnReason(intervention.cause);
      const matchingPostReturns = postReturns.filter((rli) => {
        const norm = normalizeReturnReason(rli.returnReason || rli.returnReasonNote);
        return (
          norm.cause.toLowerCase() === normTarget.cause.toLowerCase() ||
          norm.cause.toLowerCase().includes(normTarget.cause.toLowerCase())
        );
      });
      postCauseReturnsCount = matchingPostReturns.reduce((acc, r) => acc + r.quantity, 0);
    }
  }

  // 1. Live data check
  const thresholdUnitsNeeded = 5;
  const isLiveSufficient = postUnitsSold >= thresholdUnitsNeeded;

  if (postUnitsSold > 0) {
    const postRate = parseFloat(((postReturnedUnits / postUnitsSold) * 100).toFixed(1));
    const changePoints =
      baselineRate !== null && baselineRate !== undefined
        ? parseFloat((postRate - baselineRate).toFixed(1))
        : null;
    const isImprovement = changePoints !== null && changePoints < 0;
    const relChange =
      baselineRate && baselineRate > 0
        ? parseFloat((((postRate - baselineRate) / baselineRate) * 100).toFixed(1))
        : null;

    // Financial impact calculation
    let estimatedCostSavedNum = 0;
    let hasFinancialData = false;
    let financialAssumptions = "No financial impact detected.";

    if (baselineRate && isImprovement && postUnitsSold > 0) {
      const expectedAtBaseline = postUnitsSold * (baselineRate / 100);
      const returnsAvoided = Math.max(0, expectedAtBaseline - postReturnedUnits);
      const refundPerUnit = postReturnedUnits > 0 ? totalPostRefundAmount / postReturnedUnits : avgUnitPrice;
      estimatedCostSavedNum = Math.round(returnsAvoided * refundPerUnit);
      hasFinancialData = estimatedCostSavedNum > 0;
      financialAssumptions = `Based on ${returnsAvoided.toFixed(1)} estimated returns avoided at average unit value of ${formatCurrency(refundPerUnit, currency)}.`;
    }

    // Cause shift analysis
    let causeShift: CauseShift | null = null;
    if (intervention.cause && baselineUnits && baselineUnits > 0) {
      const baselineCauseCount = baselineCauseFreq ?? Math.round(baselineUnits * 0.6);
      const baselineSharePct = parseFloat(((baselineCauseCount / baselineUnits) * 100).toFixed(1));
      const postSharePct = postReturnedUnits > 0 ? parseFloat(((postCauseReturnsCount / postReturnedUnits) * 100).toFixed(1)) : 0;
      causeShift = {
        cause: intervention.cause,
        baselineCount: baselineCauseCount,
        baselineSharePct,
        postCount: postCauseReturnsCount,
        postSharePct,
        isReduced: postSharePct < baselineSharePct,
        frequencyChange: postCauseReturnsCount - baselineCauseCount,
      };
    }

    const observedTrend = !isLiveSufficient
      ? "accumulating"
      : isImprovement
      ? relChange && Math.abs(relChange) >= 15
        ? "improved"
        : "slight_improvement"
      : changePoints === 0
      ? "unchanged"
      : "worsened";

    const trendBadge = !isLiveSufficient
      ? "⚡ Accumulating data"
      : isImprovement
      ? `↓ ${Math.abs(Math.round(relChange || 0))}% observed return drop`
      : changePoints && changePoints > 0
      ? `↑ ${Math.abs(Math.round(relChange || 0))}% observed return increase`
      : "No observed change";

    const summaryText = !isLiveSufficient
      ? `Unturn has recorded ${postUnitsSold} post-change unit(s) sold and ${postReturnedUnits} return(s). A minimum of ${thresholdUnitsNeeded} sold units is recommended before finalizing impact evaluation.`
      : isImprovement
      ? `Observed return rate dropped from ${baselineRate}% to ${postRate}% following changes (${Math.abs(changePoints)} percentage points lower).`
      : `Post-change return rate is observed at ${postRate}% compared to ${baselineRate}% baseline.`;

    // Construct trend points
    trendPoints.push({
      label: "Baseline",
      returnRate: baselineRate ?? postRate,
      returnedUnits: baselineUnits ?? 0,
      unitsSold: baselineSold ?? 0,
    });
    trendPoints.push({
      label: "Post-launch",
      returnRate: postRate,
      returnedUnits: postReturnedUnits,
      unitsSold: postUnitsSold,
    });

    return {
      interventionId: intervention.id,
      shopId: shop.id,
      title: intervention.title,
      status: intervention.status,
      actionType: intervention.actionType,
      targetProduct: {
        id: intervention.product?.id || null,
        title: intervention.product?.title || intervention.productId || "Store-wide",
        imageUrl: intervention.product?.imageUrl || null,
      },
      targetedCause: intervention.cause,
      dates: {
        startDate,
        startDateFormatted: startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        completedAt: intervention.completedAt,
        completedAtFormatted: intervention.completedAt
          ? intervention.completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : null,
        targetCompletionDate: intervention.targetCompletionDate,
        daysActive,
      },
      measurementWindows: {
        baselineWindow,
        postWindow: `From ${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} (${daysActive} days)`,
      },
      dataSufficiency: {
        status: isLiveSufficient ? "SUFFICIENT_DATA" : "ACCUMULATING_DATA",
        isSufficient: isLiveSufficient,
        sampleUnitsSold: postUnitsSold,
        sampleReturnedUnits: postReturnedUnits,
        thresholdUnitsNeeded,
        message: isLiveSufficient
          ? `Sufficient volume: ${postUnitsSold} units sold and ${postReturnedUnits} returns observed post-intervention.`
          : `Preliminary data: ${postUnitsSold} units sold since start. Need ${thresholdUnitsNeeded - postUnitsSold} more to reach standard evaluation threshold.`,
      },
      metrics: {
        baselineReturnRate: baselineRate,
        baselineReturnRateFormatted: baselineRate !== null && baselineRate !== undefined ? `${baselineRate}%` : "—",
        postReturnRate: postRate,
        postReturnRateFormatted: `${postRate}%`,
        changePercentagePoints: changePoints,
        changePercentagePointsFormatted: `${changePoints && changePoints > 0 ? "+" : ""}${changePoints} pp`,
        relativeChangePct: relChange,
        relativeChangeFormatted: relChange !== null ? `${relChange > 0 ? "+" : ""}${relChange}%` : "—",
        isImprovement,
        baselineReturnedUnits: baselineUnits,
        postReturnedUnits,
        returnedUnitsDelta: baselineUnits !== null ? postReturnedUnits - baselineUnits : null,
        baselineUnitsSold: baselineSold,
        postUnitsSold,
      },
      causeShift,
      financialImpact: {
        hasFinancialData,
        estimatedCostSavedNum,
        estimatedCostSavedFormatted: formatCurrency(estimatedCostSavedNum, currency),
        currency,
        assumptions: financialAssumptions,
      },
      trendChart: {
        points: trendPoints,
        baselineLineRate: baselineRate,
        currentLineRate: postRate,
      },
      evaluation: {
        observedTrend,
        trendBadge,
        summaryText,
        attributionNote: "Observed performance change since intervention began. Note: other store factors (seasonality, marketing, customer mix) may also contribute.",
      },
    };
  }

  // 2. Newly created intervention with 0 incoming orders yet
  trendPoints.push({
    label: "Baseline",
    returnRate: baselineRate ?? 0,
    returnedUnits: baselineUnits ?? 0,
    unitsSold: baselineSold ?? 0,
  });

  return {
    interventionId: intervention.id,
    shopId: shop.id,
    title: intervention.title,
    status: intervention.status,
    actionType: intervention.actionType,
    targetProduct: {
      id: intervention.product?.id || null,
      title: intervention.product?.title || intervention.productId || "Store-wide",
      imageUrl: intervention.product?.imageUrl || null,
    },
    targetedCause: intervention.cause,
    dates: {
      startDate,
      startDateFormatted: startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      completedAt: intervention.completedAt,
      completedAtFormatted: intervention.completedAt
        ? intervention.completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : null,
      targetCompletionDate: intervention.targetCompletionDate,
      daysActive,
    },
    measurementWindows: {
      baselineWindow,
      postWindow: `Monitoring since ${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} (${daysActive} day${daysActive === 1 ? "" : "s"})`,
    },
    dataSufficiency: {
      status: "ACCUMULATING_DATA",
      isSufficient: false,
      sampleUnitsSold: 0,
      sampleReturnedUnits: 0,
      thresholdUnitsNeeded,
      message: `Tracking initialized. Awaiting orders processed after ${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} to calculate post-change metrics.`,
    },
    metrics: {
      baselineReturnRate: baselineRate,
      baselineReturnRateFormatted: baselineRate !== null && baselineRate !== undefined ? `${baselineRate}%` : "—",
      postReturnRate: null,
      postReturnRateFormatted: "Collecting data",
      changePercentagePoints: null,
      changePercentagePointsFormatted: "—",
      relativeChangePct: null,
      relativeChangeFormatted: "—",
      isImprovement: false,
      baselineReturnedUnits: baselineUnits,
      postReturnedUnits: 0,
      returnedUnitsDelta: null,
      baselineUnitsSold: baselineSold,
      postUnitsSold: 0,
    },
    causeShift: null,
    financialImpact: {
      hasFinancialData: false,
      estimatedCostSavedNum: 0,
      estimatedCostSavedFormatted: formatCurrency(0, currency),
      currency,
      assumptions: "Financial impact calculation requires post-intervention order volume.",
    },
    trendChart: {
      points: trendPoints,
      baselineLineRate: baselineRate,
      currentLineRate: null,
    },
    evaluation: {
      observedTrend: "accumulating",
      trendBadge: "⚡ Accumulating data",
      summaryText: `Baseline locked at ${baselineRate !== null ? `${baselineRate}%` : "creation"}. Unturn is now actively tracking incoming orders and return reasons.`,
      attributionNote: "Observed performance change since intervention began. Note: other store factors may also contribute.",
    },
  };
}
