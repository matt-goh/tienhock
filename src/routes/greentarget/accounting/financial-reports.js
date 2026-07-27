// src/routes/greentarget/accounting/financial-reports.js
//
// Green Target financial report routes (phase G5). Thin HTTP wrappers around
// the engines in ./report-engine.js — all the reasoning lives there, so the
// verification harness can import and run the same code these routes serve.
//
// Mounted at /greentarget/api/financial-reports (src/routes/index.js).
//
// Read-only by design. GT's Jan–Jun 2026 ledger is imported legacy evidence and
// nothing may reach it through a screen; the posting lock and any mutating
// endpoints arrive with G7 (handover R8).
import { Router } from "express";

import {
  buildTrialBalance,
  buildIncomeStatement,
  buildBalanceSheet,
  validateYearMonth,
} from "./report-engine.js";

/**
 * @param {import("pg").Pool} pool
 * @returns {import("express").Router}
 */
export default function createGreenTargetFinancialReportsRouter(pool) {
  const router = Router();

  // GET /notes — the GT financial-statement note catalogue. `statement_block`
  // is what drives statement placement; `category` alone cannot express GT's
  // printed layout (see report-engine.js).
  router.get("/notes", async (req, res) => {
    try {
      const { report_section, statement_block } = req.query;
      const params = [];
      let query = `
        SELECT code, name, description, category, report_section, statement_block,
               normal_balance, sort_order, parent_note, is_active,
               created_at, updated_at
          FROM greentarget.financial_statement_notes
         WHERE is_active = true`;

      if (report_section) {
        params.push(report_section);
        query += ` AND report_section = $${params.length}`;
      }
      if (statement_block) {
        params.push(statement_block);
        query += ` AND statement_block = $${params.length}`;
      }
      query += ` ORDER BY sort_order, code`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target financial statement notes:", error);
      res.status(500).json({
        message: "Error fetching Green Target financial statement notes",
        error: error.message,
      });
    }
  });

  // GET /trial-balance/:year/:month — year-to-date, Jan 1 to end of month.
  // Query params: ledger_type, search, hide_zero=true, limit + offset.
  // Omit `limit` to get every account (a PDF export relies on that).
  // Totals always cover the whole trial balance regardless of search, hide_zero
  // or pagination — the `ledger_type` filter is the one thing that changes them.
  router.get("/trial-balance/:year/:month", async (req, res) => {
    try {
      const validation = validateYearMonth(req.params.year, req.params.month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const { ledger_type, search, hide_zero, limit, offset } = req.query;
      const limitNum = parseInt(limit, 10);
      const offsetNum = parseInt(offset, 10);

      const report = await buildTrialBalance(pool, {
        year: validation.year,
        month: validation.month,
        ledgerType: ledger_type || null,
        search: search || null,
        hideZero: hide_zero === "true",
        limit: Number.isInteger(limitNum) && limitNum > 0 ? limitNum : null,
        offset: Number.isInteger(offsetNum) && offsetNum > 0 ? offsetNum : 0,
      });

      res.json(report);
    } catch (error) {
      console.error("Error generating Green Target trial balance:", error);
      res.status(500).json({
        message: "Error generating Green Target trial balance",
        error: error.message,
      });
    }
  });

  // GET /income-statement/:year/:month — YEAR TO DATE (Jan 1 to month end),
  // which is what the legacy printer produces despite its "FOR THE MONTH OF"
  // header. Returns printed blocks in printed order.
  router.get("/income-statement/:year/:month", async (req, res) => {
    try {
      const validation = validateYearMonth(req.params.year, req.params.month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const report = await buildIncomeStatement(pool, {
        year: validation.year,
        month: validation.month,
      });
      res.json(report);
    } catch (error) {
      console.error("Error generating Green Target income statement:", error);
      res.status(500).json({
        message: "Error generating Green Target income statement",
        error: error.message,
      });
    }
  });

  // GET /balance-sheet/:year/:month — as of month end.
  router.get("/balance-sheet/:year/:month", async (req, res) => {
    try {
      const validation = validateYearMonth(req.params.year, req.params.month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const report = await buildBalanceSheet(pool, {
        year: validation.year,
        month: validation.month,
      });
      res.json(report);
    } catch (error) {
      console.error("Error generating Green Target balance sheet:", error);
      res.status(500).json({
        message: "Error generating Green Target balance sheet",
        error: error.message,
      });
    }
  });

  return router;
}
