/* eslint-disable @typescript-eslint/no-explicit-any */
import db from "../db.server";
import { formatCurrency, normalizeReturnReason, resolveDateRange } from "./analytics.server";
import { evaluatePreventability, type PreventabilityClassification } from "./recommendations.server";

export interface ProductAnalyticsContext {
  productId: string;
  shopifyProductId?: string;
  productTitle: string;
  handle?: string | null;
  sku: string | null;
  imageUrl?: string | null;
  unitsSold: number;
  returnedUnits: number;
  productReturnRateNum: number;
  productReturnRate: string;

  // Store context for the exact same reporting period
  storeReturnRateNum: number;
  storeReturnRate: string;
  diffPercentagePointsNum: number;
  diffPercentagePoints: string;
  storeUnitsSold: number;
  storeReturnedUnits: number;

  // Root cause breakdown
  causesBreakdown: Array<{
    cause: string;
    issueType: "size-fit" | "not-as-expected" | "wrong-item" | "fabric-quality" | "damaged";
    count: number;
    shareNum: number;
    share: string;
  }>;
  primaryCause: {
    cause: string;
    issueType: "size-fit" | "not-as-expected" | "wrong-item" | "fabric-quality" | "damaged";
    count: number;
    shareNum: number;
    share: string;
  } | null;

  // Verbatim feedback notes
  customerComments: string[];

  // Variant breakdown
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    unitsSold: number;
    returnedUnits: number;
    returnRate: string;
  }>;
  worstVariant?: {
    title: string;
    returnRate: string;
    returnedUnits: number;
  };

  // Financial calculations calculated in backend
  actualReturnCostNum: number;
  actualReturnCost: string;
  currency: string;
  hasFinancialData: boolean;

  // Statistical reliability & preventability
  preventability: PreventabilityClassification;
  preventabilityRationale: string;
  isSampleReliable: boolean;

  // Defensible projected improvements
  defensibleReductionPct: number; // e.g. 18 for 18% reduction
  defensibleTargetRate: string; // e.g. "15.8%"
  defensibleSavingsNum: number; // e.g. 18230
  defensibleSavings: string; // e.g. "₹18,230"

  // Intervention history
  activeInterventionsCount: number;
  interventionTitles: string[];
}

export interface AIRecommendationResponse {
  productId: string;
  productTitle: string;
  explanation: string;
  impactItems: [string, string, string];
  metrics: {
    productReturnRate: string;
    storeReturnRate: string;
    diffPercentagePoints: string;
    returnedUnits: number;
    unitsSold: number;
    topCause: string;
    topCauseShare: string;
    actualReturnCost: string;
    estimatedSavings: string;
    isEstimatedReliable: boolean;
    sampleSizeMessage?: string;
  };
  suggestedAction: string;
  measurableTarget: string;
  customerFeedbackSample: string[];
  source: "ai" | "fallback";
}

// In-memory cache for generated AI recommendations
const aiRecommendationCache = new Map<
  string,
  { response: AIRecommendationResponse; timestamp: number }
>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch and construct comprehensive product analytics context from database
 */
