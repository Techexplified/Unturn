import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, Form, useActionData, useLoaderData } from "react-router";

import { login, authenticate } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";
import db from "../../db.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const hostParam = url.searchParams.get("host");
  const embeddedParam = url.searchParams.get("embedded");

  // 1. If shop is directly in search params, redirect straight to /app
  if (shopParam) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // 2. If host or embedded=1 is present (accessed from inside Shopify Admin)
  if (hostParam || embeddedParam === "1") {
    const targetParams = new URLSearchParams(url.searchParams);
    if (hostParam && !targetParams.get("shop")) {
      try {
        const decodedHost = Buffer.from(hostParam, "base64").toString("utf-8");
        const match = decodedHost.match(/store\/([a-zA-Z0-9-]+)/);
        if (match && match[1]) {
          targetParams.set("shop", `${match[1]}.myshopify.com`);
        }
      } catch {
        // ignore decode failure
      }
    }
    // If shop is still not set from host, check database for active shop
    if (!targetParams.get("shop")) {
      const activeShop = await db.shop.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      });
      if (activeShop?.shopDomain) {
        targetParams.set("shop", activeShop.shopDomain);
      }
    }
    throw redirect(`/app?${targetParams.toString()}`);
  }

  // 3. Check for existing Shopify authenticated session
  try {
    const { session } = await authenticate.admin(request);
    if (session?.shop) {
      const targetParams = new URLSearchParams(url.searchParams);
      targetParams.set("shop", session.shop);
      throw redirect(`/app?${targetParams.toString()}`);
    }
  } catch (authErr) {
    if (authErr instanceof Response) {
      throw authErr;
    }
  }

  // 4. If an active merchant store exists in database, redirect to /app
  const activeShop = await db.shop.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (activeShop?.shopDomain) {
    const targetParams = new URLSearchParams(url.searchParams);
    targetParams.set("shop", activeShop.shopDomain);
    throw redirect(`/app?${targetParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors;

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Unturn — Returns Prevention & Intelligence</h1>
        <p className={styles.text}>
          Transform customer return data into actionable prevention playbooks, track baseline improvements, and protect your merchant margins.
        </p>
        <div style={{ margin: "24px 0", display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="/app"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              borderRadius: "8px",
              fontWeight: 600,
              textDecoration: "none",
              fontSize: "14px",
            }}
          >
            Open in Shopify Admin →
          </a>
        </div>
        <p style={{ fontSize: "13px", color: "var(--color-text-subdued, #6b7280)", margin: "0 auto 24px", maxWidth: "480px" }}>
          Unturn is an embedded Shopify application. Install directly from the Shopify App Store or access it via your Shopify Admin Apps menu.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Root-Cause Intelligence</strong>. Uncover hidden return drivers across sizes, fit, defects, and expectations.
          </li>
          <li>
            <strong>Defensible Recommendations</strong>. AI-generated, high-confidence interventions to curb return volume.
          </li>
          <li>
            <strong>Impact & Baseline Tracking</strong>. Measure quantifiable return rate reductions and net margin saved over time.
          </li>
        </ul>
      </div>
    </div>
  );
}
