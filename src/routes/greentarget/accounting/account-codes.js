// src/routes/greentarget/accounting/account-codes.js
//
// Green Target Account Code + Ledger Type routes (phase G6). Read-only clones
// of Tien Hock's `src/routes/accounting/account-codes.js` (flat list) and
// `src/routes/accounting/ledger-types.js` (list), pointing at the
// `greentarget` schema, with response payloads kept field-for-field
// compatible so the shared accounting pages and `useAccountCodesCache` /
// `useLedgerTypesCache` work unchanged on a base-path swap (handover R7).
//
// GT's chart is flat except the DEBTOR control + its 28 children, and its
// sort_order IS the printed Trial Balance line number, so the flat list is
// served in printed order. fs_note is a real FK here (unlike TH), so the
// note name is joined straight from greentarget.financial_statement_notes.
// Mutations arrive with G7's posting lock (handover R8).
import { Router } from "express";

/**
 * @param {import("pg").Pool} pool
 * @returns {import("express").Router}
 */
export default function createGreenTargetAccountCodesRouter(pool) {
  const router = Router();

  // GET / - All GT account codes. ?flat=true returns the flat list in printed
  // Trial Balance order (the shape useAccountCodesCache consumes); without it
  // the same tree structure Tien Hock builds is returned. Supports TH's
  // search / ledger_type / is_active / parent_code filters.
  router.get("/", async (req, res) => {
    try {
      const { search, ledger_type, is_active, parent_code, flat } = req.query;

      const whereClauses = ["1=1"];
      const params = [];
      let paramIndex = 1;

      if (search) {
        whereClauses.push(
          `(ac.code ILIKE $${paramIndex} OR ac.description ILIKE $${paramIndex})`
        );
        params.push(`%${search}%`);
        paramIndex++;
      }

      if (ledger_type) {
        whereClauses.push(`ac.ledger_type = $${paramIndex}`);
        params.push(ledger_type);
        paramIndex++;
      }

      if (is_active !== undefined && is_active !== "") {
        whereClauses.push(`ac.is_active = $${paramIndex}`);
        params.push(is_active === "true" || is_active === true);
        paramIndex++;
      }

      if (parent_code) {
        if (parent_code === "null" || parent_code === "root") {
          whereClauses.push("ac.parent_code IS NULL");
        } else {
          whereClauses.push(`ac.parent_code = $${paramIndex}`);
          params.push(parent_code);
          paramIndex++;
        }
      }

      const whereSql = whereClauses.join(" AND ");
      const query = `
        SELECT
          ac.id, ac.code, ac.description, ac.ledger_type, ac.parent_code,
          ac.level, ac.sort_order, ac.is_active, ac.is_system, ac.notes,
          ac.fs_note, fsn.name AS fs_note_name,
          ac.created_at, ac.updated_at
        FROM greentarget.account_codes ac
        LEFT JOIN greentarget.financial_statement_notes fsn
          ON fsn.code = ac.fs_note
        WHERE ${whereSql}
        ORDER BY ac.sort_order, ac.code
      `;

      const result = await pool.query(query, params);

      if (flat === "true") {
        res.json(result.rows);
      } else {
        res.json(buildAccountTree(result.rows));
      }
    } catch (error) {
      console.error("Error fetching Green Target account codes:", error);
      res.status(500).json({
        message: "Error fetching Green Target account codes",
        error: error.message,
      });
    }
  });

  return router;
}

/**
 * Ledger types, mounted separately at /greentarget/api/ledger-types.
 *
 * @param {import("pg").Pool} pool
 * @returns {import("express").Router}
 */
export function createGreenTargetLedgerTypesRouter(pool) {
  const router = Router();

  // GET / - All GT ledger types (TH list shape)
  router.get("/", async (req, res) => {
    try {
      const { is_active } = req.query;

      let query = `
        SELECT code, name, description, is_system, is_active, created_at, updated_at
        FROM greentarget.ledger_types
        WHERE 1=1
      `;
      const params = [];

      if (is_active !== undefined && is_active !== "") {
        query += ` AND is_active = $1`;
        params.push(is_active === "true" || is_active === true);
      }

      query += ` ORDER BY code`;

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target ledger types:", error);
      res.status(500).json({
        message: "Error fetching Green Target ledger types",
        error: error.message,
      });
    }
  });

  return router;
}

// Same tree builder as Tien Hock's account-codes.js
function buildAccountTree(accounts) {
  const map = new Map();
  const roots = [];

  accounts.forEach((account) => {
    map.set(account.code, { ...account, children: [] });
  });

  accounts.forEach((account) => {
    const node = map.get(account.code);
    if (account.parent_code && map.has(account.parent_code)) {
      map.get(account.parent_code).children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}
