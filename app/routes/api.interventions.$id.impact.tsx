import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { calculateInterventionImpact } from "../services/impact.server";

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

  const interventionId = params.id;
  if (!interventionId) {
    return new Response(JSON.stringify({ error: "Missing intervention ID parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const impact = await calculateInterventionImpact(shopDomain, interventionId);

    if (!impact) {
      return new Response(JSON.stringify({ error: "Intervention not found or access denied" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(impact), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (err: any) {
    console.error(`[Intervention Impact API] Error calculating impact for ${interventionId}:`, err);
    return new Response(
      JSON.stringify({
        error: "Failed to calculate intervention impact",
        message: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
