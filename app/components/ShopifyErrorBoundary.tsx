import { useEffect, useRef } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";

export function ShopifyAppBridgeHtml({ html }: { html: string }) {
  useEffect(() => {
    if (!html) return;

    // Check if the HTML contains window.open(destination, target)
    const windowOpenMatch = html.match(/window\.open\((['"])(.*?)\1(?:,\s*(['"])(.*?)\3)?\)/);
    if (windowOpenMatch && windowOpenMatch[2]) {
      const destination = windowOpenMatch[2];
      const target = windowOpenMatch[4] || "_top";
      if (target === "_top" && window.top) {
        window.top.location.href = destination;
      } else {
        window.location.href = destination;
      }
      return;
    }

    // Check for location.href redirects
    const locationMatch = html.match(/location\.href\s*=\s*(['"])(.*?)\1/);
    if (locationMatch && locationMatch[2]) {
      const destination = locationMatch[2];
      if (window.top) {
        window.top.location.href = destination;
      } else {
        window.location.href = destination;
      }
    }
  }, [html]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "80vh", fontFamily: "sans-serif", color: "#5c5f62" }}>
      <p>Redirecting to Shopify Admin...</p>
    </div>
  );
}

export function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const html = typeof error.data === "string" ? error.data : "";
    if (html.includes("window.open") || html.includes("location.href")) {
      return <ShopifyAppBridgeHtml html={html} />;
    }
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", textAlign: "center" }}>
      <h2>Unexpected Application Error</h2>
      <p>{error instanceof Error ? error.message : "An error occurred while loading the application."}</p>
    </div>
  );
}
