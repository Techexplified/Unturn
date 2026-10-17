import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getSyncStatus, runShopSync, ensureShopRecord } from "../services/sync.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  await ensureShopRecord(session.shop, admin);
  const status = await getSyncStatus(session.shop);

  return new Response(JSON.stringify(status), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString() || "start";

  if (intent === "clear") {
    const shop = await db.shop.findUnique({
      where: { shopDomain: session.shop },
    });

    if (shop) {
      // Clear synced data for this merchant
      await db.product.deleteMany({ where: { shopId: shop.id } });
      await db.order.deleteMany({ where: { shopId: shop.id } });
      await db.return.deleteMany({ where: { shopId: shop.id } });
      await db.syncJob.deleteMany({ where: { shopId: shop.id } });
    }

    const updatedStatus = await getSyncStatus(session.shop);
    return new Response(
      JSON.stringify({ success: true, message: "Shop data cleared successfully", status: updatedStatus }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Start or retry sync
  const force = intent === "retry";
  const result = await runShopSync(session.shop, admin, { force });
  const updatedStatus = await getSyncStatus(session.shop);

  return new Response(
    JSON.stringify({
      success: result.success,
      message: result.message,
      job: result.job,
      status: updatedStatus,
    }),
    {
      status: result.success ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    }
  );
};
