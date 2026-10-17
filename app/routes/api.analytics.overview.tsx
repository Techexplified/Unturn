import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getOverviewAnalytics } from "../services/analytics.server";
import { getDefaultDateRange } from "../utils/dateUtils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const dateRange = url.searchParams.get("range") || undefined;

  const data = await getOverviewAnalytics(session.shop, dateRange);

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
