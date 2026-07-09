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

  const normalizeDateString = (value) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

    const [year, month, day] = normalized.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return normalized;
  };

  const getMonthRangeFromString = (monthValue) => {
    if (typeof monthValue !== "string" || !/^\d{4}-\d{2}$/.test(monthValue)) {
      return null;
    }

    const [year, monthNum] = monthValue.split("-").map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      return null;
    }

    return {
      year,
      monthNum,
      startDate: formatDateLocal(new Date(year, monthNum - 1, 1)),
      endDate: formatDateLocal(new Date(year, monthNum, 0)),
    };
  };

  const isDateInMonth = (dateString, monthRange) => {
    return dateString >= monthRange.startDate && dateString <= monthRange.endDate;
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

      // Jelly Polly products: production lives in jellypolly.production_entries
      // and sales flow through BOTH companies' invoices. TH products keep the
      // original public-only sources (identical semantics to the old queries).
      const isJPProduct = product.type === "JP";
      const productionSource = isJPProduct
        ? "jellypolly.production_entries"
        : "production_entries";
      const publicSalesSelect = `
        SELECT i.createddate, i.invoice_status, i.is_consolidated,
               od.code, od.quantity, od.freeproduct, od.returnproduct, od.issubtotal
        FROM invoices i
        JOIN order_details od ON od.invoiceid = i.id`;
      const jpSalesSelect = `
        SELECT i.createddate, i.invoice_status, i.is_consolidated,
               od.code, od.quantity, od.freeproduct, od.returnproduct, od.issubtotal
        FROM jellypolly.invoices i
        JOIN jellypolly.order_details od ON od.invoiceid = i.id`;
      const salesSource = isJPProduct
        ? `(${publicSalesSelect} UNION ALL ${jpSalesSelect}) s`
        : `(${publicSalesSelect}) s`;

      // Get initial balance (admin-set migration/opening balance) and its anchor date.
      // The balance represents stock as of the START of `anchorDate`; movements on/after
      // that date are applied on top, and anything before it is ignored. When no opening
      // balance is set, fall back to the system start date with a zero balance.
      const initialBalanceQuery = `
        SELECT balance, effective_date::text AS effective_date
        FROM stock_opening_balances
        WHERE product_id = $1
        ORDER BY effective_date DESC
        LIMIT 1
      `;
      const initialResult = await pool.query(initialBalanceQuery, [product_id]);
      const hasInitialBalance = initialResult.rows.length > 0;
      const initialBalance = hasInitialBalance
        ? parseInt(initialResult.rows[0].balance) || 0
        : 0;
      const anchorDate = hasInitialBalance
        ? initialResult.rows[0].effective_date
        : STOCK_SYSTEM_START_DATE;

      // Calculate brought forward (B/F) by summing movements from the anchor date to before start date
      // B/F = Initial Balance + (production + returns + adj_in) - (sold + foc + adj_out)
      // Data before the anchor date is ignored - initial balance represents stock as of that date
      // Use DATE comparison for consistency (not timestamp)

      // Get prior production total (only from system start date onwards)
      const priorProductionQuery = `
        SELECT COALESCE(SUM(bags_packed), 0) as total
        FROM ${productionSource}
        WHERE product_id = $1
          AND entry_date >= $2::date
          AND entry_date < $3::date
      `;
      const priorProductionResult = await pool.query(priorProductionQuery, [
        product_id,
        anchorDate,
        startDate,
      ]);
      const priorProduction = parseInt(priorProductionResult.rows[0]?.total || 0);

      // Get prior sales totals (sold, foc, returns) - only from system start date onwards
      // Use DATE extraction to match the period query's date grouping logic
      const priorSalesQuery = `
        SELECT
          COALESCE(SUM(s.quantity), 0) as sold,
          COALESCE(SUM(COALESCE(s.freeproduct, 0)), 0) as foc,
          COALESCE(SUM(COALESCE(s.returnproduct, 0)), 0) as returns
        FROM ${salesSource}
        WHERE s.code = $1
          AND s.invoice_status != 'cancelled'
          AND s.issubtotal IS NOT TRUE
          AND (s.is_consolidated = false OR s.is_consolidated IS NULL)
          AND DATE(TO_TIMESTAMP(CAST(s.createddate AS bigint) / 1000)) >= $2::date
          AND DATE(TO_TIMESTAMP(CAST(s.createddate AS bigint) / 1000)) < $3::date
      `;
      const priorSalesResult = await pool.query(priorSalesQuery, [
        product_id,
        anchorDate,
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
        anchorDate,
        startDate,
      ]);
      const priorAdjIn = parseInt(priorAdjustmentsResult.rows[0]?.adj_in || 0);
      const priorAdjOut = parseInt(priorAdjustmentsResult.rows[0]?.adj_out || 0);

      // Calculate opening balance (B/F) at the start of the viewed period.
      // If the anchor date is after the period start, the product has not been
      // "opened" yet at the period start, so B/F starts at 0 and the anchor
      // balance is injected on its effective date in the daily loop below.
      // Returns DEDUCT from stock (products returned to supplier/factory)
      const openingBalance =
        anchorDate <= startDate
          ? initialBalance +
            priorProduction +
            priorAdjIn -
            priorSold -
            priorFoc -
            priorAdjOut -
            priorReturns
          : 0;

      // Get production data grouped by date
      const productionQuery = `
        SELECT
          entry_date::text as date,
          SUM(bags_packed) as production
        FROM ${productionSource}
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
          DATE(TO_TIMESTAMP(CAST(s.createddate AS bigint) / 1000))::text as date,
          SUM(s.quantity) as sold,
          SUM(COALESCE(s.freeproduct, 0)) as foc,
          SUM(COALESCE(s.returnproduct, 0)) as returns
        FROM ${salesSource}
        WHERE s.code = $1
          AND s.invoice_status != 'cancelled'
          AND s.issubtotal IS NOT TRUE
          AND (s.is_consolidated = false OR s.is_consolidated IS NULL)
          AND DATE(TO_TIMESTAMP(CAST(s.createddate AS bigint) / 1000)) BETWEEN $2::date AND $3::date
        GROUP BY DATE(TO_TIMESTAMP(CAST(s.createddate AS bigint) / 1000))
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

      // Merge production data (ignore anything before the anchor date)
      for (const row of productionResult.rows) {
        if (dataByDate.has(row.date) && row.date >= anchorDate) {
          dataByDate.get(row.date).production = parseInt(row.production) || 0;
        }
      }

      // Merge sales data (ignore anything before the anchor date)
      for (const row of salesResult.rows) {
        if (dataByDate.has(row.date) && row.date >= anchorDate) {
          const data = dataByDate.get(row.date);
          data.sold_out = parseInt(row.sold) || 0;
          data.foc = parseInt(row.foc) || 0;
          data.returns = parseInt(row.returns) || 0;
        }
      }

      // Merge adjustments data (ignore anything before the anchor date)
      for (const row of adjustmentsResult.rows) {
        if (dataByDate.has(row.date) && row.date >= anchorDate) {
          const data = dataByDate.get(row.date);
          data.adj_in = parseInt(row.adj_in) || 0;
          data.adj_out = parseInt(row.adj_out) || 0;
        }
      }

      // Calculate B/F and C/F for each day
      const movements = [];
      let runningBalance = openingBalance;

      for (const [, data] of dataByDate) {
        // When the anchor date falls inside the viewed period (i.e. the opening
        // balance becomes effective mid-period), seed the running balance with the
        // initial balance at the start of that day.
        if (data.date === anchorDate) {
          runningBalance = initialBalance;
        }

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
        initial_balance_date: hasInitialBalance ? anchorDate : null,
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

      // Product types decide the data sources (JP products read the
      // jellypolly production table and both companies' invoices)
      const typesResult = await pool.query(
        "SELECT id, type FROM products WHERE id = ANY($1)",
        [productIdList]
      );
      const typeById = new Map(typesResult.rows.map((r) => [r.id, r.type]));
      const publicSalesSelect = `
        SELECT i.createddate, i.invoice_status, i.is_consolidated,
               od.code, od.quantity, od.freeproduct, od.returnproduct, od.issubtotal
        FROM invoices i
        JOIN order_details od ON od.invoiceid = i.id`;
      const jpSalesSelect = `
        SELECT i.createddate, i.invoice_status, i.is_consolidated,
               od.code, od.quantity, od.freeproduct, od.returnproduct, od.issubtotal
        FROM jellypolly.invoices i
        JOIN jellypolly.order_details od ON od.invoiceid = i.id`;

      // Process in parallel for efficiency
      await Promise.all(
        productIdList.map(async (product_id) => {
          try {
            const isJPProduct = typeById.get(product_id) === "JP";
            const productionSource = isJPProduct
              ? "jellypolly.production_entries"
              : "production_entries";
            const salesSource = isJPProduct
              ? `(${publicSalesSelect} UNION ALL ${jpSalesSelect}) s`
              : `(${publicSalesSelect}) s`;
            // Get initial balance and its anchor (effective) date
            const initialResult = await pool.query(
              `SELECT balance, effective_date::text AS effective_date FROM stock_opening_balances
               WHERE product_id = $1
               ORDER BY effective_date DESC LIMIT 1`,
              [product_id]
            );
            const hasInitialBalance = initialResult.rows.length > 0;
            const initialBalance = hasInitialBalance
              ? parseInt(initialResult.rows[0].balance) || 0
              : 0;
            const anchorDate = hasInitialBalance
              ? initialResult.rows[0].effective_date
              : STOCK_SYSTEM_START_DATE;

            // Get all production from system start date up to and including end date
            const productionResult = await pool.query(
              `SELECT COALESCE(SUM(bags_packed), 0) as total
               FROM ${productionSource}
               WHERE product_id = $1
                 AND entry_date >= $2::date
                 AND entry_date <= $3::date`,
              [product_id, anchorDate, endDateStr]
            );
            const totalProduction = parseInt(productionResult.rows[0]?.total) || 0;

            // Get all sales from system start date up to and including end date
            const salesResult = await pool.query(
              `SELECT
                 COALESCE(SUM(s.quantity), 0) as sold,
                 COALESCE(SUM(COALESCE(s.freeproduct, 0)), 0) as foc,
                 COALESCE(SUM(COALESCE(s.returnproduct, 0)), 0) as returns
               FROM ${salesSource}
               WHERE s.code = $1
                 AND s.invoice_status != 'cancelled'
                 AND s.issubtotal IS NOT TRUE
                 AND (s.is_consolidated = false OR s.is_consolidated IS NULL)
                 AND DATE(TO_TIMESTAMP(CAST(s.createddate AS bigint) / 1000)) >= $2::date
                 AND DATE(TO_TIMESTAMP(CAST(s.createddate AS bigint) / 1000)) <= $3::date`,
              [product_id, anchorDate, endDateStr]
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
              [product_id, anchorDate, endDateStr]
            );
            const totalAdjIn = parseInt(adjustmentsResult.rows[0]?.adj_in) || 0;
            const totalAdjOut = parseInt(adjustmentsResult.rows[0]?.adj_out) || 0;

            // Calculate closing balance
            // CF = Initial + Production + AdjIn - Sold - FOC - AdjOut - Returns
            // If the anchor date is after the period end, the product is not yet
            // "opened" within this period, so closing stock is 0.
            const closingBalance =
              anchorDate > endDateStr
                ? 0
                : initialBalance +
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
  // One opening balance per product, effective from a chosen anchor date. The
  // balance represents stock as of the START of that date; movements on/after it
  // are applied on top and anything before it is ignored in B/F calculations.
  router.post("/opening-balance", async (req, res) => {
    try {
      const { product_id, balance, effective_date, notes, created_by } =
        req.body;

      if (!product_id || balance === undefined) {
        return res.status(400).json({
          message: "product_id and balance are required",
        });
      }

      // Anchor date the balance is effective from; defaults to the system start date.
      const anchorDate = effective_date || STOCK_SYSTEM_START_DATE;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
        return res.status(400).json({
          message: "effective_date must be in YYYY-MM-DD format",
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

      // Keep a single opening balance per product: remove any record on a different date
      await pool.query(
        "DELETE FROM stock_opening_balances WHERE product_id = $1 AND effective_date != $2",
        [product_id, anchorDate]
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
        anchorDate,
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

      const monthRange = getMonthRangeFromString(month);
      if (!monthRange) {
        return res.status(400).json({
          message: "month parameter must be in YYYY-MM format",
        });
      }

      const query = `
        SELECT
          reference,
          MIN(entry_date)::text as entry_date,
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
        monthRange.startDate,
        monthRange.endDate,
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

      const monthRange = getMonthRangeFromString(month);
      if (!monthRange) {
        return res.status(400).json({
          message: "month parameter must be in YYYY-MM format",
        });
      }

      const query = `
        SELECT
          sa.id,
          sa.entry_date::text as entry_date,
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
        monthRange.startDate,
        monthRange.endDate,
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
        entry_date: result.rows[0]?.entry_date || null,
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
   * Body: { month: "YYYY-MM", entry_date: "YYYY-MM-DD", reference: "REF-123", adjustments: [{ product_id, adj_in, adj_out }] }
   */
  router.post("/adjustments/batch", async (req, res) => {
    try {
      const { month, reference, entry_date, adjustments, created_by } = req.body;

      if (!month || !reference || !Array.isArray(adjustments)) {
        return res.status(400).json({
          message: "month, reference, and adjustments array are required",
        });
      }

      const monthRange = getMonthRangeFromString(month);
      if (!monthRange) {
        return res.status(400).json({
          message: "month must be in YYYY-MM format",
        });
      }

      const entryDate =
        entry_date === undefined || entry_date === null || entry_date === ""
          ? monthRange.endDate
          : normalizeDateString(entry_date);

      if (!entryDate) {
        return res.status(400).json({
          message: "entry_date must be a valid date in YYYY-MM-DD format",
        });
      }

      if (!isDateInMonth(entryDate, monthRange)) {
        return res.status(400).json({
          message: "entry_date must be within the submitted month",
        });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // First, delete existing adjustments for this reference and month
        await client.query(
          `DELETE FROM stock_adjustments
           WHERE reference = $1
           AND entry_date BETWEEN $2 AND $3`,
          [reference, monthRange.startDate, monthRange.endDate]
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
   * PUT /api/stock/adjustments/by-reference/product
   * Save one product adjustment for a month/reference without replacing other products.
   * Body: { month: "YYYY-MM", entry_date: "YYYY-MM-DD", reference: "REF-123", product_id, adj_in, adj_out }
   */
  router.put("/adjustments/by-reference/product", async (req, res) => {
    try {
      const {
        month,
        reference,
        entry_date,
        product_id,
        adj_in = 0,
        adj_out = 0,
        created_by,
      } = req.body;

      if (!month || !reference || !product_id) {
        return res.status(400).json({
          message: "month, reference, and product_id are required",
        });
      }

      const monthRange = getMonthRangeFromString(month);
      if (!monthRange) {
        return res.status(400).json({
          message: "month must be in YYYY-MM format",
        });
      }

      const entryDate =
        entry_date === undefined || entry_date === null || entry_date === ""
          ? monthRange.endDate
          : normalizeDateString(entry_date);

      if (!entryDate) {
        return res.status(400).json({
          message: "entry_date must be a valid date in YYYY-MM-DD format",
        });
      }

      if (!isDateInMonth(entryDate, monthRange)) {
        return res.status(400).json({
          message: "entry_date must be within the submitted month",
        });
      }

      const adjInQuantity = parseFloat(adj_in) || 0;
      const adjOutQuantity = parseFloat(adj_out) || 0;
      const savedEntries = [];
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        await client.query(
          `DELETE FROM stock_adjustments
           WHERE reference = $1
             AND product_id = $2
             AND entry_date BETWEEN $3 AND $4`,
          [reference, product_id, monthRange.startDate, monthRange.endDate]
        );

        if (adjInQuantity > 0) {
          const result = await client.query(
            `INSERT INTO stock_adjustments (entry_date, product_id, adjustment_type, quantity, reference, created_by)
             VALUES ($1, $2, 'ADJ_IN', $3, $4, $5)
             RETURNING *`,
            [entryDate, product_id, adjInQuantity, reference, created_by || null]
          );
          savedEntries.push(result.rows[0]);
        }

        if (adjOutQuantity > 0) {
          const result = await client.query(
            `INSERT INTO stock_adjustments (entry_date, product_id, adjustment_type, quantity, reference, created_by)
             VALUES ($1, $2, 'ADJ_OUT', $3, $4, $5)
             RETURNING *`,
            [entryDate, product_id, adjOutQuantity, reference, created_by || null]
          );
          savedEntries.push(result.rows[0]);
        }

        await client.query("COMMIT");

        res.json({
          message: "Stock adjustment saved successfully",
          reference,
          product_id,
          entry_date: entryDate,
          entry_count: savedEntries.length,
          total_adj_in: adjInQuantity,
          total_adj_out: adjOutQuantity,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Error saving product stock adjustment:", error);
      res.status(500).json({
        message: "Error saving product stock adjustment",
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

      const monthRange = getMonthRangeFromString(month);
      if (!monthRange) {
        return res.status(400).json({
          message: "month parameter must be in YYYY-MM format",
        });
      }

      const query = `
        DELETE FROM stock_adjustments
        WHERE entry_date BETWEEN $1 AND $2
          AND reference = $3
        RETURNING *
      `;

      const result = await pool.query(query, [
        monthRange.startDate,
        monthRange.endDate,
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
