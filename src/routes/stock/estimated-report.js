// src/routes/stock/estimated-report.js
//
// API for the boss-only "Estimated Cost & Unit Cost" report (MEE & BIHUN).
// The report itself is derived in ./estimated-report-engine.js; this router owns
// request validation, the keyed Add Back input and the mapping maintenance
// surface used by the Phase 4 mappings modal.
//
// Doc: docs/Account/ESTIMATED_REPORT_HANDOVER.md

import { Router } from "express";
import {
  PRODUCT_LINES,
  computeEstimatedReport,
} from "./estimated-report-engine.js";

const SOURCE_TYPES = [
  "material",
  "kilang",
  "account",
  "product",
  "product_type",
  "line",
];
const STOCK_BUCKETS = ["mee", "bihun", "shared"];

/** Rejected mapping payload - surfaced to the caller as a 400, not a 500. */
class InvalidMapping extends Error {}

/** Turns a would-be foreign-key violation into a readable 400. */
const mustExist = async (client, sql, value, message) => {
  const result = await client.query(sql, [value]);
  if (result.rows.length === 0) throw new InvalidMapping(message);
};

const getStaffId = (req) =>
  req.session?.staff?.id || req.session?.staff_id || null;

const parseIntParam = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const trimmed = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};

const parseAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};

/** Validates ?year=&month= and returns { year, month } or null. */
const parsePeriod = (query) => {
  const year = parseIntParam(query.year);
  const month = parseIntParam(query.month);
  if (year === null || month === null) return null;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  return { year, month };
};

