// src/utils/invoice/einvoice/EInvoiceConsolidatedAdjustmentTemplate.js
// Consolidated UBL XML for Credit / Debit / Refund Notes that adjust a
// single consolidated invoice (CON-*). Each child adjustment doc becomes
// one InvoiceLine. BillingReference points at the consolidated parent's
// UUID. Phase 5.
import { TIENHOCK_INFO } from "./companyInfo.js";

const TYPE_CODE = {
  credit_note: "02",
  debit_note: "03",
  refund_note: "04",
};

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

function formatAmount(amount) {
  const n =
    typeof amount === "string" ? parseFloat(amount) : Number(amount);
  return isNaN(n) ? "0.00" : n.toFixed(2);
}

function formatDate(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime() {
  const now = new Date();
  const h = String(now.getUTCHours()).padStart(2, "0");
  const m = String(now.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}:00Z`;
}

function createLineXml(child, index) {
  const subtotal = Number(child.total_excluding_tax || 0);
  const tax = Number(child.tax_amount || 0);
  return `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="MYR">${formatAmount(subtotal)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="MYR">${formatAmount(tax)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="MYR">${formatAmount(subtotal)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="MYR">${formatAmount(tax)}</cbc:TaxAmount>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxCategory>
          <cbc:ID>01</cbc:ID>
          <cac:TaxScheme>
            <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">OTH</cbc:ID>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${escapeXml(
        `Adjustment ${child.id} for Invoice ${child.original_invoice_id}` +
          (child.reason ? ` — ${child.reason}` : "")
      )}</cbc:Description>
      <cac:OriginCountry>
        <cbc:IdentificationCode>MYS</cbc:IdentificationCode>
      </cac:OriginCountry>
      <cac:CommodityClassification>
        <cbc:ItemClassificationCode listID="PTC"/>
      </cac:CommodityClassification>
      <cac:CommodityClassification>
        <cbc:ItemClassificationCode listID="CLASS">004</cbc:ItemClassificationCode>
      </cac:CommodityClassification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="MYR">${formatAmount(subtotal)}</cbc:PriceAmount>
    </cac:Price>
    <cac:ItemPriceExtension>
      <cbc:Amount currencyID="MYR">${formatAmount(subtotal)}</cbc:Amount>
    </cac:ItemPriceExtension>
  </cac:InvoiceLine>`;
}

/**
 * Build the consolidated adjustment-doc UBL XML.
 *
 * @param {Object} args
 * @param {string} args.consolidatedId  - e.g. CON-CN-202605-1
 * @param {'credit_note'|'debit_note'|'refund_note'} args.type
 * @param {Array} args.childDocs  - rows from adjustment_documents
 *   (all same type, all referencing the same parent consolidated invoice)
 * @param {Object} args.parent  - { id, uuid } of the parent consolidated invoice
 * @returns {Promise<string>}
 */
export async function EInvoiceConsolidatedAdjustmentTemplate({
  consolidatedId,
  type,
  childDocs,
  parent,
  supplierInfo,
}) {
  const SUPPLIER = supplierInfo || TIENHOCK_INFO;
  if (!Array.isArray(childDocs) || childDocs.length === 0) {
    throw {
      type: "validation",
      message: "No child adjustment documents to consolidate",
      invoiceNo: consolidatedId || "Consolidated",
    };
  }
  if (!parent?.uuid) {
    throw {
      type: "validation",
      message:
        "Parent consolidated invoice UUID is required for adjustment doc consolidation",
      invoiceNo: consolidatedId || "Consolidated",
    };
  }
  const typeCode = TYPE_CODE[type];
  if (!typeCode) {
    throw {
      type: "validation",
      message: `Unknown adjustment doc type: ${type}`,
      invoiceNo: consolidatedId || "Consolidated",
    };
  }

  // Totals — sum child docs
  const totals = childDocs.reduce(
    (acc, d) => ({
      subtotal: acc.subtotal + Number(d.total_excluding_tax || 0),
      tax: acc.tax + Number(d.tax_amount || 0),
      rounding: acc.rounding + Number(d.rounding || 0),
      total: acc.total + Number(d.totalamountpayable || 0),
    }),
    { subtotal: 0, tax: 0, rounding: 0, total: 0 }
  );
  const inclusive = totals.subtotal + totals.tax;

  const today = formatDate(new Date());

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${escapeXml(consolidatedId)}</cbc:ID>
  <cbc:IssueDate>${today}</cbc:IssueDate>
  <cbc:IssueTime>${formatTime()}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listVersionID="1.0">${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>MYR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>MYR</cbc:TaxCurrencyCode>`;

  // BillingReference — points at the parent consolidated invoice
  xml += `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(parent.id || "-")}</cbc:ID>
      <cbc:UUID>${escapeXml(parent.uuid)}</cbc:UUID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;

  // Supplier
  xml += `
  <cac:AccountingSupplierParty>
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

  // Customer — Consolidated Customers placeholder (TIN EI00000000010)
  xml += `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">EI00000000010</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="BRN">NA</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">NA</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">NA</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName/>
        <cbc:PostalZone/>
        <cbc:CountrySubentityCode/>
        <cac:AddressLine>
          <cbc:Line>NA</cbc:Line>
        </cac:AddressLine>
        <cac:AddressLine>
          <cbc:Line/>
        </cac:AddressLine>
        <cac:AddressLine>
          <cbc:Line/>
        </cac:AddressLine>
        <cac:Country>
          <cbc:IdentificationCode listID="ISO3166-1" listAgencyID="6"></cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Consolidated Customers</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>NA</cbc:Telephone>
        <cbc:ElectronicMail>NA</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>`;

  // Tax Total
  xml += `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="MYR">${formatAmount(totals.tax)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="MYR">${formatAmount(totals.subtotal)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="MYR">${formatAmount(totals.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>01</cbc:ID>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">OTH</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`;

  // Legal monetary total
  xml += `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="MYR">${formatAmount(totals.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="MYR">${formatAmount(totals.subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="MYR">${formatAmount(inclusive)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="MYR">0</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="MYR">0</cbc:ChargeTotalAmount>
    <cbc:PayableRoundingAmount currencyID="MYR">${formatAmount(totals.rounding)}</cbc:PayableRoundingAmount>
    <cbc:PayableAmount currencyID="MYR">${formatAmount(totals.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

  xml += childDocs.map(createLineXml).join("");
  xml += `
</Invoice>`;

  return xml;
}
