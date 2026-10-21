/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ProductDetailAnalytics, CauseDetailAnalytics } from "./analytics.server";
import { formatCurrency } from "./analytics.server";
import db from "../db.server";

export type PreventabilityClassification =
  | "Potentially preventable"
  | "Possibly preventable"
  | "Insufficient data to assess";

export interface EvidenceMetrics {
  returnedUnits: number;
  totalUnitsSold: number;
  returnRate: string;
  causeShare: string;
  sampleSize: number;
  keySignals: string[];
}

export interface FinancialImpactEstimate {
  actualRecordedValue: string;
  actualRecordedValueNum: number;
  estimatedPreventableLoss: string;
  estimatedPreventableLossNum: number;
  currency: string;
  assumptions: string;
  hasFinancialData: boolean;
}

export interface PreventionRecommendation {
  id: string;
  title: string;
  targetType: "product" | "cause";
  targetId: string;
  targetName: string;
  sku: string | null;
  imageUrl: string | null;
  category: string;
  cause: string;
  issueType: "size-fit" | "not-as-expected" | "wrong-item" | "fabric-quality" | "damaged";
  preventability: PreventabilityClassification;
  preventabilityRationale: string;
  patternExplanation: string;
  evidence: EvidenceMetrics;
  financialImpact: FinancialImpactEstimate;
  suggestedAction: string;
  expectedOutcome: string;
  priority: "High" | "Medium" | "Low";
  confidence: "High" | "Medium" | "Low";
}

/**
 * Benchmark preventable loss reduction factors.
 * We deliberately do NOT claim 100% of merchandise value as preventable loss.
 * These factors represent conservative, defensible proportions of returns
 * addressable through merchant intervention (e.g. fit guidance, photo clarification).
 */
const PREVENTABILITY_FACTORS: Record<string, number> = {
  "size-fit": 0.3, // 30% addressable via size chart, fit tips, measurement widgets
  "not-as-expected": 0.25, // 25% addressable via unedited photos, color notes, dimension specs
  "wrong-item": 0.35, // 35% addressable via clearer variant labels, pick/pack verification
  "damaged": 0.15, // 15% addressable via reinforced packaging & fragile labeling
  "fabric-quality": 0.2, // 20% addressable via clear GSM, composition, and texture notes
};

/**
 * Evaluate return preventability using deterministic, configurable business rules.
 */
export function evaluatePreventability(
  issueType: "size-fit" | "not-as-expected" | "wrong-item" | "fabric-quality" | "damaged",
  causeName: string,
  returnedUnits: number,
  unitsSold: number,
  causeShareNum: number
): {
  classification: PreventabilityClassification;
  rationale: string;
  confidence: "High" | "Medium" | "Low";
} {
  // 1. Data sufficiency check: minimum returns required to detect a reliable pattern
  if (returnedUnits < 2 || unitsSold < 3) {
    return {
      classification: "Insufficient data to assess",
      rationale: `Only ${returnedUnits} unit(s) returned out of ${unitsSold} sold. Minimum sample size of at least 2 returned units and 3 sold units required to establish a defensible pattern.`,
      confidence: "Low",
    };
  }

  // 2. Unspecified or subjective buyer reasons without actionable root causes
  const lowerCause = causeName.toLowerCase();
  if (
    lowerCause.includes("unspecified") ||
    lowerCause.includes("no reason") ||
    lowerCause.includes("mind change") ||
    lowerCause.includes("other")
  ) {
    return {
      classification: "Insufficient data to assess",
      rationale:
        "Return reason is buyer discretionary or unspecified. Without specific product or fit feedback, root cause cannot be defensibly addressed.",
      confidence: "Low",
    };
  }

  // 3. Clear merchant-addressable root causes
  if (issueType === "size-fit") {
    if (returnedUnits >= 4 || causeShareNum >= 35) {
      return {
        classification: "Potentially preventable",
        rationale:
          "Size and fit issues represent a major portion of returns. Sizing charts, measurement guidelines, and fit guidance can directly prevent incorrect customer sizing choices.",
        confidence: returnedUnits >= 6 ? "High" : "Medium",
      };
    }
    return {
      classification: "Possibly preventable",
      rationale:
        "Fit mismatch identified. Additional return volume needed to confirm whether issues are model-specific or brand-wide.",
      confidence: "Medium",
    };
  }

  if (issueType === "not-as-expected") {
    if (returnedUnits >= 3 || causeShareNum >= 25) {
      return {
        classification: "Potentially preventable",
        rationale:
          "Expectation and appearance discrepancies can be directly resolved by providing realistic lighting, daylight lifestyle photography, and accurate product descriptions.",
        confidence: returnedUnits >= 5 ? "High" : "Medium",
      };
    }
    return {
      classification: "Possibly preventable",
      rationale:
        "Customers reported cosmetic or description differences. More data is needed to isolate specific image or text triggers.",
      confidence: "Medium",
    };
  }

  if (issueType === "wrong-item") {
    return {
      classification: "Potentially preventable",
      rationale:
        "Wrong item or variant selection issues are preventable through clearer variant naming, swatch previews, and fulfillment scan-checking.",
      confidence: returnedUnits >= 3 ? "High" : "Medium",
    };
  }

  // 4. Damaged or transit-related issues
  if (issueType === "damaged") {
    return {
      classification: "Possibly preventable",
      rationale:
        "Damage and defects may be reduced by improved packaging or supplier quality control, though carrier handling remains an external variable.",
      confidence: returnedUnits >= 4 ? "Medium" : "Low",
    };
  }

  // 5. Fabric / Quality dissatisfaction
  if (issueType === "fabric-quality") {
    return {
      classification: "Possibly preventable",
      rationale:
        "Fabric feel and material dissatisfaction can be partially mitigated by explicit GSM weight, composition percentages, and wash care guidance.",
      confidence: returnedUnits >= 4 ? "Medium" : "Low",
    };
  }

  return {
    classification: "Insufficient data to assess",
    rationale: "Return pattern has insufficient evidence to establish a clear merchant intervention.",
    confidence: "Low",
  };
}

