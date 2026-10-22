import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, useLoaderData, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { RouteErrorBoundary } from "../components/ShopifyErrorBoundary";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import "../styles/unturn.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    return {
      apiKey: process.env.SHOPIFY_API_KEY || "d514edab3efadfde9a2128290d60fddf",
      shop: session.shop,
    };
  } catch (err) {
    if (err instanceof Response) {
      throw err;
    }
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      const url = new URL(request.url);
      const shopParam = url.searchParams.get("shop");
      const firstShop = await db.shop.findFirst({ where: { isActive: true } });
      return {
        apiKey: process.env.SHOPIFY_API_KEY || "d514edab3efadfde9a2128290d60fddf",
        shop: shopParam || firstShop?.shopDomain || "cartmend.myshopify.com",
      };
    }
    throw err;
  }
};

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
}: {
  currentUrl: URL;
  nextUrl: URL;
  formMethod?: string;
}) {
  if (formMethod && formMethod !== "GET") {
    return true;
  }
  return currentUrl.searchParams.get("shop") !== nextUrl.searchParams.get("shop");
}

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
      <ui-nav-menu>
        <a href="/app" rel="home">Overview</a>
        <a href="/app/actions">Recommended Actions</a>
        <a href="/app/interventions">Interventions</a>
        <a href="/app/settings">Settings</a>
      </ui-nav-menu>
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
