import { Router } from "express";

const getAuthenticatedStaffId = (req) =>
  req.session?.staff?.id || req.session?.staff_id || null;

export default function accountCodeFavouritesRouter(pool) {
  const router = Router();

  router.get("/", async (req, res) => {
    const staffId = getAuthenticatedStaffId(req);
    if (!staffId) {
      return res.status(401).json({ message: "Authenticated staff required" });
    }

    try {
      const result = await pool.query(
        `SELECT id, account_code, created_at
         FROM account_code_favourites
         WHERE staff_id = $1
         ORDER BY created_at, account_code`,
        [staffId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching account code favourites:", error);
      res.status(500).json({
        message: "Error fetching account code favourites",
        error: error.message,
      });
    }
  });

  router.put("/:accountCode", async (req, res) => {
    const staffId = getAuthenticatedStaffId(req);
    if (!staffId) {
      return res.status(401).json({ message: "Authenticated staff required" });
    }

    const accountCode = String(req.params.accountCode || "").trim();
    if (!accountCode || accountCode.length > 50) {
      return res.status(400).json({ message: "Invalid account code" });
    }

    try {
      const result = await pool.query(
        `INSERT INTO account_code_favourites (staff_id, account_code)
         VALUES ($1, $2)
         ON CONFLICT (staff_id, account_code)
         DO UPDATE SET account_code = EXCLUDED.account_code
         RETURNING id, account_code, created_at`,
        [staffId, accountCode]
      );
      res.json({ ...result.rows[0], is_favourite: true });
    } catch (error) {
      if (error.code === "23503") {
        return res.status(404).json({ message: "Account code not found" });
      }
      console.error("Error adding account code favourite:", error);
      res.status(500).json({
        message: "Error adding account code favourite",
        error: error.message,
      });
    }
  });

  router.delete("/:accountCode", async (req, res) => {
    const staffId = getAuthenticatedStaffId(req);
    if (!staffId) {
      return res.status(401).json({ message: "Authenticated staff required" });
    }

    const accountCode = String(req.params.accountCode || "").trim();
    if (!accountCode || accountCode.length > 50) {
      return res.status(400).json({ message: "Invalid account code" });
    }

    try {
      await pool.query(
        `DELETE FROM account_code_favourites
         WHERE staff_id = $1 AND account_code = $2`,
        [staffId, accountCode]
      );
      res.json({ account_code: accountCode, is_favourite: false });
    } catch (error) {
      console.error("Error removing account code favourite:", error);
      res.status(500).json({
        message: "Error removing account code favourite",
        error: error.message,
      });
    }
  });

  return router;
}