/**
 * Estimate financial impact transparently with recorded values, estimated preventable loss,
 * and explicit calculation assumptions.
 */
export function estimateFinancialImpact(
  actualRefundAmount: number,
  issueType: "size-fit" | "not-as-expected" | "wrong-item" | "fabric-quality" | "damaged",
  classification: PreventabilityClassification,
  causeShareRatio: number,
  currency = "INR"
): FinancialImpactEstimate {
  const hasFinancialData = actualRefundAmount > 0;

  if (!hasFinancialData || classification === "Insufficient data to assess") {
    return {
      actualRecordedValue: formatCurrency(actualRefundAmount, currency),
      actualRecordedValueNum: actualRefundAmount,
      estimatedPreventableLoss: formatCurrency(0, currency),
      estimatedPreventableLossNum: 0,
      currency,
      assumptions: hasFinancialData
        ? "Insufficient root-cause data to defensibly estimate preventable savings."
        : "Financial impact undetermined due to missing price or refund records.",
      hasFinancialData,
    };
  }

  const factor = PREVENTABILITY_FACTORS[issueType] || 0.2;
  // Apply factor against the cause's portion of actual returns
  const estimatedLossNum = Math.round(actualRefundAmount * causeShareRatio * factor);

  const percentageStr = `${Math.round(factor * 100)}%`;
  const shareStr = `${Math.round(causeShareRatio * 100)}%`;

  const assumptions = `Based on ${formatCurrency(
    actualRefundAmount,
    currency
  )} recorded return value. Assumes an achievable ${percentageStr} return reduction on the ${shareStr} of returns attributable to this issue, avoiding full merchandise overcounting.`;

  return {
    actualRecordedValue: formatCurrency(actualRefundAmount, currency),
    actualRecordedValueNum: actualRefundAmount,
    estimatedPreventableLoss: formatCurrency(estimatedLossNum, currency),
    estimatedPreventableLossNum: estimatedLossNum,
    currency,
    assumptions,
    hasFinancialData: true,
  };
}

/**
 * Generate actionable recommendation details based on issue type and product signals
 */
