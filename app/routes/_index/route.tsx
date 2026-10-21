import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    const isEmbedded = url.searchParams.get("embedded") === "1";
    // If opened directly outside Shopify Admin iframe, redirect into Shopify Admin embedded app
    if (!isEmbedded) {
      const cleanShop = shop.replace(".myshopify.com", "");
      const apiKey = process.env.SHOPIFY_API_KEY || "d514edab3efadfde9a2128290d60fddf";
      throw redirect(`https://admin.shopify.com/store/${cleanShop}/apps/${apiKey}`);
    }
    throw redirect(`/app?${url.searchParams.toString()}`);
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
        {showForm && (
          <Form className={styles.form} method="post">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>{errors?.shop ?? "e.g: my-shop-domain.myshopify.com"}</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
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
