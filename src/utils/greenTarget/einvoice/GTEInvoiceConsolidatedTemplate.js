// src/utils/greenTarget/einvoice/GTEInvoiceConsolidatedTemplate.js
import { GREENTARGET_INFO } from "../../../utils/invoice/einvoice/companyInfo.js";

// Helper function to format ISO date (YYYY-MM-DD)
const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

// Helper function to format time in UTC (since we're using Z suffix which means UTC)
const formatTime = () => {
  const now = new Date();
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}:00Z`;
};

export async function GTEInvoiceConsolidatedTemplate(invoices, month, year) {
  try {
    if (!invoices || !Array.isArray(invoices) || invoices.length === 0) {
      throw {
        type: "validation",
        message: "No invoices provided for consolidation",
        invoiceNo: "Consolidated",
      };
    }

    // Calculate totals from all invoices
    let totalExcludingTax = 0;
    let totalInclusiveTax = 0;
    let totalPayableAmount = 0;
    let totalRounding = 0;
    let totalProductTax = 0;

    invoices.forEach((invoice) => {
      // Calculate true tax-exclusive amount
      totalExcludingTax += parseFloat(invoice.amount_before_tax || 0);
      totalProductTax += parseFloat(invoice.tax_amount || 0);
      totalPayableAmount += parseFloat(invoice.total_amount || 0);

      // Add rounding if present
      if (invoice.rounding) {
        totalRounding += parseFloat(invoice.rounding);
      }
    });

    // Calculate tax amount
    let taxAmount = totalProductTax;
    if (taxAmount === 0) {
      // If no product-level taxes found, calculate based on totals and account for rounding
      taxAmount = totalPayableAmount - totalExcludingTax - totalRounding;
    }

    totalInclusiveTax = totalExcludingTax + taxAmount;

    // Format amounts to 2 decimal places
    totalExcludingTax = totalExcludingTax.toFixed(2);
    totalPayableAmount = totalPayableAmount.toFixed(2);
    totalRounding = totalRounding.toFixed(2);
    const formattedTaxAmount = taxAmount.toFixed(2);

    // Generate a unique ID for consolidated invoice based on month and year
    const consolidatedId = `CON-${year}${String(month + 1).padStart(2, "0")}`;

    // Get current date in YYYY-MM-DD format
    const today = formatDate(new Date());

    // Start XML document
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${consolidatedId}</cbc:ID>
  <cbc:IssueDate>${today}</cbc:IssueDate>
  <cbc:IssueTime>${formatTime()}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>MYR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>MYR</cbc:TaxCurrencyCode>`;

    // Supplier party (company info)
    xml += `
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:IndustryClassificationCode name="${
        GREENTARGET_INFO.msic_description
      }">${GREENTARGET_INFO.msic_code}</cbc:IndustryClassificationCode>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${GREENTARGET_INFO.tin}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="BRN">${GREENTARGET_INFO.reg_no}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">${GREENTARGET_INFO.sst_id_xml || "-"}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">-</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName>${GREENTARGET_INFO.city_xml}</cbc:CityName>
        <cbc:PostalZone>${GREENTARGET_INFO.postcode}</cbc:PostalZone>
        <cbc:CountrySubentityCode>${
          GREENTARGET_INFO.country_code
        }</cbc:CountrySubentityCode>
        <cac:AddressLine>
          <cbc:Line>${GREENTARGET_INFO.address_xml}</cbc:Line>
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
        <cbc:RegistrationName>${GREENTARGET_INFO.name}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${GREENTARGET_INFO.phone}</cbc:Telephone>
        <cbc:ElectronicMail>${GREENTARGET_INFO.email}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>`;

    // Customer party for consolidated invoices
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

    // Add tax information
    xml += `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="MYR">${formattedTaxAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="MYR">${totalExcludingTax}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="MYR">${formattedTaxAmount}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>01</cbc:ID>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">OTH</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`;

    // Add legal monetary total
    xml += `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="MYR">${totalExcludingTax}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="MYR">${totalExcludingTax}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="MYR">${totalInclusiveTax}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="MYR">0</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="MYR">0</cbc:ChargeTotalAmount>
    <cbc:PayableRoundingAmount currencyID="MYR">${
      totalRounding || "0"
    }</cbc:PayableRoundingAmount>
    <cbc:PayableAmount currencyID="MYR">${totalPayableAmount}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

    // Add single consolidated invoice line
    const monthYearName = new Date(year, month).toLocaleString("default", {
      month: "long",
      year: "numeric",
    });

    xml += `
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="MYR">${totalExcludingTax}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="MYR">${formattedTaxAmount}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="MYR">${totalExcludingTax}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="MYR">${formattedTaxAmount}</cbc:TaxAmount>
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
      <cbc:Description>Consolidated Waste Management Services for ${monthYearName} (${invoices.length} invoices)</cbc:Description>
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
      <cbc:PriceAmount currencyID="MYR">${totalExcludingTax}</cbc:PriceAmount>
    </cac:Price>
    <cac:ItemPriceExtension>
      <cbc:Amount currencyID="MYR">${totalExcludingTax}</cbc:Amount>
    </cac:ItemPriceExtension>
  </cac:InvoiceLine>
</Invoice>`;

    return xml;
  } catch (error) {
    // If it's a validation error, pass it through
    if (error.type === "validation") {
      throw error;
    }
    // For any other errors, wrap them
    throw {
      type: "validation",
      message: `Failed to transform consolidated invoice: ${error.message}`,
      invoiceNo: "Consolidated",
    };
  }
}
