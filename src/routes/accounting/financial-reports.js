// src/routes/accounting/financial-reports.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

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

  // ==================== INVOICE-BASED CALCULATIONS ====================

  /**
   * Calculate Trade Receivables (Note 22) - cumulative outstanding as of period end
   * Returns the sum of balance_due from all unpaid/overdue invoices created up to the end date
   * @param {number} endDateTs - End date as milliseconds timestamp
   */
  const getTradeReceivables = async (endDateTs) => {
    const query = `
      SELECT COALESCE(SUM(balance_due), 0) as total
      FROM invoices
      WHERE invoice_status IN ('Unpaid', 'Overdue')
        AND balance_due > 0.01
        AND createddate::bigint <= $1
    `;
    const result = await pool.query(query, [endDateTs]);
    return parseFloat(result.rows[0]?.total || 0);
  };

  /**
   * Calculate Revenue (Note 7) - YTD from Jan 1 of year to period end
   * Returns the sum of total_excluding_tax from all invoices in the period
   * @param {number} year - The year
   * @param {number} endDateTs - End date as milliseconds timestamp
   */
  const getRevenue = async (year, endDateTs) => {
    const startOfYearTs = new Date(year, 0, 1).getTime(); // Jan 1
    const query = `
      SELECT COALESCE(SUM(total_excluding_tax), 0) as total
      FROM invoices
      WHERE createddate::bigint >= $1
        AND createddate::bigint <= $2
    `;
    const result = await pool.query(query, [startOfYearTs, endDateTs]);
    return parseFloat(result.rows[0]?.total || 0);
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

  // ==================== TRIAL BALANCE ====================

  // GET /trial-balance/:year/:month - Generate trial balance for a period
  // Date range: YTD from Jan 1 of year to end of selected month
  router.get("/trial-balance/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;
      const { ledger_type } = req.query;

      // Validate year/month parameters
      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      // Calculate YTD period: Jan 1 to end of selected month
      const periodStart = new Date(validation.year, 0, 1); // Jan 1
      const periodEnd = new Date(validation.year, validation.month, 0); // Last day of selected month
      const periodStartStr = periodStart.toISOString().split("T")[0];
      const periodEndStr = periodEnd.toISOString().split("T")[0];
      const periodEndTs = new Date(validation.year, validation.month, 0, 23, 59, 59, 999).getTime();

      // Get all account balances from journal entries for YTD period
      let query = `
        WITH account_balances AS (
          SELECT
            jel.account_code,
            SUM(COALESCE(jel.debit_amount, 0)) as total_debit,
            SUM(COALESCE(jel.credit_amount, 0)) as total_credit
          FROM journal_entry_lines jel
          JOIN journal_entries je ON jel.journal_entry_id = je.id
          WHERE je.status = 'posted'
            AND je.entry_date >= $1
            AND je.entry_date <= $2
          GROUP BY jel.account_code
        )
        SELECT
          ac.code,
          ac.description,
          ac.ledger_type,
          ac.fs_note,
          fsn.name as note_name,
          COALESCE(ab.total_debit, 0) as total_debit,
          COALESCE(ab.total_credit, 0) as total_credit,
          CASE
            WHEN fsn.normal_balance = 'debit' THEN
              COALESCE(ab.total_debit, 0) - COALESCE(ab.total_credit, 0)
            ELSE
              COALESCE(ab.total_credit, 0) - COALESCE(ab.total_debit, 0)
          END as balance
        FROM account_codes ac
        LEFT JOIN account_balances ab ON ac.code = ab.account_code
        LEFT JOIN financial_statement_notes fsn ON ac.fs_note = fsn.code
        WHERE ac.is_active = true
          AND (ab.total_debit IS NOT NULL OR ab.total_credit IS NOT NULL)
      `;
      const params = [periodStartStr, periodEndStr];
      let paramIndex = 3;

      if (ledger_type) {
        query += ` AND ac.ledger_type = $${paramIndex}`;
        params.push(ledger_type);
        paramIndex++;
      }

      query += ` ORDER BY ac.ledger_type, ac.code`;

      const result = await pool.query(query, params);

      // Calculate totals - show NET balance in appropriate column
      let totalDebit = 0;
      let totalCredit = 0;

      const accounts = result.rows.map((row) => {
        const totalDebitAmount = parseFloat(row.total_debit);
        const totalCreditAmount = parseFloat(row.total_credit);
        const netBalance = totalDebitAmount - totalCreditAmount;

        // Show net balance in appropriate column
        const debit = netBalance > 0 ? netBalance : 0;
        const credit = netBalance < 0 ? Math.abs(netBalance) : 0;

        totalDebit += debit;
        totalCredit += credit;

        return {
          code: row.code,
          description: row.description,
          ledger_type: row.ledger_type,
          fs_note: row.fs_note,
          note_name: row.note_name,
          debit: debit,
          credit: credit,
          balance: parseFloat(row.balance),
        };
      });

      // Calculate invoice-based values for Note 22 and Note 7
      const tradeReceivables = await getTradeReceivables(periodEndTs);
      const revenue = await getRevenue(validation.year, periodEndTs);

      res.json({
        period: {
          year: validation.year,
          month: validation.month,
          start_date: periodStartStr,
          end_date: periodEndStr,
        },
        accounts,
        totals: {
          debit: totalDebit,
          credit: totalCredit,
          difference: Math.abs(totalDebit - totalCredit),
          is_balanced: Math.abs(totalDebit - totalCredit) < 0.01,
        },
        // Invoice-based values (override journal-based for these notes)
        invoice_based: {
          note_22_trade_receivables: tradeReceivables,
          note_7_revenue: revenue,
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
      const periodStart = new Date(validation.year, 0, 1); // Jan 1
      const periodEnd = new Date(validation.year, validation.month, 0); // Last day of selected month
      const periodStartStr = periodStart.toISOString().split("T")[0];
      const periodEndStr = periodEnd.toISOString().split("T")[0];
      const periodEndTs = new Date(validation.year, validation.month, 0, 23, 59, 59, 999).getTime();

      // Get balances grouped by fs_note for the YTD period
      const query = `
        WITH period_balances AS (
          SELECT
            ac.fs_note,
            SUM(COALESCE(jel.debit_amount, 0)) as total_debit,
            SUM(COALESCE(jel.credit_amount, 0)) as total_credit
          FROM journal_entry_lines jel
          JOIN journal_entries je ON jel.journal_entry_id = je.id
          JOIN account_codes ac ON jel.account_code = ac.code
          WHERE je.status = 'posted'
            AND je.entry_date BETWEEN $1 AND $2
            AND ac.fs_note IS NOT NULL
          GROUP BY ac.fs_note
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

      const result = await pool.query(query, [periodStartStr, periodEndStr]);

      // Calculate invoice-based revenue (Note 7)
      const invoiceRevenue = await getRevenue(validation.year, periodEndTs);

      // Organize into sections
      const revenue = [];
      const expenses = [];
      const cogs = [];
      let totalRevenue = 0;
      let totalExpenses = 0;
      let totalCogs = 0;

      for (const row of result.rows) {
        let amount = parseFloat(row.balance);

        // Override Note 7 (Revenue/Sales) with invoice-based value
        if (row.code === "7") {
          amount = invoiceRevenue;
        }

        const item = {
          note: row.code,
          name: row.name,
          amount: amount,
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
  // Date range: YTD from Jan 1 of year to end of selected month
  router.get("/balance-sheet/:year/:month", async (req, res) => {
    try {
      const { year, month } = req.params;

      // Validate year/month parameters
      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      // Calculate YTD period: Jan 1 to end of selected month
      const periodStart = new Date(validation.year, 0, 1); // Jan 1
      const periodEnd = new Date(validation.year, validation.month, 0); // Last day of selected month
      const periodStartStr = periodStart.toISOString().split("T")[0];
      const periodEndStr = periodEnd.toISOString().split("T")[0];
      const periodEndTs = new Date(validation.year, validation.month, 0, 23, 59, 59, 999).getTime();

      // Get YTD balances grouped by fs_note
      const query = `
        WITH ytd_balances AS (
          SELECT
            ac.fs_note,
            SUM(COALESCE(jel.debit_amount, 0)) as total_debit,
            SUM(COALESCE(jel.credit_amount, 0)) as total_credit
          FROM journal_entry_lines jel
          JOIN journal_entries je ON jel.journal_entry_id = je.id
          JOIN account_codes ac ON jel.account_code = ac.code
          WHERE je.status = 'posted'
            AND je.entry_date >= $1
            AND je.entry_date <= $2
            AND ac.fs_note IS NOT NULL
          GROUP BY ac.fs_note
        )
        SELECT
          fsn.code,
          fsn.name,
          fsn.category,
          fsn.report_section,
          fsn.normal_balance,
          fsn.sort_order,
          COALESCE(yb.total_debit, 0) as total_debit,
          COALESCE(yb.total_credit, 0) as total_credit,
          CASE
            WHEN fsn.normal_balance = 'debit' THEN
              COALESCE(yb.total_debit, 0) - COALESCE(yb.total_credit, 0)
            ELSE
              COALESCE(yb.total_credit, 0) - COALESCE(yb.total_debit, 0)
          END as balance
        FROM financial_statement_notes fsn
        LEFT JOIN ytd_balances yb ON fsn.code = yb.fs_note
        WHERE fsn.report_section = 'balance_sheet'
          AND fsn.is_active = true
        ORDER BY fsn.sort_order, fsn.code
      `;

      const result = await pool.query(query, [periodStartStr, periodEndStr]);

      // Calculate invoice-based trade receivables (Note 22)
      const tradeReceivables = await getTradeReceivables(periodEndTs);

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
        let amount = parseFloat(row.balance);

        // Override Note 22 (Trade Receivables) with invoice-based value
        if (row.code === "22") {
          amount = tradeReceivables;
        }

        const item = {
          note: row.code,
          name: row.name,
          amount: amount,
        };

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
      const periodStart = new Date(validation.year, 0, 1); // Jan 1
      const periodEnd = new Date(validation.year, validation.month, 0); // Last day of selected month
      const periodStartStr = periodStart.toISOString().split("T")[0];
      const periodEndStr = periodEnd.toISOString().split("T")[0];

      // Get COGM-related balances
      const query = `
        WITH period_balances AS (
          SELECT
            ac.fs_note,
            SUM(COALESCE(jel.debit_amount, 0)) as total_debit,
            SUM(COALESCE(jel.credit_amount, 0)) as total_credit
          FROM journal_entry_lines jel
          JOIN journal_entries je ON jel.journal_entry_id = je.id
          JOIN account_codes ac ON jel.account_code = ac.code
          WHERE je.status = 'posted'
            AND je.entry_date BETWEEN $1 AND $2
            AND ac.fs_note IS NOT NULL
          GROUP BY ac.fs_note
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

      const result = await pool.query(query, [periodStartStr, periodEndStr]);

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
