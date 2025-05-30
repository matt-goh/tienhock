// src/utils/jellypolly/einvoice/JPEInvoiceTemplate.js
import { JELLYPOLLY_INFO } from "../../invoice/einvoice/companyInfo.js";

// Helper function to format ISO date (YYYY-MM-DD)
const formatDate = (timestamp) => {
  const d = new Date(Number(timestamp));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
};

// Helper function to format time
const formatTime = (timestamp) => {
  const d = new Date(Number(timestamp));
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}:00Z`;
};

// XML escape function to prevent XML injection
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

// Helper function to determine TIN or ID type and format value
const getIdTypeAndValue = (customerData) => {
  if (!customerData.id_type || customerData.id_type === "N/A") {
    return { type: "NRIC", value: customerData.id_number || "" };
  }

  const idType = customerData.id_type.toUpperCase();
  switch (idType) {
    case "NRIC":
    case "IC":
      return { type: "NRIC", value: customerData.id_number || "" };
    case "BRN":
      return { type: "BRN", value: customerData.id_number || "" };
    case "PASSPORT":
      return { type: "PASSPORT", value: customerData.id_number || "" };
    case "ARMY":
      return { type: "ARMY", value: customerData.id_number || "" };
    default:
      return { type: "NRIC", value: customerData.id_number || "" };
  }
};

export async function JPEInvoiceTemplate(invoiceData, customerData) {
  try {
    if (!invoiceData) {
      throw {
        type: "validation",
        message: "No invoice data provided",
        invoiceNo: "Unknown",
      };
    }

    if (!customerData) {
      throw {
        type: "validation",
        message: "Customer data is required",
        invoiceNo: invoiceData.id,
      };
    }

    // Validate customer data
    if (!customerData.tin_number || !customerData.id_number) {
      throw {
        type: "validation",
        code: "MISSING_REQUIRED_ID",
        message: `Missing TIN Number or ID Number for customer ${
          customerData.name || "unknown"
        }`,
        invoiceNo: invoiceData.id,
      };
    }

    const idInfo = getIdTypeAndValue(customerData);

    // Calculate totals and rounding
    const subtotal = parseFloat(invoiceData.total_excluding_tax || 0);
    const taxAmount = parseFloat(invoiceData.tax_amount || 0);
    const rounding = parseFloat(invoiceData.rounding || 0);
    const totalAmount = subtotal + taxAmount + rounding;

    // Start XML document
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>${escapeXml(invoiceData.id)}</cbc:ID>
  <cbc:IssueDate>${formatDate(invoiceData.createddate)}</cbc:IssueDate>
  <cbc:IssueTime>${formatTime(invoiceData.createddate)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>MYR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>MYR</cbc:TaxCurrencyCode>`;

    // Supplier party (JellyPolly info)
    xml += `
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:IndustryClassificationCode name="${
        JELLYPOLLY_INFO.msic_description ||
        "Manufacture of ice cream and other edible ice such as sorbet"
      }">${
      JELLYPOLLY_INFO.msic_code || "10501"
    }</cbc:IndustryClassificationCode>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${JELLYPOLLY_INFO.tin}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="NRIC">${JELLYPOLLY_INFO.reg_no}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">${JELLYPOLLY_INFO.sst_id_xml || "-"}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">-</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName>${JELLYPOLLY_INFO.city_xml}</cbc:CityName>
        <cbc:PostalZone>${JELLYPOLLY_INFO.postcode}</cbc:PostalZone>
        <cbc:CountrySubentityCode>${
          JELLYPOLLY_INFO.country_code
        }</cbc:CountrySubentityCode>
        <cac:AddressLine>
          <cbc:Line>${JELLYPOLLY_INFO.address_xml}</cbc:Line>
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
        <cbc:RegistrationName>${JELLYPOLLY_INFO.name}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${JELLYPOLLY_INFO.phone}</cbc:Telephone>
        <cbc:ElectronicMail>${JELLYPOLLY_INFO.email}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>`;

    // Customer party
    xml += `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${escapeXml(
          customerData.tin_number || "NA"
        )}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${idInfo.type}">${escapeXml(idInfo.value)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">NA</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">NA</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName>${escapeXml(customerData.city || "")}</cbc:CityName>
        <cbc:PostalZone></cbc:PostalZone>
        <cbc:CountrySubentityCode>${escapeXml(
          customerData.state || ""
        )}</cbc:CountrySubentityCode>
        <cac:AddressLine>
          <cbc:Line>${escapeXml(customerData.address || "")}</cbc:Line>
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
        <cbc:RegistrationName>${escapeXml(
          customerData.name
        )}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${escapeXml(
          customerData.phone_number || ""
        )}</cbc:Telephone>
        <cbc:ElectronicMail>${escapeXml(
          customerData.email || ""
        )}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>`;

    // Tax total
    xml += `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="MYR">${taxAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="MYR">${subtotal.toFixed(
        2
      )}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="MYR">${taxAmount.toFixed(2)}</cbc:TaxAmount>
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
    <cbc:LineExtensionAmount currencyID="MYR">${subtotal.toFixed(
      2
    )}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="MYR">${subtotal.toFixed(
      2
    )}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="MYR">${(subtotal + taxAmount).toFixed(
      2
    )}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="MYR">0</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="MYR">0</cbc:ChargeTotalAmount>
    <cbc:PayableRoundingAmount currencyID="MYR">${rounding.toFixed(
      2
    )}</cbc:PayableRoundingAmount>
    <cbc:PayableAmount currencyID="MYR">${totalAmount.toFixed(
      2
    )}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

    // Invoice lines
    let lineNumber = 1;
    for (const item of invoiceData.orderDetails) {
      if (item.issubtotal || item.istotal) continue;

      const itemSubtotal = parseFloat(item.price) * parseFloat(item.quantity);
      const itemTax = parseFloat(item.tax || 0);

      xml += `
  <cac:InvoiceLine>
    <cbc:ID>${lineNumber}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NMP">${item.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="MYR">${itemSubtotal.toFixed(
      2
    )}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="MYR">${itemTax.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="MYR">${itemSubtotal.toFixed(
          2
        )}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="MYR">${itemTax.toFixed(2)}</cbc:TaxAmount>
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
        item.description || item.code
      )}</cbc:Description>
      <cac:OriginCountry>
        <cbc:IdentificationCode>MYS</cbc:IdentificationCode>
      </cac:OriginCountry>
      <cac:CommodityClassification>
        <cbc:ItemClassificationCode listID="PTC"/>
      </cac:CommodityClassification>
      <cac:CommodityClassification>
        <cbc:ItemClassificationCode listID="CLASS">022</cbc:ItemClassificationCode>
      </cac:CommodityClassification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="MYR">${parseFloat(item.price).toFixed(
        2
      )}</cbc:PriceAmount>
    </cac:Price>
    <cac:ItemPriceExtension>
      <cbc:Amount currencyID="MYR">${itemSubtotal.toFixed(2)}</cbc:Amount>
    </cac:ItemPriceExtension>
  </cac:InvoiceLine>`;
      lineNumber++;
    }

    xml += `
</Invoice>`;

    return xml;
  } catch (error) {
    if (error.type === "validation") {
      throw error;
    }
    throw {
      type: "validation",
      message: `Failed to transform invoice: ${error.message}`,
      invoiceNo: invoiceData?.id || "Unknown",
    };
  }
}
