/**
 * MyInvois requires the current e-Invoice issuance time, independently of the
 * adjustment's accounting date. Both XML fields must describe one UTC instant.
 * https://sdk.myinvois.hasil.gov.my/documents/credit-v1-0/
 *
 * @param {Date} issuedAt
 * @returns {{ issueDate: string, issueTime: string }}
 */
export function adjustmentIssueDateTime(issuedAt = new Date()) {
  /** @type {string} */
  const year = String(issuedAt.getUTCFullYear());
  /** @type {string} */
  const month = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
  /** @type {string} */
  const day = String(issuedAt.getUTCDate()).padStart(2, "0");
  /** @type {string} */
  const hours = String(issuedAt.getUTCHours()).padStart(2, "0");
  /** @type {string} */
  const minutes = String(issuedAt.getUTCMinutes()).padStart(2, "0");
  /** @type {string} */
  const seconds = String(issuedAt.getUTCSeconds()).padStart(2, "0");
  return {
    issueDate: `${year}-${month}-${day}`,
    issueTime: `${hours}:${minutes}:${seconds}Z`,
  };
}
