/* Authenticated, short-lived quote envelope. No customer data or credentials. */
import { createHash, createHmac, hkdfSync, randomUUID, timingSafeEqual } from 'node:crypto';
import { PRICES, BUNDLE } from './_prices.mjs';

export const SITE = 'https://www.semora.com.au';
export const CREATE_SECONDS = 15 * 60;
export const CHECKOUT_SECONDS = 60 * 60;
export const VERIFY_SECONDS = 30 * 24 * 60 * 60;
export const MAX_BODY_BYTES = 64 * 1024;
export const STRIPE_TIMEOUT_MS = 10000;
const VERSION = 1;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const digest = quote => createHash('sha256').update(JSON.stringify(quote)).digest('hex');
const sign = (payload, secret) => createHmac('sha256', hkdfSync('sha256', secret,
  'semora-checkout-v1', 'quotation-envelope-signing', 32)).update(payload).digest();
export class ContractError extends Error {
  constructor(message, code = 'invalid_attempt', status = 400) {
    super(message); this.code = code; this.status = status;
  }
}

export function priceSelection(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 40)
    throw new ContractError('Select between 1 and 40 one-off items.', 'invalid_selection');
  const items = [], picked = new Set();
  let subtotal = 0;
  for (const line of lines) {
    const label = typeof line?.label === 'string' ? line.label : '';
    const row = own(PRICES, label) ? PRICES[label] : null;
    if (!row || row.mo || picked.has(label))
      throw new ContractError('The selection contains an unavailable, monthly or duplicate item.', 'invalid_selection');
    const qty = row.qty ? line.qty : 1;
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 99)
      throw new ContractError('Quantity must be a whole number between 1 and 99.', 'invalid_selection');
    picked.add(label);
    items.push({ label, amount: row.p * qty, qty });
    subtotal += row.p * qty;
  }
  if (BUNDLE.labels.length && BUNDLE.labels.every(label => picked.has(label))) {
    for (let i = items.length - 1; i >= 0; i--) {
      if (BUNDLE.labels.includes(items[i].label)) {
        subtotal -= items[i].amount; items.splice(i, 1);
      }
    }
    items.push({ label: BUNDLE.label, amount: BUNDLE.price, qty: 1 });
    subtotal += BUNDLE.price;
  }
  if (!Number.isSafeInteger(subtotal) || subtotal < 1)
    throw new ContractError('Nothing to charge.', 'invalid_selection');
  return { items, subtotal };
}

export function prepareAttempt(lines, secret, now = Math.floor(Date.now() / 1000)) {
  const priced = priceSelection(lines);
  const quote = {
    currency: 'aud',
    items: priced.items.map(item => ({ label: item.label, qty: item.qty, amount: item.amount * 100 })),
    subtotal: priced.subtotal * 100,
    gst: Math.round(priced.subtotal * 10),
    total: priced.subtotal * 100 + Math.round(priced.subtotal * 10),
  };
  const attempt = { version: VERSION, id: randomUUID(), issued_at: now,
    create_before: now + CREATE_SECONDS, expires_at: now + CHECKOUT_SECONDS,
    verify_before: now + VERIFY_SECONDS, site: SITE, quote, digest: digest(quote) };
  const encoded = Buffer.from(JSON.stringify(attempt)).toString('base64url');
  return { attempt_token: encoded + '.' + sign(encoded, secret).toString('base64url'), attempt };
}

