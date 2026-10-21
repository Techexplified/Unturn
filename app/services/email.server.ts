import { Resend } from "resend";
import db from "../db.server";
import { getOverviewAnalytics } from "./analytics.server";

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

export function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL || "Unturn <onboarding@resend.dev>";
}

export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Core email sender using Resend
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: SendEmailPayload): Promise<SendEmailResult> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[Unturn Email] RESEND_API_KEY is not defined in environment variables.");
    return {
      success: false,
      error: "RESEND_API_KEY is not configured.",
    };
  }

  const from = getFromEmail();
  const toRecipients = Array.isArray(to) ? to : [to];

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: toRecipients,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      console.error("[Unturn Email Error]:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (err: any) {
    console.error("[Unturn Email Exception]:", err);
    return {
      success: false,
      error: err?.message || "Failed to send email via Resend",
    };
  }
}

/**
 * Send weekly executive returns digest email to merchant
 */
export async function sendWeeklySummaryReport(
  shopDomain: string,
  targetEmail?: string
): Promise<SendEmailResult> {
  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    return { success: false, error: `Shop ${shopDomain} not found` };
  }

  let recipient = targetEmail;
  if (!recipient) {
    const session = await db.session.findFirst({
      where: { shop: shopDomain, email: { not: null } },
      select: { email: true },
    });
    recipient = session?.email || undefined;
  }

  if (!recipient) {
    const rawFrom = process.env.RESEND_FROM_EMAIL || "";
    const match = rawFrom.match(/<([^>]+)>/);
    recipient = match ? match[1] : undefined;
  }

  if (!recipient) {
    return { success: false, error: "No recipient email configured for shop" };
  }

  const analytics = await getOverviewAnalytics(shopDomain, "Last 7 days");
  const metrics = analytics.metrics;
  const topProducts = analytics.topProducts.slice(0, 3);
  const topCauses = analytics.topCauses.slice(0, 3);

  const subject = `Weekly Return Summary (Last 7 Days) for ${shop.name || shopDomain} - Return Rate: ${metrics.returnRate}`;
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Weekly Return Summary</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f6f7; margin: 0; padding: 32px 16px;">
        <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e1e3e5; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
          <div style="background: #111213; padding: 24px 32px; color: #ffffff;">
            <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #8c9196; font-weight: 600;">Executive Weekly Digest</div>
            <h1 style="margin: 4px 0 0 0; font-size: 22px; font-weight: 600;">Unturn Return Intelligence</h1>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #a6acb2;">${shop.name || shopDomain} • ${metrics.dateRangeLabel}</p>
          </div>
          <div style="padding: 28px 32px;">
            <h2 style="font-size: 16px; margin: 0 0 16px 0; color: #202223;">Weekly Performance Overview</h2>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
              <tr>
                <td width="48%" style="background: #f7f9fa; border: 1px solid #e1e3e5; border-radius: 8px; padding: 16px; vertical-align: top;">
                  <div style="font-size: 12px; color: #6d7175; font-weight: 500;">Store Return Rate</div>
                  <div style="font-size: 26px; font-weight: 700; color: #202223; margin: 6px 0 2px 0;">${metrics.returnRate}</div>
                  <div style="font-size: 12px; color: #6d7175;">${metrics.returnedUnits} returned of ${metrics.unitsSold} sold</div>
                </td>
                <td width="4%">&nbsp;</td>
                <td width="48%" style="background: #f7f9fa; border: 1px solid #e1e3e5; border-radius: 8px; padding: 16px; vertical-align: top;">
                  <div style="font-size: 12px; color: #6d7175; font-weight: 500;">Estimated Return Cost</div>
                  <div style="font-size: 26px; font-weight: 700; color: #202223; margin: 6px 0 2px 0;">${metrics.estimatedReturnCost}</div>
                  <div style="font-size: 12px; color: #6d7175;">${metrics.returnedOrders} returned orders</div>
                </td>
              </tr>
            </table>

            <h3 style="font-size: 14px; margin: 0 0 12px 0; color: #202223;">Top Return Causes</h3>
            <div style="margin-bottom: 24px;">
              ${topCauses.map((c) => `
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #fafbfc; border: 1px solid #edeff0; border-radius: 6px; margin-bottom: 8px;">
                  <tr>
                    <td align="left" style="padding: 10px 14px; font-size: 13px; font-weight: 600; color: #202223;">
                      ${c.cause}
                    </td>
                    <td align="right" style="padding: 10px 14px; font-size: 13px; color: #6d7175; white-space: nowrap;">
                      ${c.returns} returns (${c.share})
                    </td>
                  </tr>
                </table>
              `).join("")}
            </div>

            <h3 style="font-size: 14px; margin: 0 0 12px 0; color: #202223;">Top Impact Products</h3>
            <div style="margin-bottom: 24px;">
              ${topProducts.map((p) => `
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #ffffff; border: 1px solid #edeff0; border-radius: 8px; margin-bottom: 10px;">
                  <tr>
                    <td align="left" style="padding: 12px 14px 4px 14px; font-size: 13.5px; font-weight: 700; color: #202223;">
                      ${p.name}
                    </td>
                    <td align="right" style="padding: 12px 14px 4px 14px; font-size: 13px; font-weight: 700; color: #d72c0d; white-space: nowrap;">
                      ${p.returnRate} return rate
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" align="left" style="padding: 0 14px 12px 14px; color: #6d7175; font-size: 12px;">
                      Primary root cause: <strong style="color: #202223;">${p.mainIssue}</strong>
                    </td>
                  </tr>
                </table>
              `).join("")}
            </div>

            <div style="border-top: 1px solid #e1e3e5; padding-top: 20px; font-size: 12px; color: #8c9196;">
              You received this automated report because "Weekly email summary" is enabled in Unturn Settings.
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: recipient,
    subject,
    html,
  });
}