function getActionTemplate(
  issueType: "size-fit" | "not-as-expected" | "wrong-item" | "fabric-quality" | "damaged",
  cause: string,
  productTitle: string,
  returnRate: string
): {
  title: string;
  suggestedAction: string;
  expectedOutcome: string;
} {
  switch (issueType) {
    case "size-fit":
      return {
        title: "Improve size chart & fit guidance",
        suggestedAction: `Add an interactive size chart with body measurements (chest, waist, sleeve), and place a 'Fit Advice' badge on ${productTitle} stating whether this style runs true to size, slim, or oversized.`,
        expectedOutcome: "Target 15%–25% reduction in size-related returns within 30 days of implementation.",
      };
    case "not-as-expected":
      return {
        title: "Clarify product imagery & specifications",
        suggestedAction: `Upload unedited daylight photos showing true color tone, add close-up fabric texture imagery, and clearly specify dimensions and material feel for ${productTitle}.`,
        expectedOutcome: "Target 15%–20% reduction in expectation mismatch returns.",
      };
    case "wrong-item":
      return {
        title: "Enhance variant labeling & fulfillment checks",
        suggestedAction: `Update variant titles with clear color/size codes, verify thumbnail swatches match variant selections, and implement barcode scanning verification before dispatch.`,
        expectedOutcome: "Target >30% reduction in wrong-variant and fulfillment selection errors.",
      };
    case "damaged":
      return {
        title: "Review transit packaging & fulfillment handling",
        suggestedAction: `Upgrade protective mailer padding or box corner reinforcement for ${productTitle}, and review transit reports with the shipping carrier.`,
        expectedOutcome: "Target 10%–15% reduction in transit defect claims.",
      };
    case "fabric-quality":
      return {
        title: "Detail fabric weight & care instructions",
        suggestedAction: `Specify exact fabric composition, GSM fabric weight, and laundering instructions in the product description bullet points for ${productTitle}.`,
        expectedOutcome: "Target 10%–18% reduction in fabric dissatisfaction returns.",
      };
    default:
      return {
        title: `Address ${cause} returns`,
        suggestedAction: `Investigate root causes of customer returns for ${productTitle} and update listing details accordingly.`,
        expectedOutcome: "Target 10% reduction in return requests.",
      };
  }
}

/**
 * Determine recommendation priority based on return rate, returned volume, and preventability
 */
function calculatePriority(
  returnRateNum: number,
  returnedUnits: number,
  preventability: PreventabilityClassification
): "High" | "Medium" | "Low" {
  if (preventability === "Insufficient data to assess") return "Low";

  if (
    (returnRateNum >= 15 && returnedUnits >= 5) ||
    returnedUnits >= 15 ||
    (preventability === "Potentially preventable" && returnedUnits >= 8)
  ) {
    return "High";
  }

  if (returnRateNum >= 8 || returnedUnits >= 3) {
    return "Medium";
  }

  return "Low";
}

/**
 * Generate evidence-backed recommendations for a specific product
 */
export function generateProductRecommendations(
  product: ProductDetailAnalytics,
  actualRefundAmount = 0,
  currency = "INR"
): PreventionRecommendation[] {
  if (!product || product.returnedUnits === 0) {
    return [];
  }

  const recommendations: PreventionRecommendation[] = [];
  const primaryCause = product.mainIssue || "Size / Fit";
  const primaryShareNum =
    product.causesBreakdown.find((c) => c.cause === primaryCause)?.count ?? product.returnedUnits;
  const shareRatio = product.returnedUnits > 0 ? primaryShareNum / product.returnedUnits : 1;
  const sharePct = (shareRatio * 100).toFixed(1);

  const evaluation = evaluatePreventability(
    product.issueType,
    primaryCause,
    product.returnedUnits,
    product.unitsSold,
    parseFloat(sharePct)
  );

  const financial = estimateFinancialImpact(
    actualRefundAmount,
    product.issueType,
    evaluation.classification,
    shareRatio,
    currency
  );

  const actionTemplate = getActionTemplate(
    product.issueType,
    primaryCause,
    product.title,
    product.returnRate
  );

  const priority = calculatePriority(
    product.returnRateNum,
    product.returnedUnits,
    evaluation.classification
  );

  // Key signals observed for evidence
  const keySignals: string[] = [
    `Return rate of ${product.returnRate} (${product.returnedUnits} returned out of ${product.unitsSold} sold)`,
    `${sharePct}% of returns for this item are driven by ${primaryCause} (${primaryShareNum} units)`,
  ];

  if (product.isOutlier) {
    keySignals.push(`Statistically elevated return rate exceeding store threshold`);
  }

  // Variant signals if applicable
  const worstVariant = [...product.variants].sort(
    (a, b) => parseFloat(b.returnRate) - parseFloat(a.returnRate)
  )[0];
  if (worstVariant && parseFloat(worstVariant.returnRate) > product.returnRateNum && worstVariant.returnedUnits >= 2) {
    keySignals.push(
      `Variant '${worstVariant.title}' has highest return rate at ${worstVariant.returnRate} (${worstVariant.returnedUnits} returns)`
    );
  }

  recommendations.push({
    id: `rec-prod-${product.id}`,
    title: actionTemplate.title,
    targetType: "product",
    targetId: product.id,
    targetName: product.title,
    sku: product.sku,
    imageUrl: product.imageUrl,
    category: `${product.title} • ${primaryCause}`,
    cause: primaryCause,
    issueType: product.issueType,
    preventability: evaluation.classification,
    preventabilityRationale: evaluation.rationale,
    patternExplanation: `${product.returnedUnits} return(s) recorded across ${product.unitsSold} sold unit(s) (${product.returnRate} return rate), with ${sharePct}% attributed to ${primaryCause}.`,
    evidence: {
      returnedUnits: product.returnedUnits,
      totalUnitsSold: product.unitsSold,
      returnRate: product.returnRate,
      causeShare: `${sharePct}%`,
      sampleSize: product.returnedUnits,
      keySignals,
    },
    financialImpact: financial,
    suggestedAction: actionTemplate.suggestedAction,
    expectedOutcome: actionTemplate.expectedOutcome,
    priority,
    confidence: evaluation.confidence,
  });

  return recommendations;
}

