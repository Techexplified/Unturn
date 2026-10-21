import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, useLoaderData, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { RouteErrorBoundary } from "../components/ShopifyErrorBoundary";
import { authenticate } from "../shopify.server";
import "../styles/unturn.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shopFromUrl = url.searchParams.get("shop");
  const isEmbedded = url.searchParams.get("embedded") === "1";

  // If accessed directly in browser outside Shopify Admin with no shop context, redirect to store login
  if (!shopFromUrl && !isEmbedded && process.env.NODE_ENV === "production") {
    throw redirect("/");
  }

  try {
    const { session } = await authenticate.admin(request);
    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      shop: session.shop,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development" && !isEmbedded) {
      return { apiKey: process.env.SHOPIFY_API_KEY || "", shop: shopFromUrl || "" };
    }
    throw err;
  }
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const tags: Array<{ name: string; content: string }> = [];
  if (data?.apiKey) {
    tags.push({ name: "shopify-api-key", content: data.apiKey });
  }
  if (data?.shop) {
    tags.push({ name: "shopify-shop", content: data.shop });
  }
  return tags;
};

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();

  useEffect(() => {
    // Sync theme from localStorage
    const savedTheme = localStorage.getItem("unturn_theme") || "light";
    if (savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else if (savedTheme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, []);

  return (
    <AppProvider apiKey={apiKey}>
      {shop && <meta name="shopify-shop" content={shop} />}
      <s-app-nav>
        <s-link href="/app">Overview</s-link>
        <s-link href="/app/actions">Recommended Actions</s-link>
        <s-link href="/app/interventions">Interventions</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <div className="unturn-root">
        <main className="unturn-container">
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return <RouteErrorBoundary />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
