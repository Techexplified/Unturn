import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useState, useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { PageHeader } from "../components/PageHeader";
import { DeleteDataModal } from "../components/ActionModals";
import { getSyncStatus, ensureShopRecord, getDateCutoffForRange, pruneOldStoreData } from "../services/sync.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let shopDomain = "cartmend.myshopify.com";
  try {
    const { session, admin } = await authenticate.admin(request);
    await ensureShopRecord(session.shop, admin);
    shopDomain = session.shop;
  } catch (err) {
    if (process.env.NODE_ENV === "development" && !new URL(request.url).searchParams.get("embedded")) {
      const firstShop = await db.shop.findFirst({ where: { isActive: true } });
      shopDomain = firstShop?.shopDomain || "cartmend.myshopify.com";
    } else {
      throw err;
    }
  }

  const syncStatus = await getSyncStatus(shopDomain);
  const shop = await db.shop.findUnique({ where: { shopDomain } });

  return {
    shopDomain,
    syncStatus,
    dateRangeAnalysis: shop?.dateRangeAnalysis || "Last 90 days",
    emailSummary: shop?.emailSummary ?? true,
    shopDetails: {
      name: shop?.name || shopDomain.replace(".myshopify.com", ""),
      currency: shop?.currency || "USD",
      timezone: shop?.ianaTimezone || "UTC",
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent === "update_date_range") {
    const range = formData.get("dateRangeAnalysis")?.toString() || "Last 90 days";
    const shop = await db.shop.update({
      where: { shopDomain: session.shop },
      data: { dateRangeAnalysis: range },
    });

    const cutoffDate = getDateCutoffForRange(range);
    let prunedCounts = { deletedOrders: 0, deletedReturns: 0 };
    if (cutoffDate) {
      prunedCounts = await pruneOldStoreData(shop.id, cutoffDate);
    }

    const updatedStatus = await getSyncStatus(session.shop);
    const pruneMsg = prunedCounts.deletedOrders > 0
      ? ` Pruned ${prunedCounts.deletedOrders} orders older than ${range.toLowerCase()}.`
      : "";
    return {
      success: true,
      message: `Store data retention and analysis set to ${range}.${pruneMsg}`,
      syncStatus: updatedStatus,
    };
  }



  if (intent === "toggle_email_summary") {
    const enabled = formData.get("emailSummary") === "true";
    await db.shop.update({
      where: { shopDomain: session.shop },
      data: { emailSummary: enabled },
    });
    return {
      success: true,
      emailSummary: enabled,
      message: enabled
        ? "Weekly email summary enabled. Unturn will send reports every week."
        : "Weekly email summary disabled.",
    };
  }

  if (intent === "clear") {
    const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
    if (shop) {
      await db.product.deleteMany({ where: { shopId: shop.id } });
      await db.order.deleteMany({ where: { shopId: shop.id } });
      await db.return.deleteMany({ where: { shopId: shop.id } });
      await db.syncJob.deleteMany({ where: { shopId: shop.id } });
    }
    const updatedStatus = await getSyncStatus(session.shop);
    return { success: true, message: "All store analytics data cleared from database.", syncStatus: updatedStatus };
  }

  return { success: true };
};

