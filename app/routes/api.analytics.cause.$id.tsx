import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getCauseDetailAnalytics } from "../services/analytics.server";
import { getDefaultDateRange } from "../utils/dateUtils";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const causeId = params.id;

  if (!causeId) {
    return new Response(JSON.stringify({ error: "Missing cause identifier" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const dateRange = url.searchParams.get("range") || undefined;

  const causeData = await getCauseDetailAnalytics(session.shop, causeId, dateRange);

  if (!causeData) {
    return new Response(JSON.stringify({ error: "Cause not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ cause: causeData, ...causeData }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
