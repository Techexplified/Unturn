import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError } from "react-router";
import { ShopifyAppBridgeHtml } from "./components/ShopifyErrorBoundary";

export default function App() {
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
            <ShopifyAppBridgeHtml html={html} />
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