export default function SettingsPage() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const [dateRangeAnalysis, setDateRangeAnalysis] = useState(
    loaderData?.dateRangeAnalysis || "Last 90 days"
  );
  const [emailSummary, setEmailSummary] = useState(
    loaderData?.emailSummary ?? true
  );
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as any;
      if (data.message) {
        showToast(data.message);
      } else if (data.error) {
        showToast(`Error: ${data.error}`);
      }
    }
  }, [fetcher.data]);



  useEffect(() => {
    const savedTheme = (localStorage.getItem("unturn_theme") as "light" | "dark" | "system" | null) || "light";
    setTheme(savedTheme);

    const savedEmail = localStorage.getItem("unturn_email_summary");
    if (savedEmail !== null) {
      setEmailSummary(savedEmail === "true");
    }

    if (loaderData?.dateRangeAnalysis) {
      setDateRangeAnalysis(loaderData.dateRangeAnalysis);
    } else {
      const savedRange = localStorage.getItem("unturn_date_analysis");
      if (savedRange) {
        setDateRangeAnalysis(savedRange);
      }
    }
  }, [loaderData?.dateRangeAnalysis]);

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    localStorage.setItem("unturn_theme", newTheme);

    if (newTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else if (newTheme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    showToast(`Theme changed to ${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)}`);
  };

  const handleEmailToggle = () => {
    const nextVal = !emailSummary;
    setEmailSummary(nextVal);
    localStorage.setItem("unturn_email_summary", String(nextVal));
    fetcher.submit(
      { intent: "toggle_email_summary", emailSummary: String(nextVal) },
      { method: "post" }
    );
    showToast(nextVal ? "Weekly email summary enabled" : "Weekly email summary disabled");
  };

  const handleRangeChange = (val: string) => {
    setDateRangeAnalysis(val);
    localStorage.setItem("unturn_date_analysis", val);
    fetcher.submit(
      { intent: "update_date_range", dateRangeAnalysis: val },
      { method: "post" }
    );
    showToast(`Store data and analysis updated to ${val}`);
  };

  const handleDeleteAllData = () => {
    fetcher.submit({ intent: "clear" }, { method: "post" });
    localStorage.removeItem("unturn_email_summary");
    localStorage.removeItem("unturn_date_analysis");
    showToast("All Unturn store data has been safely cleared.");
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your Unturn reporting preferences, display theme, and store data."
        showFilters={false}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Card 1: Return data */}
        <div className="unturn-settings-card">
          <div className="unturn-setting-row">
            <div className="unturn-setting-info">
              <h3>Return data</h3>
              <p>Choose how Unturn analyzes your return data.</p>
            </div>

            <div className="unturn-setting-control-area">
              <div className="unturn-setting-control-labels">
                <h4>Date range for analysis</h4>
                <p>Unturn stores and analyzes return data within this time range.</p>
              </div>

              <div>
                <select
                  className="unturn-select"
                  value={dateRangeAnalysis}
                  onChange={(e) => handleRangeChange(e.target.value)}
                  style={{ minWidth: 150, padding: "7px 12px", fontSize: 13 }}
                  disabled={fetcher.state !== "idle"}
                >
                  <option value="Last 30 days">Last 30 days</option>
                  <option value="Last 60 days">Last 60 days</option>
                  <option value="Last 90 days">Last 90 days</option>
                  <option value="Last 180 days">Last 180 days</option>
                  <option value="All time">All time</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Notifications */}
        <div className="unturn-settings-card">
          <div className="unturn-setting-row">
            <div className="unturn-setting-info">
              <h3>Notifications</h3>
              <p>Choose what updates you want to receive.</p>
            </div>

            <div className="unturn-setting-control-area">
              <div className="unturn-setting-control-labels">
                <h4>Weekly email summary</h4>
                <p>Get a weekly summary of key return insights and recommended actions.</p>
              </div>

              <div>
                <label className="unturn-toggle">
                  <input
                    type="checkbox"
                    checked={emailSummary}
                    onChange={handleEmailToggle}
                  />
                  <span className="unturn-toggle-slider" />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Appearance */}
        <div className="unturn-settings-card">
          <div className="unturn-setting-row">
            <div className="unturn-setting-info">
              <h3>Appearance</h3>
              <p>Customize how Unturn looks for you.</p>
            </div>

            <div className="unturn-setting-control-area">
              <div className="unturn-setting-control-labels">
                <h4>Theme</h4>
                <p>Choose your preferred theme.</p>
              </div>

              <div className="unturn-segmented">
                <button
                  type="button"
                  className={`unturn-segmented-btn ${theme === "light" ? "active" : ""}`}
                  onClick={() => handleThemeChange("light")}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4.5" />
                    <line x1="12" y1="2" x2="12" y2="4" />
                    <line x1="12" y1="20" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
                    <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
                    <line x1="2" y1="12" x2="4" y2="12" />
                    <line x1="20" y1="12" x2="22" y2="12" />
                    <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
                    <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
                  </svg>
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  className={`unturn-segmented-btn ${theme === "dark" ? "active" : ""}`}
                  onClick={() => handleThemeChange("dark")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  <span>Dark</span>
                </button>
                <button
                  type="button"
                  className={`unturn-segmented-btn ${theme === "system" ? "active" : ""}`}
                  onClick={() => handleThemeChange("system")}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  <span>System</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Data */}
        <div className="unturn-settings-card">
          <div className="unturn-setting-row">
            <div className="unturn-setting-info">
              <h3>Data</h3>
              <p>Remove all Unturn data from your store.</p>
            </div>

            <div className="unturn-setting-control-area">
              <div className="unturn-setting-control-labels">
                <h4>Delete all data</h4>
                <p>This will permanently delete all Unturn data from your store.</p>
              </div>

              <div>
                <button
                  type="button"
                  className="unturn-btn-danger-outline"
                  onClick={() => setIsDeleteModalOpen(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6 }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  <span>Delete all data</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DeleteDataModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteAllData}
      />

      {toastMessage && (
        <div className="unturn-toast">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
