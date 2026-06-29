// src/routes/greentarget/driverTripRules.js
// Green Target DRIVER trip-line derivation from rentals (Phase 3).
//
// Extracted from the legacy DRIVER process-all calculation so the Daily Lori
// Habuk prefill endpoint can suggest the same PLACEMENT/PICKUP/ADDON trip lines
// a driver earned on a given day. Once a daily log is saved, monthly processing
// reads the saved lines — this helper only feeds the prefill suggestion.

// pg returns `date` columns as local-midnight JS Date objects; extract yyyy-MM-dd
// via local fields (server runs Asia/Kuala_Lumpur, so toISOString would shift).
export const dateRowToYmd = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = (value.getMonth() + 1).toString().padStart(2, "0");
  const d = value.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Evaluate a single payroll-rule condition (mirrors the legacy process-all logic).
export const evaluateCondition = (value, operator, targetValue) => {
  switch (operator) {
    case "=":
      return (
        value === targetValue ||
        (typeof value === "string" &&
          typeof targetValue === "string" &&
          value.toUpperCase() === targetValue.toUpperCase())
      );
    case ">":
      return value > targetValue;
    case "<":
      return value < targetValue;
    case ">=":
      return value >= targetValue;
    case "<=":
      return value <= targetValue;
    case "ANY":
      return true;
    default:
      return false;
  }
};

const round2 = (n) => Math.round(n * 100) / 100;

// Trips that count toward the >6/day TRIP_LB6 bonus: any Trip-unit line.
const TRIP_LB6_PAY_CODE = "TRIP_LB6";
const TRIP_LB6_THRESHOLD = 6;

/**
 * Build the suggested trip lines a driver earned on `date` from their rentals.
 *
 * @param {string} date              yyyy-MM-dd
 * @param {Array}  driverRentals     rentals for this driver (must include
 *                                   rental_id, date_placed, date_picked,
 *                                   pickup_destination, invoice_amount)
 * @param {Object} ctx
 *   - placementRules, pickupRules   from greentarget.payroll_rules
 *   - addonsByRental                map rental_id -> [addon rows]
 *   - allPayCodesMap                map pay_code_id -> {rate_biasa, rate_unit, description, pay_type}
 *   - defaultInvoiceAmount          number
 * @returns {Array} line objects: { pay_code_id, description, rate_used,
 *   rate_unit, quantity, amount, source_type, rental_id }
 */
export const buildPrefillLinesForDriverDate = (date, driverRentals, ctx) => {
  const {
    placementRules = [],
    pickupRules = [],
    addonsByRental = {},
    allPayCodesMap = {},
    defaultInvoiceAmount = 200,
  } = ctx;

  const lines = [];

  for (const rental of driverRentals) {
    const placedYmd = dateRowToYmd(rental.date_placed);
    const pickedYmd = dateRowToYmd(rental.date_picked);
    const invoiceAmount =
      rental.invoice_amount !== null && rental.invoice_amount !== undefined
        ? parseFloat(rental.invoice_amount)
        : defaultInvoiceAmount;

    // PLACEMENT line on the date the rental was placed.
    if (placedYmd === date) {
      let placementRule = null;
      for (const rule of placementRules) {
        if (
          evaluateCondition(
            invoiceAmount,
            rule.condition_operator,
            parseFloat(rule.condition_value)
          )
        ) {
          placementRule = rule;
          break;
        }
      }
      if (placementRule && placementRule.pay_code_id) {
        const payCode = allPayCodesMap[placementRule.pay_code_id];
        const rate = payCode ? parseFloat(payCode.rate_biasa) || 0 : 0;
        lines.push({
          pay_code_id: placementRule.pay_code_id,
          description:
            payCode?.description ||
            placementRule.description ||
            placementRule.pay_code_id,
          rate_used: rate,
          rate_unit: payCode?.rate_unit || "Trip",
          quantity: 1,
          amount: round2(rate),
          source_type: "PLACEMENT",
          rental_id: rental.rental_id,
        });
      }

      // Add-ons follow the rental's placement day.
      const addons = addonsByRental[rental.rental_id] || [];
      for (const addon of addons) {
        const rate = parseFloat(addon.amount) || 0;
        const qty = parseFloat(addon.quantity) || 0;
        lines.push({
          pay_code_id: addon.pay_code_id,
          description:
            addon.display_name ||
            addon.pay_code_description ||
            addon.pay_code_id,
          rate_used: rate,
          rate_unit: "Fixed",
          quantity: qty,
          amount: round2(rate * qty),
          source_type: "ADDON",
          rental_id: rental.rental_id,
        });
      }
    }

    // PICKUP line on the date the rental was picked up.
    if (pickedYmd === date && rental.pickup_destination) {
      let pickupRule = null;
      for (const rule of pickupRules) {
        const primaryMatch = evaluateCondition(
          rental.pickup_destination,
          rule.condition_operator,
          rule.condition_value
        );
        let secondaryMatch = true;
        if (rule.secondary_condition_field && rule.secondary_condition_operator) {
          if (rule.secondary_condition_field === "invoice_amount") {
            secondaryMatch = evaluateCondition(
              invoiceAmount,
              rule.secondary_condition_operator,
              parseFloat(rule.secondary_condition_value)
            );
          }
        }
        if (primaryMatch && secondaryMatch) {
          pickupRule = rule;
          break;
        }
      }
      if (pickupRule && pickupRule.pay_code_id) {
        const payCode = allPayCodesMap[pickupRule.pay_code_id];
        const rate = payCode ? parseFloat(payCode.rate_biasa) || 0 : 0;
        lines.push({
          pay_code_id: pickupRule.pay_code_id,
          description:
            payCode?.description ||
            pickupRule.description ||
            pickupRule.pay_code_id,
          rate_used: rate,
          rate_unit: payCode?.rate_unit || "Trip",
          quantity: 1,
          amount: round2(rate),
          source_type: "PICKUP",
          rental_id: rental.rental_id,
        });
      }
    }
  }

  // Derived >6-trips/day bonus (TRIP_LB6). Counts Trip-unit line quantities.
  const derived = deriveTripLb6Line(lines, allPayCodesMap);
  if (derived) lines.push(derived);

  return lines;
};

/**
 * Given a set of trip lines, return a TRIP_LB6 bonus line when the total
 * Trip-unit quantity exceeds the threshold and no TRIP_LB6 line is present.
 * Returns null otherwise. Exposed so the frontend rule can stay consistent.
 */
export const deriveTripLb6Line = (lines, allPayCodesMap = {}) => {
  const alreadyHas = lines.some((l) => l.pay_code_id === TRIP_LB6_PAY_CODE);
  if (alreadyHas) return null;
  const tripQty = lines.reduce(
    (sum, l) => (l.rate_unit === "Trip" ? sum + (parseFloat(l.quantity) || 0) : sum),
    0
  );
  if (tripQty <= TRIP_LB6_THRESHOLD) return null;
  const payCode = allPayCodesMap[TRIP_LB6_PAY_CODE];
  const rate = payCode ? parseFloat(payCode.rate_biasa) || 0 : 0;
  return {
    pay_code_id: TRIP_LB6_PAY_CODE,
    description: payCode?.description || "> 6 TRIP SISA KAYU & HABUK",
    rate_used: rate,
    rate_unit: payCode?.rate_unit || "Day",
    quantity: 1,
    amount: round2(rate),
    source_type: "DERIVED",
    rental_id: null,
  };
};
