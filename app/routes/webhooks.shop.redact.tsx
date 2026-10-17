import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}. Purging shop records.`);

  // Purge all shop records and associated data (cascades to products, orders, returns, etc.)
  await db.shop.deleteMany({
    where: { shopDomain: shop },
  });

  await db.session.deleteMany({
    where: { shop },
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