export default function (pool) {
  const router = Router();

  // GET / - full report for one month (both product lines unless filtered)
  router.get("/", async (req, res) => {
    const period = parsePeriod(req.query);
    if (!period) {
      return res.status(400).json({
        message: "Valid year and month query parameters are required",
      });
    }

    const requested = req.query.productLine;
    const productLines =
      requested && requested !== "all" ? String(requested).split(",") : null;
    if (
      productLines &&
      productLines.some((line) => !PRODUCT_LINES.includes(line))
    ) {
      return res.status(400).json({
        message: `productLine must be one of: ${PRODUCT_LINES.join(", ")}`,
      });
    }

    try {
      const report = await computeEstimatedReport(pool, {
        ...period,
        productLines,
      });
      res.json(report);
    } catch (error) {
      console.error("Error computing estimated report:", error);
      res.status(500).json({
        message: "Error computing estimated report",
        error: error.message,
      });
    }
  });

  // GET /inputs - keyed Add Back values for a month (both product lines)
  router.get("/inputs", async (req, res) => {
    const period = parsePeriod(req.query);
    if (!period) {
      return res.status(400).json({
        message: "Valid year and month query parameters are required",
      });
    }

    try {
      const result = await pool.query(
        `SELECT product_line, year, month, add_back, notes, updated_at, updated_by
           FROM estimated_report_inputs
          WHERE year = $1 AND month = $2`,
        [period.year, period.month]
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching estimated report inputs:", error);
      res.status(500).json({
        message: "Error fetching estimated report inputs",
        error: error.message,
      });
    }
  });

  // PUT /add-back - upsert the boss-keyed Add Back for one product line/month
  router.put("/add-back", async (req, res) => {
    const { productLine, year, month, addBack, notes } = req.body || {};

    if (!PRODUCT_LINES.includes(productLine)) {
      return res.status(400).json({
        message: `productLine must be one of: ${PRODUCT_LINES.join(", ")}`,
      });
    }
    const period = parsePeriod({ year, month });
    if (!period) {
      return res.status(400).json({ message: "Valid year and month are required" });
    }
    const amount = parseAmount(addBack);
    if (amount === null) {
      return res.status(400).json({ message: "addBack must be a number" });
    }

    try {
      const staffId = getStaffId(req);
      const result = await pool.query(
        `INSERT INTO estimated_report_inputs
           (product_line, year, month, add_back, notes, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (product_line, year, month) DO UPDATE
           SET add_back = EXCLUDED.add_back,
               notes = EXCLUDED.notes,
               updated_at = NOW(),
               updated_by = EXCLUDED.updated_by
         RETURNING product_line, year, month, add_back, notes, updated_at, updated_by`,
        [
          productLine,
          period.year,
          period.month,
          amount,
          notes ? String(notes).trim() || null : null,
          staffId,
        ]
      );
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error saving estimated report add back:", error);
      res.status(500).json({
        message: "Error saving estimated report add back",
        error: error.message,
      });
    }
  });

  // GET /mappings - every report line with its resolved source members
  router.get("/mappings", async (req, res) => {
    try {
      const linesResult = await pool.query(
        `SELECT id, line_key, product_line, page, section, code, description,
                opening_code, opening_description, sort_order, source_kind,
                is_active, notes
           FROM estimated_report_lines
          ORDER BY page, section, product_line, sort_order, id`
      );

      const sourcesResult = await pool.query(
        `SELECT s.id, s.line_id, s.source_type, s.sign, s.percentage,
                s.material_id, s.variant_id, s.stock_bucket, s.account_code,
                s.product_id, s.product_type, s.ref_line_id,
                m.code AS material_code, m.name AS material_name,
                mv.variant_name,
                ac.description AS account_description,
                p.description AS product_description,
                rl.line_key AS ref_line_key, rl.description AS ref_line_description
           FROM estimated_report_line_sources s
           LEFT JOIN materials m ON m.id = s.material_id
           LEFT JOIN material_variants mv ON mv.id = s.variant_id
           LEFT JOIN account_codes ac ON ac.code = s.account_code
           LEFT JOIN products p ON p.id = s.product_id
           LEFT JOIN estimated_report_lines rl ON rl.id = s.ref_line_id
          ORDER BY s.line_id, s.id`
      );

      const sourcesByLine = new Map();
      for (const row of sourcesResult.rows) {
        const lineId = Number(row.line_id);
        if (!sourcesByLine.has(lineId)) sourcesByLine.set(lineId, []);
        sourcesByLine.get(lineId).push(row);
      }

      res.json(
        linesResult.rows.map((line) => ({
          ...line,
          sources: sourcesByLine.get(Number(line.id)) || [],
        }))
      );
    } catch (error) {
      console.error("Error fetching estimated report mappings:", error);
      res.status(500).json({
        message: "Error fetching estimated report mappings",
        error: error.message,
      });
    }
  });

  // GET /mappings/options - pickable materials/accounts/products/lines for the modal
  router.get("/mappings/options", async (req, res) => {
    try {
      const materials = await pool.query(
        `SELECT m.id, m.code, m.name, m.category, m.applies_to,
                COALESCE(
                  json_agg(
                    json_build_object('id', mv.id, 'variant_name', mv.variant_name)
                    ORDER BY mv.sort_order, mv.id
                  ) FILTER (WHERE mv.id IS NOT NULL),
                  '[]'
                ) AS variants
           FROM materials m
           LEFT JOIN material_variants mv ON mv.material_id = m.id AND mv.is_active
          WHERE m.is_active
          GROUP BY m.id
          ORDER BY m.category, m.sort_order, m.id`
      );
      const accounts = await pool.query(
        `SELECT code, description, ledger_type
           FROM account_codes
          WHERE is_active
          ORDER BY code`
      );
      const products = await pool.query(
        `SELECT id, description, type
           FROM products
          WHERE is_active
          ORDER BY type, sort_order NULLS LAST, id`
      );
      const lines = await pool.query(
        `SELECT id, line_key, product_line, page, section, code, description
           FROM estimated_report_lines
          WHERE page = 'pl' AND section IN ('stock', 'purchase')
          ORDER BY product_line, section, sort_order`
      );

      res.json({
        materials: materials.rows,
        accounts: accounts.rows,
        products: products.rows,
        productTypes: [...new Set(products.rows.map((row) => row.type))].filter(
          Boolean
        ),
        stockBuckets: STOCK_BUCKETS,
        referenceLines: lines.rows,
      });
    } catch (error) {
      console.error("Error fetching estimated report mapping options:", error);
      res.status(500).json({
        message: "Error fetching estimated report mapping options",
        error: error.message,
      });
    }
  });

  // PUT /mappings/:lineId - replace one line's source members
  router.put("/mappings/:lineId", async (req, res) => {
    const lineId = parseIntParam(req.params.lineId);
    if (lineId === null) {
      return res.status(400).json({ message: "Invalid line id" });
    }

    const { sources, isActive, notes } = req.body || {};
    if (!Array.isArray(sources)) {
      return res.status(400).json({ message: "sources must be an array" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const lineResult = await client.query(
        `SELECT id, line_key, source_kind, section FROM estimated_report_lines
          WHERE id = $1 FOR UPDATE`,
        [lineId]
      );
      if (lineResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Report line not found" });
      }

      // Validate every member up-front so a bad row never leaves a half-edited line.
      const prepared = [];
      for (const source of sources) {
        const sourceType = source?.source_type;
        if (!SOURCE_TYPES.includes(sourceType)) {
          throw new InvalidMapping(
            `source_type must be one of: ${SOURCE_TYPES.join(", ")}`
          );
        }

        const sign = source.sign === -1 || source.sign === "-1" ? -1 : 1;
        const percentage =
          source.percentage === undefined || source.percentage === null
            ? 100
            : Number(source.percentage);
        if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
          throw new InvalidMapping("percentage must be between 0 and 100");
        }

        const member = {
          sourceType,
          sign,
          percentage,
          materialId: null,
          variantId: null,
          stockBucket: null,
          accountCode: null,
          productId: null,
          productType: null,
          refLineId: null,
        };

        if (sourceType === "material") {
          member.materialId = parseIntParam(source.material_id);
          member.variantId =
            source.variant_id === null || source.variant_id === undefined
              ? null
              : parseIntParam(source.variant_id);
          member.stockBucket = source.stock_bucket;
          if (member.materialId === null) {
            throw new InvalidMapping("material_id is required for a material source");
          }
          if (!STOCK_BUCKETS.includes(member.stockBucket)) {
            throw new InvalidMapping(
              `stock_bucket must be one of: ${STOCK_BUCKETS.join(", ")}`
            );
          }
          await mustExist(
            client,
            "SELECT 1 FROM materials WHERE id = $1",
            member.materialId,
            `Material ${member.materialId} does not exist`
          );
          if (member.variantId !== null) {
            const variant = await client.query(
              "SELECT material_id FROM material_variants WHERE id = $1",
              [member.variantId]
            );
            if (
              variant.rows.length === 0 ||
              Number(variant.rows[0].material_id) !== member.materialId
            ) {
              throw new InvalidMapping(
                `Variant ${member.variantId} does not belong to material ${member.materialId}`
              );
            }
          }
        } else if (sourceType === "kilang") {
          member.stockBucket = source.stock_bucket;
          if (!STOCK_BUCKETS.includes(member.stockBucket)) {
            throw new InvalidMapping(
              `stock_bucket must be one of: ${STOCK_BUCKETS.join(", ")}`
            );
          }
        } else if (sourceType === "account") {
          member.accountCode = trimmed(source.account_code);
          if (!member.accountCode) {
            throw new InvalidMapping(
              "account_code is required for an account source"
            );
          }
          await mustExist(
            client,
            "SELECT 1 FROM account_codes WHERE code = $1",
            member.accountCode,
            `Account code '${member.accountCode}' does not exist`
          );
        } else if (sourceType === "product") {
          member.productId = trimmed(source.product_id);
          if (!member.productId) {
            throw new InvalidMapping("product_id is required for a product source");
          }
          await mustExist(
            client,
            "SELECT 1 FROM products WHERE id = $1",
            member.productId,
            `Product '${member.productId}' does not exist`
          );
        } else if (sourceType === "product_type") {
          member.productType = trimmed(source.product_type);
          if (!member.productType) {
            throw new InvalidMapping(
              "product_type is required for a product_type source"
            );
          }
        } else if (sourceType === "line") {
          member.refLineId = parseIntParam(source.ref_line_id);
          if (member.refLineId === null) {
            throw new InvalidMapping("ref_line_id is required for a line source");
          }
          if (member.refLineId === lineId) {
            throw new InvalidMapping("A line cannot reference itself");
          }
          // Referenced lines must be P&L stock/purchase rows - that is what the
          // legacy usage formulas do, and it keeps references acyclic.
          const referenced = await client.query(
            `SELECT id FROM estimated_report_lines
              WHERE id = $1 AND page = 'pl' AND section IN ('stock', 'purchase')`,
            [member.refLineId]
          );
          if (referenced.rows.length === 0) {
            throw new InvalidMapping(
              `Line ${member.refLineId} cannot be referenced - only P&L stock and purchase lines may be`
            );
          }
        }

        prepared.push(member);
      }

      await client.query(
        "DELETE FROM estimated_report_line_sources WHERE line_id = $1",
        [lineId]
      );

      for (const member of prepared) {
        await client.query(
          `INSERT INTO estimated_report_line_sources
             (line_id, source_type, sign, percentage, material_id, variant_id,
              stock_bucket, account_code, product_id, product_type, ref_line_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            lineId,
            member.sourceType,
            member.sign,
            member.percentage,
            member.materialId,
            member.variantId,
            member.stockBucket,
            member.accountCode,
            member.productId,
            member.productType,
            member.refLineId,
          ]
        );
      }

      if (isActive !== undefined || notes !== undefined) {
        await client.query(
          `UPDATE estimated_report_lines
              SET is_active = COALESCE($2, is_active),
                  notes = COALESCE($3, notes),
                  updated_at = NOW()
            WHERE id = $1`,
          [
            lineId,
            isActive === undefined ? null : Boolean(isActive),
            notes === undefined ? null : String(notes).trim() || null,
          ]
        );
      }

      await client.query("COMMIT");
      res.json({
        message: "Mapping updated",
        lineId,
        lineKey: lineResult.rows[0].line_key,
        sourceCount: prepared.length,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof InvalidMapping) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error updating estimated report mapping:", error);
      res.status(500).json({
        message: "Error updating estimated report mapping",
        error: error.message,
      });
    } finally {
      client.release();
    }
  });

  return router;
}
