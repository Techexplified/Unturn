import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  createIntervention,
  getInterventions,
  getInterventionById,
  updateIntervention,
  deleteIntervention,
  calculateBeforeAfterPerformance,
} from "../services/interventions.server";
import db from "../db.server";
import { calculateInterventionImpact } from "../services/impact.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let shopDomain = "cartmend.myshopify.com";
  try {
    const { session } = await authenticate.admin(request);
    shopDomain = session.shop;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      const firstShop = await db.shop.findFirst({ where: { isActive: true } });
      shopDomain = firstShop?.shopDomain || "cartmend.myshopify.com";
    } else {
      throw err;
    }
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const id = url.searchParams.get("id");

  if (id) {
    const intervention = await getInterventionById(shopDomain, id);
    if (!intervention) {
      return new Response(JSON.stringify({ error: "Intervention not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ intervention }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const interventions = await getInterventions(shopDomain, { status, search });
  return new Response(JSON.stringify({ interventions, count: interventions.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  let shopDomain = "cartmend.myshopify.com";
  try {
    const { session } = await authenticate.admin(request);
    shopDomain = session.shop;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      const firstShop = await db.shop.findFirst({ where: { isActive: true } });
      shopDomain = firstShop?.shopDomain || "cartmend.myshopify.com";
    } else {
      throw err;
    }
  }

  const method = request.method.toUpperCase();

  try {
    const body = await request.json();

    if (method === "POST") {
      const intervention = await createIntervention(shopDomain, {
        title: body.title,
        description: body.description,
        productId: body.productId,
        variantId: body.variantId,
        cause: body.cause,
        actionType: body.actionType,
        expectedOutcome: body.expectedOutcome,
        recommendationId: body.recommendationId,
        startDate: body.startDate,
        targetCompletionDate: body.targetCompletionDate,
        status: body.status,
        notes: body.notes,
        baselinePeriod: body.baselinePeriod,
        baselineReturnRate:
          body.baselineReturnRate !== undefined && body.baselineReturnRate !== null
            ? parseFloat(String(body.baselineReturnRate).replace("%", ""))
            : undefined,
        baselineReturnedUnits:
          body.baselineReturnedUnits !== undefined && body.baselineReturnedUnits !== null
            ? parseInt(String(body.baselineReturnedUnits), 10)
            : undefined,
        baselineUnitsSold:
          body.baselineUnitsSold !== undefined && body.baselineUnitsSold !== null
            ? parseInt(String(body.baselineUnitsSold), 10)
            : undefined,
        baselineCauseFrequency:
          body.baselineCauseFrequency !== undefined && body.baselineCauseFrequency !== null
            ? parseInt(String(body.baselineCauseFrequency), 10)
            : undefined,
      });

      return new Response(JSON.stringify({ ok: true, intervention }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "PATCH" || method === "PUT") {
      const id = body.id;
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing intervention ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const updated = await updateIntervention(shopDomain, id, {
        title: body.title,
        description: body.description,
        status: body.status,
        actionType: body.actionType,
        expectedOutcome: body.expectedOutcome,
        targetCompletionDate: body.targetCompletionDate,
        notes: body.notes,
      });

      const performance = await calculateBeforeAfterPerformance(updated.shopId, updated);
      const impact = await calculateInterventionImpact(shopDomain, updated.id);

      return new Response(
        JSON.stringify({
          ok: true,
          intervention: {
            ...updated,
            performance,
            impact,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (method === "DELETE") {
      const id = body.id;
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing intervention ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      await deleteIntervention(shopDomain, id);
      return new Response(JSON.stringify({ ok: true, id }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to process intervention request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
