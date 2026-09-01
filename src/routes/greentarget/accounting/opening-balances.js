// src/routes/greentarget/accounting/opening-balances.js
// Green Target GL opening-balance anchors, mirroring Tien Hock's
// src/routes/accounting/opening-balances.js against the `greentarget` schema.
// One signed amount per (account_code, as_of_date): DR-positive for assets. The
// GT Account Ledger / Bank Statement report seeds its brought-forward balance
// from the latest anchor whose as_of_date is on/before the period start,
// ignoring every posted line before it.
//
// Every query is explicitly schema-qualified so no GT request can touch Tien
// Hock's chart. CD/SD subledger identities are deliberately NOT covered here:
// their openings come from greentarget.debtor_subledger_snapshots (see
// report-engine.js buildAccountLedger), never from account_opening_balances.
import { Router } from "express";
import {
  assertGreenTargetAccountingDateUnlocked,
  isAccountingPeriodLockedError,
} from "./posting-lock.js";

// Resolves each account's EFFECTIVE fs_note (its own, else the nearest ancestor
// carrying one) exactly like Tien Hock's route, so the bulk sheet groups GT
// accounts into the same statement sections the GT reports use.
const EFFECTIVE_FS_NOTES_CTE = `
  WITH RECURSIVE walk AS (
    SELECT code AS origin, parent_code, fs_note, 0 AS depth
      FROM greentarget.account_codes
    UNION ALL
    SELECT w.origin, p.parent_code, p.fs_note, w.depth + 1
      FROM walk w
      JOIN greentarget.account_codes p ON p.code = w.parent_code
     WHERE w.fs_note IS NULL
  ),
  effective_fs_notes AS (
    SELECT DISTINCT ON (origin) origin AS code, fs_note
      FROM walk
     WHERE fs_note IS NOT NULL
     ORDER BY origin, depth
  )`;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Accounts whose protection is a load-bearing ABSENCE of anchors in the pinned
// legacy import: DEBTOR is a control parent whose children carry the balances
// (an anchor here double-counts), and BTFS is the one account the six legacy
// Trial Balances print with genuinely blank debit AND credit — the report
// engines only surface accounts with an anchor or a posted line, so anchoring
// BTFS breaks that printing.
const ANCHOR_FORBIDDEN_ACCOUNTS = new Set(["DEBTOR", "BTFS"]);

/**
 * @param {string} accountCode
 * @param {string | null | undefined} parentCode
 * @returns {boolean}
 */
function isAnchorWriteForbidden(accountCode, parentCode) {
  return (
    ANCHOR_FORBIDDEN_ACCOUNTS.has(accountCode) || parentCode === "CD_SD"
  );
}

/**
 * Guards one anchor write: the R8 period lock (an anchor ignores every posted
 * line before it, so a pre-open-date anchor silently rewrites the pinned
 * Jan-Jun legacy history) plus the forbidden accounts above.
 *
 * @param {string} accountCode
 * @param {string} asOfDate  yyyy-MM-dd
 * @param {{ deletion?: boolean, parentCode?: string | null }} [options]
 * @throws {Error & {status: number, code?: string}}
 */
function assertAnchorWriteAllowed(accountCode, asOfDate, options = {}) {
  // Removing a forbidden anchor is always safe (and the single DELETE path
  // allows it); only a write that CREATES/REPLACES one is blocked.
  if (
    !options.deletion &&
    isAnchorWriteForbidden(accountCode, options.parentCode)
  ) {
    throw Object.assign(
      new Error(
        `Account ${accountCode} cannot carry an opening-balance anchor (its balance is managed by its children, the debtor sub-ledger, or its legacy blank printing).`
      ),
      { status: 400 }
    );
  }
  assertGreenTargetAccountingDateUnlocked(asOfDate, "Opening balance anchor");
}

/**
 * Shared write-path error surface: period-lock 409s and validation 400s keep
 * their status and message instead of falling into the generic 500.
 *
 * @param {import("express").Response} res
 * @param {unknown} error
 * @returns {boolean} true when the error was handled here
 */
