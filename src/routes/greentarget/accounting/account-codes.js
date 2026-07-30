// src/routes/greentarget/accounting/account-codes.js
//
// Green Target Account Code + Ledger Type routes. The account-code reads clone
// the shared Tien Hock page contract, while POST /, PUT /:code and
// DELETE /:code provide the GT mutation surface: account codes cannot be
// renamed, deletion is guarded like Tien Hock's (system accounts, parents
// with children, and accounts with journal lines or opening anchors are
// blocked), and accounting metadata can be maintained. Every query is
// explicitly schema-qualified so no GT request can touch Tien Hock's chart.
//
// GT's chart is flat except the DEBTOR control + its 28 children, and its
// sort_order IS the printed Trial Balance line number, so the flat list is
// served in printed order. fs_note is a real FK here (unlike TH), so the
// note name is joined straight from greentarget.financial_statement_notes.
// Mutations are protected by session auth + the restore guard at the mount in
// src/routes/index.js. GT's chart requires an active ledger type and financial
// statement note so a newly-created account cannot disappear from reports.
import { Router } from "express";

const ACCOUNT_CODE_PATTERN = /^[A-Z0-9._-]+$/;
const RESERVED_ACCOUNT_CODES = new Set(["NEW", "CHILDREN", ".", ".."]);
const MAX_ACCOUNT_CODE_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 255;
const MAX_INTEGER = 2147483647;

