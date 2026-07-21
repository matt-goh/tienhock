// src/routes/accounting/bank-in-service.js
// RV cash bank-in service: shared RV numbering (rv_registry) + structured
// bank-ins posting DR bank / CR holding (CH_REV1 cash-sales pools, CH_REV2
// cash receipts). Frozen contract: docs/Account/INVOICE_PAYMENT_ACCOUNTING_PROGRESS.md §4.
//
// Journal shape: one DR bank line PER display group (legacy proof: RV052/06 &
// RV074/06 print one bank row per customer group), then ONE aggregated CR per
// holding account whose particulars join the group descriptions. RV rows have
// no Cheque value.
//
// Pool availability (CH_REV1):
//   * source dates >= 1 June 2026 cutover: collected = posted CH_REV1 debits of
//     that date's S journals; banked = posted bank-in allocations for the date.
//   * pre-cutover dates share ONE aggregate opening pool seeded from the
//     CH_REV1 anchor (per-date splits before the anchor are not provable; the
//     anchor supersedes them).
// Over-banking is blocked under advisory locks (per source date) and row locks
// (per receipt).

const CUTOVER = "2026-06-01";

const round2 = (v) => Math.round(parseFloat(v || 0) * 100) / 100;

export function formatRvNumber(seq, month) {
  const seqStr = String(seq).length >= 3 ? String(seq) : String(seq).padStart(3, "0");
  return `RV${seqStr}/${String(month).padStart(2, "0")}`;
}

export function parseRvNumber(rvNumber) {
  const m = /^RV(\d{3,})\/(\d{2})$/.exec((rvNumber || "").trim().toUpperCase());
  if (!m) return null;
  return { seq: parseInt(m[1], 10), month: parseInt(m[2], 10) };
}

/** Next free RV number for (year, month) — gaps are allowed, cancelled stay reserved. */
export async function getNextRvNumber(client, year, month) {
  const result = await client.query(
    `SELECT COALESCE(MAX(rv_seq), 0) + 1 AS next
       FROM rv_registry WHERE rv_year = $1 AND rv_month = $2`,
    [year, month]
  );
  const seq = parseInt(result.rows[0].next, 10);
  return { rv_seq: seq, rv_number: formatRvNumber(seq, month) };
}

/**
 * Reserves an RV number in the shared registry (race-safe via the unique
 * constraints; a duplicate becomes a friendly error).
 * source_type: 'bank_in' | 'manual_journal' | 'import'.
 */
export async function reserveRvNumber(
  client,
  { year, month, seq, source_type, journal_entry_id = null, created_by = null }
) {
  try {
    const result = await client.query(
      `INSERT INTO rv_registry (rv_year, rv_month, rv_seq, rv_number, source_type, journal_entry_id, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
       RETURNING *`,
      [year, month, seq, formatRvNumber(seq, month), source_type, journal_entry_id, created_by]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      throw new Error(
        `RV number ${formatRvNumber(seq, month)} is already reserved for ${year}. Pick the next free number.`
      );
    }
    throw error;
  }
}

/** CH_REV1 opening-anchor amount (1 June cutover). */
async function getChRev1Anchor(client) {
  const result = await client.query(
    `SELECT amount FROM account_opening_balances
      WHERE account_code = 'CH_REV1' AND as_of_date <= $1
      ORDER BY as_of_date DESC LIMIT 1`,
    [CUTOVER]
  );
  return result.rows.length ? round2(result.rows[0].amount) : 0;
}

/**
 * CH_REV1 cash-sales pool availability.
 * Returns { pools: [{source_date, collected, banked, remaining}], opening: {...} }.
 * `opening` is the aggregate pre-cutover pool (anchor-based).
 */