function handleAnchorWriteError(res, error) {
  if (isAccountingPeriodLockedError(error)) {
    res
      .status(error.status)
      .json({ code: error.code, message: error.message });
    return true;
  }
  if (error && error.status === 400) {
    res.status(400).json({ message: error.message });
    return true;
  }
  return false;
}

/**
 * Resolve the authenticated actor into the VARCHAR(50) audit column, following
 * the other GT accounting routes.
 *
 * @param {import("express").Request} req
 * @returns {string | null}
 */
function getRequestActor(req) {
  const actor =
    req.session?.staff_id ||
    req.session?.staff?.id ||
    req.staffId ||
    (req.apiKey
      ? "API_KEY"
      : req.session
        ? `SESSION:${req.session.session_id || "UNKNOWN"}`
        : null);
  return actor === null || actor === undefined
    ? null
    : String(actor).slice(0, 50);
}

/**
 * @param {import("pg").Pool} pool
 * @returns {import("express").Router}
 */
export default function createGreenTargetOpeningBalancesRouter(pool) {
  const router = Router();

  // GET / - every GT account with its anchor AT one exact as-of date, for the
  // bulk Opening Balances sheet (the auditor's "Opening balances as at ..."
  // schedule). Filters: ?as_of_date=YYYY-MM-DD (required)
  // &filter=anchored|unanchored|all &search= &note= &include_inactive=true
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

      let editability = {
        allowed: true,
        reason_code: null,
        open_date: null,
      };
      try {
        assertGreenTargetAccountingDateUnlocked(
          asOfDate,
          "Opening balance anchor"
        );
      } catch (error) {
        if (!isAccountingPeriodLockedError(error)) throw error;
        editability = {
          allowed: false,
          reason_code: error.code || null,
          open_date: error.open_date || null,
        };
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
                   FROM greentarget.account_opening_balances o2
                  WHERE o2.account_code = ac.code
                    AND o2.as_of_date <> $1) AS other_anchor_count
           FROM greentarget.account_codes ac
           LEFT JOIN effective_fs_notes efn ON efn.code = ac.code
           LEFT JOIN greentarget.financial_statement_notes fsn
                  ON fsn.code = efn.fs_note
           LEFT JOIN greentarget.account_opening_balances ob
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
        opening_balance_write_allowed: !isAnchorWriteForbidden(
          row.code,
          row.parent_code
        ),
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
           FROM greentarget.account_opening_balances
          WHERE as_of_date = $1`,
        [asOfDate]
      );
      const dt = dateTotalsResult.rows[0];

      const datesResult = await pool.query(
        `SELECT to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date, COUNT(*)::int AS count
           FROM greentarget.account_opening_balances
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
        editability,
      });
    } catch (error) {
      console.error("Error fetching Green Target opening balances:", error);
      res.status(500).json({
        message: "Error fetching Green Target opening balances",
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
        `SELECT code, parent_code
           FROM greentarget.account_codes
          WHERE code = ANY($1::varchar[])`,
        [codes]
      );
      const knownAccounts = new Map(
        existing.rows.map((account) => [account.code, account])
      );
      const knownCodes = new Set(knownAccounts.keys());
      const unknown = codes.filter((c) => !knownCodes.has(c));
      if (unknown.length > 0) {
        return res.status(404).json({
          message: `Unknown account code(s): ${unknown.slice(0, 5).join(", ")}${
            unknown.length > 5 ? ` (+${unknown.length - 5} more)` : ""
          }`,
        });
      }

      for (const entry of entries) {
        assertAnchorWriteAllowed(entry.account_code, asOfDate, {
          deletion: entry.amount === null || entry.amount === undefined,
          parentCode:
            knownAccounts.get(entry.account_code)?.parent_code || null,
        });
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
            `DELETE FROM greentarget.account_opening_balances
              WHERE account_code = $1 AND as_of_date = $2`,
            [code, asOfDate]
          );
          deleted += del.rowCount;
          continue;
        }

        const amountNum = Math.round(parseFloat(entry.amount) * 100) / 100;
        await client.query(
          `INSERT INTO greentarget.account_opening_balances
             (account_code, as_of_date, amount, notes, created_by)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (account_code, as_of_date)
           DO UPDATE SET amount = EXCLUDED.amount,
                         notes = EXCLUDED.notes,
                         updated_at = CURRENT_TIMESTAMP`,
          [code, asOfDate, amountNum, entry.notes || null, getRequestActor(req)]
        );
        saved += 1;
      }

      await client.query("COMMIT");
      res.json({ message: "Opening balances saved", saved, deleted });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (handleAnchorWriteError(res, error)) return;
      console.error("Error saving Green Target opening balances in bulk:", error);
      res.status(500).json({
        message: "Error saving Green Target opening balances",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // GET /:accountCode - the applicable anchor (latest as_of_date), plus full
  // history. Optional ?as_of=yyyy-MM-dd returns the anchor applicable then.
  router.get("/:accountCode", async (req, res) => {
    try {
      const { accountCode } = req.params;
      const { as_of } = req.query;

      const params = [accountCode];
      let applicableSql = `
        SELECT id, account_code, to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date,
               amount, notes, created_at, updated_at, created_by
          FROM greentarget.account_opening_balances
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
           FROM greentarget.account_opening_balances
          WHERE account_code = $1
          ORDER BY as_of_date DESC`,
        [accountCode]
      );

      res.json({
        opening_balance: applicableResult.rows[0] || null,
        history: historyResult.rows,
      });
    } catch (error) {
      console.error("Error fetching Green Target opening balance:", error);
      res.status(500).json({
        message: "Error fetching Green Target opening balance",
        error: error.message,
      });
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
      if (!ISO_DATE_RE.test(as_of_date)) {
        return res
          .status(400)
          .json({ message: "as_of_date must be YYYY-MM-DD" });
      }
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum)) {
        return res.status(400).json({ message: "amount must be a number" });
      }

      // Account must exist
      const acResult = await pool.query(
        `SELECT parent_code
           FROM greentarget.account_codes
          WHERE code = $1`,
        [accountCode]
      );
      if (acResult.rows.length === 0) {
        return res
          .status(404)
          .json({ message: `Account ${accountCode} not found` });
      }

      assertAnchorWriteAllowed(accountCode, as_of_date, {
        parentCode: acResult.rows[0].parent_code,
      });

      const result = await pool.query(
        `INSERT INTO greentarget.account_opening_balances
           (account_code, as_of_date, amount, notes, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_code, as_of_date)
         DO UPDATE SET amount = EXCLUDED.amount,
                       notes = EXCLUDED.notes,
                       updated_at = CURRENT_TIMESTAMP
         RETURNING id, account_code, to_char(as_of_date, 'YYYY-MM-DD') AS as_of_date,
                   amount, notes`,
        [accountCode, as_of_date, amountNum, notes || null, getRequestActor(req)]
      );

      res.json({
        message: "Opening balance saved",
        opening_balance: result.rows[0],
      });
    } catch (error) {
      if (handleAnchorWriteError(res, error)) return;
      console.error("Error saving Green Target opening balance:", error);
      res.status(500).json({
        message: "Error saving Green Target opening balance",
        error: error.message,
      });
    }
  });

  // DELETE /:accountCode/:asOfDate - clear a specific anchor
  router.delete("/:accountCode/:asOfDate", async (req, res) => {
    try {
      const { accountCode, asOfDate } = req.params;
      if (!ISO_DATE_RE.test(asOfDate)) {
        return res.status(400).json({ message: "asOfDate must be YYYY-MM-DD" });
      }
      // Removing a pre-open-date anchor rewrites the pinned legacy history
      // just as adding one does; the forbidden-account set does not apply
      // (deleting one of those anchors is always safe).
      assertGreenTargetAccountingDateUnlocked(
        asOfDate,
        "Opening balance anchor"
      );
      const result = await pool.query(
        `DELETE FROM greentarget.account_opening_balances
          WHERE account_code = $1 AND as_of_date = $2`,
        [accountCode, asOfDate]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Opening balance not found" });
      }
      res.json({ message: "Opening balance deleted" });
    } catch (error) {
      if (handleAnchorWriteError(res, error)) return;
      console.error("Error deleting Green Target opening balance:", error);
      res.status(500).json({
        message: "Error deleting Green Target opening balance",
        error: error.message,
      });
    }
  });

  return router;
}