/**
 * Resolve the authenticated actor into the VARCHAR(50) audit columns. API-key
 * calls remain attributable even though they have no staff session.
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

  // GET /children/:parentCode - Direct children used by the shared edit page.
  router.get("/children/:parentCode", async (req, res) => {
    try {
      const { parentCode } = req.params;
      const result = await pool.query(
        `SELECT
           id, code, description, ledger_type, parent_code,
           level, sort_order, is_active, is_system, fs_note
         FROM greentarget.account_codes
         WHERE parent_code = $1
         ORDER BY sort_order, code`,
        [parentCode]
      );

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching Green Target child accounts:", error);
      res.status(500).json({
        message: "Error fetching Green Target child accounts",
        error: error.message,
      });
    }
  });

  // GET /:code/overview - Annual activity for the selected GT account branch.
  // The response shape matches the shared Tien Hock account-code form.
  router.get("/:code/overview", async (req, res) => {
    const { code } = req.params;
    const now = new Date();
    const yearValue = req.query.year || String(now.getFullYear());
    const monthValue = req.query.month || String(now.getMonth() + 1);
    const year = /^\d{4}$/.test(yearValue) ? Number(yearValue) : Number.NaN;
    const month = /^\d{1,2}$/.test(monthValue)
      ? Number(monthValue)
      : Number.NaN;

    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return res.status(400).json({
        message: "Invalid year. Must be between 1900 and 2100.",
      });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({
        message: "Invalid month. Must be between 1 and 12.",
      });
    }

    const yearStart = `${year}-01-01`;
    const nextYearStart = `${year + 1}-01-01`;

    try {
      const [accountResult, childrenResult, activityResult] = await Promise.all([
        pool.query(
          `SELECT
             ac.id, ac.code, ac.description, ac.ledger_type, ac.parent_code,
             ac.level, ac.sort_order, ac.is_active, ac.is_system, ac.notes,
             ac.fs_note, ac.created_at, ac.updated_at,
             lt.name AS ledger_type_name,
             fsn.name AS fs_note_name
           FROM greentarget.account_codes ac
           LEFT JOIN greentarget.ledger_types lt
             ON lt.code = ac.ledger_type
           LEFT JOIN greentarget.financial_statement_notes fsn
             ON fsn.code = ac.fs_note
           WHERE ac.code = $1`,
          [code]
        ),
        pool.query(
          `SELECT
             id, code, description, ledger_type, parent_code, level,
             sort_order, is_active, is_system, notes, fs_note,
             created_at, updated_at
           FROM greentarget.account_codes
           WHERE parent_code = $1
           ORDER BY sort_order, code`,
          [code]
        ),
        pool.query(
          `WITH RECURSIVE account_tree AS (
             SELECT
               ac.code,
               ac.parent_code,
               0::integer AS depth,
               NULL::varchar AS branch_code,
               ARRAY[ac.code::text] AS path
             FROM greentarget.account_codes ac
             WHERE ac.code = $1

             UNION ALL

             SELECT
               child.code,
               child.parent_code,
               parent.depth + 1,
               CASE
                 WHEN parent.depth = 0 THEN child.code
                 ELSE parent.branch_code
               END AS branch_code,
               parent.path || child.code::text
             FROM greentarget.account_codes child
             JOIN account_tree parent ON child.parent_code = parent.code
             WHERE NOT child.code::text = ANY(parent.path)
           ),
           latest_anchors AS (
             SELECT DISTINCT ON (aob.account_code)
               aob.account_code,
               aob.as_of_date,
               aob.amount
             FROM greentarget.account_opening_balances aob
             JOIN account_tree tree ON tree.code = aob.account_code
             WHERE aob.as_of_date <= $2::date
             ORDER BY aob.account_code, aob.as_of_date DESC
           ),
           prior_movements AS (
             SELECT
               jel.account_code,
               je.entry_date,
               COALESCE(jel.debit_amount, 0) -
                 COALESCE(jel.credit_amount, 0) AS net
             FROM greentarget.journal_entry_lines jel
             JOIN greentarget.journal_entries je
               ON je.id = jel.journal_entry_id
             JOIN account_tree tree ON tree.code = jel.account_code
             WHERE je.status = 'posted'
               AND je.entry_date < $2::date
           ),
           opening_by_account AS (
             SELECT
               tree.code,
               tree.branch_code,
               COALESCE(anchor.amount, 0) +
                 COALESCE(
                   SUM(movement.net) FILTER (
                     WHERE anchor.as_of_date IS NULL
                        OR movement.entry_date >= anchor.as_of_date
                   ),
                   0
                 ) AS amount
             FROM account_tree tree
             LEFT JOIN latest_anchors anchor
               ON anchor.account_code = tree.code
             LEFT JOIN prior_movements movement
               ON movement.account_code = tree.code
             GROUP BY
               tree.code,
               tree.branch_code,
               anchor.as_of_date,
               anchor.amount
           ),
           monthly_by_account AS (
             SELECT
               tree.code,
               tree.branch_code,
               EXTRACT(MONTH FROM je.entry_date)::integer AS month,
               COALESCE(SUM(jel.debit_amount), 0) AS debit,
               COALESCE(SUM(jel.credit_amount), 0) AS credit
             FROM account_tree tree
             JOIN greentarget.journal_entry_lines jel
               ON jel.account_code = tree.code
             JOIN greentarget.journal_entries je
               ON je.id = jel.journal_entry_id
             WHERE je.status = 'posted'
               AND je.entry_date >= $2::date
               AND je.entry_date < $3::date
             GROUP BY
               tree.code,
               tree.branch_code,
               EXTRACT(MONTH FROM je.entry_date)
           )
           SELECT
             'opening' AS row_type,
             code,
             branch_code,
             NULL::integer AS month,
             0::numeric AS debit,
             0::numeric AS credit,
             amount AS net
           FROM opening_by_account

           UNION ALL

           SELECT
             'month' AS row_type,
             code,
             branch_code,
             month,
             debit,
             credit,
             debit - credit AS net
           FROM monthly_by_account
           ORDER BY row_type, code, month`,
          [code, yearStart, nextYearStart]
        ),
      ]);

      if (accountResult.rows.length === 0) {
        return res.status(404).json({ message: "Account code not found" });
      }

      const createMonths = () =>
        Array.from({ length: 12 }, (_unused, index) => ({
          month: index + 1,
          debit: 0,
          credit: 0,
          net: 0,
        }));
      const overall = { opening: 0, months: createMonths() };
      const directAccount = { opening: 0, months: createMonths() };
      const branches = new Map(
        childrenResult.rows.map((child) => [
          child.code,
          { opening: 0, months: createMonths() },
        ])
      );

      activityResult.rows.forEach((row) => {
        const net = parseFloat(row.net) || 0;
        const branch = row.branch_code ? branches.get(row.branch_code) : null;

        if (row.row_type === "opening") {
          overall.opening += net;
          if (branch) branch.opening += net;
          else directAccount.opening += net;
          return;
        }

        const monthIndex = parseInt(row.month, 10) - 1;
        if (monthIndex < 0 || monthIndex > 11) return;
        const debit = parseFloat(row.debit) || 0;
        const credit = parseFloat(row.credit) || 0;
        overall.months[monthIndex].debit += debit;
        overall.months[monthIndex].credit += credit;
        overall.months[monthIndex].net += net;

        const target = branch || directAccount;
        target.months[monthIndex].debit += debit;
        target.months[monthIndex].credit += credit;
        target.months[monthIndex].net += net;
      });

      const summarize = (activity) => {
        const balanceBroughtForward =
          activity.opening +
          activity.months
            .slice(0, month - 1)
            .reduce((sum, item) => sum + item.net, 0);
        const currentMonthMovement = activity.months[month - 1].net;
        return {
          opening_balance: activity.opening,
          balance_brought_forward: balanceBroughtForward,
          current_month_movement: currentMonthMovement,
          accumulative_balance:
            balanceBroughtForward + currentMonthMovement,
        };
      };

      const children = childrenResult.rows.map((child) => ({
        ...child,
        ...summarize(
          branches.get(child.code) || { opening: 0, months: createMonths() }
        ),
      }));

      res.json({
        account: accountResult.rows[0],
        period: {
          year,
          opening_month: 1,
          current_month: month,
        },
        subtree_account_count: activityResult.rows.filter(
          (row) => row.row_type === "opening"
        ).length,
        months: overall.months,
        totals: summarize(overall),
        direct_account: summarize(directAccount),
        children,
      });
    } catch (error) {
      console.error("Error fetching Green Target account overview:", error);
      res.status(500).json({
        message: "Error fetching Green Target account overview",
        error: error.message,
      });
    }
  });

  // GET /:code - Single account details used by the shared edit page.
  router.get("/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const result = await pool.query(
        `SELECT
           id, code, description, ledger_type, parent_code,
           level, sort_order, is_active, is_system, notes, fs_note,
           created_at, updated_at, created_by, updated_by
         FROM greentarget.account_codes
         WHERE code = $1`,
        [code]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Account code not found" });
      }

      const childrenResult = await pool.query(
        `SELECT COUNT(*) AS children_count
         FROM greentarget.account_codes
         WHERE parent_code = $1`,
        [code]
      );

      res.json({
        ...result.rows[0],
        children_count: parseInt(childrenResult.rows[0].children_count, 10),
      });
    } catch (error) {
      console.error("Error fetching Green Target account code:", error);
      res.status(500).json({
        message: "Error fetching Green Target account code",
        error: error.message,
      });
    }
  });

  // POST / - Create a GT account. Codes are normalized once at creation and
  // remain immutable thereafter.
  router.post("/", async (req, res) => {
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};
    const {
      code,
      description,
      ledger_type,
      parent_code,
      sort_order,
      is_active,
      fs_note,
      notes,
    } = body;

    if (typeof code !== "string" || !code.trim()) {
      return res.status(400).json({ message: "Account code is required" });
    }
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length > MAX_ACCOUNT_CODE_LENGTH) {
      return res.status(400).json({
        message: `Account code cannot exceed ${MAX_ACCOUNT_CODE_LENGTH} characters`,
      });
    }
    if (!ACCOUNT_CODE_PATTERN.test(normalizedCode)) {
      return res.status(400).json({
        message:
          "Account code can only contain letters, numbers, hyphens, underscores, and periods",
      });
    }
    if (RESERVED_ACCOUNT_CODES.has(normalizedCode)) {
      return res.status(400).json({
        message: `Account code '${normalizedCode}' is reserved by the account-code page`,
      });
    }

    if (typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ message: "Description is required" });
    }
    const normalizedDescription = description.trim();
    if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        message: `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }

    if (typeof ledger_type !== "string" || !ledger_type.trim()) {
      return res.status(400).json({
        message: "An active ledger type is required",
      });
    }
    const normalizedLedgerType = ledger_type.trim().toUpperCase();

    if (typeof fs_note !== "string" || !fs_note.trim()) {
      return res.status(400).json({
        message: "An active financial statement note is required",
      });
    }
    const normalizedFsNote = fs_note.trim().toUpperCase();

    if (
      parent_code !== undefined &&
      parent_code !== null &&
      typeof parent_code !== "string"
    ) {
      return res.status(400).json({
        message: "Parent account code must be a string or null",
      });
    }
    const normalizedParentCode =
      typeof parent_code === "string" && parent_code.trim()
        ? parent_code.trim().toUpperCase()
        : null;
    if (normalizedParentCode === normalizedCode) {
      return res.status(400).json({
        message: "Account cannot be its own parent",
      });
    }
    if (
      (normalizedLedgerType === "TD" || normalizedParentCode === "DEBTOR") &&
      (normalizedLedgerType !== "TD" ||
        normalizedParentCode !== "DEBTOR" ||
        normalizedFsNote !== "22")
    ) {
      return res.status(400).json({
        message:
          "Trade debtor accounts must use ledger type 'TD', parent 'DEBTOR', and financial statement note '22'",
      });
    }

    const normalizedSortOrder = sort_order === undefined ? 0 : sort_order;
    if (
      !Number.isInteger(normalizedSortOrder) ||
      normalizedSortOrder < 0 ||
      normalizedSortOrder > MAX_INTEGER
    ) {
      return res.status(400).json({
        message: "Sort order must be a non-negative whole number",
      });
    }
    if (is_active !== undefined && typeof is_active !== "boolean") {
      return res.status(400).json({
        message: "Active status must be true or false",
      });
    }
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      return res.status(400).json({
        message: "Notes must be text or null",
      });
    }
    const normalizedNotes =
      typeof notes === "string" && notes.trim() ? notes.trim() : null;
    const actor = getRequestActor(req);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize chart mutations so two concurrent re-parent operations
      // cannot each pass cycle validation against a stale hierarchy.
      await client.query(
        "LOCK TABLE greentarget.account_codes IN SHARE ROW EXCLUSIVE MODE"
      );

      const duplicateResult = await client.query(
        `SELECT code
         FROM greentarget.account_codes
         WHERE UPPER(code) = $1
         LIMIT 1`,
        [normalizedCode]
      );
      if (duplicateResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `Account code '${normalizedCode}' already exists`,
        });
      }

      const ledgerTypeResult = await client.query(
        `SELECT 1
         FROM greentarget.ledger_types
         WHERE code = $1 AND is_active = true`,
        [normalizedLedgerType]
      );
      if (ledgerTypeResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Ledger type '${normalizedLedgerType}' does not exist or is inactive`,
        });
      }

      const fsNoteResult = await client.query(
        `SELECT 1
         FROM greentarget.financial_statement_notes
         WHERE code = $1 AND is_active = true`,
        [normalizedFsNote]
      );
      if (fsNoteResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Financial statement note '${normalizedFsNote}' does not exist or is inactive`,
        });
      }

      let calculatedLevel = 1;
      if (normalizedParentCode) {
        const parentResult = await client.query(
          `SELECT level, is_active, ledger_type
           FROM greentarget.account_codes
           WHERE code = $1`,
          [normalizedParentCode]
        );
        if (parentResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Parent account '${normalizedParentCode}' does not exist`,
          });
        }
        if (!parentResult.rows[0].is_active) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Parent account '${normalizedParentCode}' is inactive`,
          });
        }
        if (
          normalizedParentCode !== "DEBTOR" &&
          parentResult.rows[0].ledger_type === "TD"
        ) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message:
              "Trade debtor accounts must remain leaf accounts and cannot be used as a parent",
          });
        }
        calculatedLevel = Number(parentResult.rows[0].level) + 1;
      }

      const result = await client.query(
        `INSERT INTO greentarget.account_codes (
           code, description, ledger_type, parent_code, level, sort_order,
           is_active, is_system, fs_note, notes, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9, $10, $10)
         RETURNING *`,
        [
          normalizedCode,
          normalizedDescription,
          normalizedLedgerType,
          normalizedParentCode,
          calculatedLevel,
          normalizedSortOrder,
          is_active !== false,
          normalizedFsNote,
          normalizedNotes,
          actor,
        ]
      );

      await client.query("COMMIT");
      res.status(201).json({
        message: "Account code created successfully",
        accountCode: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating Green Target account code:", error);

      if (error.code === "23505") {
        return res.status(409).json({
          message: `Account code '${normalizedCode}' already exists`,
        });
      }
      if (error.code === "23503") {
        return res.status(400).json({
          message: "The selected parent, ledger type, or financial statement note is no longer available",
        });
      }

      res.status(500).json({
        message: "Error creating Green Target account code",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // PUT /:code - Update accounting metadata. The route key is authoritative;
  // any attempted rename is rejected.
  router.put("/:code", async (req, res) => {
    const { code } = req.params;
    const body =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};
    const {
      code: requestedCode,
      description,
      ledger_type,
      parent_code,
      sort_order,
      is_active,
      fs_note,
      notes,
      expected_updated_at,
    } = body;

    if (requestedCode !== undefined && typeof requestedCode !== "string") {
      return res.status(400).json({
        message: "Account code must be text when provided",
      });
    }
    if (typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ message: "Description is required" });
    }
    const normalizedDescription = description.trim();
    if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        message: `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }

    if (
      ledger_type !== undefined &&
      (typeof ledger_type !== "string" || !ledger_type.trim())
    ) {
      return res.status(400).json({
        message: "An active ledger type is required",
      });
    }
    if (
      fs_note !== undefined &&
      (typeof fs_note !== "string" || !fs_note.trim())
    ) {
      return res.status(400).json({
        message: "An active financial statement note is required",
      });
    }
    if (
      parent_code !== undefined &&
      parent_code !== null &&
      typeof parent_code !== "string"
    ) {
      return res.status(400).json({
        message: "Parent account code must be a string or null",
      });
    }
    if (
      sort_order !== undefined &&
      (!Number.isInteger(sort_order) ||
        sort_order < 0 ||
        sort_order > MAX_INTEGER)
    ) {
      return res.status(400).json({
        message: "Sort order must be a non-negative whole number",
      });
    }
    if (is_active !== undefined && typeof is_active !== "boolean") {
      return res.status(400).json({
        message: "Active status must be true or false",
      });
    }
    if (notes !== undefined && notes !== null && typeof notes !== "string") {
      return res.status(400).json({
        message: "Notes must be text or null",
      });
    }
    if (
      typeof expected_updated_at !== "string" ||
      !expected_updated_at.trim() ||
      !Number.isFinite(Date.parse(expected_updated_at))
    ) {
      return res.status(400).json({
        message:
          "The account version is missing or invalid. Reload the account and try again.",
      });
    }

    const actor = getRequestActor(req);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "LOCK TABLE greentarget.account_codes IN SHARE ROW EXCLUSIVE MODE"
      );

      const accountResult = await client.query(
        `SELECT
           code, description, ledger_type, parent_code, level, sort_order,
           is_active, is_system, fs_note, notes, updated_at
         FROM greentarget.account_codes
         WHERE code = $1
         FOR UPDATE`,
        [code]
      );
      if (accountResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: `Account code '${code}' not found`,
        });
      }

      const existing = accountResult.rows[0];
      const expectedUpdatedAt = Date.parse(expected_updated_at);
      const currentUpdatedAt = new Date(existing.updated_at).getTime();
      if (
        !Number.isFinite(currentUpdatedAt) ||
        expectedUpdatedAt !== currentUpdatedAt
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message:
            "This account code was changed by another user. Reload it before saving your changes.",
        });
      }
      if (
        requestedCode !== undefined &&
        requestedCode.trim().toUpperCase() !== existing.code
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Account code cannot be changed. Create a new account code instead.",
        });
      }

      const nextLedgerType =
        ledger_type === undefined
          ? existing.ledger_type
          : ledger_type.trim().toUpperCase();
      const nextFsNote =
        fs_note === undefined
          ? existing.fs_note
          : fs_note.trim().toUpperCase();
      const nextParentCode =
        parent_code === undefined
          ? existing.parent_code
          : typeof parent_code === "string" && parent_code.trim()
            ? parent_code.trim().toUpperCase()
            : null;
      const nextSortOrder =
        sort_order === undefined ? existing.sort_order : sort_order;
      const nextIsActive =
        is_active === undefined ? existing.is_active : is_active;
      const nextNotes =
        notes === undefined
          ? existing.notes
          : typeof notes === "string" && notes.trim()
            ? notes.trim()
            : null;

      if (!nextLedgerType) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "An active ledger type is required",
        });
      }
      if (!nextFsNote) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "An active financial statement note is required",
        });
      }

      // The DEBTOR control is the only current system row. Keep its structural
      // fields fixed while still allowing harmless description/order/notes edits.
      if (existing.is_system) {
        if (!nextIsActive) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: "System account codes cannot be deactivated",
          });
        }
        if (
          nextParentCode !== existing.parent_code ||
          nextLedgerType !== existing.ledger_type ||
          nextFsNote !== existing.fs_note
        ) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message:
              "A system account's parent, ledger type, and financial statement note cannot be changed",
          });
        }
      }

      const isDebtorMember =
        !existing.is_system &&
        (existing.ledger_type === "TD" ||
          existing.parent_code === "DEBTOR" ||
          nextLedgerType === "TD" ||
          nextParentCode === "DEBTOR");
      if (
        isDebtorMember &&
        (nextLedgerType !== "TD" ||
          nextParentCode !== "DEBTOR" ||
          nextFsNote !== "22")
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
          "Trade debtor accounts must keep ledger type 'TD', parent 'DEBTOR', and financial statement note '22'",
        });
      }

      if (isDebtorMember) {
        const childResult = await client.query(
          `SELECT 1
           FROM greentarget.account_codes
           WHERE parent_code = $1
           LIMIT 1`,
          [existing.code]
        );
        if (childResult.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            message:
              "Trade debtor accounts must remain leaf accounts. Reassign this account's children first.",
          });
        }
      }

      if (existing.is_active && !nextIsActive) {
        const usageResult = await client.query(
          `SELECT
             EXISTS (
               SELECT 1
               FROM greentarget.journal_entry_lines
               WHERE account_code = $1
             ) AS has_journal_lines,
             EXISTS (
               SELECT 1
               FROM greentarget.account_opening_balances
               WHERE account_code = $1
             ) AS has_opening_balance,
             EXISTS (
               SELECT 1
               FROM greentarget.account_codes
               WHERE parent_code = $1
             ) AS has_children`,
          [existing.code]
        );
        const usage = usageResult.rows[0];
        if (usage.has_journal_lines || usage.has_opening_balance) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            message:
              "This account has accounting history and must remain active so its balances stay visible in Green Target reports",
          });
        }
        if (usage.has_children) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            message:
              "This account has child accounts and cannot be deactivated. Reassign its children first.",
          });
        }
      }

      const ledgerTypeResult = await client.query(
        `SELECT 1
         FROM greentarget.ledger_types
         WHERE code = $1 AND is_active = true`,
        [nextLedgerType]
      );
      if (ledgerTypeResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Ledger type '${nextLedgerType}' does not exist or is inactive`,
        });
      }

      const fsNoteResult = await client.query(
        `SELECT 1
         FROM greentarget.financial_statement_notes
         WHERE code = $1 AND is_active = true`,
        [nextFsNote]
      );
      if (fsNoteResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Financial statement note '${nextFsNote}' does not exist or is inactive`,
        });
      }

      let calculatedLevel = 1;
      if (nextParentCode) {
        if (nextParentCode === existing.code) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: "Account cannot be its own parent",
          });
        }

        const parentResult = await client.query(
          `SELECT level, is_active, ledger_type
           FROM greentarget.account_codes
           WHERE code = $1`,
          [nextParentCode]
        );
        if (parentResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Parent account '${nextParentCode}' does not exist`,
          });
        }
        if (!parentResult.rows[0].is_active) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message: `Parent account '${nextParentCode}' is inactive`,
          });
        }
        if (
          nextParentCode !== "DEBTOR" &&
          parentResult.rows[0].ledger_type === "TD"
        ) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message:
              "Trade debtor accounts must remain leaf accounts and cannot be used as a parent",
          });
        }

        const cycleResult = await client.query(
          `WITH RECURSIVE subtree AS (
             SELECT code, ARRAY[code::text] AS path
             FROM greentarget.account_codes
             WHERE code = $1

             UNION ALL

             SELECT child.code, parent.path || child.code::text
             FROM greentarget.account_codes child
             JOIN subtree parent ON child.parent_code = parent.code
             WHERE NOT child.code::text = ANY(parent.path)
           )
           SELECT 1
           FROM subtree
           WHERE code = $2
           LIMIT 1`,
          [existing.code, nextParentCode]
        );
        if (cycleResult.rows.length > 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            message:
              "Parent account cannot be this account or one of its descendants",
          });
        }

        calculatedLevel = Number(parentResult.rows[0].level) + 1;
      }

      const updateResult = await client.query(
        `UPDATE greentarget.account_codes
         SET description = $1,
             ledger_type = $2,
             parent_code = $3,
             level = $4,
             sort_order = $5,
             is_active = $6,
             fs_note = $7,
             notes = $8,
             updated_by = $9,
             updated_at = CURRENT_TIMESTAMP
         WHERE code = $10
         RETURNING *`,
        [
          normalizedDescription,
          nextLedgerType,
          nextParentCode,
          calculatedLevel,
          nextSortOrder,
          nextIsActive,
          nextFsNote,
          nextNotes,
          actor,
          existing.code,
        ]
      );

      // Recalculate every descendant from the updated root so re-parenting a
      // branch never leaves the denormalized level column stale.
      await client.query(
        `WITH RECURSIVE subtree AS (
           SELECT code, $2::integer AS calculated_level,
                  ARRAY[code::text] AS path
           FROM greentarget.account_codes
           WHERE code = $1

           UNION ALL

           SELECT child.code, parent.calculated_level + 1,
                  parent.path || child.code::text
           FROM greentarget.account_codes child
           JOIN subtree parent ON child.parent_code = parent.code
           WHERE NOT child.code::text = ANY(parent.path)
         )
         UPDATE greentarget.account_codes account
         SET level = subtree.calculated_level,
             updated_by = $3,
             updated_at = CURRENT_TIMESTAMP
         FROM subtree
         WHERE account.code = subtree.code
           AND (
             account.level IS NULL OR
             account.level <> subtree.calculated_level
           )`,
        [existing.code, calculatedLevel, actor]
      );

      await client.query("COMMIT");
      res.json({
        message: "Account code updated successfully",
        accountCode: updateResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating Green Target account code:", error);

      if (error.code === "23503") {
        return res.status(400).json({
          message: "The selected parent, ledger type, or financial statement note is no longer available",
        });
      }

      res.status(500).json({
        message: "Error updating Green Target account code",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  // DELETE /:code - Delete a GT account code. Mirrors the Tien Hock delete:
  // system accounts, parents with children, and accounts with accounting
  // history are blocked. GT additionally blocks accounts carrying an opening
  // balance anchor (consistent with its stricter deactivation guard), so a
  // delete can never strand ledger history or an anchor. The parent self-FK
  // is ON DELETE SET NULL, but the children check fires first so a delete
  // never silently orphans a branch.
  router.delete("/:code", async (req, res) => {
    const { code } = req.params;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "LOCK TABLE greentarget.account_codes IN SHARE ROW EXCLUSIVE MODE"
      );

      const accountResult = await client.query(
        `SELECT is_system
         FROM greentarget.account_codes
         WHERE code = $1
         FOR UPDATE`,
        [code]
      );
      if (accountResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          message: `Account code '${code}' not found`,
        });
      }
      if (accountResult.rows[0].is_system) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Cannot delete system account code",
        });
      }

      const usageResult = await client.query(
        `SELECT
           EXISTS (
             SELECT 1
             FROM greentarget.account_codes
             WHERE parent_code = $1
           ) AS has_children,
           EXISTS (
             SELECT 1
             FROM greentarget.journal_entry_lines
             WHERE account_code = $1
           ) AS has_journal_lines,
           EXISTS (
             SELECT 1
             FROM greentarget.account_opening_balances
             WHERE account_code = $1
           ) AS has_opening_balance`,
        [code]
      );
      const usage = usageResult.rows[0];

      if (usage.has_children) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Cannot delete account with child accounts. Delete children first or reassign them.",
        });
      }
      if (usage.has_journal_lines) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Cannot delete account that has been used in journal entries. Its balances must stay visible in Green Target reports.",
        });
      }
      if (usage.has_opening_balance) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Cannot delete account that carries an opening balance. Its balances must stay visible in Green Target reports.",
        });
      }

      const result = await client.query(
        `DELETE FROM greentarget.account_codes
         WHERE code = $1
         RETURNING code`,
        [code]
      );

      await client.query("COMMIT");
      res.json({
        message: "Account code deleted successfully",
        code: result.rows[0].code,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error deleting Green Target account code:", error);

      if (error.code === "23503") {
        return res.status(409).json({
          message:
            "This account is still referenced by other Green Target records and cannot be deleted.",
        });
      }

      res.status(500).json({
        message: "Error deleting Green Target account code",
        error: error.message,
      });
    } finally {
      client.release();
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
