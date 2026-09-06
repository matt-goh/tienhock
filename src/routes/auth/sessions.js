import { Router } from 'express';
import { isSecurityAdmin, SESSION_COOKIE, sessionCookieOptions } from '../../middleware/security.js';

/** @param {{ query: Function }} pool @returns {import('express').Router} */
export default function sessionsRouter(pool) {
  const router = Router();
  /** The auth middleware validates eligibility and both session timeouts.
   * @type {import('express').RequestHandler}
   */
  const state = (req, res) => res.set('Cache-Control', 'no-store').json({
    hasActiveProfile: true,
    staff: { ...req.session.staff, isSecurityAdmin: isSecurityAdmin(req.staffId) },
    lastActive: req.session.last_active,
    status: req.session.status,
  });
  router.post('/initialize', state);
  router.get('/state', state);
  router.delete('/current', async (req, res) => {
    try {
      await pool.query("UPDATE active_sessions SET status = 'ended' WHERE session_id = $1", [req.session.session_id]);
      res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
      res.set('Cache-Control', 'no-store').json({ status: 'success' });
    } catch (error) {
      console.error('Session revocation failed:', error.code || error.name);
      res.status(500).json({ message: 'Could not end session. Please retry.' });
    }
  });
  return router;
}
