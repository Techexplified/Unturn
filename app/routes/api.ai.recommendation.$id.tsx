import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  fetchProductAnalyticsContext,
  generateProductAIInsights,
} from "../services/aiRecommendations.server";
import { getDefaultDateRange } from "../utils/dateUtils";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  let shopDomain = "demo.myshopify.com";
  try {
    const { session } = await authenticate.admin(request);
    shopDomain = session.shop;
  } catch (err) {
    if (
      (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") &&
      !new URL(request.url).searchParams.get("embedded")
    ) {
      shopDomain = "demo.myshopify.com";
    } else {
      throw err;
    }
  }

  const productId = params.id;
  if (!productId) {
    return new Response(JSON.stringify({ error: "Missing product ID parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const dateRange = url.searchParams.get("range") || undefined;
  const refresh = url.searchParams.get("refresh") === "true";

  try {
    const context = await fetchProductAnalyticsContext(shopDomain, productId, dateRange);
    const aiInsight = await generateProductAIInsights(context, !refresh);

    return new Response(JSON.stringify(aiInsight), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err: any) {
    console.error(`[AI Recommendation API] Error generating insights for ${productId}:`, err);
    return new Response(
      JSON.stringify({
        error: "Failed to generate product AI recommendation",
        message: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
