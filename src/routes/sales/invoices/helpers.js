// src/routes/sales/invoices/helpers.js

// Helper function to check if a value is empty or invalid
export const isEmptyOrInvalid = (value) => {
    return value === '' || value === null || value === undefined || 
           Number.isNaN(value) || value === '\r' || value === 'NaN';
  };
  
  // Helper function to check if a row should be removed
  export const shouldRemoveRow = (row) => {
    return isEmptyOrInvalid(row.code);
  };
  
  // Helper function to sanitize a single order detail
  export const sanitizeOrderDetail = (detail) => {
    const sanitized = { ...detail };
    for (const key in sanitized) {
      if (isEmptyOrInvalid(sanitized[key])) {
        if (key === 'qty' || key === 'price' || key === 'total' || key === 'discount' || key === 'tax') {
          sanitized[key] = '0';
        } else if (key === 'foc' || key === 'returned') {
          sanitized[key] = 0;
        } else {
          sanitized[key] = '';
        }
      }
    }
    return sanitized;
  };
  
  // Helper function to sanitize numeric values
  export const sanitizeNumeric = (value) => {
    if (typeof value === 'string') {
      return value.replace(/[^\d.-]/g, '');
    }
    return value;
  };
  
  // Helper function to cleanup orphaned total rows
  export const cleanupOrphanedTotalRows = async (client) => {
    const query = `
      DELETE FROM order_details
      WHERE (
        istotal = true OR 
        issubtotal = true OR 
        isless = true OR 
        istax = true OR
        isfoc = true OR
        isreturned = true OR
        code = '' OR code IS NULL
      ) AND (
        invoiceId NOT IN (SELECT id FROM invoices)
        OR
        invoiceId IN (
          SELECT invoiceId
          FROM order_details
          GROUP BY invoiceId
          HAVING COUNT(*) = SUM(
            CASE WHEN istotal OR issubtotal OR isless OR istax OR isfoc OR isreturned 
                 OR code = '' OR code IS NULL THEN 1 ELSE 0 END
          )
        )
      )
    `;
    await client.query(query);
  };
  
  // Helper function to fetch invoice from database
  export const fetchInvoiceFromDb = async (pool, invoiceId) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
  
      const invoiceQuery = `
        SELECT 
          i.id, 
          i.invoiceno, 
          i.orderno, 
          TO_CHAR(i.date, 'DD/MM/YYYY') as date,
          i.type,
          i.customer,
          i.customername,
          i.salesman,
          i.totalamount as "totalAmount",
          TO_CHAR(i.time, 'HH24:MI') as time
        FROM 
          invoices i
        WHERE 
          i.id = $1
      `;
      
      const invoiceResult = await client.query(invoiceQuery, [invoiceId]);
      
      if (invoiceResult.rows.length === 0) {
        throw new Error(`Invoice not found: ${invoiceId}`);
      }
  
      const orderDetailsQuery = `
        SELECT 
          od.code,
          od.productname as "productname",
          od.qty,
          od.price,
          od.total,
          od.isfoc as "isfoc",
          od.isreturned as "isreturned",
          od.istotal as "istotal",
          od.issubtotal as "issubtotal",
          od.isless as "isless",
          od.istax as "istax"
        FROM 
          order_details od
        WHERE 
          od.invoiceid = $1
        ORDER BY 
          CASE 
            WHEN od.istotal = true THEN 4
            WHEN od.issubtotal = true THEN 3
            WHEN od.isless = true THEN 2
            WHEN od.istax = true THEN 1
            ELSE 0 
          END,
          od.id
      `;
  
      const orderDetailsResult = await client.query(orderDetailsQuery, [invoiceId]);
  
      await client.query('COMMIT');
  
      return {
        ...invoiceResult.rows[0],
        orderDetails: orderDetailsResult.rows.map(detail => ({
          ...detail,
          qty: Number(detail.qty),
          price: Number(detail.price),
          total: detail.total
        }))
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };