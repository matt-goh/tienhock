// src/utils/greenTarget/einvoice/GTEInvoiceAdjustmentNoteTemplate.js
// UBL XML for Green Target Credit / Debit / Refund Notes per MyInvois Malaysia
// spec. Phase 7 — mirrors EInvoiceAdjustmentNoteTemplate.js but uses GT field
// names (date_issued / amount_before_tax / tax_amount / total_amount, no
// rounding, lines are description-driven with no code-based freeform logic).
//
// Defaults supplierInfo to GREENTARGET_INFO.
import { GREENTARGET_INFO } from "../../invoice/einvoice/companyInfo.js";
import { formatAdjustmentDocId } from "../../adjustments/formatDocId.js";
import { buildGTBillingAddressLines } from "./GTBillingAddress.js";

const TYPE_CODE = {
  credit_note: "02",
  debit_note: "03",
  refund_note: "04",
};

function formatPhoneNumber(phone) {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  let number = cleaned;
  if (cleaned.startsWith("60")) number = cleaned.slice(2);
  while (number.startsWith("0")) number = number.slice(1);
  return `0${number}`;
}

function formatAmount(amount) {
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  return isNaN(num) ? 0.0 : Number(num.toFixed(2));
}

function escapeXml(unsafe) {
  if (unsafe === undefined || unsafe === null) return "";
  return unsafe
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isDateWithinRange(dateStr, daysBack = 3) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const earliest = new Date(today);
    earliest.setDate(today.getDate() - daysBack);
    const [day, month, year] = dateStr.split("/").map(Number);
    const inputDate = new Date(year, month - 1, day);
    inputDate.setHours(0, 0, 0, 0);
    return inputDate >= earliest && inputDate <= today;
  } catch {
    return false;
  }
}

function calculateTaxAndTotals(adjData) {
  const subtotal = adjData.lines.reduce((sum, l) => {
    if (l.issubtotal) return sum;
    const qty = Number(l.quantity) || 0;
    const price = Number(l.price) || 0;
    return sum + qty * price;
  }, 0);

  const taxGroups = {
    "01": { amount: 0, taxable: 0 },
    "02": { amount: 0, taxable: 0 },
    "06": { amount: 0, taxable: 0 },
    E: { amount: 0, taxable: 0 },
  };

  let totalTax = 0;
  adjData.lines.forEach((l) => {
    if (l.issubtotal) return;
    const taxAmount = parseFloat(l.tax) || 0;
    const qty = Number(l.quantity) || 0;
    const price = Number(l.price) || 0;
    const lineAmount = qty * price;
    totalTax += taxAmount;

    let cat = "06";
    if (taxAmount > 0) cat = "01";
    else if (lineAmount > 0) cat = "E";

    taxGroups[cat].amount += taxAmount;
    taxGroups[cat].taxable += lineAmount;
  });

  const taxSubtotals = Object.entries(taxGroups)
    .filter(([, g]) => g.taxable > 0)
    .map(([category, g]) => ({
      category,
      taxableAmount: formatAmount(g.taxable),
      taxAmount: formatAmount(g.amount),
    }));

  const total = formatAmount(subtotal + totalTax);
  return {
    subtotal: formatAmount(subtotal),
    tax: formatAmount(totalTax),
    total,
    taxSubtotals,
  };
}

function generateTaxSubtotals(taxSubtotals) {
  let out = "";
  for (const s of taxSubtotals) {
    out += `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="MYR">${s.taxableAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="MYR">${s.taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${s.category}</cbc:ID>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">OTH</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
  }
  return out;
}

function generateLines(lines) {
  const regular = lines.filter((l) => !l.issubtotal);
  let out = "";
  for (let i = 0; i < regular.length; i++) {
    const item = regular[i];
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const lineAmount = formatAmount(qty * price);
    const productTax = formatAmount(Number(item.tax) || 0);
    const taxCategory = productTax > 0 ? "01" : "06";

    out += `
  <cac:InvoiceLine>
    <cbc:ID>${(i + 1).toString().padStart(3, "0")}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NMP">${qty || 1}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="MYR">${lineAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason>-</cbc:AllowanceChargeReason>
      <cbc:MultiplierFactorNumeric>0</cbc:MultiplierFactorNumeric>
      <cbc:Amount currencyID="MYR">0.00</cbc:Amount>
    </cac:AllowanceCharge>
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason>-</cbc:AllowanceChargeReason>
      <cbc:MultiplierFactorNumeric>0</cbc:MultiplierFactorNumeric>
      <cbc:Amount currencyID="MYR">0.00</cbc:Amount>
    </cac:AllowanceCharge>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="MYR">${productTax.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="MYR">${lineAmount.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="MYR">${productTax.toFixed(2)}</cbc:TaxAmount>
        <cbc:BaseUnitMeasure unitCode="NMP">${qty || 1}</cbc:BaseUnitMeasure>
        <cbc:PerUnitAmount currencyID="MYR">${(qty > 0 ? productTax / qty : 0).toFixed(2)}</cbc:PerUnitAmount>
        <cac:TaxCategory>
          <cbc:ID>${taxCategory}</cbc:ID>
          <cac:TaxScheme>
            <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">OTH</cbc:ID>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${escapeXml(item.description || "Adjustment")}</cbc:Description>
      <cac:OriginCountry>
        <cbc:IdentificationCode>MYS</cbc:IdentificationCode>
      </cac:OriginCountry>
      <cac:CommodityClassification>
        <cbc:ItemClassificationCode listID="PTC"></cbc:ItemClassificationCode>
      </cac:CommodityClassification>
      <cac:CommodityClassification>
        <cbc:ItemClassificationCode listID="CLASS">022</cbc:ItemClassificationCode>
      </cac:CommodityClassification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="MYR">${price}</cbc:PriceAmount>
    </cac:Price>
    <cac:ItemPriceExtension>
      <cbc:Amount currencyID="MYR">${lineAmount.toFixed(2)}</cbc:Amount>
    </cac:ItemPriceExtension>
  </cac:InvoiceLine>`;
  }
  return out;
}

/**
 * Build the UBL XML for a Green Target Adjustment Document (CN / DN / RN).
 *
 * @param {Object} adjustmentDoc - row from greentarget.adjustment_documents (with `lines`)
 * @param {Object} customerData - row from greentarget.customers
 * @param {Object} referenced  - { id, uuid } of the referenced source document
 *   (original invoice or its consolidated parent).
 * @returns {Promise<string>} the generated XML
 */
export async function GTEInvoiceAdjustmentNoteTemplate(
  adjustmentDoc,
  customerData,
  referenced,
  supplierInfo = GREENTARGET_INFO
) {
  const SUPPLIER = supplierInfo || GREENTARGET_INFO;
  if (!adjustmentDoc) {
    throw { type: "validation", message: "No adjustment data", invoiceNo: "Unknown" };
  }
  if (!customerData) {
    throw {
      type: "validation",
      message: "Customer data is required",
      invoiceNo: adjustmentDoc.id || "Unknown",
    };
  }
  if (!referenced || !referenced.uuid) {
    throw {
      type: "validation",
      code: "REF_MISSING",
      message:
        "Referenced source document UUID is required (original invoice must be e-invoiced or have a consolidated parent)",
      invoiceNo: adjustmentDoc.id,
    };
  }

  const typeCode = TYPE_CODE[adjustmentDoc.type];
  if (!typeCode) {
    throw {
      type: "validation",
      message: `Unknown adjustment doc type: ${adjustmentDoc.type}`,
      invoiceNo: adjustmentDoc.id,
    };
  }

  // GT date_issued is a DATE; parse YYYY-MM-DD safely (DB may also hand back a
  // Date object via the pg driver, so accept both).
  let adjDate;
  if (adjustmentDoc.date_issued instanceof Date) {
    adjDate = adjustmentDoc.date_issued;
  } else if (typeof adjustmentDoc.date_issued === "string") {
    const iso = adjustmentDoc.date_issued.slice(0, 10);
    const [y, m, d] = iso.split("-").map(Number);
    adjDate = new Date(y, (m || 1) - 1, d || 1);
  } else {
    adjDate = new Date();
  }
  const year = adjDate.getFullYear();
  const month = String(adjDate.getMonth() + 1).padStart(2, "0");
  const day = String(adjDate.getDate()).padStart(2, "0");
  const formattedDate = `${year}-${month}-${day}`;
  const validationDate = `${day}/${month}/${year}`;
  if (!isDateWithinRange(validationDate)) {
    throw {
      type: "validation",
      code: "DATE_VALIDATION",
      message: "Adjustment document date must be within the last 3 days",
      invoiceNo: adjustmentDoc.id,
    };
  }

  // Time-of-day isn't stored for GT date-only fields — emit issue time as now.
  const now = new Date();
  const hours = now.getUTCHours().toString().padStart(2, "0");
  const minutes = now.getUTCMinutes().toString().padStart(2, "0");
  const seconds = now.getUTCSeconds().toString().padStart(2, "0");
  const formattedTime = `${hours}:${minutes}:${seconds}Z`;

  if (!Array.isArray(adjustmentDoc.lines) || adjustmentDoc.lines.length === 0) {
    throw {
      type: "validation",
      code: "INV_VALIDATION",
      message: "Adjustment document must have at least one line item",
      invoiceNo: adjustmentDoc.id,
    };
  }
  const lines = adjustmentDoc.lines.map((l) => ({
    description: l.description || "",
    quantity: Number(l.quantity || 0),
    price: Number(l.price || 0),
    tax: Number(l.tax || 0),
    total: Number(l.total || 0),
    issubtotal: !!l.issubtotal,
  }));

  const totals = calculateTaxAndTotals({ lines });
  const billingAddressLines = buildGTBillingAddressLines(
    customerData.address,
    customerData.sites || customerData.site
  );

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`;

  xml += `
  <cbc:ID>${escapeXml(formatAdjustmentDocId(adjustmentDoc.id))}</cbc:ID>
  <cbc:IssueDate>${formattedDate}</cbc:IssueDate>
  <cbc:IssueTime>${formattedTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listVersionID="1.0">${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>MYR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>MYR</cbc:TaxCurrencyCode>`;

  xml += `
  <cac:InvoicePeriod>
    <cbc:StartDate>${formattedDate}</cbc:StartDate>
    <cbc:EndDate>${formattedDate}</cbc:EndDate>
    <cbc:Description>Not Applicable</cbc:Description>
  </cac:InvoicePeriod>`;

  xml += `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(referenced.id || "-")}</cbc:ID>
      <cbc:UUID>${escapeXml(referenced.uuid)}</cbc:UUID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;

  xml += `
  <cac:AdditionalDocumentReference>
    <cbc:ID></cbc:ID>
    <cbc:DocumentType></cbc:DocumentType>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID></cbc:ID>
    <cbc:DocumentType></cbc:DocumentType>
    <cbc:DocumentDescription></cbc:DocumentDescription>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID></cbc:ID>
    <cbc:DocumentType></cbc:DocumentType>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID></cbc:ID>
  </cac:AdditionalDocumentReference>`;

  xml += `
  <cac:AccountingSupplierParty>
    <cbc:AdditionalAccountID schemeAgencyName="CertEX"></cbc:AdditionalAccountID>
    <cac:Party>
      <cbc:IndustryClassificationCode name="${SUPPLIER.msic_description}">${SUPPLIER.msic_code}</cbc:IndustryClassificationCode>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${SUPPLIER.tin}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="BRN">${SUPPLIER.reg_no}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">${SUPPLIER.sst_id_xml || "-"}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">-</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName>${SUPPLIER.city_xml}</cbc:CityName>
        <cbc:PostalZone>${SUPPLIER.postcode}</cbc:PostalZone>
        <cbc:CountrySubentityCode>${SUPPLIER.country_code}</cbc:CountrySubentityCode>
        <cac:AddressLine>
          <cbc:Line>${SUPPLIER.address_xml}</cbc:Line>
        </cac:AddressLine>
        <cac:AddressLine>
          <cbc:Line></cbc:Line>
        </cac:AddressLine>
        <cac:AddressLine>
          <cbc:Line></cbc:Line>
        </cac:AddressLine>
        <cac:Country>
          <cbc:IdentificationCode listID="ISO3166-1" listAgencyID="6">MYS</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER.name}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${SUPPLIER.phone}</cbc:Telephone>
        <cbc:ElectronicMail>${SUPPLIER.email}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>`;

  xml += `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${escapeXml(customerData.tin_number || "-")}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${escapeXml(customerData.id_type || "BRN")}">${escapeXml(customerData.id_number || "-")}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">-</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">-</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName>KOTA KINABALU</cbc:CityName>
        <cbc:PostalZone></cbc:PostalZone>
        <cbc:CountrySubentityCode>${escapeXml(customerData.state || "")}</cbc:CountrySubentityCode>
        <cac:AddressLine>
          <cbc:Line>${escapeXml(billingAddressLines[0])}</cbc:Line>
        </cac:AddressLine>
        <cac:AddressLine>
          <cbc:Line>${escapeXml(billingAddressLines[1])}</cbc:Line>
        </cac:AddressLine>
        <cac:AddressLine>
          <cbc:Line>${escapeXml(billingAddressLines[2])}</cbc:Line>
        </cac:AddressLine>
        <cac:Country>
          <cbc:IdentificationCode listID="ISO3166-1" listAgencyID="6">MYS</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(customerData.name || "")}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${formatPhoneNumber(customerData.phone_number)}</cbc:Telephone>
        <cbc:ElectronicMail>${escapeXml(customerData.email || "")}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>`;

  xml += `
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason></cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="MYR">0.00</cbc:Amount>
  </cac:AllowanceCharge>
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason></cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="MYR">0.00</cbc:Amount>
  </cac:AllowanceCharge>`;

  xml += `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="MYR">${totals.tax.toFixed(2)}</cbc:TaxAmount>
    ${generateTaxSubtotals(totals.taxSubtotals)}
  </cac:TaxTotal>`;

  xml += `
<cac:LegalMonetaryTotal>
  <cbc:LineExtensionAmount currencyID="MYR">${totals.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
  <cbc:TaxExclusiveAmount currencyID="MYR">${totals.subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
  <cbc:TaxInclusiveAmount currencyID="MYR">${(totals.subtotal + totals.tax).toFixed(2)}</cbc:TaxInclusiveAmount>
  <cbc:AllowanceTotalAmount currencyID="MYR">0.00</cbc:AllowanceTotalAmount>
  <cbc:ChargeTotalAmount currencyID="MYR">0.00</cbc:ChargeTotalAmount>
  <cbc:PayableRoundingAmount currencyID="MYR">0.00</cbc:PayableRoundingAmount>
  <cbc:PayableAmount currencyID="MYR">${totals.total.toFixed(2)}</cbc:PayableAmount>
</cac:LegalMonetaryTotal>`;

  xml += generateLines(lines);

  xml += `
</Invoice>`;

  return xml;
}
