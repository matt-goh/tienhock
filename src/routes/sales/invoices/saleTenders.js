// src/routes/sales/invoices/saleTenders.js
// What was actually tendered when a bill was settled at the counter.
//
// A bill can be paid in more than one way at once — the common case is part
// cash and part online transfer on the same day. Each way is a "tender". Tien
// Hock turns every non-cash tender into its own receipt and leaves the cash
// part to the automatic CH_REV1 collection; Jelly Polly records one payment
// row per tender (JP posts no journals).
//
// Shared by both companies' invoice routes so the validation can never drift.

const RECORDABLE_SALE_METHODS = ["cash", "cheque", "bank_transfer", "online"];

const round2 = (value) => Math.round(parseFloat(value || 0) * 100) / 100;

/**
 * Normalizes an invoice payload's tenders into a list summing to exactly the
 * bill total.
 *
 * Accepts either the split-tender array `invoice.payments` or the single
 * `invoice.payment_method` shorthand, which stays valid so existing callers
 * (batch import, older clients) are unaffected. Cash lines are merged so the
 * automatic collection stays a single row.
 *
 * @param {object} invoice        the create-invoice payload
 * @param {number} totalPayable   the bill total the tenders must add up to
 * @param {boolean} enabled       false for bill types that do not tender at
 *                                creation (a credit invoice collects later)
 * @returns {{payment_method: string, amount: number, payment_reference: string|null, bank_account: string|null}[]}
 * @throws {Error & {status: 400}} when a method is invalid or the lines do not
 *   add up to the bill
 */
export function normalizeSaleTenders(invoice, totalPayable, enabled) {
  if (!enabled || !(totalPayable > 0)) return [];

  const raw =
    Array.isArray(invoice.payments) && invoice.payments.length > 0
      ? invoice.payments
      : [
          {
            payment_method: invoice.payment_method || "cash",
            amount: totalPayable,
            payment_reference: invoice.payment_reference || null,
            bank_account: invoice.bank_account || null,
          },
        ];

  const tenders = raw.map((entry, index) => {
    const method = String(entry.payment_method || "").trim();
    if (!RECORDABLE_SALE_METHODS.includes(method)) {
      throw Object.assign(
        new Error(`Payment ${index + 1}: "${method}" is not a valid payment method.`),
        { status: 400 }
      );
    }
    const amount = round2(entry.amount);
    if (!(amount > 0)) {
      throw Object.assign(
        new Error(`Payment ${index + 1}: enter an amount greater than RM0.`),
        { status: 400 }
      );
    }
    return {
      payment_method: method,
      amount,
      payment_reference: String(entry.payment_reference || "").trim() || null,
      bank_account: String(entry.bank_account || "").trim() || null,
    };
  });

  const tendered = round2(tenders.reduce((sum, tender) => sum + tender.amount, 0));
  if (Math.abs(tendered - round2(totalPayable)) > 0.005) {
    throw Object.assign(
      new Error(
        `Payments total RM${tendered.toFixed(2)} but the bill is RM${round2(
          totalPayable
        ).toFixed(2)}. They must match exactly.`
      ),
      { status: 400 }
    );
  }

  // More than one cash line is the same tender keyed twice.
  const cashTotal = round2(
    tenders
      .filter((tender) => tender.payment_method === "cash")
      .reduce((sum, tender) => sum + tender.amount, 0)
  );
  const merged = tenders.filter((tender) => tender.payment_method !== "cash");
  if (cashTotal > 0) {
    merged.unshift({
      payment_method: "cash",
      amount: cashTotal,
      payment_reference: null,
      bank_account: null,
    });
  }
  return merged;
}
