// src/utils/greenTarget/einvoice/GTEInvoiceTemplate.js
import { GREENTARGET_INFO } from "../../../utils/invoice/einvoice/companyInfo.js";

// Helper function to format phone number
function formatPhoneNumber(phone) {
  if (!phone) return "";
  // Remove any non-digit characters
  const cleaned = phone.replace(/\D/g, "");

  // Remove leading country code if present (both +60 and 60)
  let number = cleaned;
  if (cleaned.startsWith("60")) {
    number = cleaned.slice(2);
  }

  // Remove any leading zeros from the number itself
  while (number.startsWith("0")) {
    number = number.slice(1);
  }

  // Add custom leadings and return
  return `0${number}`;
}

const formatAmount = (amount) => {
  const num = typeof amount === "string" ? parseFloat(amount) : Number(amount);
  return isNaN(num) ? 0.0 : Number(num.toFixed(2));
};

const formatDate = (dateStr) => {
  if (!dateStr) {
    console.warn("No date provided, using current date");
    const today = new Date();
    return today.toISOString().split("T")[0];
  }

  try {
    // Handle DD/MM/YYYY format (which is what our database returns)
    if (typeof dateStr === "string" && dateStr.includes("/")) {
      const [day, month, year] = dateStr.split("/").map((part) => part.trim());
      if (day && month && year) {
        // Validate the parts
        const numDay = parseInt(day, 10);
        const numMonth = parseInt(month, 10);
        const numYear = parseInt(year, 10);

        if (
          numDay >= 1 &&
          numDay <= 31 &&
          numMonth >= 1 &&
          numMonth <= 12 &&
          numYear >= 1900 &&
          numYear <= 9999
        ) {
          return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }
      }
    }

    // Try parsing as ISO date
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }

    console.warn("Failed to parse date:", dateStr);
    const today = new Date();
    return today.toISOString().split("T")[0];
  } catch (error) {
    console.error("Error parsing date:", error, "for date string:", dateStr);
    const today = new Date();
    return today.toISOString().split("T")[0];
  }
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

// Precompile static template parts for performance
const TEMPLATE_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" 
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" 
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`;

const TEMPLATE_FOOTER = `</Invoice>`;

export async function GTEInvoiceTemplate(invoiceData, customerData) {
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
        invoiceNo: invoiceData?.invoice_number || "Unknown",
      };
    }

    // Convert timestamp to date format
    const timestamp = new Date(invoiceData.date_issued).getTime();
    const invoiceDate = new Date(timestamp);

    // Format the date using our robust date formatter (YYYY-MM-DD)
    const formattedDate = formatDate(invoiceDate.toISOString().split("T")[0]);

    // Get time in UTC (since we're using Z suffix which means UTC)
    const hours = invoiceDate.getUTCHours().toString().padStart(2, "0");
    const minutes = invoiceDate.getUTCMinutes().toString().padStart(2, "0");
    const seconds = invoiceDate.getUTCSeconds().toString().padStart(2, "0");
    const formattedTime = `${hours}:${minutes}:${seconds}Z`;

    // Validate customer data
    if (!customerData.tin_number || !customerData.id_number) {
      throw {
        type: "validation",
        code: "MISSING_REQUIRED_ID",
        message: `Missing TIN Number or ID Number for customer ${
          customerData.name || "unknown"
        }`,
        invoiceNo: invoiceData.invoice_number,
      };
    }

    // Calculate total amounts
    const subtotal = formatAmount(invoiceData.amount_before_tax);
    const taxAmount = formatAmount(invoiceData.tax_amount);
    const totalAmount = formatAmount(invoiceData.total_amount);

    // Generate description based on rental details
    const generateInvoiceDescription = (invoice) => {
      // Check if invoice has rental details for dynamic description
      if (invoice.rental_details && invoice.rental_details.length > 0) {
        const groupedByType = {};
        
        invoice.rental_details.forEach(rental => {
          if (rental.tong_no) {
            const dumpsterNumber = rental.tong_no.trim();
            const type = dumpsterNumber.startsWith("B") ? "B" : "A";
            groupedByType[type] = (groupedByType[type] || 0) + 1;
          }
        });

        const descriptions = [];
        Object.entries(groupedByType).forEach(([type, quantity]) => {
          const desc = quantity === 1 
            ? `1x Rental Tong (${type})`
            : `${quantity}x Rental Tong (${type})`;
          descriptions.push(desc);
        });

        return descriptions.length > 0 
          ? descriptions.join(", ")
          : "Rental Tong Service";
      }
      
      // Fallback to legacy single rental fields
      if (invoice.type === "regular" && invoice.rental_id && invoice.tong_no) {
        const dumpsterNumber = invoice.tong_no.trim();
        const type = dumpsterNumber.startsWith("B") ? "B" : "A";
        return `Rental Tong (${type})`;
      }

      // Default fallback
      return "Waste Management Service";
    };

    const itemDescription = generateInvoiceDescription(invoiceData);

    // Start XML document using optimized string concatenation
    let xml = TEMPLATE_HEADER;

    // Add invoice ID and basic information
    xml += `
  <cbc:ID>${escapeXml(invoiceData.invoice_number)}</cbc:ID>
  <cbc:IssueDate>${formattedDate}</cbc:IssueDate>
  <cbc:IssueTime>${formattedTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>MYR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>MYR</cbc:TaxCurrencyCode>`;

    // Add supplier party (Green Target)
    xml += `
  <cac:AccountingSupplierParty>
    <cbc:AdditionalAccountID schemeAgencyName="CertEX"></cbc:AdditionalAccountID>
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
        <cbc:ID schemeID="${escapeXml(
          customerData.id_type || "BRN"
        )}">${escapeXml(customerData.id_number || "NA")}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">NA</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">NA</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName>Kota Kinabalu</cbc:CityName>
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
        <cbc:Telephone>${formatPhoneNumber(
          customerData.phone_number
        )}</cbc:Telephone>
        <cbc:ElectronicMail>${escapeXml(
          customerData.email || ""
        )}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingCustomerParty>`;

    // Tax information
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

    // Add monetary total
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
    <cbc:AllowanceTotalAmount currencyID="MYR">0.00</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="MYR">0.00</cbc:ChargeTotalAmount>
    <cbc:PayableRoundingAmount currencyID="MYR">0</cbc:PayableRoundingAmount>
    <cbc:PayableAmount currencyID="MYR">${totalAmount.toFixed(
      2
    )}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

    // Add invoice line for the rental services
    xml += `
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="MYR">${subtotal.toFixed(
      2
    )}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="MYR">${taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="MYR">${subtotal.toFixed(
          2
        )}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="MYR">${taxAmount.toFixed(2)}</cbc:TaxAmount>
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
      <cbc:Description>${escapeXml(itemDescription)}</cbc:Description>
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
      <cbc:PriceAmount currencyID="MYR">${subtotal.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
    <cac:ItemPriceExtension>
      <cbc:Amount currencyID="MYR">${subtotal.toFixed(2)}</cbc:Amount>
    </cac:ItemPriceExtension>
  </cac:InvoiceLine>`;

    // Close the XML document
    xml += TEMPLATE_FOOTER;

    return xml;
  } catch (error) {
    // If it's a validation error, pass it through
    if (error.type === "validation") {
      throw error;
    }
    // For any other errors, wrap them
    throw {
      type: "validation",
      message: `Failed to transform invoice: ${error.message}`,
      invoiceNo: invoiceData?.invoice_number || "Unknown",
    };
  }
}
