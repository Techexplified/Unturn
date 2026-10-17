import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  // Unturn does not collect or store customer personal data.
  return new Response(JSON.stringify({ message: "No customer personal data stored" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
