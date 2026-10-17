import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getOverviewAnalytics } from "../services/analytics.server";
import { getDefaultDateRange } from "../utils/dateUtils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const dateRange = url.searchParams.get("range") || undefined;
  const search = url.searchParams.get("search")?.toLowerCase().trim();
  const sortBy = url.searchParams.get("sortBy") || "return-rate";

  const data = await getOverviewAnalytics(session.shop, dateRange);
  let products = [...data.allProducts];

  if (search) {
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.sku.toLowerCase().includes(search) ||
        p.mainIssue.toLowerCase().includes(search)
    );
  }

  if (sortBy === "returns-desc") {
    products.sort((a, b) => b.returns - a.returns);
  } else if (sortBy === "returns-asc") {
    products.sort((a, b) => a.returns - b.returns);
  } else if (sortBy === "name-asc") {
    products.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // return-rate
    products.sort((a, b) => parseFloat(b.returnRate) - parseFloat(a.returnRate));
  }

  return new Response(JSON.stringify({ products, total: products.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
