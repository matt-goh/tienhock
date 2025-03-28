// EInvoiceTemplate.js
import { TIENHOCK_INFO } from "./companyInfo.js";

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
        } else {
          console.warn("Invalid date parts:", { day, month, year });
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

const isDateWithinRange = (dateStr, daysBack = 3) => {
  try {
    // Get current date at start of day in local timezone
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate the earliest allowed date
    const earliestDate = new Date(today);
    earliestDate.setDate(today.getDate() - daysBack);

    // Parse the input date
    const [day, month, year] = dateStr.split("/").map(Number);
    const inputDate = new Date(year, month - 1, day);
    inputDate.setHours(0, 0, 0, 0);

    return inputDate >= earliestDate && inputDate <= today;
  } catch (error) {
    console.error("Error in isDateWithinRange:", error);
    return false;
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

const calculateTaxAndTotals = (invoiceData) => {
  // Calculate tax-exclusive amount (subtotal) from product data
  const subtotal = invoiceData.orderDetails.reduce((sum, detail) => {
    if (!detail.issubtotal) {
      return sum + (detail.qty || 0) * (Number(detail.price) || 0);
    }
    return sum;
  }, 0);

  // Group tax items by tax category
  const taxGroups = {
    ["01"]: { amount: 0, taxable: 0 }, // Sales Tax
    ["02"]: { amount: 0, taxable: 0 }, // Service Tax
    ["06"]: { amount: 0, taxable: 0 }, // Not Applicable
    ["E"]: { amount: 0, taxable: 0 }, // Tax exemption
  };

  // Calculate tax by category
  let totalProductTax = 0;
  invoiceData.orderDetails.forEach((detail) => {
    if (detail.issubtotal) return;

    const taxAmount = parseFloat(detail.tax) || 0;
    const lineAmount = (detail.qty || 0) * (Number(detail.price) || 0);
    totalProductTax += taxAmount;

    // Determine tax category based on tax amount
    let taxCategory = "06"; // Default to not applicable
    if (taxAmount > 0) {
      taxCategory = "01"; // Default to Sales Tax when tax exists
    } else if (lineAmount > 0) {
      taxCategory = "E"; // Exempt if there's an amount but no tax
    }

    taxGroups[taxCategory].amount += taxAmount;
    taxGroups[taxCategory].taxable += lineAmount;
  });

  // Filter out empty tax groups
  const taxSubtotals = Object.entries(taxGroups)
    .filter(([_, group]) => group.taxable > 0)
    .map(([category, group]) => ({
      category,
      taxableAmount: formatAmount(group.taxable),
      taxAmount: formatAmount(group.amount),
    }));

  // Calculate total tax - prefer product-level calculation
  let totalTax = formatAmount(totalProductTax);

  // Get the rounding value
  const rounding = formatAmount(invoiceData.rounding || 0);

  // Calculate total (tax-inclusive amount + rounding)
  const total = formatAmount(subtotal + totalTax + rounding);

  return {
    subtotal: formatAmount(subtotal),
    tax: totalTax,
    total,
    taxSubtotals,
    rounding,
  };
};

// Precompile static template parts for performance
const TEMPLATE_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" 
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" 
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`;

const TEMPLATE_FOOTER = `</Invoice>`;

// Optimized tax subtotal generation with string concatenation
function generateTaxSubtotals(taxSubtotals) {
  let result = "";

  for (const subtotal of taxSubtotals) {
    result += `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="MYR">${subtotal.taxableAmount.toFixed(
        2
      )}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="MYR">${subtotal.taxAmount.toFixed(
        2
      )}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${subtotal.category}</cbc:ID>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">OTH</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
  }

  return result;
}

// Optimized invoice lines generation with string concatenation
const generateInvoiceLines = (orderDetails) => {
  // First filter out any subtotal rows, we only want regular items
  const regularItems = orderDetails.filter((item) => !item.issubtotal);

  let result = "";

  for (let index = 0; index < regularItems.length; index++) {
    const item = regularItems[index];
    const lineNumber = (index + 1).toString().padStart(3, "0");
    const lineAmount = formatAmount(
      (item.qty || 0) * (Number(item.price) || 0)
    );
    const productTax = formatAmount(Number(item.tax) || 0);
    const taxCategory = productTax > 0 ? "01" : "06"; // 01 for Sales Tax, 06 for Not Applicable

    result += `
  <cac:InvoiceLine>
    <cbc:ID>${lineNumber}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NMP">${item.qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="MYR">${lineAmount.toFixed(
      2
    )}</cbc:LineExtensionAmount>
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
        <cbc:TaxableAmount currencyID="MYR">${lineAmount.toFixed(
          2
        )}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="MYR">${productTax.toFixed(2)}</cbc:TaxAmount>
        <cbc:BaseUnitMeasure unitCode="NMP">${item.qty}</cbc:BaseUnitMeasure>
        <cbc:PerUnitAmount currencyID="MYR">${(item.qty > 0
          ? productTax / item.qty
          : 0
        ).toFixed(2)}</cbc:PerUnitAmount>
        <cac:TaxCategory>
          <cbc:ID>${taxCategory}</cbc:ID>
          <cac:TaxScheme>
            <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">OTH</cbc:ID>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${escapeXml(item.productname)}</cbc:Description>
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
      <cbc:PriceAmount currencyID="MYR">${item.price}</cbc:PriceAmount>
    </cac:Price>
    <cac:ItemPriceExtension>
      <cbc:Amount currencyID="MYR">${lineAmount.toFixed(2)}</cbc:Amount>
    </cac:ItemPriceExtension>
  </cac:InvoiceLine>`;
  }

  return result;
};

export async function EInvoiceTemplate(rawInvoiceData, customerData) {
  try {
    if (!rawInvoiceData) {
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
        invoiceNo: rawInvoiceData?.id || "Unknown",
      };
    }

    // Convert timestamp to date format
    const timestamp = Number(rawInvoiceData.createddate);
    const invoiceDate = new Date(timestamp);

    // Format the date using our robust date formatter (YYYY-MM-DD)
    const formattedDate = formatDate(invoiceDate.toISOString().split("T")[0]);

    // Get time from the timestamp
    const hours = invoiceDate.getHours().toString().padStart(2, "0");
    const minutes = invoiceDate.getMinutes().toString().padStart(2, "0");
    const seconds = invoiceDate.getSeconds().toString().padStart(2, "0");
    const formattedTime = `${hours}:${minutes}:${seconds}Z`;

    // Check if date is within range
    const day = invoiceDate.getDate().toString().padStart(2, "0");
    const month = (invoiceDate.getMonth() + 1).toString().padStart(2, "0");
    const year = invoiceDate.getFullYear();
    const formattedDateForValidation = `${day}/${month}/${year}`;

    if (!isDateWithinRange(formattedDateForValidation)) {
      throw {
        type: "validation",
        code: "DATE_VALIDATION",
        message: "Invoice date must be within the last 3 days",
        invoiceNo: rawInvoiceData.id,
      };
    }

    // Validate order details
    if (!Array.isArray(rawInvoiceData?.orderDetails)) {
      throw {
        type: "validation",
        code: "INV_VALIDATION",
        message: "Invoice must contain at least one order detail",
        invoiceNo: rawInvoiceData.id,
      };
    } else if (rawInvoiceData.orderDetails.length === 0) {
      throw {
        type: "validation",
        code: "INV_VALIDATION",
        message: "Invoice must contain at least one order detail",
        invoiceNo: rawInvoiceData.id,
      };
    }

    // Clean and prepare the order details
    const sanitizedOrderDetails = rawInvoiceData.orderDetails.map((detail) => ({
      ...detail,
      qty: Number(detail.quantity || 0),
      productname: detail.description || "",
      price: Number(detail.price || 0),
      total: detail.total || "0",
    }));

    // Total amounts calculation
    const totals = calculateTaxAndTotals({
      orderDetails: sanitizedOrderDetails,
      totalamountpayable: Number(rawInvoiceData.totalamountpayable || 0),
      amount: Number(rawInvoiceData.amount || 0),
      rounding: Number(rawInvoiceData.rounding || 0),
    });

    // Start XML document using optimized string concatenation
    let xml = TEMPLATE_HEADER;

    // Add invoice ID and basic information
    xml += `
  <cbc:ID>${escapeXml(rawInvoiceData.id)}</cbc:ID>
  <cbc:IssueDate>${formattedDate}</cbc:IssueDate>
  <cbc:IssueTime>${formattedTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listVersionID="1.0">01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>MYR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>MYR</cbc:TaxCurrencyCode>`;

    // Add invoice period
    xml += `
  <cac:InvoicePeriod>
    <cbc:StartDate>${formattedDate}</cbc:StartDate>
    <cbc:EndDate>${formattedDate}</cbc:EndDate>
    <cbc:Description>Not Applicable</cbc:Description>
  </cac:InvoicePeriod>`;

    // Add billing reference
    xml += `
  <cac:BillingReference>
    <cac:AdditionalDocumentReference>
      <cbc:ID>-</cbc:ID>
    </cac:AdditionalDocumentReference>
  </cac:BillingReference>`;

    // Add additional document references
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

    // Add supplier party
    xml += `
  <cac:AccountingSupplierParty>
    <cbc:AdditionalAccountID schemeAgencyName="CertEX"></cbc:AdditionalAccountID>
    <cac:Party>
      <cbc:IndustryClassificationCode name="${
        TIENHOCK_INFO.msic_description
      }">${TIENHOCK_INFO.msic_code}</cbc:IndustryClassificationCode>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${TIENHOCK_INFO.tin}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="BRN">${TIENHOCK_INFO.reg_no}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">${TIENHOCK_INFO.sst_id_xml || "-"}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">-</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName>${TIENHOCK_INFO.city_xml}</cbc:CityName>
        <cbc:PostalZone>${TIENHOCK_INFO.postcode}</cbc:PostalZone>
        <cbc:CountrySubentityCode>${
          TIENHOCK_INFO.country_code
        }</cbc:CountrySubentityCode>
          <cac:AddressLine>
            <cbc:Line>${TIENHOCK_INFO.address_xml}</cbc:Line>
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
        <cbc:RegistrationName>${TIENHOCK_INFO.name}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${TIENHOCK_INFO.phone}</cbc:Telephone>
        <cbc:ElectronicMail>${TIENHOCK_INFO.email}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>`;

    // Customer party
    xml += `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${escapeXml(
          customerData.tin_number || "-"
        )}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${escapeXml(
          customerData.id_type || "BRN"
        )}">${escapeXml(customerData.id_number || "-")}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">-</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">-</cbc:ID>
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

    // Tax information
    xml += `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="MYR">${totals.tax.toFixed(2)}</cbc:TaxAmount>
    ${generateTaxSubtotals(totals.taxSubtotals)}
  </cac:TaxTotal>`;

    // Add legal monetary total
    xml += `
<cac:LegalMonetaryTotal>
  <cbc:LineExtensionAmount currencyID="MYR">${totals.subtotal.toFixed(
    2
  )}</cbc:LineExtensionAmount>
  <cbc:TaxExclusiveAmount currencyID="MYR">${totals.subtotal.toFixed(
    2
  )}</cbc:TaxExclusiveAmount>
  <cbc:TaxInclusiveAmount currencyID="MYR">${(
    totals.subtotal + totals.tax
  ).toFixed(2)}</cbc:TaxInclusiveAmount>
  <cbc:AllowanceTotalAmount currencyID="MYR">0.00</cbc:AllowanceTotalAmount>
  <cbc:ChargeTotalAmount currencyID="MYR">0.00</cbc:ChargeTotalAmount>
  <cbc:PayableRoundingAmount currencyID="MYR">${totals.rounding.toFixed(
    2
  )}</cbc:PayableRoundingAmount>
  <cbc:PayableAmount currencyID="MYR">${totals.total.toFixed(
    2
  )}</cbc:PayableAmount>
</cac:LegalMonetaryTotal>`;

    // Add invoice lines
    xml += generateInvoiceLines(sanitizedOrderDetails);

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
      invoiceNo: rawInvoiceData?.invoiceno || "Unknown",
    };
  }
}
