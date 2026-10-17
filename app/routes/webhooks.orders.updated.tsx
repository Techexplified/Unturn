import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { runShopSync } from "../services/sync.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { shop, topic } = await authenticate.webhook(request);
    console.log(`[Unturn Webhook] Received ${topic} for ${shop}`);

    // Trigger store sync in the background so latest returns are captured immediately
    const { admin } = await unauthenticated.admin(shop);
    if (admin) {
      runShopSync(shop, admin, { force: false }).catch((err) => {
        console.warn(`[Unturn Webhook Sync Error for ${shop}]`, err?.message);
      });
    }
  } catch (err: any) {
    console.warn(`[Unturn Webhook Processing Error]`, err?.message);
  }

  return new Response();
};
