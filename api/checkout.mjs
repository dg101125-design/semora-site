/* /api/checkout — the quotation builder's payment gate (founder order,
 * 4 Sep 2026: 选购产品以后可以直接支付).
 *
 *   GET  → { enabled }        the front end shows the pay button only when
 *                             a payment account is actually connected — a
 *                             dead pay button would be worse than none
 *   POST → { url }            a Stripe Checkout Session for the ONE-OFF
 *                             items in the selection; the browser goes to
 *                             Stripe's hosted, PCI-compliant page and
 *                             returns to /quotation?payment=…
 *
 * Money rules, in order of importance:
 *   1. Prices come from api/_prices.mjs — GENERATED from the builder's own
 *      markup, which answers to 01_Service_Architecture.md v1.5.1. The
 *      client's numbers are never trusted; unknown labels are rejected.
 *   2. Only one-off items are chargeable here. Monthly items carry a
 *      6-month minimum and go through the SOW/margin gate (SOP Stage 1) —
 *      a subscription is a contract, not an impulse card charge.
 *   3. GST rides as its own line at 10% of the ex-GST subtotal, so the
 *      Stripe receipt shows exactly what the site shows: prices + GST.
 *
 * Same platform conventions as enquiry.mjs: .mjs, zero npm dependencies
 * (Stripe's REST API over global fetch), secrets only in Vercel env.
 * Requires STRIPE_SECRET_KEY; until it is set every POST answers 503 and
 * GET answers { enabled: false } — the whole flow ships dark and turns on
 * the day the founder connects the account. */
import { PRICES, BUNDLE } from "./_prices.mjs";

export const config = { api: { bodyParser: false } };

const SITE = "https://www.semora.com.au";
const MAX_LINES = 40;
const MAX_QTY = 99;

async function rawBody(req) {
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

/* Rebuild the charge from the server's own table. Returns { items, subtotal }
 * in whole dollars, or throws with a message safe to show. Exported for the
 * browser-run test harness (this machine has no Node). */
export function priceSelection(lines) {
  if (!Array.isArray(lines) || !lines.length) throw new Error("Nothing selected.");
  if (lines.length > MAX_LINES) throw new Error("Too many lines.");
  const items = [];
  let subtotal = 0;
  const picked = new Set();
  for (const l of lines) {
    const label = typeof l?.label === "string" ? l.label : "";
    /* own properties only — "__proto__" and friends must read as unknown,
     * not as inherited object plumbing (Codex r1) */
    const row = Object.prototype.hasOwnProperty.call(PRICES, label)
      ? PRICES[label] : null;
    if (!row) throw new Error("Unknown item: " + label.slice(0, 60));
    if (row.mo) throw new Error("Monthly items are contracted, not carded: " + label);
    if (picked.has(label)) throw new Error("Duplicate line: " + label);
    picked.add(label);
    let qty = 1;
    if (row.qty) {
      qty = Math.floor(Number(l.qty));
      if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY)
        throw new Error("Bad quantity for: " + label);
    }
    items.push({ label, amount: row.p * qty, qty });
    subtotal += row.p * qty;
  }
  /* the four-piece bundle collapses to its published product line, exactly
   * as the page's own summary does */
  if (BUNDLE.labels.length &&
      BUNDLE.labels.every((b) => picked.has(b))) {
    let folded = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      if (BUNDLE.labels.includes(items[i].label)) {
        folded += items[i].amount;
        items.splice(i, 1);
      }
    }
    items.push({ label: BUNDLE.label, amount: BUNDLE.price, qty: 1 });
    subtotal = subtotal - folded + BUNDLE.price;
  }
  if (subtotal < 1) throw new Error("Nothing to charge.");
  return { items, subtotal };
}

export default async function handler(req, res) {
  const key = process.env.STRIPE_SECRET_KEY;

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    /* ?session_id=cs_… → verify a return leg against Stripe itself.
     * Codex r1: the success banner was forgeable by typing the URL —
     * "Payment received" must only ever follow Stripe saying paid. */
    const sid = new URL(req.url, "http://local").searchParams.get("session_id");
    if (sid) {
      if (!key || !/^cs_[A-Za-z0-9_]+$/.test(sid)) {
        return res.status(200).json({ enabled: Boolean(key), paid: false });
      }
      try {
        const r = await fetch(
          "https://api.stripe.com/v1/checkout/sessions/" + sid,
          { headers: { Authorization: "Bearer " + key } });
        const s = await r.json();
        return res.status(200).json({
          enabled: true,
          paid: r.ok && s.payment_status === "paid",
        });
      } catch {
        return res.status(200).json({ enabled: true, paid: false });
      }
    }
    return res.status(200).json({ enabled: Boolean(key) });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!key) {
    return res.status(503).json({ enabled: false,
      error: "Payments are not activated yet. Email the quote instead." });
  }

  let priced;
  try {
    const parsed = JSON.parse((await rawBody(req)) || "{}");
    priced = priceSelection(parsed.lines);
  } catch (e) {
    return res.status(400).json({ error: String(e.message || "Bad request") });
  }

  /* Stripe's REST API takes form-encoded bodies; cents, AUD. Each item is
   * its own line and GST is its own line, so the receipt reads like the
   * page. */
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("currency", "aud");
  form.set("success_url",
    SITE + "/quotation?payment=success&session_id={CHECKOUT_SESSION_ID}");
  form.set("cancel_url", SITE + "/quotation?payment=cancelled");
  priced.items.forEach((it, i) => {
    form.set(`line_items[${i}][quantity]`, "1");
    form.set(`line_items[${i}][price_data][currency]`, "aud");
    form.set(`line_items[${i}][price_data][unit_amount]`,
      String(Math.round(it.amount * 100)));
    form.set(`line_items[${i}][price_data][product_data][name]`,
      it.qty > 1 ? `${it.label} × ${it.qty}` : it.label);
  });
  const n = priced.items.length;
  form.set(`line_items[${n}][quantity]`, "1");
  form.set(`line_items[${n}][price_data][currency]`, "aud");
  form.set(`line_items[${n}][price_data][unit_amount]`,
    String(Math.round(priced.subtotal * 10))); /* 10% of subtotal, in cents */
  form.set(`line_items[${n}][price_data][product_data][name]`, "GST (10%)");
  form.set("metadata[source]", "quotation-builder");
  form.set("metadata[subtotal_ex_gst]", String(priced.subtotal));

  let session;
  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    session = await r.json();
    if (!r.ok) {
      console.error("stripe error", session?.error?.message);
      return res.status(502).json({ error: "The payment service declined the request. Email the quote instead." });
    }
  } catch (e) {
    console.error("stripe unreachable", e?.message);
    return res.status(502).json({ error: "The payment service is unreachable. Email the quote instead." });
  }
  return res.status(200).json({ url: session.url });
}
