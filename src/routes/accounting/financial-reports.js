// src/routes/accounting/financial-reports.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Build local yyyy-MM-dd period boundaries for a YTD report (Jan 1 -> last day of month).
  // Never derive these via toISOString(): the server runs in UTC+8, so that shifts the
  // date back one day (Jan 1 becomes Dec 31, month-end loses its last day).
  const getYtdPeriod = (year, month) => {
    const lastDay = new Date(year, month, 0).getDate();
    const mm = String(month).padStart(2, "0");
    return {
      startStr: `${year}-01-01`,
      endStr: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
    };
  };

  // Helper function to validate year/month parameters
  const validateYearMonth = (year, month) => {
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      return { valid: false, error: "Invalid year. Must be between 1900 and 2100." };
    }
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return { valid: false, error: "Invalid month. Must be between 1 and 12." };
    }
    return { valid: true, year: yearNum, month: monthNum };
  };

  // Resolve each account's effective FS note: its own fs_note, or the nearest
  // ancestor's (walking parent_code). Lets journal lines posted to child
  // accounts (e.g. PU_BBER under PUR) roll up into the parent's Income
  // Statement / Balance Sheet / COGM note without assigning a note per child.
  // Interpolate as the leading CTEs of a WITH RECURSIVE query.
  const EFFECTIVE_FS_NOTES_CTES = `
        note_walk AS (
          SELECT code AS origin, parent_code, fs_note, 0 AS depth
          FROM account_codes
          UNION ALL
          SELECT w.origin, p.parent_code, p.fs_note, w.depth + 1
          FROM note_walk w
          JOIN account_codes p ON p.code = w.parent_code
          WHERE w.fs_note IS NULL
        ),
        effective_fs_notes AS (
          SELECT DISTINCT ON (origin) origin AS code, fs_note
          FROM note_walk
          WHERE fs_note IS NOT NULL
          ORDER BY origin, depth
        )`;

  // Trial Balance and Balance Sheet are as-of reports. For each account, use
  // the latest opening anchor on or before the period end and add only posted
  // movement from that anchor date onward. An unanchored account starts at
  // January 1. Keeping the anchor as the account source also preserves explicit
  // zero fences and anchor-only balances in the report population.
  // Interpolate after EFFECTIVE_FS_NOTES_CTES; $1 = Jan 1, $2 = period end.
  const ANCHORED_ACCOUNT_BALANCES_CTES = `
        latest_anchors AS (
          SELECT DISTINCT ON (aob.account_code)
            aob.account_code,
            aob.as_of_date,
            aob.amount
          FROM account_opening_balances aob
          WHERE aob.as_of_date <= $2::date
          ORDER BY aob.account_code, aob.as_of_date DESC
        ),
        account_periods AS (
          SELECT
            ac.code,
            la.as_of_date AS anchor_date,
            la.amount AS anchor_amount,
            COALESCE(la.as_of_date, $1::date) AS movement_start
          FROM account_codes ac
          LEFT JOIN latest_anchors la ON la.account_code = ac.code
          WHERE ac.is_active = true
        ),
        account_movements AS (
          SELECT
            ap.code,
            SUM(
              COALESCE(jel.debit_amount, 0)
              - COALESCE(jel.credit_amount, 0)
            ) AS net
          FROM account_periods ap
          JOIN journal_entry_lines jel ON jel.account_code = ap.code
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE je.status = 'posted'
            AND je.entry_date >= ap.movement_start
            AND je.entry_date <= $2::date
          GROUP BY ap.code
        ),
        account_balances AS (
          SELECT
            ap.code,
            COALESCE(ap.anchor_amount, 0) + COALESCE(am.net, 0) AS net
          FROM account_periods ap
          LEFT JOIN account_movements am ON am.code = ap.code
          WHERE ap.anchor_date IS NOT NULL OR am.code IS NOT NULL
        )`;

  /** @type {string[]} */
  const INCOME_STATEMENT_OPENING_STOCK_NOTES = ["3-1", "3-3", "3-7"];

  /** @type {string[]} */
  const COGM_OPENING_STOCK_NOTES = ["3-3", "3-7"];

  // Profit-and-loss reports consume only the exact fiscal-year opening-stock
  // anchors. This is deliberately separate from the latest-anchor semantics
  // used by the Trial Balance and Balance Sheet account balances: a later
  // checkpoint must never replace opening stock in the Income Statement or
  // CoGM.
  /** @type {string} */
  const EXACT_FISCAL_OPENING_STOCK_CTE = `
        fiscal_opening_stock AS (
          SELECT
            efn.fs_note,
            SUM(CASE WHEN aob.amount > 0 THEN aob.amount ELSE 0 END) AS total_debit,
            SUM(CASE WHEN aob.amount < 0 THEN -aob.amount ELSE 0 END) AS total_credit,
            SUM(aob.amount) AS net
          FROM account_opening_balances aob
          JOIN effective_fs_notes efn ON efn.code = aob.account_code
          WHERE aob.as_of_date = $1::date
            AND efn.fs_note = ANY($3::varchar[])
          GROUP BY efn.fs_note
        )`;

  /** @type {string[]} */
  const CLOSING_STOCK_NOTES = ["14-1", "14-2", "14-3"];

  // V3 monthly closing stock. The legacy system injected month-end stock into
  // the BS/IS/CoGM at report level from its stock module; its printed Trial
  // Balances carry the CS_* accounts at .00 every month. The ERP mirrors that:
  // the confirmed month-end values keyed on the Material Stock page live in
  // closing_stock_values and are injected into the statement responses only —
  // never into the GL — so the Trial Balance keeps the CS accounts at zero.
  // Exact-month semantics: an unkeyed month injects nothing, and the Balance
  // Sheet stays balanced because the inventory lines and Current Year Profit
  // skip the injection together.
  const getClosingStockValues = async (year, month) => {
    const result = await pool.query(
      `SELECT csv.fs_note, csv.amount, fsn.name
         FROM closing_stock_values csv
         JOIN financial_statement_notes fsn ON fsn.code = csv.fs_note
        WHERE csv.year = $1 AND csv.month = $2`,
      [year, month]
    );
    const map = {};
    let total = 0;
    for (const row of result.rows) {
      const amount = parseFloat(row.amount) || 0;
      map[row.fs_note] = { name: row.name, amount };
      total += amount;
    }
    return { map, total };
  };

  // ==================== FINANCIAL STATEMENT NOTES ====================

  // GET /notes - Get all financial statement notes
  router.get("/notes", async (req, res) => {
    try {
      const { category, report_section, is_active } = req.query;

      let query = `
        SELECT code, name, description, category, report_section,
               normal_balance, sort_order, parent_note, is_active,
               created_at, updated_at
        FROM financial_statement_notes
        WHERE 1=1
      `;

      const params = [];
      let paramIndex = 1;

      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (report_section) {
        query += ` AND report_section = $${paramIndex}`;
        params.push(report_section);
        paramIndex++;
      }

      if (is_active !== undefined && is_active !== "") {
        query += ` AND is_active = $${paramIndex}`;
        params.push(is_active === "true" || is_active === true);
        paramIndex++;
      }

      query += ` ORDER BY sort_order, code`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching financial statement notes:", error);
      res.status(500).json({
        message: "Error fetching financial statement notes",
        error: error.message,
      });
    }
  });

  // POST /notes - Create a new financial statement note
  router.post("/notes", async (req, res) => {
    try {
      const {
        code,
        name,
        description,
        category,
        report_section,
        normal_balance,
        sort_order,
        parent_note,
      } = req.body;

      if (!code || !name || !category || !normal_balance) {
        return res.status(400).json({
          message: "code, name, category, and normal_balance are required",
        });
      }

      const result = await pool.query(
        `INSERT INTO financial_statement_notes
         (code, name, description, category, report_section, normal_balance, sort_order, parent_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          code,
          name,
          description || null,
          category,
          report_section || null,
          normal_balance,
          sort_order || 0,
          parent_note || null,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating financial statement note:", error);
      if (error.code === "23505") {
        return res.status(409).json({
          message: "A note with this code already exists",
        });
      }
      res.status(500).json({
        message: "Error creating financial statement note",
        error: error.message,
      });
    }
  });

  // PUT /notes/:code - Update a financial statement note
  router.put("/notes/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const {
        name,
        description,
        category,
        report_section,
        normal_balance,
        sort_order,
        parent_note,
        is_active,
      } = req.body;

      const result = await pool.query(
        `UPDATE financial_statement_notes
         SET name = COALESCE($1, name),
             description = $2,
             category = COALESCE($3, category),
             report_section = $4,
             normal_balance = COALESCE($5, normal_balance),
             sort_order = COALESCE($6, sort_order),
             parent_note = $7,
             is_active = COALESCE($8, is_active),
             updated_at = CURRENT_TIMESTAMP
         WHERE code = $9
         RETURNING *`,
        [
          name,
          description,
          category,
          report_section,
          normal_balance,
          sort_order,
          parent_note,
          is_active,
          code,
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Note not found" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating financial statement note:", error);
      res.status(500).json({
        message: "Error updating financial statement note",
        error: error.message,
      });
    }
  });

  // DELETE /notes/:code - Delete a financial statement note
  router.delete("/notes/:code", async (req, res) => {
    try {
      const { code } = req.params;

      // Check if any account codes are using this note
      const usageCheck = await pool.query(
        `SELECT COUNT(*) FROM account_codes WHERE fs_note = $1`,
        [code]
      );

      if (parseInt(usageCheck.rows[0].count) > 0) {
        return res.status(400).json({
          message: `Cannot delete note: ${usageCheck.rows[0].count} account codes are using this note`,
        });
      }

      const result = await pool.query(
        `DELETE FROM financial_statement_notes WHERE code = $1 RETURNING *`,
        [code]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Note not found" });
      }

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting financial statement note:", error);
      res.status(500).json({
        message: "Error deleting financial statement note",
        error: error.message,
      });
    }
  });

  // ==================== ASSIGN NOTES TO ACCOUNT CODES ====================

  // POST /assign-notes - Bulk assign fs_note to account codes
  router.post("/assign-notes", async (req, res) => {
    const client = await pool.connect();
    try {
      const { assignments } = req.body;

      if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({
          message: "assignments array is required with format [{ code, fs_note }, ...]",
        });
      }

      await client.query("BEGIN");

      let updatedCount = 0;
      const errors = [];

      for (const { code, fs_note } of assignments) {
        if (!code) {
          errors.push({ code, error: "code is required" });
          continue;
        }

        // Validate fs_note exists if provided
        if (fs_note) {
          const noteCheck = await client.query(
            `SELECT code FROM financial_statement_notes WHERE code = $1`,
            [fs_note]
          );
          if (noteCheck.rows.length === 0) {
            errors.push({ code, error: `Note '${fs_note}' does not exist` });
            continue;
          }
        }

        const result = await client.query(
          `UPDATE account_codes SET fs_note = $1, updated_at = CURRENT_TIMESTAMP WHERE code = $2`,
          [fs_note || null, code]
        );

        if (result.rowCount > 0) {
          updatedCount++;
        } else {
          errors.push({ code, error: "Account code not found" });
        }
      }

      await client.query("COMMIT");

      res.json({
        message: `Updated ${updatedCount} account codes`,
        updated: updatedCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error assigning notes:", error);
      res.status(500).json({
        message: "Error assigning notes",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // GET /account-codes-with-notes - Get account codes with their notes
  router.get("/account-codes-with-notes", async (req, res) => {
    try {
      const { ledger_type, has_note } = req.query;

      let query = `
        SELECT ac.code, ac.description, ac.ledger_type, ac.fs_note,
               fsn.name as note_name, fsn.category as note_category
        FROM account_codes ac
        LEFT JOIN financial_statement_notes fsn ON ac.fs_note = fsn.code
        WHERE ac.is_active = true
      `;
      const params = [];
      let paramIndex = 1;

      if (ledger_type) {
        query += ` AND ac.ledger_type = $${paramIndex}`;
        params.push(ledger_type);
        paramIndex++;
      }

      if (has_note === "true") {
        query += ` AND ac.fs_note IS NOT NULL`;
      } else if (has_note === "false") {
        query += ` AND ac.fs_note IS NULL`;
      }

      query += ` ORDER BY ac.ledger_type, ac.code`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching account codes with notes:", error);
      res.status(500).json({
        message: "Error fetching account codes with notes",
        error: error.message,
      });
    }
  });

  // ==================== CLOSING STOCK (V3) ====================

  // GET /closing-stock/:year/:month - the confirmed month-end closing-stock
  // values keyed on the Material Stock page (null = not keyed). Injected into
  // the BS/IS/CoGM at report level; never part of the GL.
  router.get("/closing-stock/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;
      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const { map } = await getClosingStockValues(validation.year, validation.month);
      const values = {};
      for (const note of CLOSING_STOCK_NOTES) {
        values[note] = map[note] ? map[note].amount : null;
      }

      res.json({ year: validation.year, month: validation.month, values });
    } catch (error) {
      console.error("Error fetching closing stock values:", error);
      res.status(500).json({
        message: "Error fetching closing stock values",
        error: error.message,
      });
    }
  });

  // PUT /closing-stock/:year/:month - confirm all three month-end values at
  // once. Body: { values: { "14-1": number, "14-2": number, "14-3": number } }.
  router.put("/closing-stock/:year/:month", async (req, res) => {
    const client = await pool.connect();
    try {
      const { year, month } = req.params;
      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const values = req.body?.values || {};
      const amounts = {};
      for (const note of CLOSING_STOCK_NOTES) {
        const amount = Number(values[note]);
        if (!Number.isFinite(amount)) {
          return res.status(400).json({
            message: `A finite numeric value is required for closing-stock note ${note}`,
          });
        }
        amounts[note] = Math.round(amount * 100) / 100;
      }

      await client.query("BEGIN");
      for (const note of CLOSING_STOCK_NOTES) {
        await client.query(
          `INSERT INTO closing_stock_values (
             year, month, fs_note, amount, created_by, updated_by
           ) VALUES ($1, $2, $3, $4, $5, $5)
           ON CONFLICT (year, month, fs_note)
           DO UPDATE SET
             amount = EXCLUDED.amount,
             updated_at = CURRENT_TIMESTAMP,
             updated_by = EXCLUDED.updated_by`,
          [validation.year, validation.month, note, amounts[note], req.staffId || null]
        );
      }
      await client.query("COMMIT");

      res.json({
        message: "Closing stock values saved",
        year: validation.year,
        month: validation.month,
        values: amounts,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error saving closing stock values:", error);
      res.status(500).json({
        message: "Error saving closing stock values",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // ==================== TRIAL BALANCE ====================

  // GET /trial-balance/:year/:month - Generate trial balance for a period
  // Date range: YTD from Jan 1 of year to end of selected month.
  // Optional query params: ledger_type, search (code/description/note), hide_zero=true,
  // limit + offset (server-side pagination; omit limit to get every account — PDF export
  // relies on this). Totals always cover the whole trial balance (ledger_type filter only),
  // regardless of search/hide_zero/pagination.
  router.get("/trial-balance/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;
      const { ledger_type, search, hide_zero, limit, offset } = req.query;

      // Validate year/month parameters
      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      // Calculate YTD period: Jan 1 to end of selected month
      const { startStr: periodStartStr, endStr: periodEndStr } = getYtdPeriod(
        validation.year,
        validation.month
      );

      // Shared CTE: every active account with an applicable opening anchor or
      // posted movement in its account-specific reporting window.
      const baseParams = [periodStartStr, periodEndStr];
      let ledgerFilter = "";
      if (ledger_type) {
        baseParams.push(ledger_type);
        ledgerFilter = ` AND ac.ledger_type = $${baseParams.length}`;
      }

      // TD customer debtor children collapse into ONE "Trade Debtors" row so
      // the trial balance stays concise; filtering ledger_type=TD itemizes
      // every customer child instead.
      const groupTd = ledger_type !== "TD";
      const baseCte = `
        WITH RECURSIVE ${EFFECTIVE_FS_NOTES_CTES},
        ${ANCHORED_ACCOUNT_BALANCES_CTES},
        raw_accounts AS (
          SELECT
            ac.code,
            ac.description,
            ac.ledger_type,
            efn.fs_note,
            fsn.name as note_name,
            GREATEST(ab.net, 0) as total_debit,
            GREATEST(-ab.net, 0) as total_credit,
            CASE
              WHEN fsn.normal_balance = 'credit' THEN -ab.net
              ELSE ab.net
            END as balance,
            ab.net
          FROM account_balances ab
          JOIN account_codes ac ON ac.code = ab.code
          LEFT JOIN effective_fs_notes efn ON efn.code = ac.code
          LEFT JOIN financial_statement_notes fsn ON fsn.code = efn.fs_note
          WHERE ac.is_active = true${ledgerFilter}
        ),
        active_accounts AS (
          ${
            groupTd
              ? `SELECT * FROM raw_accounts WHERE ledger_type IS DISTINCT FROM 'TD'
                 UNION ALL
                 SELECT 'DEBTOR' as code,
                        'TRADE DEBTORS (per-customer subledger)' as description,
                        'TD' as ledger_type,
                        MIN(fs_note) as fs_note,
                        MIN(note_name) as note_name,
                        SUM(total_debit) as total_debit,
                        SUM(total_credit) as total_credit,
                        SUM(balance) as balance,
                        SUM(net) as net
                   FROM raw_accounts WHERE ledger_type = 'TD'
                 HAVING COUNT(*) > 0`
              : `SELECT * FROM raw_accounts`
          }
        )
      `;

      // Totals over the full (unpaginated, unsearched) trial balance
      const totalsQuery = `
        ${baseCte}
        SELECT
          COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0) as total_debit,
          COALESCE(SUM(CASE WHEN net < 0 THEN -net ELSE 0 END), 0) as total_credit
        FROM active_accounts
      `;
      const totalsResult = await pool.query(totalsQuery, baseParams);
      const totalDebit = parseFloat(totalsResult.rows[0].total_debit);
      const totalCredit = parseFloat(totalsResult.rows[0].total_credit);

      // Paginated account rows (search + hide-zero applied here)
      const rowParams = [...baseParams];
      let rowsQuery = `
        ${baseCte}
        SELECT *, COUNT(*) OVER() as full_count
        FROM active_accounts
        WHERE 1=1
      `;

      if (search) {
        // Escape ILIKE wildcards so e.g. "CR_" matches literally, not "CR + any char"
        const escaped = String(search).replace(/[\\%_]/g, (m) => `\\${m}`);
        rowParams.push(`%${escaped}%`);
        rowsQuery += ` AND (code ILIKE $${rowParams.length} OR description ILIKE $${rowParams.length} OR fs_note ILIKE $${rowParams.length})`;
      }

      if (hide_zero === "true") {
        rowsQuery += ` AND ABS(net) > 0.001`;
      }

      rowsQuery += ` ORDER BY ledger_type, code`;

      const limitNum = parseInt(limit);
      const offsetNum = parseInt(offset) || 0;
      if (!isNaN(limitNum) && limitNum > 0) {
        rowParams.push(limitNum, offsetNum);
        rowsQuery += ` LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`;
      }

      const result = await pool.query(rowsQuery, rowParams);
      const filteredTotal =
        result.rows.length > 0 ? parseInt(result.rows[0].full_count) : 0;

      const accounts = result.rows.map((row) => {
        const netBalance = parseFloat(row.net);
        return {
          code: row.code,
          description: row.description,
          ledger_type: row.ledger_type,
          fs_note: row.fs_note,
          note_name: row.note_name,
          debit: netBalance > 0 ? netBalance : 0,
          credit: netBalance < 0 ? Math.abs(netBalance) : 0,
          balance: parseFloat(row.balance),
        };
      });

      res.json({
        period: {
          year: validation.year,
          month: validation.month,
          start_date: periodStartStr,
          end_date: periodEndStr,
        },
        accounts,
        pagination: {
          total: filteredTotal,
          limit: !isNaN(limitNum) && limitNum > 0 ? limitNum : null,
          offset: offsetNum,
        },
        totals: {
          debit: totalDebit,
          credit: totalCredit,
          difference: Math.abs(totalDebit - totalCredit),
          is_balanced: Math.abs(totalDebit - totalCredit) < 0.01,
        },
      });
    } catch (error) {
      console.error("Error generating trial balance:", error);
      res.status(500).json({
        message: "Error generating trial balance",
        error: error.message,
      });
    }
  });

  // ==================== INCOME STATEMENT ====================

  // GET /income-statement/:year/:month - Generate income statement for a period
  // Date range: YTD from Jan 1 of year to end of selected month
  router.get("/income-statement/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;

      // Validate year/month parameters
      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      // Calculate YTD period: Jan 1 to end of selected month
      const { startStr: periodStartStr, endStr: periodEndStr } = getYtdPeriod(
        validation.year,
        validation.month
      );

      // Get balances grouped by effective fs_note for the YTD period
      const query = `
        WITH RECURSIVE ${EFFECTIVE_FS_NOTES_CTES},
        ${EXACT_FISCAL_OPENING_STOCK_CTE},
        period_activity AS (
          SELECT
            efn.fs_note,
            SUM(COALESCE(jel.debit_amount, 0)) as total_debit,
            SUM(COALESCE(jel.credit_amount, 0)) as total_credit
          FROM journal_entry_lines jel
          JOIN journal_entries je ON jel.journal_entry_id = je.id
          JOIN effective_fs_notes efn ON jel.account_code = efn.code
          WHERE je.status = 'posted'
            AND je.entry_date BETWEEN $1 AND $2
          GROUP BY efn.fs_note
          UNION ALL
          SELECT fs_note, total_debit, total_credit
          FROM fiscal_opening_stock
        ),
        period_balances AS (
          SELECT
            fs_note,
            SUM(total_debit) AS total_debit,
            SUM(total_credit) AS total_credit
          FROM period_activity
          GROUP BY fs_note
        )
        SELECT
          fsn.code,
          fsn.name,
          fsn.category,
          fsn.report_section,
          fsn.normal_balance,
          fsn.sort_order,
          COALESCE(pb.total_debit, 0) as total_debit,
          COALESCE(pb.total_credit, 0) as total_credit,
          CASE
            WHEN fsn.normal_balance = 'debit' THEN
              COALESCE(pb.total_debit, 0) - COALESCE(pb.total_credit, 0)
            ELSE
              COALESCE(pb.total_credit, 0) - COALESCE(pb.total_debit, 0)
          END as balance
        FROM financial_statement_notes fsn
        LEFT JOIN period_balances pb ON fsn.code = pb.fs_note
        WHERE fsn.report_section IN ('income_statement', 'cogm')
          AND fsn.is_active = true
        ORDER BY fsn.sort_order, fsn.code
      `;

      const result = await pool.query(query, [
        periodStartStr,
        periodEndStr,
        INCOME_STATEMENT_OPENING_STOCK_NOTES,
      ]);

      const closingStock = await getClosingStockValues(
        validation.year,
        validation.month
      );

      // Organize into sections
      const revenue = [];
      const expenses = [];
      const cogs = [];
      let totalRevenue = 0;
      let totalExpenses = 0;
      let totalCogs = 0;

      for (const row of result.rows) {
        const item = {
          note: row.code,
          name: row.name,
          amount: parseFloat(row.balance),
        };

        if (row.category === "revenue") {
          revenue.push(item);
          totalRevenue += item.amount;
        } else if (row.category === "expense") {
          expenses.push(item);
          totalExpenses += item.amount;
        } else if (row.category === "cogs") {
          cogs.push(item);
          totalCogs += item.amount;
        }
      }

      // V3: inject the keyed month-end closing stock as the "LESS: CLOSING
      // INVENTORIES" deductions. Finished goods (14-1) prints as its own IS
      // line; raw/packing (14-2/14-3) reach the IS through the CoGM total,
      // whose notes are bucketed into this COGS section — so all three are
      // deducted here. Report-level only; the GL never carries closing stock.
      for (const note of CLOSING_STOCK_NOTES) {
        if (closingStock.map[note]) {
          const amount = closingStock.map[note].amount;
          cogs.push({ note, name: closingStock.map[note].name, amount: -amount });
          totalCogs -= amount;
        }
      }

      const grossProfit = totalRevenue - totalCogs;
      const netProfit = grossProfit - totalExpenses;

      res.json({
        period: {
          year: validation.year,
          month: validation.month,
          start_date: periodStartStr,
          end_date: periodEndStr,
        },
        revenue: {
          items: revenue,
          total: totalRevenue,
        },
        cost_of_goods_sold: {
          items: cogs,
          total: totalCogs,
        },
        gross_profit: grossProfit,
        expenses: {
          items: expenses,
          total: totalExpenses,
        },
        net_profit: netProfit,
      });
    } catch (error) {
      console.error("Error generating income statement:", error);
      res.status(500).json({
        message: "Error generating income statement",
        error: error.message,
      });
    }
  });

  // ==================== BALANCE SHEET ====================

  // GET /balance-sheet/:year/:month - Generate balance sheet as of period end
  router.get("/balance-sheet/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;

      // Validate year/month parameters
      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const { startStr: periodStartStr, endStr: periodEndStr } = getYtdPeriod(
        validation.year,
        validation.month
      );

      // Balance Sheet notes use each account's latest applicable opening
      // anchor plus subsequent posted movement. Current Year Profit follows
      // the Income Statement: exact fiscal-year opening stock plus posted YTD
      // movement. Later checkpoint anchors do not replace fiscal opening stock.
      const query = `
        WITH RECURSIVE ${EFFECTIVE_FS_NOTES_CTES},
        ${ANCHORED_ACCOUNT_BALANCES_CTES},
        ${EXACT_FISCAL_OPENING_STOCK_CTE},
        statement_balances AS (
          SELECT
            efn.fs_note,
            SUM(CASE WHEN ab.net > 0 THEN ab.net ELSE 0 END) AS total_debit,
            SUM(CASE WHEN ab.net < 0 THEN -ab.net ELSE 0 END) AS total_credit,
            SUM(ab.net) AS net
          FROM account_balances ab
          JOIN effective_fs_notes efn ON efn.code = ab.code
          GROUP BY efn.fs_note
        ),
        pnl_activity AS (
          SELECT
            efn.fs_note,
            SUM(
              COALESCE(jel.debit_amount, 0)
              - COALESCE(jel.credit_amount, 0)
            ) AS net
          FROM journal_entry_lines jel
          JOIN journal_entries je ON je.id = jel.journal_entry_id
          JOIN effective_fs_notes efn ON efn.code = jel.account_code
          WHERE je.status = 'posted'
            AND je.entry_date >= $1
            AND je.entry_date <= $2
          GROUP BY efn.fs_note
          UNION ALL
          SELECT fs_note, net
          FROM fiscal_opening_stock
        ),
        pnl_movements AS (
          SELECT fs_note, SUM(net) AS net
          FROM pnl_activity
          GROUP BY fs_note
        ),
        current_year_profit AS (
          SELECT COALESCE(
            SUM(
              CASE
                WHEN fsn.category = 'revenue' THEN
                  CASE
                    WHEN fsn.normal_balance = 'debit' THEN COALESCE(pm.net, 0)
                    ELSE -COALESCE(pm.net, 0)
                  END
                WHEN fsn.category IN ('expense', 'cogs') THEN
                  -(CASE
                    WHEN fsn.normal_balance = 'debit' THEN COALESCE(pm.net, 0)
                    ELSE -COALESCE(pm.net, 0)
                  END)
                ELSE 0
              END
            ),
            0
          ) AS balance
          FROM financial_statement_notes fsn
          LEFT JOIN pnl_movements pm ON pm.fs_note = fsn.code
          WHERE fsn.report_section IN ('income_statement', 'cogm')
            AND fsn.is_active = true
        )
        SELECT
          fsn.code,
          fsn.name,
          fsn.category,
          fsn.report_section,
          fsn.normal_balance,
          fsn.sort_order,
          COALESCE(sb.total_debit, 0) as total_debit,
          COALESCE(sb.total_credit, 0) as total_credit,
          CASE
            WHEN fsn.normal_balance = 'credit' THEN -COALESCE(sb.net, 0)
            ELSE COALESCE(sb.net, 0)
          END as balance
        FROM financial_statement_notes fsn
        LEFT JOIN statement_balances sb ON sb.fs_note = fsn.code
        WHERE fsn.report_section = 'balance_sheet'
          AND fsn.is_active = true
        UNION ALL
        SELECT
          NULL::varchar AS code,
          'Current Year Profit'::varchar AS name,
          'equity'::varchar AS category,
          'balance_sheet'::varchar AS report_section,
          'credit'::varchar AS normal_balance,
          2147483647::integer AS sort_order,
          0::numeric AS total_debit,
          0::numeric AS total_credit,
          cyp.balance
        FROM current_year_profit cyp
        ORDER BY sort_order, code
      `;

      const result = await pool.query(query, [
        periodStartStr,
        periodEndStr,
        INCOME_STATEMENT_OPENING_STOCK_NOTES,
      ]);

      const closingStock = await getClosingStockValues(
        validation.year,
        validation.month
      );

      // Organize into sections
      const assets = { current: [], non_current: [] };
      const liabilities = { current: [], non_current: [] };
      const equity = [];
      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquity = 0;

      // Classify assets as current or non-current based on note codes
      const nonCurrentAssetNotes = ["4"]; // Property, Plant & Equipment
      // Classify liabilities as current or non-current
      const nonCurrentLiabilityNotes = ["11", "16"]; // Term Loans, Hire Purchase Payable

      for (const row of result.rows) {
        const item = {
          note: row.code,
          name: row.name,
          amount: parseFloat(row.balance),
        };

        // V3 report-level closing-stock injection. The GL is pinned at zero
        // for the 14-* notes (63 explicit zero CS anchors, no movement — the
        // legacy-parity harness gates this), so adding the keyed value is an
        // exact override, never a double count. Current Year Profit (the
        // code-less synthetic row) absorbs the same total, which keeps the
        // Balance Sheet balanced against the inventory lines.
        if (row.code === null) {
          item.amount += closingStock.total;
        } else if (closingStock.map[row.code]) {
          item.amount += closingStock.map[row.code].amount;
        }

        if (row.category === "asset") {
          if (nonCurrentAssetNotes.includes(row.code)) {
            assets.non_current.push(item);
          } else {
            assets.current.push(item);
          }
          totalAssets += item.amount;
        } else if (row.category === "liability") {
          if (nonCurrentLiabilityNotes.includes(row.code)) {
            liabilities.non_current.push(item);
          } else {
            liabilities.current.push(item);
          }
          totalLiabilities += item.amount;
        } else if (row.category === "equity") {
          equity.push(item);
          totalEquity += item.amount;
        }
      }

      res.json({
        period: {
          year: validation.year,
          month: validation.month,
          start_date: periodStartStr,
          as_of_date: periodEndStr,
        },
        assets: {
          current: {
            items: assets.current,
            total: assets.current.reduce((sum, item) => sum + item.amount, 0),
          },
          non_current: {
            items: assets.non_current,
            total: assets.non_current.reduce((sum, item) => sum + item.amount, 0),
          },
          total: totalAssets,
        },
        liabilities: {
          current: {
            items: liabilities.current,
            total: liabilities.current.reduce((sum, item) => sum + item.amount, 0),
          },
          non_current: {
            items: liabilities.non_current,
            total: liabilities.non_current.reduce((sum, item) => sum + item.amount, 0),
          },
          total: totalLiabilities,
        },
        equity: {
          items: equity,
          total: totalEquity,
        },
        totals: {
          total_assets: totalAssets,
          total_liabilities_equity: totalLiabilities + totalEquity,
          is_balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
        },
      });
    } catch (error) {
      console.error("Error generating balance sheet:", error);
      res.status(500).json({
        message: "Error generating balance sheet",
        error: error.message,
      });
    }
  });

  // ==================== COST OF GOODS MANUFACTURED ====================

  // GET /cogm/:year/:month - Generate Cost of Goods Manufactured report
  // Date range: YTD from Jan 1 of year to end of selected month
  router.get("/cogm/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;

      // Validate year/month parameters
      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      // Calculate YTD period: Jan 1 to end of selected month
      const { startStr: periodStartStr, endStr: periodEndStr } =
        getYtdPeriod(validation.year, validation.month);

      // Get COGM-related balances grouped by effective fs_note
      const query = `
        WITH RECURSIVE ${EFFECTIVE_FS_NOTES_CTES},
        ${EXACT_FISCAL_OPENING_STOCK_CTE},
        period_activity AS (
          SELECT
            efn.fs_note,
            SUM(COALESCE(jel.debit_amount, 0)) as total_debit,
            SUM(COALESCE(jel.credit_amount, 0)) as total_credit
          FROM journal_entry_lines jel
          JOIN journal_entries je ON jel.journal_entry_id = je.id
          JOIN effective_fs_notes efn ON jel.account_code = efn.code
          WHERE je.status = 'posted'
            AND je.entry_date BETWEEN $1 AND $2
          GROUP BY efn.fs_note
          UNION ALL
          SELECT fs_note, total_debit, total_credit
          FROM fiscal_opening_stock
        ),
        period_balances AS (
          SELECT
            fs_note,
            SUM(total_debit) AS total_debit,
            SUM(total_credit) AS total_credit
          FROM period_activity
          GROUP BY fs_note
        )
        SELECT
          fsn.code,
          fsn.name,
          fsn.category,
          fsn.sort_order,
          fsn.normal_balance,
          COALESCE(pb.total_debit, 0) as total_debit,
          COALESCE(pb.total_credit, 0) as total_credit,
          CASE
            WHEN fsn.normal_balance = 'debit' THEN
              COALESCE(pb.total_debit, 0) - COALESCE(pb.total_credit, 0)
            ELSE
              COALESCE(pb.total_credit, 0) - COALESCE(pb.total_debit, 0)
          END as balance
        FROM financial_statement_notes fsn
        LEFT JOIN period_balances pb ON fsn.code = pb.fs_note
        WHERE fsn.report_section = 'cogm'
          AND fsn.is_active = true
        ORDER BY fsn.sort_order, fsn.code
      `;

      const result = await pool.query(query, [
        periodStartStr,
        periodEndStr,
        COGM_OPENING_STOCK_NOTES,
      ]);

      const closingStock = await getClosingStockValues(
        validation.year,
        validation.month
      );

      // Categorize COGM items
      const rawMaterials = [];
      const packingMaterials = [];
      const laborCosts = [];
      const otherCosts = [];

      let totalRawMaterials = 0;
      let totalPackingMaterials = 0;
      let totalLaborCosts = 0;
      let totalOtherCosts = 0;

      for (const row of result.rows) {
        const item = {
          note: row.code,
          name: row.name,
          amount: parseFloat(row.balance),
        };

        // Categorize based on note codes
        if (["3-3", "3-4", "3-5"].includes(row.code)) {
          // Raw Materials: Opening Stock, Purchase of Chemical, Purchase of Raw Material
          rawMaterials.push(item);
          totalRawMaterials += item.amount;
        } else if (["3-2", "3-7"].includes(row.code)) {
          // Packing Materials: Purchases, Opening Stock
          packingMaterials.push(item);
          totalPackingMaterials += item.amount;
        } else if (["5-1"].includes(row.code)) {
          // Labor Costs: Factory Worker Salaries
          laborCosts.push(item);
          totalLaborCosts += item.amount;
        } else {
          // Other costs: Opening Stock (Finished Products), Freight & Transportation, etc.
          otherCosts.push(item);
          totalOtherCosts += item.amount;
        }
      }

      // V3: inject the keyed month-end closing stock for raw and packing
      // materials as the "LESS: CLOSING INVENTORIES" deductions. Report-level
      // only; the GL never carries closing stock.
      if (closingStock.map["14-2"]) {
        const amount = closingStock.map["14-2"].amount;
        rawMaterials.push({ note: "14-2", name: closingStock.map["14-2"].name, amount: -amount });
        totalRawMaterials -= amount;
      }
      if (closingStock.map["14-3"]) {
        const amount = closingStock.map["14-3"].amount;
        packingMaterials.push({ note: "14-3", name: closingStock.map["14-3"].name, amount: -amount });
        totalPackingMaterials -= amount;
      }

      const totalCogm = totalRawMaterials + totalPackingMaterials + totalLaborCosts + totalOtherCosts;

      res.json({
        period: {
          year: validation.year,
          month: validation.month,
          start_date: periodStartStr,
          end_date: periodEndStr,
        },
        raw_materials: {
          items: rawMaterials,
          total: totalRawMaterials,
        },
        packing_materials: {
          items: packingMaterials,
          total: totalPackingMaterials,
        },
        labor_costs: {
          items: laborCosts,
          total: totalLaborCosts,
        },
        other_costs: {
          items: otherCosts,
          total: totalOtherCosts,
        },
        total_cogm: totalCogm,
      });
    } catch (error) {
      console.error("Error generating COGM report:", error);
      res.status(500).json({
        message: "Error generating COGM report",
        error: error.message,
      });
    }
  });

  return router;
}