export async function getCashSalesPools(client) {
  const collected = await client.query(
    `SELECT je.entry_date AS source_date, SUM(jel.debit_amount)::numeric(12,2) AS collected
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE je.status = 'posted' AND je.entry_type = 'S'
        AND jel.account_code = 'CH_REV1' AND jel.debit_amount > 0
        AND je.entry_date >= $1
      GROUP BY je.entry_date`,
    [CUTOVER]
  );
  const banked = await client.query(
    `SELECT bia.source_date, SUM(bia.amount)::numeric(12,2) AS banked
       FROM bank_in_allocations bia
       JOIN bank_in_groups big ON big.id = bia.group_id
       JOIN bank_ins bi ON bi.id = big.bank_in_id
      WHERE bi.status = 'posted' AND bia.source_type = 'cash_sales_pool'
      GROUP BY bia.source_date`
  );

  const bankedMap = {};
  let bankedPre = 0;
  for (const row of banked.rows) {
    const key = String(row.source_date).slice(0, 10) ||
      `${row.source_date.getFullYear()}-${String(row.source_date.getMonth() + 1).padStart(2, "0")}-${String(row.source_date.getDate()).padStart(2, "0")}`;
    const dateStr =
      row.source_date instanceof Date
        ? `${row.source_date.getFullYear()}-${String(row.source_date.getMonth() + 1).padStart(2, "0")}-${String(row.source_date.getDate()).padStart(2, "0")}`
        : key;
    if (dateStr < CUTOVER) bankedPre = round2(bankedPre + parseFloat(row.banked));
    else bankedMap[dateStr] = round2(parseFloat(row.banked));
  }

  const pools = collected.rows.map((row) => {
    const dateStr =
      row.source_date instanceof Date
        ? `${row.source_date.getFullYear()}-${String(row.source_date.getMonth() + 1).padStart(2, "0")}-${String(row.source_date.getDate()).padStart(2, "0")}`
        : String(row.source_date).slice(0, 10);
    const collectedAmt = round2(row.collected);
    const bankedAmt = bankedMap[dateStr] || 0;
    return {
      source_date: dateStr,
      collected: collectedAmt,
      banked: bankedAmt,
      remaining: round2(collectedAmt - bankedAmt),
    };
  });
  pools.sort((a, b) => (a.source_date < b.source_date ? -1 : 1));

  const anchor = await getChRev1Anchor(client);
  return {
    pools,
    opening: {
      anchor,
      banked: bankedPre,
      remaining: round2(anchor - bankedPre),
      note: "Aggregate pre-cutover (before 2026-06-01) opening cash; per-date splits are superseded by the anchor",
    },
  };
}

/**
 * CH_REV2 unbanked cash receipts (incl. import_opening seeds).
 * remaining = receipt total − posted bank-in allocations.
 */
export async function getUnbankedCashReceipts(client) {
  const result = await client.query(
    `SELECT r.id, r.display_reference, r.received_date, r.total_amount::numeric(12,2) AS total_amount,
            r.description, r.origin,
            COALESCE(b.banked, 0)::numeric(12,2) AS banked,
            (r.total_amount - COALESCE(b.banked, 0))::numeric(12,2) AS remaining,
            (SELECT string_agg(DISTINCT ra.customer_id, ', ')
               FROM receipt_allocations ra WHERE ra.receipt_id = r.id) AS customers
       FROM receipts r
       LEFT JOIN (
         SELECT bia.receipt_id, SUM(bia.amount) AS banked
           FROM bank_in_allocations bia
           JOIN bank_in_groups big ON big.id = bia.group_id
           JOIN bank_ins bi ON bi.id = big.bank_in_id
          WHERE bi.status = 'posted' AND bia.source_type = 'cash_receipt'
          GROUP BY bia.receipt_id
       ) b ON b.receipt_id = r.id
      WHERE r.debit_account = 'CH_REV2'
        AND r.status = 'posted'
        AND r.total_amount - COALESCE(b.banked, 0) > 0.005
      ORDER BY r.received_date, r.id`
  );
  return result.rows.map((r) => ({ ...r, total_amount: round2(r.total_amount), banked: round2(r.banked), remaining: round2(r.remaining) }));
}

/**
 * Creates one RV bank-in atomically: reserves the RV number, validates pools /
 * receipts under locks, posts DR bank per group + aggregated CR holding.
 *
 * payload: {
 *   posting_date: 'yyyy-MM-dd', bank_account?: 'BANK_PBB',
 *   rv_number?: 'RV012/06' (omit to auto-assign),
 *   notes?, allow_month_mismatch?: false,
 *   legacy_particulars?: false  (import only: use "SALES DD/MM/YYYY" text),
 *   groups: [{ holding_account: 'CH_REV1'|'CH_REV2', description?,
 *              allocations: [{source_date, amount} | {receipt_id, amount}] }]
 * }
 */
