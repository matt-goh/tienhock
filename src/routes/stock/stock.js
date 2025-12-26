// src/routes/stock/stock.js
import { Router } from "express";

export default function (pool) {
  const router = Router();

  // Initialize tables on module load
  const initializeTables = async () => {
    try {
      // Create stock_opening_balances table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_opening_balances (
          id SERIAL PRIMARY KEY,
          product_id VARCHAR(50) NOT NULL,
          balance INTEGER NOT NULL DEFAULT 0,
          effective_date DATE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by VARCHAR(50),
          notes TEXT,
          UNIQUE(product_id, effective_date)
        )
      `);

      // Create indexes
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_stock_opening_product
        ON stock_opening_balances(product_id)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_stock_opening_date
        ON stock_opening_balances(effective_date)
      `);

      // Create stock_adjustments table (for future ADJ/IN, ADJ/OUT)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stock_adjustments (
          id SERIAL PRIMARY KEY,
          entry_date DATE NOT NULL,
          product_id VARCHAR(50) NOT NULL,
          adjustment_type VARCHAR(20) NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by VARCHAR(50),
          CONSTRAINT valid_adjustment_type CHECK (adjustment_type IN ('ADJ_IN', 'ADJ_OUT', 'DEFECT'))
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_stock_adjustments_date
        ON stock_adjustments(entry_date)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product
        ON stock_adjustments(product_id)
      `);

      console.log("Stock tables initialized successfully");
    } catch (error) {
      console.error("Error initializing stock tables:", error);
    }
  };

  // Initialize tables when module loads
  initializeTables();

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
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      };
    } else if (viewType === "rolling") {
      // Rolling 31-day view
      const endDate = new Date(now);
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      };
    } else {
      // Default: current month
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
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

      // Convert dates to timestamps for invoice queries (milliseconds)
      const startTimestamp = new Date(startDate).setHours(0, 0, 0, 0);
      const endTimestamp = new Date(endDate).setHours(23, 59, 59, 999);

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

      // Calculate brought forward (B/F) by summing all movements BEFORE start date
      // B/F = Initial Balance + (production + returns + adj_in) - (sold + foc + adj_out) before start_date
      const priorStartTimestamp = new Date(startDate).setHours(0, 0, 0, 0) - 1; // Day before start

      // Get prior production total
      const priorProductionQuery = `
        SELECT COALESCE(SUM(bags_packed), 0) as total
        FROM production_entries
        WHERE product_id = $1 AND entry_date < $2
      `;
      const priorProductionResult = await pool.query(priorProductionQuery, [
        product_id,
        startDate,
      ]);
      const priorProduction = parseInt(priorProductionResult.rows[0]?.total || 0);

      // Get prior sales totals (sold, foc, returns)
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
          AND CAST(i.createddate AS bigint) < $2
      `;
      const priorSalesResult = await pool.query(priorSalesQuery, [
        product_id,
        priorStartTimestamp.toString(),
      ]);
      const priorSold = parseInt(priorSalesResult.rows[0]?.sold || 0);
      const priorFoc = parseInt(priorSalesResult.rows[0]?.foc || 0);
      const priorReturns = parseInt(priorSalesResult.rows[0]?.returns || 0);

      // Get prior adjustments totals
      const priorAdjustmentsQuery = `
        SELECT
          COALESCE(SUM(CASE WHEN adjustment_type = 'ADJ_IN' THEN quantity ELSE 0 END), 0) as adj_in,
          COALESCE(SUM(CASE WHEN adjustment_type IN ('ADJ_OUT', 'DEFECT') THEN quantity ELSE 0 END), 0) as adj_out
        FROM stock_adjustments
        WHERE product_id = $1 AND entry_date < $2
      `;
      const priorAdjustmentsResult = await pool.query(priorAdjustmentsQuery, [
        product_id,
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
          AND CAST(i.createddate AS bigint) BETWEEN $2 AND $3
        GROUP BY DATE(TO_TIMESTAMP(CAST(i.createddate AS bigint) / 1000))
        ORDER BY date
      `;
      const salesResult = await pool.query(salesQuery, [
        product_id,
        startTimestamp.toString(),
        endTimestamp.toString(),
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
      const currentDate = new Date(startDate);
      const endDateObj = new Date(endDate);

      while (currentDate <= endDateObj) {
        const dateStr = currentDate.toISOString().split("T")[0];
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

  return router;
}
