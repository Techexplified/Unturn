import { useEffect, useRef } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";

export function ShopifyAppBridgeHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !html) return;

    // 1. Try to find shop from URL search params
    const params = new URLSearchParams(window.location.search);
    let shop = params.get("shop");

    // 2. Fallback: try to extract shop from the html payload
    if (!shop) {
      const match = html.match(/shop=([a-zA-Z0-9.\-_]+(?:\.myshopify\.com)?)/i);
      if (match && match[1]) {
        shop = match[1];
      }
    }

    if (shop) {
      let metaShop = document.querySelector('meta[name="shopify-shop"]');
      if (!metaShop) {
        metaShop = document.createElement("meta");
        metaShop.setAttribute("name", "shopify-shop");
        document.head.appendChild(metaShop);
      }
      metaShop.setAttribute("content", shop);
    }

    // 3. Re-execute scripts
    const scripts = ref.current.querySelectorAll("script");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });
  }, [html]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html || "Handling response..." }} />;
}

export function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const html = typeof error.data === "string" ? error.data : "";
    return <ShopifyAppBridgeHtml html={html} />;
  }

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif", textAlign: "center" }}>
      <h2>Unexpected Application Error</h2>
      <p>{error instanceof Error ? error.message : "An error occurred while loading the application."}</p>
    </div>
  );
}