export function readAttempt(token, secret, action, now = Math.floor(Date.now() / 1000)) {
  const invalid = () => { throw new ContractError('We could not confirm this checkout. Email team@semora.com.au with your Stripe receipt if you paid.'); };
  if (typeof token !== 'string' || token.length > 48000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) invalid();
  const [payload, signature] = token.split('.');
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== 32 || supplied.toString('base64url') !== signature || !timingSafeEqual(sign(payload, secret), supplied)) invalid();
  let a;
  try { a = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { invalid(); }
  if (!object(a) || a.version !== VERSION || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.id) ||
      !Number.isSafeInteger(a.issued_at) || a.issued_at > now ||
      a.create_before !== a.issued_at + CREATE_SECONDS || a.expires_at !== a.issued_at + CHECKOUT_SECONDS ||
      a.verify_before !== a.issued_at + VERIFY_SECONDS || a.site !== SITE) invalid();
  const q = a.quote;
  if (!object(q) || q.currency !== 'aud' || !Array.isArray(q.items) || !q.items.length || q.items.length > 40 ||
      q.items.some(i => !object(i) || typeof i.label !== 'string' || !i.label || i.label.length > 200 ||
        !Number.isSafeInteger(i.qty) || i.qty < 1 || i.qty > 99 || !Number.isSafeInteger(i.amount) || i.amount < 0) ||
      !Number.isSafeInteger(q.subtotal) || q.subtotal < 100 ||
      q.subtotal !== q.items.reduce((sum, item) => sum + item.amount, 0) ||
      q.gst !== Math.round(q.subtotal / 10) || q.total !== q.subtotal + q.gst || a.digest !== digest(q)) invalid();
  if (now >= a.verify_before) throw new ContractError('This saved checkout is too old to verify here. Email team@semora.com.au with your Stripe receipt.', 'verification_expired');
  if (action === 'create' && now >= a.create_before)
    throw new ContractError('The retry window has ended. Verify the saved checkout or email team@semora.com.au before starting another.', 'create_expired', 409);
  return a;
}

export function stripeParameters(a) {
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('currency', 'aud');
  form.set('expires_at', String(a.expires_at));
  form.set('client_reference_id', a.id);
  form.set('success_url', a.site + '/quotation?payment=success&attempt_id=' + a.id + '&session_id={CHECKOUT_SESSION_ID}');
  form.set('cancel_url', a.site + '/quotation?payment=cancelled&attempt_id=' + a.id);
  const rows = a.quote.items.concat([{ label: 'GST (10%)', qty: 1, amount: a.quote.gst }]);
  rows.forEach((item, index) => {
    const p = `line_items[${index}]`;
    form.set(p + '[quantity]', '1');
    form.set(p + '[price_data][currency]', 'aud');
    form.set(p + '[price_data][unit_amount]', String(item.amount));
    form.set(p + '[price_data][product_data][name]', item.qty > 1 ? `${item.label} × ${item.qty}` : item.label);
  });
  form.set('metadata[source]', 'quotation-builder');
  form.set('metadata[schema_version]', String(a.version));
  form.set('metadata[attempt_id]', a.id);
  form.set('metadata[quote_digest]', a.digest);
  return form.toString();
}

export function matchesSession(s, a, sid) {
  return object(s) && s.id === sid && s.mode === 'payment' && s.client_reference_id === a.id &&
    s.currency === a.quote.currency && s.amount_total === a.quote.total &&
    s.metadata?.source === 'quotation-builder' && s.metadata?.schema_version === String(a.version) &&
    s.metadata?.attempt_id === a.id && s.metadata?.quote_digest === a.digest;
}
export function checkoutURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'checkout.stripe.com' && !u.username && !u.password ? u.href : null; }
  catch { return null; }
}
export function sessionState(s, a, sid) {
  if (!matchesSession(s, a, sid)) return { state: 'uncertain', paid: false };
  if (s.status === 'complete' && s.payment_status === 'paid')
    return { state: 'paid', paid: true, session_id: sid, receipt: a.quote, attempt_id: a.id };
  if (s.status === 'expired' && s.payment_status === 'unpaid')
    return { state: 'expired', paid: false, session_id: sid };
  const url = checkoutURL(s.url);
  if (s.status === 'open' && s.payment_status === 'unpaid' && url)
    return { state: 'open', paid: false, session_id: sid, url };
  return { state: 'uncertain', paid: false, session_id: sid };
}
