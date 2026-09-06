/**
 * @typedef {{ pay_code_id: string, description?: string, rate: number|string,
 * rate_unit: string, quantity: number|string, amount: number|string, is_manual?: boolean,
 * job_type?: string|null, source_employee_id?: string|null, source_date?: string|Date|null,
 * work_log_id?: number|null, work_log_type?: string|null, foc_units?: number|null }} PayrollItem
 */

/**
 * Values, including numeric-looking input and imported descriptions, must never
 * become SQL syntax. Chunking stays below PostgreSQL's parameter limit.
 * @param {{ query: Function }} client
 * @param {number} payrollId
 * @param {PayrollItem[]} items
 * @param {boolean} [includeSource]
 * @returns {Promise<void>}
 */
export async function insertPayrollItems(client, payrollId, items, includeSource = false) {
  if (!Array.isArray(items) || items.length > 10000) {
    throw new Error('Invalid payroll items');
  }
  /** @type {string[]} */
  const columns = ['employee_payroll_id', 'pay_code_id', 'description', 'rate', 'rate_unit', 'quantity', 'amount', 'is_manual'];
  if (includeSource) columns.push('job_type', 'source_employee_id', 'source_date', 'work_log_id', 'work_log_type', 'foc_units');
  for (let offset = 0; offset < items.length; offset += 500) {
    /** @type {unknown[]} */
    const values = [];
    /** @type {string[]} */
    const placeholders = [];
    for (const item of items.slice(offset, offset + 500)) {
      if (!item || typeof item.pay_code_id !== 'string' || typeof item.rate_unit !== 'string'
        || (item.description != null && typeof item.description !== 'string')
        || (item.is_manual !== undefined && typeof item.is_manual !== 'boolean')
        || [item.rate, item.quantity, item.amount].some((value) =>
          !['string', 'number'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value)))) {
        throw new Error('Invalid payroll item values');
      }
      /** @type {unknown[]} */
      const row = [payrollId, item.pay_code_id, item.description || '', item.rate, item.rate_unit, item.quantity, item.amount, item.is_manual || false];
      if (includeSource) row.push(item.job_type || null, item.source_employee_id || null, item.source_date || null, item.work_log_id || null, item.work_log_type || null, item.foc_units || null);
      placeholders.push(`(${row.map((value) => { values.push(value); return `$${values.length}`; }).join(', ')})`);
    }
    await client.query(`INSERT INTO payroll_items (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`, values);
  }
}
