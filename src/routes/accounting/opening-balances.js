// src/routes/accounting/opening-balances.js
// GL opening-balance anchors (item 1A-7, first used by the Bank Statement report).
// One signed amount per (account_code, as_of_date): DR-positive for assets. The Bank
// Statement report seeds its brought-forward balance from the latest anchor whose
// as_of_date is on/before the period start, ignoring every posted line before it — this
// discards pre-migration / pre-cutover noise without backdated journals.
import { Router } from "express";

// Resolves each account's EFFECTIVE fs_note (its own, else the nearest ancestor
// carrying one) exactly like financial-reports.js, so the bulk sheet groups
// accounts into the same statement sections the reports use.
const EFFECTIVE_FS_NOTES_CTE = `
  WITH RECURSIVE walk AS (
    SELECT code AS origin, parent_code, fs_note, 0 AS depth
      FROM account_codes
    UNION ALL
    SELECT w.origin, p.parent_code, p.fs_note, w.depth + 1
      FROM walk w
      JOIN account_codes p ON p.code = w.parent_code
     WHERE w.fs_note IS NULL
  ),
  effective_fs_notes AS (
    SELECT DISTINCT ON (origin) origin AS code, fs_note
      FROM walk
     WHERE fs_note IS NOT NULL
     ORDER BY origin, depth
  )`;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function (pool) {
  const router = Router();

  // GET / - every account with its anchor AT one exact as-of date, for the bulk
  // Opening Balances sheet (the auditor's "Opening balances as at ..." schedule).
  // Filters: ?as_of_date=YYYY-MM-DD (required) &filter=anchored|unanchored|all
  //          &search= &note= &include_inactive=true
  router.get("/", async (req, res) => {
    try {
      const {
        as_of_date: asOfDate,
        filter = "anchored",
        search,
        note,
        include_inactive: includeInactive,
      } = req.query;

      if (!asOfDate || !ISO_DATE_RE.test(asOfDate)) {
        return res
          .status(400)
          .json({ message: "as_of_date (YYYY-MM-DD) is required" });
      }

      const params = [asOfDate];
      const conditions = [];

      if (includeInactive !== "true") conditions.push("ac.is_active = TRUE");
      if (filter === "anchored") conditions.push("ob.id IS NOT NULL");
      else if (filter === "unanchored") conditions.push("ob.id IS NULL");

      if (note) {
        params.push(note);
        conditions.push(`efn.fs_note = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(
          `(ac.code ILIKE $${params.length} OR ac.description ILIKE $${params.length})`
        );
      }

      const rowsResult = await pool.query(
        `${EFFECTIVE_FS_NOTES_CTE}
         SELECT ac.code,
                ac.description,
                ac.ledger_type,
                ac.parent_code,
                ac.sort_order,
                ac.is_active,
                efn.fs_note,
                fsn.name AS note_name,
                fsn.category AS note_category,
                fsn.report_section AS note_report_section,
                fsn.sort_order AS note_sort_order,
                ob.amount,
                ob.notes,
                ob.updated_at,
                (SELECT COUNT(*)::int
                   FROM account_opening_balances o2
                  WHERE o2.account_code = ac.code
                    AND o2.as_of_date <> $1) AS other_anchor_count
           FROM account_codes ac
           LEFT JOIN effective_fs_notes efn ON efn.code = ac.code
           LEFT JOIN financial_statement_notes fsn ON fsn.code = efn.fs_note
           LEFT JOIN account_opening_balances ob
                  ON ob.account_code = ac.code AND ob.as_of_date = $1
          ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
          ORDER BY CASE fsn.report_section
                     WHEN 'balance_sheet' THEN 1
                     WHEN 'income_statement' THEN 2
                     WHEN 'cogm' THEN 3
                     ELSE 4
                   END,
                   fsn.sort_order NULLS LAST,
                   efn.fs_note NULLS LAST,
                   ac.sort_order,
                   ac.code`,
        params
      );

      const accounts = rowsResult.rows.map((row) => ({
        ...row,
        amount: row.amount === null ? null : parseFloat(row.amount),
        sort_order: row.sort_order === null ? 0 : Number(row.sort_order),
        opening_balance_write_allowed: true,
      }));

      // Totals of the rows shown...
      const shownTotals = accounts.reduce(
        (acc, a) => {
          if (a.amount === null) return acc;
          if (a.amount >= 0) acc.debit += a.amount;
          else acc.credit += Math.abs(a.amount);
          return acc;
        },
        { debit: 0, credit: 0 }
      );

      // ...and of EVERY anchor on this date, so a filtered view still shows
      // whether the complete set balances (Dr must equal Cr).
      const dateTotalsResult = await pool.query(
        `SELECT COUNT(*)::int AS count,
                COALESCE(SUM(CASE WHEN amount >= 0 THEN amount ELSE 0 END), 0) AS debit,
                COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS credit
           FROM account_opening_balances
          WHERE as_of_date = $1`,
        [asOfDate]
      );
      const dt = dateTotalsResult.rows[0];

      const datesResult = await pool.query(
        `SELECT to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date, COUNT(*)::int AS count
           FROM account_opening_balances
          GROUP BY as_of_date
          ORDER BY as_of_date DESC`
      );

      res.json({
        as_of_date: asOfDate,
        accounts,
        shown_totals: {
          ...shownTotals,
          count: accounts.filter((a) => a.amount !== null).length,
        },
        date_totals: {
          count: dt.count,
          debit: parseFloat(dt.debit),
          credit: parseFloat(dt.credit),
          difference: parseFloat(dt.debit) - parseFloat(dt.credit),
        },
        available_dates: datesResult.rows,
        editability: {
          allowed: true,
          reason_code: null,
          open_date: null,
        },
      });
    } catch (error) {
      console.error("Error fetching opening balances:", error);
      res.status(500).json({
        message: "Error fetching opening balances",
        error: error.message,
      });
    }
  });

  // PUT /bulk - upsert/delete many anchors on one as-of date in a single
  // transaction. amount === null deletes that account's anchor for the date.
  // Declared before PUT /:accountCode so "bulk" is never read as a code.
  router.put("/bulk", async (req, res) => {
    const { as_of_date: asOfDate, entries } = req.body;

    if (!asOfDate || !ISO_DATE_RE.test(asOfDate)) {
      return res
        .status(400)
        .json({ message: "as_of_date (YYYY-MM-DD) is required" });
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ message: "entries array is required" });
    }

    const client = await pool.connect();
    try {
      const codes = entries.map((e) => e.account_code);
      const existing = await client.query(
        `SELECT code FROM account_codes WHERE code = ANY($1::varchar[])`,
        [codes]
      );
      const knownCodes = new Set(existing.rows.map((r) => r.code));
      const unknown = codes.filter((c) => !knownCodes.has(c));
      if (unknown.length > 0) {
        return res.status(404).json({
          message: `Unknown account code(s): ${unknown.slice(0, 5).join(", ")}${
            unknown.length > 5 ? ` (+${unknown.length - 5} more)` : ""
          }`,
        });
      }

      for (const entry of entries) {
        if (entry.amount !== null && entry.amount !== undefined) {
          const amountNum = parseFloat(entry.amount);
          if (isNaN(amountNum)) {
            return res.status(400).json({
              message: `Amount for ${entry.account_code} must be a number`,
            });
          }
        }
      }

      await client.query("BEGIN");

      let saved = 0;
      let deleted = 0;

      for (const entry of entries) {
        const code = entry.account_code;
        if (entry.amount === null || entry.amount === undefined) {
          const del = await client.query(
            `DELETE FROM account_opening_balances
              WHERE account_code = $1 AND as_of_date = $2`,
            [code, asOfDate]
          );
          deleted += del.rowCount;
          continue;
        }

        const amountNum = Math.round(parseFloat(entry.amount) * 100) / 100;
        await client.query(
          `INSERT INTO account_opening_balances
             (account_code, as_of_date, amount, notes, created_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (account_code, as_of_date)
           DO UPDATE SET amount = EXCLUDED.amount,
                         notes = EXCLUDED.notes,
                         updated_at = CURRENT_TIMESTAMP`,
          [code, asOfDate, amountNum, entry.notes || null, req.staffId || null]
        );
        saved += 1;
      }

      await client.query("COMMIT");
      res.json({ message: "Opening balances saved", saved, deleted });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Error saving opening balances in bulk:", error);
      res.status(500).json({
        message: "Error saving opening balances",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // GET /:accountCode - the applicable anchor (latest as_of_date), plus full history.
  // Optional ?as_of=yyyy-MM-dd returns the anchor applicable at that date.
  router.get("/:accountCode", async (req, res) => {
    try {
      const { accountCode } = req.params;
      const { as_of } = req.query;

      const params = [accountCode];
      let applicableSql = `
        SELECT id, account_code, to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date,
               amount, notes, created_at, updated_at, created_by
          FROM account_opening_balances
         WHERE account_code = $1`;
      if (as_of) {
        applicableSql += ` AND as_of_date <= $2`;
        params.push(as_of);
      }
      applicableSql += ` ORDER BY as_of_date DESC LIMIT 1`;

      const applicableResult = await pool.query(applicableSql, params);

      const historyResult = await pool.query(
        `SELECT id, account_code, to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date,
                amount, notes, created_at, updated_at, created_by
           FROM account_opening_balances
          WHERE account_code = $1
          ORDER BY as_of_date DESC`,
        [accountCode]
      );

      res.json({
        opening_balance: applicableResult.rows[0] || null,
        history: historyResult.rows,
      });
    } catch (error) {
      console.error("Error fetching opening balance:", error);
      res
        .status(500)
        .json({ message: "Error fetching opening balance", error: error.message });
    }
  });

  // PUT /:accountCode - upsert an anchor on (account_code, as_of_date)
  router.put("/:accountCode", async (req, res) => {
    try {
      const { accountCode } = req.params;
      const { as_of_date, amount, notes } = req.body;

      if (!as_of_date) {
        return res.status(400).json({ message: "as_of_date is required" });
      }
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum)) {
        return res.status(400).json({ message: "amount must be a number" });
      }

      // Account must exist
      const acResult = await pool.query(
        `SELECT 1 FROM account_codes WHERE code = $1`,
        [accountCode]
      );
      if (acResult.rows.length === 0) {
        return res
          .status(404)
          .json({ message: `Account ${accountCode} not found` });
      }

      const result = await pool.query(
        `INSERT INTO account_opening_balances
           (account_code, as_of_date, amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_code, as_of_date)
         DO UPDATE SET amount = EXCLUDED.amount,
                       notes = EXCLUDED.notes,
                       updated_at = CURRENT_TIMESTAMP
         RETURNING id, account_code, to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date,
                   amount, notes`,
        [accountCode, as_of_date, amountNum, notes || null, req.staffId || null]
      );

      res.json({
        message: "Opening balance saved",
        opening_balance: result.rows[0],
      });
    } catch (error) {
      console.error("Error saving opening balance:", error);
      res
        .status(500)
        .json({ message: "Error saving opening balance", error: error.message });
    }
  });

  // DELETE /:accountCode/:asOfDate - clear a specific anchor
  router.delete("/:accountCode/:asOfDate", async (req, res) => {
    try {
      const { accountCode, asOfDate } = req.params;
      const result = await pool.query(
        `DELETE FROM account_opening_balances
          WHERE account_code = $1 AND as_of_date = $2`,
        [accountCode, asOfDate]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Opening balance not found" });
      }
      res.json({ message: "Opening balance deleted" });
    } catch (error) {
      console.error("Error deleting opening balance:", error);
      res
        .status(500)
        .json({ message: "Error deleting opening balance", error: error.message });
    }
  });

  return router;
}
