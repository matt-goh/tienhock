import bcrypt from 'bcryptjs';
import express from 'express';
import { randomBytes } from 'node:crypto';
import { readSessionCookie, isSecurityAdmin, requireBrowserOrigin, throttleCredentials, SESSION_COOKIE, sessionCookieOptions } from '../../middleware/security.js';

/** @type {Promise<string>} */
const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), 12);

/** @param {{ query: Function, connect: Function }} pool @returns {import('express').Router} */
export default function authRouter(pool) {
  const router = express.Router();
  router.post('/login', requireBrowserOrigin, throttleCredentials, async (req, res) => {
    const { ic_no, password } = req.body || {};
    res.set('Cache-Control', 'no-store');
    if (typeof ic_no !== 'string' || ic_no.length > 32 || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(401).json({ message: 'Invalid IC number or password' });
    }
    try {
      const result = await pool.query(`SELECT id, name, password, ic_no, job FROM staffs
        WHERE ic_no = $1 AND job ? 'OFFICE' AND (date_resigned IS NULL OR date_resigned > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur')::date)`, [ic_no]);
      const staff = result.rows.length === 1 ? result.rows[0] : null;
      const matches = await bcrypt.compare(password, staff?.password || await dummyHash);
      if (!staff?.password || !matches) return res.status(401).json({ message: 'Invalid IC number or password' });
      /** @type {string} */
      const sessionId = randomBytes(32).toString('base64url');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serialize logins with account changes and recheck the credential under the lock.
        const locked = await client.query(`SELECT password FROM staffs WHERE id = $1 AND job ? 'OFFICE'
          AND (date_resigned IS NULL OR date_resigned > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur')::date) FOR UPDATE`, [staff.id]);
        if (locked.rows[0]?.password !== staff.password) {
          await client.query('ROLLBACK');
          return res.status(401).json({ message: 'Invalid IC number or password' });
        }
        await client.query("UPDATE active_sessions SET status = 'ended' WHERE staff_id = $1 AND status = 'active'", [staff.id]);
        await client.query('INSERT INTO active_sessions (session_id, staff_id, last_active) VALUES ($1, $2, CURRENT_TIMESTAMP)', [sessionId, staff.id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
      res.cookie(SESSION_COOKIE, sessionId, sessionCookieOptions);
      return res.json({ message: 'Login successful', sessionId: 'cookie-session', user: {
        id: staff.id, name: staff.name, ic_no: staff.ic_no, job: typeof staff.job === 'string' ? JSON.parse(staff.job) : staff.job,
        isSecurityAdmin: isSecurityAdmin(staff.id),
      } });
    } catch (error) {
      console.error('Login failed:', error.code || error.name);
      return res.status(500).json({ message: 'Error during login' });
    }
  });
  // Logout must also work after expiry or an administrator's session revocation.
  router.post('/logout', requireBrowserOrigin, async (req, res) => {
    try {
      const sessionId = readSessionCookie(req);
      if (sessionId) await pool.query("UPDATE active_sessions SET status = 'ended' WHERE session_id = $1", [sessionId]);
      res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
      res.set('Cache-Control', 'no-store').json({ status: 'success' });
    } catch (error) {
      console.error('Logout failed:', error.code || error.name);
      res.status(503).json({ message: 'Could not end session. Please retry.' });
    }
  });
  return router;
}
