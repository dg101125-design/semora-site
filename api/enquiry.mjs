/* POST /api/enquiry — the contact form's handler.
 *
 * Replaces Web3Forms, whose template is fixed: no layout, no brand, no
 * button. This sends two messages through Resend instead —
 *
 *   1. a notification to the studio, built to be read in a phone preview
 *   2. a designed auto-reply to the enquirer, from _templates.js
 *
 * .mjs, not .js: without a package.json Vercel treats .js as
 * CommonJS and the import below fails at runtime. Adding a
 * package.json would make Vercel treat this static site as a Node
 * project and try to build it.
 *
 * No npm dependencies: Vercel's Node runtime has global fetch, so the
 * function needs no build step and cannot break on a dependency update.
 *
 * Requires the RESEND_API_KEY environment variable, set in the Vercel
 * project. It is never committed.
 */
import { autoReplyHtml, escapeHtml } from "./_templates.mjs";

const TO = "team@semora.com.au";
const FROM = "SEMORA STUDIO <team@semora.com.au>";
const RESEND = "https://api.resend.com/emails";

const FIELDS = ["name", "practice", "email", "phone", "vertical", "want", "prompt"];

function send(payload) {
  return fetch(RESEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

function notificationHtml(d) {
  const row = (label, value) =>
    `<tr>
       <td style="padding:6px 14px 6px 0;font:500 12px/1.5 monospace;letter-spacing:.1em;text-transform:uppercase;color:#8B6B7E;white-space:nowrap;vertical-align:top;">${label}</td>
       <td style="padding:6px 0;font:400 15px/1.55 -apple-system,'Segoe UI',Arial,sans-serif;color:#2E1C29;">${escapeHtml(value) || "—"}</td>
     </tr>`;
  return `<div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;max-width:620px;">
    <p style="margin:0 0 4px;font:500 12px/1.5 monospace;letter-spacing:.18em;text-transform:uppercase;color:#6B7B4E;">New enquiry / semora.com.au</p>
    <h2 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:26px;color:#2E1C29;">${escapeHtml(d.name) || "No name given"} — ${escapeHtml(d.practice) || "no practice given"}</h2>
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      ${row("Email", d.email)}
      ${row("Phone", d.phone)}
      ${row("Field", d.vertical)}
      ${row("Wants", d.want)}
    </table>
    <p style="margin:18px 0 6px;font:500 12px/1.5 monospace;letter-spacing:.1em;text-transform:uppercase;color:#8B6B7E;">What prompted this</p>
    <p style="margin:0;padding:14px 18px;background:#F0E8EC;border-left:3px solid #6B7B4E;font-size:15px;line-height:1.6;color:#2E1C29;white-space:pre-wrap;">${escapeHtml(d.prompt) || "—"}</p>
    <p style="margin:22px 0 0;font-size:13px;color:#6B6560;">Reply straight to this email — it goes to the enquirer.</p>
  </div>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Use POST." });
  }
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return res.status(500).json({ success: false, message: "Not configured." });
  }

  const body = typeof req.body === "string" ? Object.fromEntries(new URLSearchParams(req.body)) : req.body || {};

  // Honeypot. Bots tick it; a person never sees it.
  if (body.botcheck) return res.status(200).json({ success: true });

  const d = {};
  for (const f of FIELDS) d[f] = String(body[f] ?? "").trim().slice(0, 4000);

  if (!d.name || !d.email || !d.prompt) {
    return res.status(400).json({ success: false, message: "Please complete the required fields." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
    return res.status(400).json({ success: false, message: "That email address does not look right." });
  }

  try {
    // The studio's copy must land even if the courtesy reply fails, so it is
    // sent first and its result alone decides what the visitor is told.
    const notify = await send({
      from: FROM,
      to: [TO],
      reply_to: d.email,
      subject: `New enquiry — ${d.practice || d.name}`,
      html: notificationHtml(d),
    });

    if (!notify.ok) {
      const detail = await notify.text();
      console.error("Resend rejected the notification:", notify.status, detail);
      return res.status(502).json({ success: false, message: "That didn’t send." });
    }

    // Auto-reply is best-effort. A visitor who does not get the courtesy note
    // still had their enquiry delivered, and telling them it failed would be
    // false.
    try {
      await send({
        from: FROM,
        to: [d.email],
        reply_to: TO,
        subject: "Thank you — that’s with us",
        html: autoReplyHtml(d),
      });
    } catch (e) {
      console.error("Auto-reply failed (enquiry still delivered):", e);
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error("Enquiry handler threw:", e);
    return res.status(500).json({ success: false, message: "That didn’t send." });
  }
}
