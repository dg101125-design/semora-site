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

/* Vercel's body parser is turned off so this function always owns the request
 * stream. It has to be, because leaving it on loses enquiries.
 *
 * Observed on production 11 Aug 2026: the FIRST request after a cold start
 * returned 400 "Please complete the required fields", and every request after
 * it parsed correctly. Twice, in two separate test runs. On a cold start the
 * platform consumes the stream trying to parse a content type it does not
 * understand, leaves req.body as an empty object, and the stream is then spent
 * — so reading it back yields nothing and every field looks blank.
 *
 * A warm function is not the case that matters. The enquiry that arrives after
 * a quiet hour is the one that was hardest to earn, and it is exactly the one
 * that was being dropped. */
export const config = { api: { bodyParser: false } };

const TO = "team@semora.com.au";
const FROM = "SEMORA STUDIO <team@semora.com.au>";
const RESEND = "https://api.resend.com/emails";

/* "website" is posted by the FREE AI VISIBILITY REPORT form — it is the URL
 * the 24-hour report is ABOUT. Dropping it (as this list once did) meant the
 * notification arrived without the one datum the promise depends on. */
const FIELDS = ["name", "practice", "email", "phone", "website", "vertical", "want", "prompt"];

/* Read the enquiry out of the request whatever shape it arrives in.
 *
 * Three transports have to work, because all three genuinely occur:
 *   multipart/form-data   — what fetch() sends for a FormData body, i.e. what
 *                           the site's own contact form posts
 *   x-www-form-urlencoded — what the browser sends on a native <form> POST,
 *                           the no-JS fallback
 *   application/json      — anything posting the API directly
 *
 * Vercel's helper parses the last two into an object but does not understand
 * multipart, so those bytes arrive raw and every field would read empty.
 * Parsing it here means the client never has to be changed in step with the
 * endpoint — switching the form's action is a one-line change with no
 * matching client release.
 *
 * The raw body is taken from req.body when the helper leaves it there and
 * read off the stream when it does not, because which of the two happens is a
 * property of the platform rather than of this code. */
async function rawBody(req) {
  // With bodyParser off this is the normal path; the req.body branches remain
  // so the handler still works if the config export is ever not honoured.
  const body = req.body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (typeof body === "string") return body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return "";
  }
}

async function readFields(req) {
  const body = req.body;
  if (body && typeof body === "object" && !Buffer.isBuffer(body)
      && Object.keys(body).length) return body;

  const raw = await rawBody(req);
  if (!raw) return {};

  const type = String(req.headers["content-type"] || "");

  if (type.includes("multipart/form-data")) {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type);
    if (!boundary) return {};
    const marker = "--" + (boundary[1] || boundary[2]).trim();
    const out = {};
    for (const part of raw.split(marker)) {
      const split = part.indexOf("\r\n\r\n");
      if (split === -1) continue;
      const name = /name="([^"]*)"/.exec(part.slice(0, split));
      if (!name) continue;
      out[name[1]] = part.slice(split + 4).replace(/\r\n$/, "");
    }
    return out;
  }

  if (type.includes("application/json")) {
    try { return JSON.parse(raw); } catch { return {}; }
  }

  return Object.fromEntries(new URLSearchParams(raw));
}

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
      ${row("Website", d.website)}
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
  const body = await readFields(req);

  // Honeypot. Bots tick it; a person never sees it.
  if (body.botcheck) return res.status(200).json({ success: true });

  const d = {};
  for (const f of FIELDS) d[f] = String(body[f] ?? "").trim().slice(0, 4000);

  /* Tell a lost body apart from an empty form, and never blame the visitor for
   * ours.
   *
   * Reproduced on production across three separate deployments: the FIRST
   * request against a new deployment parses to nothing, and every request
   * after it is fine. Turning Vercel's body parser off did not stop it, so the
   * body is being lost somewhere in the platform's request path on the very
   * first invocation, not in this code.
   *
   * The tell is unambiguous — bytes arrived and no field survived. A person
   * submitting a blank form sends almost nothing; a lost body sends hundreds
   * of bytes and yields zero fields. That case answers 503, which is
   * retryable, and the client retries once. A genuinely incomplete form still
   * answers 400.
   *
   * Getting this backwards is expensive in a way that never shows up in
   * logs: the enquiry after a quiet period is the hardest one to earn, and it
   * would have been told to go back and fill in fields it had already filled
   * in. */
  const declared = Number(req.headers["content-length"] || 0);
  if (!Object.keys(body).length && declared > 100) {
    console.error("Body arrived but parsed to nothing — content-length", declared,
                  "type", req.headers["content-type"]);
    res.setHeader("Retry-After", "1");
    return res.status(503).json({
      success: false,
      message: "That didn\u2019t go through. Please try once more.",
      retryable: true,
    });
  }

  if (!d.name || !d.email || !d.prompt) {
    return res.status(400).json({ success: false, message: "Please complete the required fields." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
    return res.status(400).json({ success: false, message: "That email address does not look right." });
  }

  /* Checked after validation, not before, so that a well-formed enquiry posted
   * against an unconfigured deployment answers "Not configured" while a
   * malformed one still answers 400. The two are then distinguishable from
   * outside, which is the only way to test that the body actually parsed
   * without sending real mail. */
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not set");
    return res.status(500).json({ success: false, message: "Not configured." });
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
