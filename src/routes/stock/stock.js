// src/routes/stock/stock.js
import { Router } from "express";

// Stock system start date - data before this date is ignored in B/F calculations
// Initial balance represents stock as of this date
const STOCK_SYSTEM_START_DATE = "2026-01-01";

export default function (pool) {
  const router = Router();

  /**
   * Format date to YYYY-MM-DD in local timezone (not UTC)
   * This prevents timezone issues where toISOString() converts to UTC
   */
  const formatDateLocal = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  /**
   * Helper function to get date range based on view type
   */
  const getDateRange = (viewType, year, month) => {
    const now = new Date();

    if (viewType === "month" && year && month !== undefined) {
      // Specific month view
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0); // Last day of month
      return {
        startDate: formatDateLocal(startDate),
        endDate: formatDateLocal(endDate),
      };
    } else if (viewType === "rolling") {
      // Rolling 31-day view
      const endDate = new Date(now);
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      return {
        startDate: formatDateLocal(startDate),
        endDate: formatDateLocal(endDate),
      };
    } else {
      // Default: current month
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        startDate: formatDateLocal(startDate),
        endDate: formatDateLocal(endDate),
      };
    }
  };

  /**
   * GET /api/stock/movements - CRITICAL: Comprehensive stock movements aggregation
   *
   * Query params:
   * - product_id (required)
   * - view_type: 'month' | 'rolling' | 'custom' (default: 'month')
   * - year, month: for month view (0-indexed month)
   * - start_date, end_date: for custom view (YYYY-MM-DD)
   */
  router.get("/movements", async (req, res) => {
    try {
      const {
        product_id,
        view_type = "month",
        year,
        month,
        start_date,
        end_date,
      } = req.query;

      if (!product_id) {
        return res.status(400).json({
          message: "product_id is required",
        });
      }

      // Determine date range based on view type
      // Use frontend-provided dates whenever available (frontend correctly handles all months including leap years)
      let dateRange;
      if (start_date && end_date) {
        dateRange = { startDate: start_date, endDate: end_date };
      } else {
        dateRange = getDateRange(
          view_type,
          year ? parseInt(year) : undefined,
          month !== undefined ? parseInt(month) : undefined
        );
      }

      const { startDate, endDate } = dateRange;

      // Get product info
      const productQuery = `SELECT id, description, type FROM products WHERE id = $1`;
      const productResult = await pool.query(productQuery, [product_id]);

      if (productResult.rows.length === 0) {
        return res.status(404).json({
          message: "Product not found",
        });
      }

      const product = productResult.rows[0];

      // Get initial balance (admin-set migration balance)
      const initialBalanceQuery = `
        SELECT balance
        FROM stock_opening_balances
        WHERE product_id = $1
        ORDER BY effective_date DESC
        LIMIT 1
      `;
      const initialResult = await pool.query(initialBalanceQuery, [product_id]);
      const initialBalance =
        initialResult.rows.length > 0 ? initialResult.rows[0].balance : 0;

      // Calculate brought forward (B/F) by summing movements from STOCK_SYSTEM_START_DATE to before start date
      // B/F = Initial Balance + (production + returns + adj_in) - (sold + foc + adj_out)
      // Data before STOCK_SYSTEM_START_DATE is ignored - initial balance represents stock as of that date
      // Use DATE comparison for consistency (not timestamp)

      // Get prior production total (only from system start date onwards)
      const priorProductionQuery = `
        SELECT COALESCE(SUM(bags_packed), 0) as total
        FROM production_entries
        WHERE product_id = $1
          AND entry_date >= $2::date
          AND entry_date < $3::date
      `;
      const priorProductionResult = await pool.query(priorProductionQuery, [
        product_id,
        STOCK_SYSTEM_START_DATE,
        startDate,
      ]);
      const priorProduction = parseInt(priorProductionResult.rows[0]?.total || 0);

      // Get prior sales totals (sold, foc, returns) - only from system start date onwards
      // Use DATE extraction to match the period query's date grouping logic
      const priorSalesQuery = `
        SELECT
          COALESCE(SUM(od.quantity), 0) as sold,
          COALESCE(SUM(COALESCE(od.freeproduct, 0)), 0) as foc,
          COALESCE(SUM(COALESCE(od.returnproduct, 0)), 0) as returns
        FROM invoices i
        JOIN order_details od ON od.invoiceid = i.id
        WHERE od.code = $1
          AND i.invoice_status != 'cancelled'
          AND od.issubtotal IS NOT TRUE
          AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
          AND DATE(TO_TIMESTAMP(CAST(i.createddate AS bigint) / 1000)) >= $2::date
          AND DATE(TO_TIMESTAMP(CAST(i.createddate AS bigint) / 1000)) < $3::date
      `;
      const priorSalesResult = await pool.query(priorSalesQuery, [
        product_id,
        STOCK_SYSTEM_START_DATE,
        startDate,
      ]);
      const priorSold = parseInt(priorSalesResult.rows[0]?.sold || 0);
      const priorFoc = parseInt(priorSalesResult.rows[0]?.foc || 0);
      const priorReturns = parseInt(priorSalesResult.rows[0]?.returns || 0);

      // Get prior adjustments totals (only from system start date onwards)
      const priorAdjustmentsQuery = `
        SELECT
          COALESCE(SUM(CASE WHEN adjustment_type = 'ADJ_IN' THEN quantity ELSE 0 END), 0) as adj_in,
          COALESCE(SUM(CASE WHEN adjustment_type IN ('ADJ_OUT', 'DEFECT') THEN quantity ELSE 0 END), 0) as adj_out
        FROM stock_adjustments
        WHERE product_id = $1
          AND entry_date >= $2
          AND entry_date < $3
      `;
      const priorAdjustmentsResult = await pool.query(priorAdjustmentsQuery, [
        product_id,
        STOCK_SYSTEM_START_DATE,
        startDate,
      ]);
      const priorAdjIn = parseInt(priorAdjustmentsResult.rows[0]?.adj_in || 0);
      const priorAdjOut = parseInt(priorAdjustmentsResult.rows[0]?.adj_out || 0);

      // Calculate opening balance (B/F)
      // Returns DEDUCT from stock (products returned to supplier/factory)
      const openingBalance =
        initialBalance +
        priorProduction +
        priorAdjIn -
        priorSold -
        priorFoc -
        priorAdjOut -
        priorReturns;

      // Get production data grouped by date
      const productionQuery = `
        SELECT
          entry_date::text as date,
          SUM(bags_packed) as production
        FROM production_entries
        WHERE product_id = $1
          AND entry_date BETWEEN $2 AND $3
        GROUP BY entry_date
        ORDER BY entry_date
      `;
      const productionResult = await pool.query(productionQuery, [
        product_id,
        startDate,
        endDate,
      ]);

      // Get sales data from order_details (sold, FOC, returns)
      // Use DATE comparison for consistency with prior sales query
      const salesQuery = `
        SELECT
          DATE(TO_TIMESTAMP(CAST(i.createddate AS bigint) / 1000))::text as date,
          SUM(od.quantity) as sold,
          SUM(COALESCE(od.freeproduct, 0)) as foc,
          SUM(COALESCE(od.returnproduct, 0)) as returns
        FROM invoices i
        JOIN order_details od ON od.invoiceid = i.id
        WHERE od.code = $1
          AND i.invoice_status != 'cancelled'
          AND od.issubtotal IS NOT TRUE
          AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
          AND DATE(TO_TIMESTAMP(CAST(i.createddate AS bigint) / 1000)) BETWEEN $2::date AND $3::date
        GROUP BY DATE(TO_TIMESTAMP(CAST(i.createddate AS bigint) / 1000))
        ORDER BY date
      `;
      const salesResult = await pool.query(salesQuery, [
        product_id,
        startDate,
        endDate,
      ]);

      // Get adjustments data (for future use)
      const adjustmentsQuery = `
        SELECT
          entry_date::text as date,
          SUM(CASE WHEN adjustment_type = 'ADJ_IN' THEN quantity ELSE 0 END) as adj_in,
          SUM(CASE WHEN adjustment_type IN ('ADJ_OUT', 'DEFECT') THEN quantity ELSE 0 END) as adj_out
        FROM stock_adjustments
        WHERE product_id = $1
          AND entry_date BETWEEN $2 AND $3
        GROUP BY entry_date
        ORDER BY entry_date
      `;
      const adjustmentsResult = await pool.query(adjustmentsQuery, [
        product_id,
        startDate,
        endDate,
      ]);

      // Build a map of data by date
      const dataByDate = new Map();

      // Generate all dates in range
      // Parse dates carefully to avoid timezone issues
      const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
      const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
      const currentDate = new Date(startYear, startMonth - 1, startDay);
      const endDateObj = new Date(endYear, endMonth - 1, endDay);

      while (currentDate <= endDateObj) {
        const dateStr = formatDateLocal(currentDate);
        dataByDate.set(dateStr, {
          date: dateStr,
          day: currentDate.getDate(),
          bf: 0,
          production: 0,
          adj_in: 0,
          returns: 0,
          sold_out: 0,
          adj_out: 0,
          foc: 0,
          cf: 0,
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Merge production data
      for (const row of productionResult.rows) {
        if (dataByDate.has(row.date)) {
          dataByDate.get(row.date).production = parseInt(row.production) || 0;
        }
      }

      // Merge sales data
      for (const row of salesResult.rows) {
        if (dataByDate.has(row.date)) {
          const data = dataByDate.get(row.date);
          data.sold_out = parseInt(row.sold) || 0;
          data.foc = parseInt(row.foc) || 0;
          data.returns = parseInt(row.returns) || 0;
        }
      }

      // Merge adjustments data
      for (const row of adjustmentsResult.rows) {
        if (dataByDate.has(row.date)) {
          const data = dataByDate.get(row.date);
          data.adj_in = parseInt(row.adj_in) || 0;
          data.adj_out = parseInt(row.adj_out) || 0;
        }
      }

      // Calculate B/F and C/F for each day
      const movements = [];
      let runningBalance = openingBalance;

      for (const [, data] of dataByDate) {
        data.bf = runningBalance;

        // C/F = B/F + PRODUCTION + ADJ_IN - SOLD_OUT - ADJ_OUT - FOC - RETURNS
        // Returns DEDUCT from stock (products returned to supplier/factory)
        data.cf =
          data.bf +
          data.production +
          data.adj_in -
          data.sold_out -
          data.adj_out -
          data.foc -
          data.returns;

        runningBalance = data.cf;
        movements.push(data);
      }

      // Calculate monthly totals
      const monthlyTotals = movements.reduce(
        (totals, day) => {
          totals.production += day.production;
          totals.adj_in += day.adj_in;
          totals.returns += day.returns;
          totals.sold_out += day.sold_out;
          totals.adj_out += day.adj_out;
          totals.foc += day.foc;
          return totals;
        },
        {
          production: 0,
          adj_in: 0,
          returns: 0,
          sold_out: 0,
          adj_out: 0,
          foc: 0,
        }
      );

      res.json({
        product_id: product.id,
        product_description: product.description,
        product_type: product.type,
        opening_balance: openingBalance,
        initial_balance: initialBalance,
        date_range: {
          start_date: startDate,
          end_date: endDate,
          view_type,
        },
        movements,
        monthly_totals: monthlyTotals,
      });
    } catch (error) {
      console.error("Error fetching stock movements:", error);
      res.status(500).json({
        message: "Error fetching stock movements",
        error: error.message,
      });
    }
  });

  /**
   * GET /api/stock/closing-batch - Batch fetch closing stock for multiple products
   * More efficient than calling /movements for each product individually.
   *
   * Query params:
   * - product_ids: comma-separated product IDs (required)
   * - year: year (required)
   * - month: month 1-12 (required)
   *
   * Returns: { [product_id]: closing_quantity }
   */
  router.get("/closing-batch", async (req, res) => {
    try {
      const { product_ids, year, month } = req.query;

      if (!product_ids || !year || !month) {
        return res.status(400).json({
          message: "product_ids, year, and month are required",
        });
      }

      const productIdList = product_ids.split(",").map((id) => id.trim());
      const yearNum = parseInt(year);
      const monthNum = parseInt(month);

      // Calculate date range for the month
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0); // Last day of month
      const startDateStr = formatDateLocal(startDate);
      const endDateStr = formatDateLocal(endDate);

      // Results map
      const results = {};

      // Process in parallel for efficiency
      await Promise.all(
        productIdList.map(async (product_id) => {
          try {
            // Get initial balance
            const initialResult = await pool.query(
              `SELECT balance FROM stock_opening_balances
               WHERE product_id = $1
               ORDER BY effective_date DESC LIMIT 1`,
              [product_id]
            );
            const initialBalance = initialResult.rows.length > 0
              ? parseInt(initialResult.rows[0].balance) || 0
              : 0;

            // Get all production from system start date up to and including end date
            const productionResult = await pool.query(
              `SELECT COALESCE(SUM(bags_packed), 0) as total
               FROM production_entries
               WHERE product_id = $1
                 AND entry_date >= $2::date
                 AND entry_date <= $3::date`,
              [product_id, STOCK_SYSTEM_START_DATE, endDateStr]
            );
            const totalProduction = parseInt(productionResult.rows[0]?.total) || 0;

            // Get all sales from system start date up to and including end date
            const salesResult = await pool.query(
              `SELECT
                 COALESCE(SUM(od.quantity), 0) as sold,
                 COALESCE(SUM(COALESCE(od.freeproduct, 0)), 0) as foc,
                 COALESCE(SUM(COALESCE(od.returnproduct, 0)), 0) as returns
               FROM invoices i
               JOIN order_details od ON od.invoiceid = i.id
               WHERE od.code = $1
                 AND i.invoice_status != 'cancelled'
                 AND od.issubtotal IS NOT TRUE
                 AND (i.is_consolidated = false OR i.is_consolidated IS NULL)
                 AND DATE(TO_TIMESTAMP(CAST(i.createddate AS bigint) / 1000)) >= $2::date
                 AND DATE(TO_TIMESTAMP(CAST(i.createddate AS bigint) / 1000)) <= $3::date`,
              [product_id, STOCK_SYSTEM_START_DATE, endDateStr]
            );
            const totalSold = parseInt(salesResult.rows[0]?.sold) || 0;
            const totalFoc = parseInt(salesResult.rows[0]?.foc) || 0;
            const totalReturns = parseInt(salesResult.rows[0]?.returns) || 0;

            // Get all adjustments from system start date up to and including end date
            const adjustmentsResult = await pool.query(
              `SELECT
                 COALESCE(SUM(CASE WHEN adjustment_type = 'ADJ_IN' THEN quantity ELSE 0 END), 0) as adj_in,
                 COALESCE(SUM(CASE WHEN adjustment_type IN ('ADJ_OUT', 'DEFECT') THEN quantity ELSE 0 END), 0) as adj_out
               FROM stock_adjustments
               WHERE product_id = $1
                 AND entry_date >= $2
                 AND entry_date <= $3`,
              [product_id, STOCK_SYSTEM_START_DATE, endDateStr]
            );
            const totalAdjIn = parseInt(adjustmentsResult.rows[0]?.adj_in) || 0;
            const totalAdjOut = parseInt(adjustmentsResult.rows[0]?.adj_out) || 0;

            // Calculate closing balance
            // CF = Initial + Production + AdjIn - Sold - FOC - AdjOut - Returns
            const closingBalance =
              initialBalance +
              totalProduction +
              totalAdjIn -
              totalSold -
              totalFoc -
              totalAdjOut -
              totalReturns;

            results[product_id] = closingBalance;
          } catch (err) {
            console.error(`Error calculating closing for product ${product_id}:`, err);
            results[product_id] = 0;
          }
        })
      );

      res.json({
        year: yearNum,
        month: monthNum,
        end_date: endDateStr,
        closing_balances: results,
      });
    } catch (error) {
      console.error("Error fetching batch closing stock:", error);
      res.status(500).json({
        message: "Error fetching batch closing stock",
        error: error.message,
      });
    }
  });

  // GET /api/stock/opening-balance/:product_id - Get opening balance for product
  router.get("/opening-balance/:product_id", async (req, res) => {
    try {
      const { product_id } = req.params;
      const { effective_date } = req.query;

      let query;
      let params;

      if (effective_date) {
        // Get balance for specific date
        query = `
          SELECT *
          FROM stock_opening_balances
          WHERE product_id = $1 AND effective_date <= $2
          ORDER BY effective_date DESC
          LIMIT 1
        `;
        params = [product_id, effective_date];
      } else {
        // Get most recent balance
        query = `
          SELECT *
          FROM stock_opening_balances
          WHERE product_id = $1
          ORDER BY effective_date DESC
          LIMIT 1
        `;
        params = [product_id];
      }

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return res.json({
          product_id,
          balance: 0,
          effective_date: null,
          message: "No opening balance set for this product",
        });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching opening balance:", error);
      res.status(500).json({
        message: "Error fetching opening balance",
        error: error.message,
      });
    }
  });

  // GET /api/stock/opening-balances - List all opening balances
  router.get("/opening-balances", async (req, res) => {
    try {
      const query = `
        SELECT
          sob.*,
          p.description as product_description,
          p.type as product_type
        FROM stock_opening_balances sob
        LEFT JOIN products p ON sob.product_id = p.id
        ORDER BY sob.effective_date DESC, p.description
      `;

      const result = await pool.query(query);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching opening balances:", error);
      res.status(500).json({
        message: "Error fetching opening balances",
        error: error.message,
      });
    }
  });

  // POST /api/stock/opening-balance - Set/update opening balance
  // Opening balance is now global per product (not tied to a specific date)
  router.post("/opening-balance", async (req, res) => {
    try {
      const { product_id, balance, notes, created_by } = req.body;

      if (!product_id || balance === undefined) {
        return res.status(400).json({
          message: "product_id and balance are required",
        });
      }

      // Verify product exists
      const productCheck = await pool.query(
        "SELECT id FROM products WHERE id = $1",
        [product_id]
      );

      if (productCheck.rows.length === 0) {
        return res.status(404).json({
          message: "Product not found",
        });
      }

      // Use a far-future date for global balance (ensures it's always picked first by ORDER BY effective_date DESC)
      const fixedDate = "9999-12-31";

      // First, delete any old date-specific records for this product (migration cleanup)
      await pool.query(
        "DELETE FROM stock_opening_balances WHERE product_id = $1 AND effective_date != $2",
        [product_id, fixedDate]
      );

      const query = `
        INSERT INTO stock_opening_balances (product_id, balance, effective_date, notes, created_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (product_id, effective_date)
        DO UPDATE SET
          balance = EXCLUDED.balance,
          notes = EXCLUDED.notes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await pool.query(query, [
        product_id,
        balance,
        fixedDate,
        notes || null,
        created_by || null,
      ]);

      res.status(201).json({
        message: "Opening balance saved successfully",
        opening_balance: result.rows[0],
      });
    } catch (error) {
      console.error("Error saving opening balance:", error);
      res.status(500).json({
        message: "Error saving opening balance",
        error: error.message,
      });
    }
  });

  // PUT /api/stock/opening-balance/:id - Update opening balance by ID
  router.put("/opening-balance/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { balance, notes } = req.body;

      if (balance === undefined) {
        return res.status(400).json({
          message: "balance is required",
        });
      }

      const query = `
        UPDATE stock_opening_balances
        SET balance = $1, notes = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;

      const result = await pool.query(query, [balance, notes || null, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Opening balance record not found",
        });
      }

      res.json({
        message: "Opening balance updated successfully",
        opening_balance: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating opening balance:", error);
      res.status(500).json({
        message: "Error updating opening balance",
        error: error.message,
      });
    }
  });

  // DELETE /api/stock/opening-balance/:id - Delete opening balance
  router.delete("/opening-balance/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const query = `DELETE FROM stock_opening_balances WHERE id = $1 RETURNING *`;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Opening balance record not found",
        });
      }

      res.json({
        message: "Opening balance deleted successfully",
        opening_balance: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting opening balance:", error);
      res.status(500).json({
        message: "Error deleting opening balance",
        error: error.message,
      });
    }
  });

  // --- Stock Adjustments Routes (placeholder for future) ---

  // GET /api/stock/adjustments - List adjustments
  router.get("/adjustments", async (req, res) => {
    try {
      const { product_id, start_date, end_date, adjustment_type } = req.query;

      let query = `
        SELECT
          sa.*,
          p.description as product_description
        FROM stock_adjustments sa
        LEFT JOIN products p ON sa.product_id = p.id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (product_id) {
        query += ` AND sa.product_id = $${paramCount++}`;
        params.push(product_id);
      }

      if (start_date && end_date) {
        query += ` AND sa.entry_date BETWEEN $${paramCount++} AND $${paramCount++}`;
        params.push(start_date, end_date);
      }

      if (adjustment_type) {
        query += ` AND sa.adjustment_type = $${paramCount++}`;
        params.push(adjustment_type);
      }

      query += ` ORDER BY sa.entry_date DESC, sa.created_at DESC`;

      const result = await pool.query(query, params);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching stock adjustments:", error);
      res.status(500).json({
        message: "Error fetching stock adjustments",
        error: error.message,
      });
    }
  });

  // POST /api/stock/adjustment - Create adjustment (placeholder)
  router.post("/adjustment", async (req, res) => {
    try {
      const {
        entry_date,
        product_id,
        adjustment_type,
        quantity,
        reason,
        created_by,
      } = req.body;

      if (!entry_date || !product_id || !adjustment_type || quantity === undefined) {
        return res.status(400).json({
          message:
            "entry_date, product_id, adjustment_type, and quantity are required",
        });
      }

      if (!["ADJ_IN", "ADJ_OUT", "DEFECT"].includes(adjustment_type)) {
        return res.status(400).json({
          message:
            "adjustment_type must be one of: ADJ_IN, ADJ_OUT, DEFECT",
        });
      }

      const query = `
        INSERT INTO stock_adjustments (entry_date, product_id, adjustment_type, quantity, reason, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const result = await pool.query(query, [
        entry_date,
        product_id,
        adjustment_type,
        quantity,
        reason || null,
        created_by || null,
      ]);

      res.status(201).json({
        message: "Stock adjustment created successfully",
        adjustment: result.rows[0],
      });
    } catch (error) {
      console.error("Error creating stock adjustment:", error);
      res.status(500).json({
        message: "Error creating stock adjustment",
        error: error.message,
      });
    }
  });

  // DELETE /api/stock/adjustment/:id - Delete adjustment
  router.delete("/adjustment/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const query = `DELETE FROM stock_adjustments WHERE id = $1 RETURNING *`;

      const result = await pool.query(query, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Stock adjustment not found",
        });
      }

      res.json({
        message: "Stock adjustment deleted successfully",
        adjustment: result.rows[0],
      });
    } catch (error) {
      console.error("Error deleting stock adjustment:", error);
      res.status(500).json({
        message: "Error deleting stock adjustment",
        error: error.message,
      });
    }
  });

  // --- Monthly Stock Adjustments (ADJ+/ADJ-) Routes ---

  /**
   * GET /api/stock/adjustments/references
   * List unique references for a given month with summary info
   * Query params: month=YYYY-MM
   */
  router.get("/adjustments/references", async (req, res) => {
    try {
      const { month } = req.query;

      if (!month) {
        return res.status(400).json({
          message: "month parameter is required (format: YYYY-MM)",
        });
      }

      // Parse month to get date range
      const [year, monthNum] = month.split("-").map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0); // Last day of month

      const query = `
        SELECT
          reference,
          COUNT(DISTINCT product_id) as product_count,
          SUM(CASE WHEN adjustment_type = 'ADJ_IN' THEN quantity ELSE 0 END) as total_adj_in,
          SUM(CASE WHEN adjustment_type IN ('ADJ_OUT', 'DEFECT') THEN quantity ELSE 0 END) as total_adj_out,
          MIN(created_at) as created_at
        FROM stock_adjustments
        WHERE entry_date BETWEEN $1 AND $2
          AND reference IS NOT NULL
        GROUP BY reference
        ORDER BY created_at DESC
      `;

      const result = await pool.query(query, [
        startDate.toISOString().split("T")[0],
        endDate.toISOString().split("T")[0],
      ]);

      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching adjustment references:", error);
      res.status(500).json({
        message: "Error fetching adjustment references",
        error: error.message,
      });
    }
  });

  /**
   * GET /api/stock/adjustments/by-reference
   * Get all adjustments for a specific reference in a month
   * Query params: month=YYYY-MM, reference=REF-123
   */
  router.get("/adjustments/by-reference", async (req, res) => {
    try {
      const { month, reference } = req.query;

      if (!month || !reference) {
        return res.status(400).json({
          message: "month and reference parameters are required",
        });
      }

      // Parse month to get date range
      const [year, monthNum] = month.split("-").map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0);

      const query = `
        SELECT
          sa.id,
          sa.entry_date,
          sa.product_id,
          sa.adjustment_type,
          sa.quantity,
          sa.reference,
          sa.reason,
          sa.created_at,
          p.description as product_description,
          p.type as product_type
        FROM stock_adjustments sa
        LEFT JOIN products p ON sa.product_id = p.id
        WHERE sa.entry_date BETWEEN $1 AND $2
          AND sa.reference = $3
        ORDER BY p.type, p.id
      `;

      const result = await pool.query(query, [
        startDate.toISOString().split("T")[0],
        endDate.toISOString().split("T")[0],
        reference,
      ]);

      // Group by product_id and combine ADJ_IN and ADJ_OUT
      const adjustmentsByProduct = new Map();
      for (const row of result.rows) {
        if (!adjustmentsByProduct.has(row.product_id)) {
          adjustmentsByProduct.set(row.product_id, {
            product_id: row.product_id,
            product_description: row.product_description,
            product_type: row.product_type,
            adj_in: 0,
            adj_out: 0,
          });
        }
        const entry = adjustmentsByProduct.get(row.product_id);
        if (row.adjustment_type === "ADJ_IN") {
          entry.adj_in += row.quantity;
        } else {
          entry.adj_out += row.quantity;
        }
      }

      res.json({
        reference,
        month,
        adjustments: Array.from(adjustmentsByProduct.values()),
      });
    } catch (error) {
      console.error("Error fetching adjustments by reference:", error);
      res.status(500).json({
        message: "Error fetching adjustments by reference",
        error: error.message,
      });
    }
  });

  /**
   * POST /api/stock/adjustments/batch
   * Batch save adjustments for a month with a reference
   * Body: { month: "YYYY-MM", reference: "REF-123", adjustments: [{ product_id, adj_in, adj_out }] }
   */
  router.post("/adjustments/batch", async (req, res) => {
    try {
      const { month, reference, adjustments, created_by } = req.body;

      if (!month || !reference || !Array.isArray(adjustments)) {
        return res.status(400).json({
          message: "month, reference, and adjustments array are required",
        });
      }

      // Parse month to get last day
      const [year, monthNum] = month.split("-").map(Number);
      const lastDayOfMonth = new Date(year, monthNum, 0);
      const entryDate = lastDayOfMonth.toISOString().split("T")[0];

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // First, delete existing adjustments for this reference and month
        await client.query(
          `DELETE FROM stock_adjustments
           WHERE reference = $1
           AND entry_date = $2`,
          [reference, entryDate]
        );

        const savedEntries = [];

        for (const adj of adjustments) {
          const { product_id, adj_in, adj_out } = adj;

          if (!product_id) continue;

          // Insert ADJ_IN if quantity > 0
          if (adj_in && adj_in > 0) {
            const result = await client.query(
              `INSERT INTO stock_adjustments (entry_date, product_id, adjustment_type, quantity, reference, created_by)
               VALUES ($1, $2, 'ADJ_IN', $3, $4, $5)
               RETURNING *`,
              [entryDate, product_id, adj_in, reference, created_by || null]
            );
            savedEntries.push(result.rows[0]);
          }

          // Insert ADJ_OUT if quantity > 0
          if (adj_out && adj_out > 0) {
            const result = await client.query(
              `INSERT INTO stock_adjustments (entry_date, product_id, adjustment_type, quantity, reference, created_by)
               VALUES ($1, $2, 'ADJ_OUT', $3, $4, $5)
               RETURNING *`,
              [entryDate, product_id, adj_out, reference, created_by || null]
            );
            savedEntries.push(result.rows[0]);
          }
        }

        await client.query("COMMIT");

        // Calculate totals
        const totalAdjIn = savedEntries
          .filter((e) => e.adjustment_type === "ADJ_IN")
          .reduce((sum, e) => sum + e.quantity, 0);
        const totalAdjOut = savedEntries
          .filter((e) => e.adjustment_type === "ADJ_OUT")
          .reduce((sum, e) => sum + e.quantity, 0);

        res.json({
          message: "Stock adjustments saved successfully",
          reference,
          entry_date: entryDate,
          entry_count: savedEntries.length,
          total_adj_in: totalAdjIn,
          total_adj_out: totalAdjOut,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error batch saving stock adjustments:", error);
      res.status(500).json({
        message: "Error saving stock adjustments",
        error: error.message,
      });
    }
  });

  /**
   * DELETE /api/stock/adjustments/by-reference
   * Delete all adjustments for a specific reference in a month
   * Query params: month=YYYY-MM, reference=REF-123
   */
  router.delete("/adjustments/by-reference", async (req, res) => {
    try {
      const { month, reference } = req.query;

      if (!month || !reference) {
        return res.status(400).json({
          message: "month and reference parameters are required",
        });
      }

      // Parse month to get date range
      const [year, monthNum] = month.split("-").map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0);

      const query = `
        DELETE FROM stock_adjustments
        WHERE entry_date BETWEEN $1 AND $2
          AND reference = $3
        RETURNING *
      `;

      const result = await pool.query(query, [
        startDate.toISOString().split("T")[0],
        endDate.toISOString().split("T")[0],
        reference,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "No adjustments found for this reference",
        });
      }

      res.json({
        message: "Stock adjustments deleted successfully",
        deleted_count: result.rows.length,
        reference,
      });
    } catch (error) {
      console.error("Error deleting adjustments by reference:", error);
      res.status(500).json({
        message: "Error deleting stock adjustments",
        error: error.message,
      });
    }
  });

  return router;
}
