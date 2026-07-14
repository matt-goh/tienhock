const MYINVOIS_ADDRESS_LINE_MAX_LENGTH = 150;
const MYINVOIS_ADDRESS_LINE_COUNT = 3;

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function wrapAddressText(value) {
  let remaining = String(value || "").trim();
  const lines = [];

  while (remaining) {
    if (remaining.length <= MYINVOIS_ADDRESS_LINE_MAX_LENGTH) {
      lines.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf(
      " ",
      MYINVOIS_ADDRESS_LINE_MAX_LENGTH
    );
    if (splitAt <= 0) splitAt = MYINVOIS_ADDRESS_LINE_MAX_LENGTH;

    lines.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  return lines;
}

/**
 * @param {unknown} sites
 * @returns {string[]}
 */
function normalizeSites(sites) {
  const values = Array.isArray(sites) ? sites : [sites];
  const seen = new Set();

  return values.reduce((normalized, value) => {
    const site = String(value || "").trim();
    const key = site.toLocaleLowerCase("en-MY");
    if (!site || seen.has(key)) return normalized;

    seen.add(key);
    normalized.push(site);
    return normalized;
  }, []);
}

/**
 * Builds the three MyInvois billing-address lines with every distinct Site
 * after the main address. Separate lines are preferred; a compact fallback
 * shares line capacity only when needed to keep all values within three lines.
 *
 * @param {unknown} address
 * @param {unknown} sites
 * @returns {[string, string, string]}
 */
export function buildGTBillingAddressLines(address, sites) {
  const normalizedAddress = String(address || "").trim();
  const normalizedSites = normalizeSites(sites);
  const siteText = normalizedSites.join(", ");
  const addressLines = wrapAddressText(normalizedAddress);
  const siteLines = wrapAddressText(siteText);

  let lines = [...addressLines, ...siteLines];
  if (lines.length > MYINVOIS_ADDRESS_LINE_COUNT) {
    lines = wrapAddressText(
      [normalizedAddress, siteText].filter(Boolean).join(" | ")
    );
  }

  if (lines.length > MYINVOIS_ADDRESS_LINE_COUNT) {
    const error = new Error(
      "The billing address and Sites are too long for the three MyInvois address lines. Shorten the Site labels or address before submitting."
    );
    error.type = "validation";
    error.code = "BILLING_ADDRESS_TOO_LONG";
    throw error;
  }

  return [lines[0] || "", lines[1] || "", lines[2] || ""];
}
