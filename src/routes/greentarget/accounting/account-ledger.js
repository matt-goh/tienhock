// src/routes/greentarget/accounting/account-ledger.js
//
// Green Target Account Ledger / Bank Statement routes (phase G5). Thin HTTP
// wrappers around ./report-engine.js.
//
// Mounted at /greentarget/api/bank-statement (src/routes/index.js) so the
// contract matches Tien Hock's path segment for segment and G6 can point the
// shared page at it with a base-path swap (handover R7). The name mismatch is
// inherited from Tien Hock, where the page is "Account Ledger" and its backend
// is `bank-statement.js`: a GT bank statement is simply this ledger pointed at
// one of the five APPX-19 `BK` accounts. There is no separate engine.
//
// Read-only. Mutations arrive with G7's posting lock (handover R8).
import { Router } from "express";

import {
  buildAccountLedger,
  listLedgerAccounts,
  getMonthPeriod,
  validateYearMonth,
  isDateString,
} from "./report-engine.js";

/**
 * @param {import("pg").Pool} pool
 * @returns {import("express").Router}
 */
export default function createGreenTargetAccountLedgerRouter(pool) {
  const router = Router();

  // GET /accounts — every GT account with its posted-line count, in printed
  // Trial Balance order. Drives the ledger's account picker and its
  // "most used first" ranking in one call.
  router.get("/accounts", async (_req, res) => {
    try {
      res.json(await listLedgerAccounts(pool));
    } catch (error) {
      console.error("Error fetching Green Target ledger accounts:", error);
      res.status(500).json({
        message: "Error fetching Green Target ledger accounts",
        error: error.message,
      });
    }
  });

  // GET /:accountCode/range/:start/:end — arbitrary inclusive date range
  router.get("/:accountCode/range/:start/:end", async (req, res) => {
    try {
      const { accountCode, start, end } = req.params;
      if (!isDateString(start) || !isDateString(end)) {
        return res.status(400).json({ message: "Dates must be yyyy-MM-dd" });
      }
      if (start > end) {
        return res.status(400).json({ message: "start must be on or before end" });
      }

      const ledger = await buildAccountLedger(pool, accountCode, start, end);
      res.json({
        ...ledger,
        period: {
          mode: "range",
          year: parseInt(start.slice(0, 4), 10),
          month: parseInt(start.slice(5, 7), 10),
          start_date: start,
          end_date: end,
        },
      });
    } catch (error) {
      if (error.status === 404) {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error generating Green Target account ledger range:", error);
      res.status(500).json({
        message: "Error generating Green Target account ledger",
        error: error.message,
      });
    }
  });

  // GET /:accountCode/:year/:month — running ledger for one calendar month
  router.get("/:accountCode/:year/:month", async (req, res) => {
    try {
      const { accountCode, year, month } = req.params;
      const validation = validateYearMonth(year, month);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      const { startStr, endStr } = getMonthPeriod(validation.year, validation.month);
      const ledger = await buildAccountLedger(pool, accountCode, startStr, endStr);
      res.json({
        ...ledger,
        period: {
          mode: "month",
          year: validation.year,
          month: validation.month,
          start_date: startStr,
          end_date: endStr,
        },
      });
    } catch (error) {
      if (error.status === 404) {
        return res.status(404).json({ message: error.message });
      }
      console.error("Error generating Green Target bank statement:", error);
      res.status(500).json({
        message: "Error generating Green Target bank statement",
        error: error.message,
      });
    }
  });

  return router;
}
