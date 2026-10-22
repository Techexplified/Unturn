import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError, useLoaderData } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const apiKey = process.env.SHOPIFY_API_KEY || "d514edab3efadfde9a2128290d60fddf";
  return { apiKey, shop };
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
  const data = useLoaderData<typeof loader>();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        {data?.apiKey && <meta name="shopify-api-key" content={data.apiKey} />}
        {data?.shop && <meta name="shopify-shop" content={data.shop} />}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const html = typeof error.data === "string" ? error.data : "";
    if (html.includes("<script") || html.includes("data-api-key")) {
      return (
        <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
          </head>
          <body>
            <div dangerouslySetInnerHTML={{ __html: html }} />
            <Scripts />
          </body>
        </html>
      );
    }

    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <Meta />
          <Links />
        </head>
        <body style={{ padding: "2rem", fontFamily: "sans-serif", textAlign: "center" }}>
          <h1>{error.status} {error.statusText}</h1>
          <p>{typeof error.data === "string" ? error.data : "An error occurred."}</p>
          <Scripts />
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body style={{ padding: "2rem", fontFamily: "sans-serif", textAlign: "center" }}>
        <h1>Application Error</h1>
        <p>{error instanceof Error ? error.message : "An unexpected error occurred."}</p>
        <Scripts />
      </body>
    </html>
  );
}

