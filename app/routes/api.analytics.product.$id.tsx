import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getProductDetailAnalytics } from "../services/analytics.server";
import { getDefaultDateRange } from "../utils/dateUtils";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const productId = params.id;

  if (!productId) {
    return new Response(JSON.stringify({ error: "Missing product ID" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const dateRange = url.searchParams.get("range") || undefined;

  const productData = await getProductDetailAnalytics(session.shop, productId, dateRange);

  if (!productData) {
    return new Response(JSON.stringify({ error: "Product not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ product: productData, ...productData }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