export async function createBankIn(client, payload, userId) {
  const postingDate = String(payload.posting_date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDate)) {
    throw new Error("posting_date must be yyyy-MM-dd");
  }
  const bankAccount = payload.bank_account || "BANK_PBB";
  const year = parseInt(postingDate.slice(0, 4), 10);
  const month = parseInt(postingDate.slice(5, 7), 10);

  if (!Array.isArray(payload.groups) || payload.groups.length === 0) {
    throw new Error("At least one bank-in group is required");
  }

  // Validate the bank account exists.
  const acctCheck = await client.query(
    `SELECT code FROM account_codes WHERE code = $1 AND is_active = true`,
    [bankAccount]
  );
  if (acctCheck.rows.length === 0) {
    throw new Error(`Bank account ${bankAccount} not found or inactive`);
  }

  // ----- RV number: explicit (validated) or auto-assigned -----
  let seq;
  if (payload.rv_number) {
    const parsed = parseRvNumber(payload.rv_number);
    if (!parsed) {
      throw new Error(`Invalid RV number "${payload.rv_number}" — expected RV###/MM (e.g. RV012/06)`);
    }
    if (parsed.month !== month && !payload.allow_month_mismatch) {
      throw new Error(
        `RV month /${String(parsed.month).padStart(2, "0")} must match the posting month /${String(month).padStart(2, "0")}`
      );
    }
    seq = parsed.seq;
  } else {
    const next = await getNextRvNumber(client, year, month);
    seq = next.rv_seq;
  }
  const rvMonth = payload.rv_number ? parseRvNumber(payload.rv_number).month : month;
  const registry = await reserveRvNumber(client, {
    year,
    month: rvMonth,
    seq,
    source_type: "bank_in",
    created_by: userId,
  });
  const rvNumber = registry.rv_number;

  // ----- Normalize and validate groups/allocations under locks -----
  const groups = [];
  let total = 0;
  for (let gi = 0; gi < payload.groups.length; gi++) {
    const g = payload.groups[gi];
    if (!["CH_REV1", "CH_REV2"].includes(g.holding_account)) {
      throw new Error(`Group ${gi + 1}: holding_account must be CH_REV1 or CH_REV2`);
    }
    if (!Array.isArray(g.allocations) || g.allocations.length === 0) {
      throw new Error(`Group ${gi + 1}: at least one allocation is required`);
    }
    const allocations = [];
    let groupAmount = 0;
    for (const a of g.allocations) {
      const amount = round2(a.amount);
      if (!(amount > 0)) throw new Error(`Group ${gi + 1}: allocation amount must be positive`);
      if (g.holding_account === "CH_REV1") {
        const sourceDate = String(a.source_date || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
          throw new Error(`Group ${gi + 1}: CH_REV1 allocations need a source_date`);
        }
        allocations.push({ source_type: "cash_sales_pool", source_date: sourceDate, receipt_id: null, amount });
      } else {
        if (!a.receipt_id) throw new Error(`Group ${gi + 1}: CH_REV2 allocations need a receipt_id`);
        allocations.push({ source_type: "cash_receipt", source_date: null, receipt_id: parseInt(a.receipt_id, 10), amount });
      }
      groupAmount = round2(groupAmount + amount);
    }
    groups.push({
      holding_account: g.holding_account,
      description: (g.description || "").trim() || null,
      description_overridden: Boolean((g.description || "").trim()),
      allocations,
      amount: groupAmount,
    });
    total = round2(total + groupAmount);
  }

  // Pool validation (CH_REV1): advisory lock per source date, then re-check.
  const poolDates = [
    ...new Set(
      groups.flatMap((g) => g.allocations.filter((a) => a.source_type === "cash_sales_pool").map((a) => a.source_date))
    ),
  ].sort();
  const skipPoolChecks = payload.skip_pool_validation === true; // import path
  for (const d of poolDates) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('chrev1_pool_' || $1::text))`, [d]);
  }
  if (!skipPoolChecks && poolDates.length > 0) {
    const requested = {};
    for (const g of groups) {
      for (const a of g.allocations) {
        if (a.source_type !== "cash_sales_pool") continue;
        requested[a.source_date] = round2((requested[a.source_date] || 0) + a.amount);
      }
    }
    const { pools, opening } = await getCashSalesPools(client);
    const poolMap = Object.fromEntries(pools.map((p) => [p.source_date, p]));
    let preRequested = 0;
    for (const [d, amt] of Object.entries(requested)) {
      if (d < CUTOVER) {
        preRequested = round2(preRequested + amt);
        continue;
      }
      const pool = poolMap[d];
      const remaining = pool ? pool.remaining : 0;
      if (amt > remaining + 0.005) {
        throw new Error(
          `Cash-sales pool ${d}: requested ${amt.toFixed(2)} exceeds the unbanked remainder ${remaining.toFixed(2)}`
        );
      }
    }
    if (preRequested > 0 && preRequested > opening.remaining + 0.005) {
      throw new Error(
        `Pre-cutover opening pool: requested ${preRequested.toFixed(2)} exceeds the unbanked opening remainder ${opening.remaining.toFixed(2)}`
      );
    }
  }

  // Receipt validation (CH_REV2): row locks + remaining re-check.
  const receiptIds = [
    ...new Set(groups.flatMap((g) => g.allocations.filter((a) => a.source_type === "cash_receipt").map((a) => a.receipt_id))),
  ].sort((a, b) => a - b);
  const receiptMap = {};
  if (receiptIds.length > 0) {
    const receipts = await client.query(
      `SELECT r.id, r.display_reference, r.description, r.debit_account, r.status, r.total_amount::numeric(12,2) AS total_amount
         FROM receipts r WHERE r.id = ANY($1::int[]) ORDER BY r.id FOR UPDATE`,
      [receiptIds]
    );
    for (const row of receipts.rows) receiptMap[row.id] = row;
    for (const id of receiptIds) {
      const r = receiptMap[id];
      if (!r) throw new Error(`Receipt ${id} not found`);
      if (r.status !== "posted") throw new Error(`Receipt ${id} is ${r.status}, not posted`);
      if (r.debit_account !== "CH_REV2") {
        throw new Error(`Receipt ${id} (${r.display_reference || "no ref"}) is not CH_REV2 cash — it cannot be banked in`);
      }
    }
    const bankedRows = await client.query(
      `SELECT bia.receipt_id, COALESCE(SUM(bia.amount), 0)::numeric(12,2) AS banked
         FROM bank_in_allocations bia
         JOIN bank_in_groups big ON big.id = bia.group_id
         JOIN bank_ins bi ON bi.id = big.bank_in_id
        WHERE bi.status = 'posted' AND bia.receipt_id = ANY($1::int[])
        GROUP BY bia.receipt_id`,
      [receiptIds]
    );
    const bankedMap = Object.fromEntries(bankedRows.rows.map((r) => [r.receipt_id, round2(r.banked)]));
    const requested = {};
    for (const g of groups) {
      for (const a of g.allocations) {
        if (a.source_type !== "cash_receipt") continue;
        requested[a.receipt_id] = round2((requested[a.receipt_id] || 0) + a.amount);
      }
    }
    if (!skipPoolChecks) {
      for (const [idStr, amt] of Object.entries(requested)) {
        const id = parseInt(idStr, 10);
        const remaining = round2(receiptMap[id].total_amount - (bankedMap[id] || 0));
        if (amt > remaining + 0.005) {
          throw new Error(
            `Receipt ${receiptMap[id].display_reference || id}: requested ${amt.toFixed(2)} exceeds the unbanked remainder ${remaining.toFixed(2)}`
          );
        }
      }
    }
  }

  // ----- Default group descriptions -----
  const fmtDMY = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  for (const g of groups) {
    if (g.description) continue;
    if (g.holding_account === "CH_REV1") {
      const dates = [...new Set(g.allocations.map((a) => a.source_date))];
      g.description = payload.legacy_particulars
        ? dates.map((d) => `SALES ${fmtDMY(d)}`).join(" & ")
        : dates.map((d) => `SALES CASH FROM ${fmtDMY(d)} BANK IN`).join(" & ");
    } else {
      const descs = g.allocations.map((a) => {
        const r = receiptMap[a.receipt_id];
        return r?.description || r?.display_reference || `Receipt #${a.receipt_id}`;
      });
      g.description = [...new Set(descs)].join(" & ");
    }
  }

  // ----- Journal first (the posted bank_in requires its journal id) -----
  const journalResult = await client.query(
    `INSERT INTO journal_entries (
       reference_no, entry_type, entry_date, description,
       total_debit, total_credit, status, display_reference,
       created_at, created_by
     ) VALUES ($1, 'RV', $2, $3, $4, $4, 'posted', $5, NOW(), $6)
     RETURNING id`,
    [
      `BI-${registry.id}`,
      postingDate,
      groups.map((g) => g.description).join(" & "),
      total,
      rvNumber,
      userId || null,
    ]
  );
  const journalId = journalResult.rows[0].id;

  const bankInResult = await client.query(
    `INSERT INTO bank_ins (
       rv_registry_id, posting_date, bank_account, total_amount, status,
       journal_entry_id, notes, created_by, updated_by
     ) VALUES ($1, $2, $3, $4, 'posted', $5, $6, $7, $7)
     RETURNING *`,
    [registry.id, postingDate, bankAccount, total, journalId, payload.notes || null, userId || null]
  );
  const bankIn = bankInResult.rows[0];

  await client.query(
    `UPDATE journal_entries SET source_type = 'bank_in', source_id = $1 WHERE id = $2`,
    [String(bankIn.id), journalId]
  );

  // ----- Groups + allocations -----
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const groupResult = await client.query(
      `INSERT INTO bank_in_groups (bank_in_id, group_number, holding_account, amount, description, description_overridden)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [bankIn.id, gi + 1, g.holding_account, g.amount, g.description, g.description_overridden]
    );
    g.id = groupResult.rows[0].id;
    for (const a of g.allocations) {
      await client.query(
        `INSERT INTO bank_in_allocations (group_id, source_type, source_date, receipt_id, amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [g.id, a.source_type, a.source_date, a.receipt_id, a.amount]
      );
    }
  }

  // ----- Journal lines: DR bank per group, then aggregated CR per holding -----
  let lineNo = 0;
  for (const g of groups) {
    lineNo += 1;
    await client.query(
      `INSERT INTO journal_entry_lines (
         journal_entry_id, line_number, account_code, debit_amount, credit_amount,
         reference, particulars, display_order, created_at
       ) VALUES ($1, $2, $3, $4, 0, $5, $6, $2, NOW())`,
      [journalId, lineNo, bankAccount, g.amount, rvNumber, g.description]
    );
  }
  const holdingTotals = {};
  for (const g of groups) {
    if (!holdingTotals[g.holding_account]) holdingTotals[g.holding_account] = { amount: 0, descs: [] };
    holdingTotals[g.holding_account].amount = round2(holdingTotals[g.holding_account].amount + g.amount);
    holdingTotals[g.holding_account].descs.push(g.description);
  }
  for (const [account, info] of Object.entries(holdingTotals)) {
    lineNo += 1;
    await client.query(
      `INSERT INTO journal_entry_lines (
         journal_entry_id, line_number, account_code, debit_amount, credit_amount,
         reference, particulars, display_order, created_at
       ) VALUES ($1, $2, $3, 0, $4, $5, $6, $2, NOW())`,
      [journalId, lineNo, account, info.amount, rvNumber, [...new Set(info.descs)].join(" & ")]
    );
  }

  return { bank_in: bankIn, rv_number: rvNumber, journal_entry_id: journalId, groups };
}

