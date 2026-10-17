import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { sendWeeklySummaryReport } from "../services/email.server";

async function handleWeeklySummaryDispatch(request: Request) {
  const url = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("Authorization");
  const providedSecret = url.searchParams.get("secret") || authHeader?.replace(/^Bearer\s+/i, "");

  // Protect endpoint if CRON_SECRET is configured
  if (cronSecret && providedSecret !== cronSecret && process.env.NODE_ENV === "production") {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid cron secret" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Filter specific shop if test parameter passed, otherwise all active subscribed shops
  const testShop = url.searchParams.get("shop");
  const targetRecipient = url.searchParams.get("recipient") || undefined;

  const shops = await db.shop.findMany({
    where: {
      isActive: true,
      emailSummary: true,
      ...(testShop ? { shopDomain: testShop } : {}),
    },
    select: {
      id: true,
      shopDomain: true,
      name: true,
      emailSummary: true,
    },
  });

  const results: { shop: string; success: boolean; error?: string; emailId?: string }[] = [];

  for (const s of shops) {
    try {
      const res = await sendWeeklySummaryReport(s.shopDomain, targetRecipient);
      results.push({
        shop: s.shopDomain,
        success: res.success,
        ...(res.data?.id ? { emailId: res.data.id } : {}),
        ...(res.error ? { error: res.error } : {}),
      });
    } catch (err: any) {
      results.push({
        shop: s.shopDomain,
        success: false,
        error: err?.message || "Failed to dispatch weekly summary",
      });
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      totalEligibleShops: shops.length,
      dispatchedCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return handleWeeklySummaryDispatch(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return handleWeeklySummaryDispatch(request);
};
