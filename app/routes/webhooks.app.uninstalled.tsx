import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    // Clean up active session
    await db.session.deleteMany({ where: { shop } });
  }

  // Deactivate the store record without prematurely destroying data
  await db.shop.updateMany({
    where: { shopDomain: shop },
    data: {
      isActive: false,
      uninstalledAt: new Date(),
    },
  });

  return new Response();
};