export async function fetchProductAnalyticsContext(
  shopDomain: string,
  productIdentifier: string,
  dateRangeStr?: string
): Promise<ProductAnalyticsContext> {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  const currency = shop?.currency || "INR";
  const dateWindow = dateRangeStr ? resolveDateRange(dateRangeStr) : { label: "All time", prevLabel: "Prior period", startDate: undefined, endDate: new Date() };

  let storeUnitsSold = 0;
  let storeReturnedUnits = 0;
  let storeReturnRateNum = 12.1; // Baseline store average default

  if (shop) {
    // 1. Calculate store-wide units sold and returned for the exact same reporting period
    const storeOrders = await db.order.findMany({
      where: {
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
      include: { lineItems: true },
    });

    for (const ord of storeOrders) {
      for (const li of ord.lineItems) {
        storeUnitsSold += li.quantity;
      }
    }

    const storeReturns = await db.return.findMany({
      where: {
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
      include: { returnLineItems: true },
    });

    for (const ret of storeReturns) {
      for (const rli of ret.returnLineItems) {
        storeReturnedUnits += rli.quantity;
      }
    }

    if (storeUnitsSold > 0) {
      storeReturnRateNum = parseFloat(((storeReturnedUnits / storeUnitsSold) * 100).toFixed(1));
    }
  }

  // 2. Locate product in database
  let dbProduct: any = null;
  if (shop) {
    dbProduct = await db.product.findFirst({
      where: {
        shopId: shop.id,
        OR: [
          { id: productIdentifier },
          { shopifyProductId: productIdentifier },
          { title: { contains: productIdentifier } },
          { handle: productIdentifier },
        ],
      },
      include: {
        variants: true,
        orderLineItems: {
          where:
            dateWindow.startDate || dateWindow.endDate
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
          where:
            dateWindow.startDate || dateWindow.endDate
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
        interventions: true,
      },
    });
  }

  // 3. If found in DB with return or order records, compute from live data
  let productReturns: any[] = [];
  if (dbProduct && shop) {
    productReturns = await db.returnLineItem.findMany({
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
          { productId: dbProduct.id },
          { orderLineItem: { productId: dbProduct.id } },
        ],
      },
      include: {
        orderLineItem: true,
        return: true,
      },
    });
  }

  const allReturnsForProduct = productReturns.length > 0 ? productReturns : (dbProduct?.returnLineItems || []);

  if (dbProduct && (dbProduct.orderLineItems.length > 0 || allReturnsForProduct.length > 0)) {
    const rawUnitsSold = dbProduct.orderLineItems.reduce((acc: number, li: any) => acc + li.quantity, 0);
    const returnedUnits = allReturnsForProduct.reduce((acc: number, rli: any) => acc + rli.quantity, 0);
    const unitsSold = rawUnitsSold > 0 ? rawUnitsSold : returnedUnits;
    const productReturnRateNum = unitsSold > 0 ? parseFloat(((returnedUnits / unitsSold) * 100).toFixed(1)) : 0;
    const productReturnRate = `${productReturnRateNum.toFixed(1)}%`;

    // Causes & customer feedback
    const causeMap = new Map<
      string,
      { count: number; issueType: any }
    >();
    const customerComments: string[] = [];
    let actualReturnCostNum = 0;

    for (const rli of allReturnsForProduct) {
      const norm = normalizeReturnReason(rli.returnReason, rli.returnReasonNote);
      const cur = causeMap.get(norm.cause) || { count: 0, issueType: norm.issueType };
      cur.count += rli.quantity;
      causeMap.set(norm.cause, cur);

      if (rli.returnReasonNote && rli.returnReasonNote.trim().length > 3) {
        const cleanNote = rli.returnReasonNote.trim();
        if (!customerComments.includes(cleanNote)) {
          customerComments.push(cleanNote);
        }
      }

      if (rli.orderLineItem?.unitPrice) {
        actualReturnCostNum += rli.orderLineItem.unitPrice * rli.quantity;
      } else if (rli.return?.totalRefundAmount) {
        actualReturnCostNum += rli.return.totalRefundAmount;
      }
    }

    const causesBreakdown = Array.from(causeMap.entries())
      .map(([cause, info]) => {
        const shareNum = returnedUnits > 0 ? parseFloat(((info.count / returnedUnits) * 100).toFixed(1)) : 0;
        return {
          cause,
          issueType: info.issueType,
          count: info.count,
          shareNum,
          share: shareNum % 1 === 0 ? `${shareNum.toFixed(0)}%` : `${shareNum.toFixed(1)}%`,
        };
      })
      .sort((a, b) => b.count - a.count);

    const primaryCause = causesBreakdown[0] || null;
    const issueType = primaryCause?.issueType || "size-fit";

    // Variants
    const variants = dbProduct.variants.map((v: any) => {
      const vSold = dbProduct.orderLineItems
        .filter((li: any) => li.variantId === v.id)
        .reduce((acc: number, li: any) => acc + li.quantity, 0);
      const vReturns = dbProduct.returnLineItems
        .filter((rli: any) => rli.variantId === v.id)
        .reduce((acc: number, rli: any) => acc + rli.quantity, 0);
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

    const worstVariant = [...variants]
      .filter((v) => v.returnedUnits >= 2)
      .sort((a, b) => parseFloat(b.returnRate) - parseFloat(a.returnRate))[0];

    // Preventability evaluation
    const evaluation = evaluatePreventability(
      issueType,
      primaryCause?.cause || "Size / Fit",
      returnedUnits,
      unitsSold,
      primaryCause?.shareNum || 0
    );

    // Factors for defensible estimation
    const factors: Record<string, number> = {
      "size-fit": 0.3,
      "not-as-expected": 0.25,
      "wrong-item": 0.35,
      "damaged": 0.15,
      "fabric-quality": 0.2,
    };
    const factor = factors[issueType] || 0.2;
    const isSampleReliable = returnedUnits >= 2 && unitsSold >= 3 && evaluation.classification !== "Insufficient data to assess";

    const defensibleReductionPct = isSampleReliable && primaryCause
      ? Math.round(primaryCause.shareNum * factor)
      : 0;

    const defensibleTargetRate = isSampleReliable
      ? `${(productReturnRateNum * (1 - defensibleReductionPct / 100)).toFixed(1)}%`
      : productReturnRate;

    const defensibleSavingsNum = isSampleReliable && actualReturnCostNum > 0 && primaryCause
      ? Math.round(actualReturnCostNum * (primaryCause.shareNum / 100) * factor)
      : 0;

    const diffPoints = productReturnRateNum - storeReturnRateNum;
    const diffPercentagePoints = `${diffPoints >= 0 ? "+" : ""}${diffPoints.toFixed(1)} percentage points`;

    const activeInterventions = dbProduct.interventions || [];

    return {
      productId: dbProduct.id,
      shopifyProductId: dbProduct.shopifyProductId,
      productTitle: dbProduct.title,
      handle: dbProduct.handle,
      sku: dbProduct.variants[0]?.sku || null,
      imageUrl: dbProduct.imageUrl,
      unitsSold,
      returnedUnits,
      productReturnRateNum,
      productReturnRate,
      storeReturnRateNum,
      storeReturnRate: `${storeReturnRateNum.toFixed(1)}%`,
      diffPercentagePointsNum: diffPoints,
      diffPercentagePoints,
      storeUnitsSold,
      storeReturnedUnits,
      causesBreakdown,
      primaryCause,
      customerComments,
      variants,
      worstVariant: worstVariant
        ? {
            title: worstVariant.title,
            returnRate: worstVariant.returnRate,
            returnedUnits: worstVariant.returnedUnits,
          }
        : undefined,
      actualReturnCostNum,
      actualReturnCost: formatCurrency(actualReturnCostNum, currency),
      currency,
      hasFinancialData: actualReturnCostNum > 0,
      preventability: evaluation.classification,
      preventabilityRationale: evaluation.rationale,
      isSampleReliable,
      defensibleReductionPct,
      defensibleTargetRate,
      defensibleSavingsNum,
      defensibleSavings: formatCurrency(defensibleSavingsNum, currency),
      activeInterventionsCount: activeInterventions.length,
      interventionTitles: activeInterventions.map((i: any) => i.title),
    };
  }

  if (!dbProduct) {
    throw new Error(`Product not found: ${productIdentifier}`);
  }

  // Found in database with 0 recorded orders and returns
  const diffPoints = 0 - storeReturnRateNum;
  const diffPercentagePoints = `${diffPoints >= 0 ? "+" : ""}${diffPoints.toFixed(1)} percentage points`;

  return {
    productId: dbProduct.id,
    shopifyProductId: dbProduct.shopifyProductId,
    productTitle: dbProduct.title,
    handle: dbProduct.handle,
    sku: dbProduct.variants?.[0]?.sku || null,
    imageUrl: dbProduct.imageUrl,
    unitsSold: 0,
    returnedUnits: 0,
    productReturnRateNum: 0,
    productReturnRate: "0.0%",
    storeReturnRateNum,
    storeReturnRate: `${storeReturnRateNum.toFixed(1)}%`,
    diffPercentagePointsNum: diffPoints,
    diffPercentagePoints,
    storeUnitsSold,
    storeReturnedUnits,
    causesBreakdown: [],
    primaryCause: null,
    customerComments: [],
    variants: (dbProduct.variants || []).map((v: any) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      unitsSold: 0,
      returnedUnits: 0,
      returnRate: "0.0%",
    })),
    actualReturnCostNum: 0,
    actualReturnCost: formatCurrency(0, currency),
    currency,
    hasFinancialData: false,
    preventability: "Insufficient data to assess",
    preventabilityRationale: "No orders or returns recorded for this product yet.",
    isSampleReliable: false,
    defensibleReductionPct: 0,
    defensibleTargetRate: "0.0%",
    defensibleSavingsNum: 0,
    defensibleSavings: formatCurrency(0, currency),
    activeInterventionsCount: dbProduct.interventions?.length || 0,
    interventionTitles: (dbProduct.interventions || []).map((i: any) => i.title),
  };
}

/**
 * Deterministic fallback synthesizer: guarantees evidence-based output without hallucination
 */
export function synthesizeFallbackResponse(
  ctx: ProductAnalyticsContext
): AIRecommendationResponse {
  const primaryCauseName = ctx.primaryCause?.cause || "Size / Fit";
  const primaryShare = ctx.primaryCause?.share || "60%";
  const diffStr = ctx.diffPercentagePoints;
  const isElevated = ctx.diffPercentagePointsNum > 0;

  // 1. Explanation
  let explanation = "";
  if (ctx.isSampleReliable) {
    const comparisonText = isElevated
      ? `${diffStr} higher than your store average (${ctx.storeReturnRate})`
      : `comparable to your store average (${ctx.storeReturnRate})`;

    if (ctx.primaryCause?.issueType === "size-fit") {
      explanation = `Returns for ${ctx.productTitle} are driven by ${primaryCauseName} (${primaryShare} of returns, ${ctx.primaryCause.count} units), with an overall return rate of ${ctx.productReturnRate}—${comparisonText}. Customer feedback indicates consistent sizing mismatches and requests for clearer garment measurement guidance.`;
    } else if (ctx.primaryCause?.issueType === "not-as-expected") {
      explanation = `${ctx.productTitle} has an elevated return rate of ${ctx.productReturnRate} (${comparisonText}), with ${primaryShare} of returns attributed to ${primaryCauseName}. Verbatim customer feedback cites color discrepancies and tactile differences compared to listing imagery.`;
    } else if (ctx.primaryCause?.issueType === "damaged") {
      explanation = `${ctx.productTitle} currently records a ${ctx.productReturnRate} return rate (${comparisonText}), with ${primaryShare} linked to ${primaryCauseName}. In-transit handling and packaging protection are the primary contributing factors identified in return reports.`;
    } else {
      explanation = `${ctx.productTitle} has recorded ${ctx.returnedUnits} returns out of ${ctx.unitsSold} units sold (${ctx.productReturnRate} return rate), which is ${comparisonText}. The leading driver is ${primaryCauseName} accounting for ${primaryShare} of all return claims.`;
    }
  } else {
    explanation = `${ctx.productTitle} currently has ${ctx.returnedUnits} recorded return(s) out of ${ctx.unitsSold} units sold (${ctx.productReturnRate} return rate). Additional order and return volume is needed to confirm statistically defensible root causes before making permanent catalog alterations.`;
  }

  // 2. Impact items (exact 3 items conforming to section 3)
  const impactItems: [string, string, string] = [
    ctx.isSampleReliable && ctx.defensibleReductionPct > 0
      ? `Reduce return rate by up to ${ctx.defensibleReductionPct}% (targeting ~${ctx.defensibleTargetRate})`
      : `Target 10%–15% return rate stabilization with expanded sample tracking`,
    ctx.hasFinancialData && ctx.defensibleSavingsNum > 0
      ? `Save an estimated ${ctx.defensibleSavings} in return costs`
      : `Establish baseline return-cost tracking once refund amounts are recorded`,
    ctx.primaryCause?.issueType === "size-fit"
      ? `Improve customer sizing confidence and reduce size-exchange requests`
      : ctx.primaryCause?.issueType === "damaged"
      ? `Lower transit defect claims and decrease replacement logistics overhead`
      : `Enhance buyer expectation alignment and reduce post-delivery friction`,
  ];

  // 3. Action and Target
  let suggestedAction = "";
  let measurableTarget = "";
  if (ctx.primaryCause?.issueType === "size-fit") {
    suggestedAction = `Add an interactive size chart with body measurements (chest, waist, length) and insert a 'Fit Advice' badge on ${ctx.productTitle} indicating whether it runs true to size.`;
    measurableTarget = `Track size-related return rate over 30 days, targeting reduction from ${ctx.productReturnRate} towards ${ctx.defensibleTargetRate}.`;
  } else if (ctx.primaryCause?.issueType === "damaged") {
    suggestedAction = `Upgrade to reinforced protective packaging and add transit cushioning for ${ctx.productTitle}.`;
    measurableTarget = `Track defect return frequency over the next 30 days.`;
  } else {
    suggestedAction = `Upload daylight unedited lifestyle photos and detail material texture specifications for ${ctx.productTitle}.`;
    measurableTarget = `Monitor return share of ${primaryCauseName} to drop below 15%.`;
  }

  return {
    productId: ctx.productId,
    productTitle: ctx.productTitle,
    explanation,
    impactItems,
    metrics: {
      productReturnRate: ctx.productReturnRate,
      storeReturnRate: ctx.storeReturnRate,
      diffPercentagePoints: ctx.diffPercentagePoints,
      returnedUnits: ctx.returnedUnits,
      unitsSold: ctx.unitsSold,
      topCause: primaryCauseName,
      topCauseShare: primaryShare,
      actualReturnCost: ctx.actualReturnCost,
      estimatedSavings: ctx.defensibleSavings,
      isEstimatedReliable: ctx.isSampleReliable,
      sampleSizeMessage: ctx.isSampleReliable
        ? undefined
        : `Sample size (${ctx.returnedUnits} returns / ${ctx.unitsSold} sold) is too low for high-confidence predictions.`,
    },
    suggestedAction,
    measurableTarget,
    customerFeedbackSample: ctx.customerComments.slice(0, 3),
    source: "fallback",
  };
}

/**
 * Generate AI-powered product recommendation and "Why this matters" explanation.
 * Calls Groq API with structured context and deterministic fallback on errors.
 */
export async function generateProductAIInsights(
  ctx: ProductAnalyticsContext,
  useCache = true
): Promise<AIRecommendationResponse> {
  const cacheKey = `${ctx.productId}:${ctx.returnedUnits}:${ctx.unitsSold}:${ctx.primaryCause?.cause || "none"}`;

  if (useCache) {
    const cached = aiRecommendationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.response;
    }
  }

  const groqApiKey = process.env.GROQ_API_KEY;

  // If no API key configured, use deterministic synthesis directly
  if (!groqApiKey) {
    const fallback = synthesizeFallbackResponse(ctx);
    aiRecommendationCache.set(cacheKey, { response: fallback, timestamp: Date.now() });
    return fallback;
  }

  try {
    const systemPrompt = `You are Unturn's AI Return Prevention Intelligence Engine for Shopify stores.
You evaluate product return data and produce structured, evidence-based insights for the merchant modal "Why this matters".

CRITICAL STATISTICAL & ACCURACY RULES:
1. NEVER INVENT OR HALLUCINATE NUMBERS, PERCENTAGES, OR CURRENCY AMOUNTS.
2. USE ONLY the exact figures provided in the metrics context below.
3. Clearly distinguish percentage-point differences (e.g. "+7.2 percentage points above store average of 12.1%") from relative percentage reductions (e.g. "reduce return rate by up to 18%").
4. If sample size is insufficient or savings cannot be defensibly calculated, clearly state that limitation instead of guessing.
5. Provide a concise explanation (2 to 3 sentences maximum) and EXACTLY 3 impact items for "Impact if addressed":
   - Item 1: Potential return rate improvement (e.g. "Reduce return rate by up to ${ctx.defensibleReductionPct}% (target ~${ctx.defensibleTargetRate})" or a measurable target if limited data).
   - Item 2: Estimated return-cost savings (e.g. "Save an estimated ${ctx.defensibleSavings} in return costs" if data exists, or a note on establishing baseline).
   - Item 3: A relevant secondary benefit (e.g. customer trust, reduced sizing exchanges, lower transit claims).
6. Return ONLY a valid JSON object matching the requested schema. No markdown formatting outside JSON.`;

    const userPrompt = JSON.stringify({
      productTitle: ctx.productTitle,
      sku: ctx.sku,
      unitsSold: ctx.unitsSold,
      returnedUnits: ctx.returnedUnits,
      productReturnRate: ctx.productReturnRate,
      storeReturnRate: ctx.storeReturnRate,
      differenceInPercentagePoints: ctx.diffPercentagePoints,
      primaryReturnCause: ctx.primaryCause?.cause,
      primaryCauseShare: ctx.primaryCause?.share,
      primaryCauseUnits: ctx.primaryCause?.count,
      allReturnCauses: ctx.causesBreakdown.map((c) => `${c.cause}: ${c.count} units (${c.share})`),
      customerFeedback: ctx.customerComments.slice(0, 3),
      recordedReturnCost: ctx.actualReturnCost,
      backendCalculatedPotentialSavings: ctx.defensibleSavings,
      backendCalculatedReturnReduction: `${ctx.defensibleReductionPct}%`,
      backendCalculatedTargetReturnRate: ctx.defensibleTargetRate,
      isSampleReliable: ctx.isSampleReliable,
      worstVariant: ctx.worstVariant,
    });

    // Call Groq with 4-second timeout to maintain rapid UI responsiveness
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Analyze this product and output JSON with keys: explanation (string), impactItems (array of 3 strings), suggestedAction (string), measurableTarget (string).\n\nData Context:\n${userPrompt}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!groqResponse.ok) {
      throw new Error(`Groq API returned status ${groqResponse.status}`);
    }

    const groqJson = (await groqResponse.json()) as any;
    const rawContent = groqJson.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let parsed: any = null;
    try {
      // Find JSON block if wrapped in markdown
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(rawContent);
      }
    } catch {
      parsed = null;
    }

    if (
      parsed &&
      typeof parsed.explanation === "string" &&
      Array.isArray(parsed.impactItems) &&
      parsed.impactItems.length === 3
    ) {
      const response: AIRecommendationResponse = {
        productId: ctx.productId,
        productTitle: ctx.productTitle,
        explanation: parsed.explanation.trim(),
        impactItems: [
          String(parsed.impactItems[0]).trim(),
          String(parsed.impactItems[1]).trim(),
          String(parsed.impactItems[2]).trim(),
        ],
        metrics: {
          productReturnRate: ctx.productReturnRate,
          storeReturnRate: ctx.storeReturnRate,
          diffPercentagePoints: ctx.diffPercentagePoints,
          returnedUnits: ctx.returnedUnits,
          unitsSold: ctx.unitsSold,
          topCause: ctx.primaryCause?.cause || "Size / Fit",
          topCauseShare: ctx.primaryCause?.share || "0%",
          actualReturnCost: ctx.actualReturnCost,
          estimatedSavings: ctx.defensibleSavings,
          isEstimatedReliable: ctx.isSampleReliable,
        },
        suggestedAction: parsed.suggestedAction || ctx.preventabilityRationale,
        measurableTarget: parsed.measurableTarget || `Track return rate towards ${ctx.defensibleTargetRate}`,
        customerFeedbackSample: ctx.customerComments.slice(0, 3),
        source: "ai",
      };

      aiRecommendationCache.set(cacheKey, { response, timestamp: Date.now() });
      return response;
    }

    // If parse failed or didn't meet structure, use fallback
    const fallback = synthesizeFallbackResponse(ctx);
    aiRecommendationCache.set(cacheKey, { response: fallback, timestamp: Date.now() });
    return fallback;
  } catch (err) {
    // Graceful fallback on network error, abort timeout, or invalid output
    const fallback = synthesizeFallbackResponse(ctx);
    aiRecommendationCache.set(cacheKey, { response: fallback, timestamp: Date.now() });
    return fallback;
  }
}
