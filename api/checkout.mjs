/* Hosted one-off Checkout. Prepare freezes a server-priced quote; subsequent
 * requests carry its signed token. A retry always uses the same Stripe key.
 * This endpoint confirms a quote receipt, not fulfilment or customer identity. */
import { ContractError, MAX_BODY_BYTES, STRIPE_TIMEOUT_MS, prepareAttempt, readAttempt,
  stripeParameters, matchesSession, sessionState } from './_checkout-contract.mjs';
export { priceSelection } from './_checkout-contract.mjs';
export const config = { api: { bodyParser: false } };
const SID = /^cs_[A-Za-z0-9_]{1,240}$/;

async function requestJSON(req) {
  if (Number(req.headers?.['content-length']) > MAX_BODY_BYTES)
    throw new ContractError('Checkout request is too large.', 'request_too_large', 413);
  let chunks = [], size = 0;
  const add = chunk => {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += b.length;
    if (size > MAX_BODY_BYTES) throw new ContractError('Checkout request is too large.', 'request_too_large', 413);
    chunks.push(b);
  };
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) add(req.body);
  else for await (const chunk of req) add(chunk);
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ContractError('Invalid checkout request.', 'invalid_request'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new ContractError('Invalid checkout request.', 'invalid_request');
  return parsed;
}

async function stripe(key, path, { method = 'GET', body, idempotency } = {}) {
  const headers = { Authorization: 'Bearer ' + key };
  if (body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotency) headers['Idempotency-Key'] = idempotency;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STRIPE_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions' + path,
      { method, headers, body, signal: controller.signal });
    const value = await response.json();
    if (!response.ok) throw new Error('provider_unconfirmed');
    return value;
  } finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = process.env.STRIPE_SECRET_KEY;
  if (req.method === 'GET') {
    if (new URL(req.url, 'http://local').searchParams.has('session_id'))
      return res.status(200).json({ enabled: Boolean(key), state: 'uncertain', paid: false });
    return res.status(200).json({ enabled: Boolean(key) });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!key) return res.status(503).json({ enabled: false, state: 'uncertain', paid: false,
    error: 'Payments are not activated. Email the quote instead.' });
  let a, data;
  try {
    data = await requestJSON(req);
    if (data.action === 'prepare') return res.status(200).json(prepareAttempt(data.lines, key));
    if (!['create', 'verify', 'abandon'].includes(data.action))
      throw new ContractError('Invalid checkout action.', 'invalid_request');
    a = readAttempt(data.attempt_token, key, data.action);
    if (data.action !== 'create' && !SID.test(data.session_id || ''))
      throw new ContractError('This checkout has no valid saved session.', 'invalid_session');
  } catch (error) {
    return res.status(error instanceof ContractError ? error.status : 400).json({
      state: 'uncertain', paid: false, code: error instanceof ContractError ? error.code : 'invalid_request',
      error: error instanceof ContractError ? error.message : 'Invalid checkout request.' });
  }
  try {
    if (data.action === 'create') {
      let s = await stripe(key, '', { method: 'POST', body: stripeParameters(a),
        idempotency: 'semora-checkout-v1:' + a.id });
      if (SID.test(s?.id || '') && s.status === 'complete') s = await stripe(key, '/' + s.id);
      const state = SID.test(s?.id || '') ? sessionState(s, a, s.id) : { state: 'uncertain', paid: false };
      // Replays can return the original open object. The browser retrieves it
      // before navigating, so an already-paid/expired session is never resumed.
      return res.status(200).json(state);
    }
    const sid = data.session_id;
    let s = await stripe(key, '/' + sid);
    if (data.action === 'abandon' && matchesSession(s, a, sid) && s.status === 'open' && s.payment_status === 'unpaid') {
      try { await stripe(key, '/' + sid + '/expire', { method: 'POST', body: '' }); }
      catch { /* expiry may race completion: retrieve its current state */ }
      s = await stripe(key, '/' + sid);
    }
    return res.status(200).json(sessionState(s, a, sid));
  } catch {
    // A transport error does not establish whether Stripe created/paid a session.
    return res.status(502).json({ state: 'uncertain', paid: false,
      error: 'We could not confirm this checkout. Retry the saved checkout or email team@semora.com.au with your Stripe receipt if you paid.' });
  }
}
