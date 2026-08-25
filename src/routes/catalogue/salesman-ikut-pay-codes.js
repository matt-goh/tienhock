// src/routes/catalogue/salesman-ikut-pay-codes.js
//
// Data-driven Tien Hock product -> Ikut Lori (DME/DWE) pay-code mapping used by
// the salesman daily-log pages. Previously these pages hardcoded this map, so
// every new product needed a developer edit; the map now lives in
// product_salesman_ikut_pay_codes (backfilled by
// 2026-08-24_product_paycode_auto_setup.sql and written by the Add Product
// auto-setup flow).

import { Router } from "express";

export default function (pool) {
  const router = Router();

  // GET / - All product -> Ikut Lori pay-code mappings
  router.get("/", async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ps.product_id, ps.pay_code_id,
                pc.description, pc.rate_unit
           FROM product_salesman_ikut_pay_codes ps
           JOIN pay_codes pc ON pc.id = ps.pay_code_id
          ORDER BY ps.product_id`
      );
      res.json(
        result.rows.map((row) => ({
          product_id: row.product_id,
          pay_code_id: row.pay_code_id,
          description: row.description,
          rate_unit: row.rate_unit,
        }))
      );
    } catch (error) {
      console.error("Error fetching salesman Ikut Lori mappings:", error);
      res.status(500).json({
        message: "Error fetching salesman Ikut Lori mappings",
        error: error.message,
      });
    }
  });

  return router;
}