/**
 * Creates a manual "drawing" RV journal (worker advance repayment): one DR bank
 * line and one CR CA_WA (WORKER'S ADVANCE) line, like the legacy RV021/06. The
 * RV number is reserved in the shared registry with source_type 'manual_journal'
 * and the journal stays source-less so it can be edited/cancelled from the
 * Journal page like any other manual journal.
 *
 * payload: {
 *   posting_date: 'yyyy-MM-dd', bank_account?: 'BANK_PBB',
 *   rv_number?: 'RV021/06' (omit to auto-assign),
 *   amount: number, description?: 'FROM DRAWING WORKERS'
 * }
 */
export async function createDrawingJournal(client, payload, userId) {
  const postingDate = String(payload.posting_date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDate)) {
    throw new Error("posting_date must be yyyy-MM-dd");
  }
  const bankAccount = payload.bank_account || "BANK_PBB";
  const year = parseInt(postingDate.slice(0, 4), 10);
  const month = parseInt(postingDate.slice(5, 7), 10);

  const amount = round2(payload.amount);
  if (!(amount > 0)) throw new Error("Amount must be positive");
  const description = (payload.description || "").trim() || "FROM DRAWING WORKERS";

  const acctCheck = await client.query(
    `SELECT code FROM account_codes WHERE code = ANY($1::text[]) AND is_active = true`,
    [[bankAccount, "CA_WA"]]
  );
  const found = new Set(acctCheck.rows.map((r) => r.code));
  if (!found.has(bankAccount)) throw new Error(`Bank account ${bankAccount} not found or inactive`);
  if (!found.has("CA_WA")) throw new Error("Credit account CA_WA not found or inactive");

  // ----- RV number: explicit (validated) or auto-assigned -----
  let seq;
  if (payload.rv_number) {
    const parsed = parseRvNumber(payload.rv_number);
    if (!parsed) {
      throw new Error(`Invalid RV number "${payload.rv_number}" — expected RV###/MM (e.g. RV021/06)`);
    }
    if (parsed.month !== month) {
      throw new Error(
        `RV month /${String(parsed.month).padStart(2, "0")} must match the posting month /${String(month).padStart(2, "0")}`
      );
    }
    seq = parsed.seq;
  } else {
    const next = await getNextRvNumber(client, year, month);
    seq = next.rv_seq;
  }
  const registry = await reserveRvNumber(client, {
    year,
    month,
    seq,
    source_type: "manual_journal",
    created_by: userId,
  });
  const rvNumber = registry.rv_number;

  // ----- Journal (reference_no = RV number, matching legacy manual RVs) -----
  const journalResult = await client.query(
    `INSERT INTO journal_entries (
       reference_no, entry_type, entry_date, description,
       total_debit, total_credit, status, created_at, created_by
     ) VALUES ($1, 'RV', $2, $3, $4, $4, 'posted', NOW(), $5)
     RETURNING id`,
    [rvNumber, postingDate, description, amount, userId || null]
  );
  const journalId = journalResult.rows[0].id;

  await client.query(`UPDATE rv_registry SET journal_entry_id = $1 WHERE id = $2`, [
    journalId,
    registry.id,
  ]);

  // ----- Lines: DR bank / CR CA_WA -----
  await client.query(
    `INSERT INTO journal_entry_lines (
       journal_entry_id, line_number, account_code, debit_amount, credit_amount,
       reference, particulars, display_order, created_at
     ) VALUES ($1, 1, $2, $3, 0, $4, $5, 1, NOW()),
              ($1, 2, 'CA_WA', 0, $3, $4, $5, 2, NOW())`,
    [journalId, bankAccount, amount, rvNumber, description]
  );

  return { rv_number: rvNumber, journal_entry_id: journalId, amount };
}