/**
 * Generate evidence-backed systemic recommendations for a specific return cause
 */
export function generateCauseRecommendations(
  cause: CauseDetailAnalytics,
  totalStoreReturns = 0,
  actualRefundAmount = 0,
  currency = "INR"
): PreventionRecommendation[] {
  if (!cause || cause.returnsCount === 0) {
    return [];
  }

  // Derive issue type from cause name
  const lower = cause.causeName.toLowerCase();
  let issueType: "size-fit" | "not-as-expected" | "wrong-item" | "fabric-quality" | "damaged" =
    "not-as-expected";
  if (lower.includes("size") || lower.includes("fit")) issueType = "size-fit";
  else if (lower.includes("damage") || lower.includes("defect")) issueType = "damaged";
  else if (lower.includes("quality") || lower.includes("fabric")) issueType = "fabric-quality";
  else if (lower.includes("wrong")) issueType = "wrong-item";

  const totalEvaluated = totalStoreReturns > 0 ? totalStoreReturns : cause.returnsCount;
  const shareRatio = totalStoreReturns > 0 ? cause.returnsCount / totalStoreReturns : 1;

  const evaluation = evaluatePreventability(
    issueType,
    cause.causeName,
    cause.returnsCount,
    totalEvaluated,
    cause.shareNum
  );

  const financial = estimateFinancialImpact(
    actualRefundAmount,
    issueType,
    evaluation.classification,
    shareRatio,
    currency
  );

  let title = `Systemic intervention for ${cause.causeName}`;
  let suggestedAction = `Address systemic factors contributing to ${cause.causeName} across your catalog.`;
  let expectedOutcome = `Target 15% reduction in store-wide ${cause.causeName} returns.`;

  if (issueType === "size-fit") {
    title = "Store-wide size guide & measurement audit";
    suggestedAction =
      "Audit size charts on top-returned apparel listings. Standardize body measurement units (inches and centimeters) and add customer fit indicators.";
    expectedOutcome = "Target 20% store-wide reduction in sizing-related return requests.";
  } else if (issueType === "not-as-expected") {
    title = "Audit listing photography & color accuracy";
    suggestedAction =
      "Review hero photography under natural lighting, replace high-saturation renders, and ensure color swatches accurately reflect physical garments.";
    expectedOutcome = "Target 15%–20% reduction in 'not as expected' return requests.";
  } else if (issueType === "wrong-item") {
    title = "Fulfillment pick & pack barcode verification";
    suggestedAction =
      "Implement barcode scanning during packing to eliminate wrong item and variant shipping errors before packages leave the warehouse.";
    expectedOutcome = "Target >30% reduction in fulfillment dispatch errors.";
  } else if (issueType === "damaged") {
    title = "Reinforce transit packaging & box integrity";
    suggestedAction =
      "Investigate carrier transit damage rates and upgrade bubble wrap, edge protectors, or rigid boxes for fragile SKUs.";
    expectedOutcome = "Target 15% reduction in transit damage returns.";
  } else if (issueType === "fabric-quality") {
    title = "Enhance fabric specifications & touchpoint guidance";
    suggestedAction =
      "Disclose fabric weight (GSM) and material composition on product pages to align customer expectations before purchase.";
    expectedOutcome = "Target 12% reduction in material dissatisfaction returns.";
  }

  const priority: "High" | "Medium" | "Low" =
    evaluation.classification === "Potentially preventable" && cause.shareNum >= 25
      ? "High"
      : cause.returnsCount >= 5
      ? "Medium"
      : "Low";

  const keySignals = [
    `Represents ${cause.share} of all store return requests (${cause.returnsCount} units)`,
    `Impacts ${cause.topProducts.length} key product line(s)`,
  ];

  if (cause.topProducts[0]) {
    keySignals.push(
      `Highest concentration in '${cause.topProducts[0].title}' (${cause.topProducts[0].returnsCount} returns)`
    );
  }

  return [
    {
      id: `rec-cause-${cause.causeName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      title,
      targetType: "cause",
      targetId: cause.causeName,
      targetName: cause.causeName,
      sku: null,
      imageUrl: cause.topProducts[0]?.imageUrl || null,
      category: `Store-wide • ${cause.causeName}`,
      cause: cause.causeName,
      issueType,
      preventability: evaluation.classification,
      preventabilityRationale: evaluation.rationale,
      patternExplanation: `${cause.causeName} accounts for ${cause.share} (${cause.returnsCount} returned units) of store returns across ${cause.topProducts.length} top products.`,
      evidence: {
        returnedUnits: cause.returnsCount,
        totalUnitsSold: totalEvaluated,
        returnRate: `${cause.shareNum.toFixed(1)}% share`,
        causeShare: cause.share,
        sampleSize: cause.returnsCount,
        keySignals,
      },
      financialImpact: financial,
      suggestedAction,
      expectedOutcome,
      priority,
      confidence: evaluation.confidence,
    },
  ];
}

/**
 * Fetch all store-wide recommendations calculated from current analytics
 */
export async function getAllStoreRecommendations(
  shopDomain: string,
  dateRangeStr?: string
): Promise<PreventionRecommendation[]> {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) return [];

  // 1. Fetch top return causes
  const returnLineItems = await db.returnLineItem.findMany({
    where: { return: { shopId: shop.id } },
    include: {
      product: true,
      orderLineItem: true,
      return: true,
    },
  });

  if (returnLineItems.length === 0) {
    return [];
  }

  const currency = shop.currency || "INR";
  const recommendations: PreventionRecommendation[] = [];

  // Group by product
  const productMap = new Map<
    string,
    {
      product: any;
      items: typeof returnLineItems;
      refundAmount: number;
    }
  >();

  for (const item of returnLineItems) {
    if (item.product) {
      const existing = productMap.get(item.product.id) || {
        product: item.product,
        items: [],
        refundAmount: 0,
      };
      existing.items.push(item);
      const itemRefund =
        (item.orderLineItem?.unitPrice || 0) * item.quantity ||
        item.return?.totalRefundAmount ||
        0;
      existing.refundAmount += itemRefund;
      productMap.set(item.product.id, existing);
    }
  }

  // Generate for top returned products
  for (const [prodId, data] of productMap.entries()) {
    const returnedUnits = data.items.reduce((acc, i) => acc + i.quantity, 0);
    // Count orders for this product to get sold units
    const orderLines = await db.orderLineItem.findMany({
      where: { productId: prodId },
    });
    const unitsSold = orderLines.reduce((acc, ol) => acc + ol.quantity, 0);

    // Group issues
    const causeCounts: Record<string, number> = {};
    for (const it of data.items) {
      const r = it.returnReason || it.returnReasonNote || "Size / Fit";
      causeCounts[r] = (causeCounts[r] || 0) + it.quantity;
    }
    const topCause = Object.entries(causeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Size / Fit";

    const dummyDetail: ProductDetailAnalytics = {
      id: data.product.id,
      title: data.product.title,
      handle: data.product.handle,
      sku: null,
      imageUrl: data.product.imageUrl,
      unitsSold: Math.max(unitsSold, returnedUnits),
      returnedUnits,
      returnRate:
        unitsSold > 0 ? `${((returnedUnits / unitsSold) * 100).toFixed(1)}%` : "100.0%",
      returnRateNum: unitsSold > 0 ? (returnedUnits / unitsSold) * 100 : 100,
      mainIssue: topCause,
      issueType: topCause.toLowerCase().includes("size")
        ? "size-fit"
        : topCause.toLowerCase().includes("damage")
        ? "damaged"
        : "not-as-expected",
      isOutlier: unitsSold > 0 && returnedUnits / unitsSold > 0.2,
      causesBreakdown: Object.entries(causeCounts).map(([cause, count]) => ({
        cause,
        count,
        share: `${((count / returnedUnits) * 100).toFixed(1)}%`,
      })),
      variants: [],
    };

    const recs = generateProductRecommendations(dummyDetail, data.refundAmount, currency);
    recommendations.push(...recs);
  }

  // Sort: High priority first, then descending by returned units
  recommendations.sort((a, b) => {
    const pWeight = { High: 3, Medium: 2, Low: 1 };
    const diff = pWeight[b.priority] - pWeight[a.priority];
    if (diff !== 0) return diff;
    return b.evidence.returnedUnits - a.evidence.returnedUnits;
  });

  return recommendations;
}
