import { createHash } from 'node:crypto';

/** @type {Set<string>} */
const securityAdmins = new Set(['MILTI', 'TIMOTHY.G', 'HELEN', 'MATTHEW']);
/** @type {boolean} */
const production = process.env.NODE_ENV === 'production';
export const SESSION_COOKIE = production ? '__Host-erp_session' : 'erp_session';
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** @type {import('express').CookieOptions} */
export const sessionCookieOptions = { httpOnly: true, secure: production, sameSite: 'strict', path: '/', maxAge: SESSION_MAX_AGE_MS };
/** @type {Set<string>} */
const browserOrigins = new Set(production
  ? ['https://tienhock.com', 'https://greentarget.tienhock.com']
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173']);

/** @param {unknown} staffId @returns {boolean} */
export const isSecurityAdmin = (staffId) => typeof staffId === 'string' && securityAdmins.has(staffId);

/** @type {import('express').RequestHandler} */
export const requireSecurityAdmin = (req, res, next) => {
  if (!isSecurityAdmin(req.staffId)) return res.status(403).json({ message: 'Security administrator access required' });
  next();
};

/** Exact origins protect cookie requests and login from CSRF.
 * @type {import('express').RequestHandler}
 */
export const requireBrowserOrigin = (req, res, next) => {
  if (!browserOrigins.has(req.get('origin') || '')) return res.status(403).json({ message: 'Untrusted browser origin' });
  next();
};

/** @param {import('express').Request} req @returns {string|null} */
export function readSessionCookie(req) {
  /** @type {string[]} */
  const cookies = (req.headers.cookie || '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (cookies.length !== 1) return null;
  /** @type {string} */
  const value = cookies[0].slice(SESSION_COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

/** Single-process throttle. Counts before bcrypt/DB work, including concurrent requests.
 * @type {Map<string, {count: number, until: number}>}
 */
const attempts = new Map();
/** @type {import('express').RequestHandler} */
export const throttleCredentials = (req, res, next) => {
  /** @type {number} */
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  /** @type {string} */
  const identity = String(req.body?.ic_no || req.staffId || '').slice(0, 128).trim().toLowerCase();
  /** @type {[string, number][]} */
  const limits = [[`ip:${req.ip}`, 100], [`account:${createHash('sha256').update(identity).digest('hex')}`, 10]];
  if (limits.some(([key, limit]) => (attempts.get(key)?.count || 0) >= limit) || attempts.size >= 10000) {
    res.set('Retry-After', '900');
    return res.status(429).json({ message: 'Too many attempts. Please try again in 15 minutes.' });
  }
  for (const [key] of limits) {
    const value = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    value.count += 1;
    attempts.set(key, value);
  }
  next();
};

/** @param {import('express').Request} req @param {string} action @param {string} [target] @returns {void} */
export function logSecurityAction(req, action, target = '') {
  console.info(JSON.stringify({ event: 'security', time: new Date().toISOString(), actor: req.staffId, action, target }));
}