/**
 * Cancels a bank-in: cancels the journal, marks the registry entry cancelled
 * (the RV number stays reserved forever), and frees the source amounts back
 * to their pools/receipts (pool sums only count posted bank-ins).
 */
export async function cancelBankIn(client, bankInId, reason, userId) {
  const result = await client.query(`SELECT * FROM bank_ins WHERE id = $1 FOR UPDATE`, [bankInId]);
  if (result.rows.length === 0) throw new Error(`Bank-in ${bankInId} not found`);
  const bankIn = result.rows[0];
  if (bankIn.status === "cancelled") throw new Error(`Bank-in ${bankInId} is already cancelled`);

  if (bankIn.journal_entry_id) {
    await client.query(
      `UPDATE journal_entries SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status = 'posted'`,
      [bankIn.journal_entry_id]
    );
  }
  await client.query(
    `UPDATE bank_ins
        SET status = 'cancelled', cancellation_date = NOW(), cancellation_reason = $2,
            cancelled_by = $3, updated_at = NOW(), updated_by = $3
      WHERE id = $1`,
    [bankInId, reason || null, userId || null]
  );
  await client.query(
    `UPDATE rv_registry SET status = 'cancelled' WHERE id = $1`,
    [bankIn.rv_registry_id]
  );

  const fresh = await client.query(`SELECT * FROM bank_ins WHERE id = $1`, [bankInId]);
  return { bank_in: fresh.rows[0] };
}
