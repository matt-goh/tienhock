import { TIENHOCK_INFO } from "./companyInfo.js";

const TEMPLATE_HEADER = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`;

const TEMPLATE_FOOTER = `</Invoice>`;

const FOREIGN_SUPPLIER_TIN = "EI00000000030";
const FOREIGN_SUPPLIER_MSIC_CODE = "00000";
const FOREIGN_SUPPLIER_MSIC_DESCRIPTION = "NA";

function escapeXml(value) {
  if (value === undefined || value === null) return "";
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanValue(value, fallback = "NA") {
  if (value === undefined || value === null) return fallback;
  const trimmed = value.toString().trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function formatAmount(value, decimals = 2) {
  const parsed = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;
  return safeValue.toFixed(decimals);
}

function convertMyrToDocumentAmount(value, fxRate) {
  const parsedValue = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  const parsedFxRate = typeof fxRate === "string" ? Number.parseFloat(fxRate) : Number(fxRate);
  const safeValue = Number.isFinite(parsedValue) ? parsedValue : 0;
  return Number.isFinite(parsedFxRate) && parsedFxRate > 0
    ? safeValue / parsedFxRate
    : safeValue;
}

function getLineTaxAmount(line, amountForeign, fxRate) {
  const taxAmountMyr = Number(line.tax_amount_myr || 0);
  if (taxAmountMyr > 0) {
    return convertMyrToDocumentAmount(taxAmountMyr, fxRate);
  }

  const taxRate = Number(line.tax_rate || 0);
  return taxRate > 0 ? amountForeign * (taxRate / 100) : 0;
}

function getLineTaxAmountMyr(line, taxAmount, fxRate) {
  const taxAmountMyr = Number(line.tax_amount_myr || 0);
  if (taxAmountMyr > 0) {
    return taxAmountMyr;
  }

  const parsedFxRate = typeof fxRate === "string" ? Number.parseFloat(fxRate) : Number(fxRate);
  return Number.isFinite(parsedFxRate) && parsedFxRate > 0
    ? taxAmount * parsedFxRate
    : taxAmount;
}

function getCurrentIssueDateTime() {
  const now = new Date();
  const iso = now.toISOString();
  return {
    issueDate: iso.slice(0, 10),
    issueTime: `${iso.slice(11, 19)}Z`,
  };
}

function generateSupplierParty(supplier) {
  const addressLine1 = supplier.address_line_1 ? supplier.address_line_1 : "";
  const addressLine2 = supplier.address_line_2 ? supplier.address_line_2 : "";

  return `
  <cac:AccountingSupplierParty>
    <cbc:AdditionalAccountID schemeAgencyName="CertEX"></cbc:AdditionalAccountID>
    <cac:Party>
      <cbc:IndustryClassificationCode name="${FOREIGN_SUPPLIER_MSIC_DESCRIPTION}">${FOREIGN_SUPPLIER_MSIC_CODE}</cbc:IndustryClassificationCode>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${FOREIGN_SUPPLIER_TIN}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${escapeXml(cleanValue(supplier.id_type, "BRN"))}">${escapeXml(
          cleanValue(supplier.id_number)
        )}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">${escapeXml(cleanValue(supplier.sst_number))}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">${escapeXml(cleanValue(supplier.ttx_number))}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName>${escapeXml(cleanValue(supplier.city))}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(cleanValue(supplier.postcode, ""))}</cbc:PostalZone>
        <cbc:CountrySubentityCode>${escapeXml(cleanValue(supplier.state_code, "17"))}</cbc:CountrySubentityCode>
        <cac:AddressLine>
          <cbc:Line>${escapeXml(cleanValue(supplier.address_line_0))}</cbc:Line>
        </cac:AddressLine>
        <cac:AddressLine>
          <cbc:Line>${escapeXml(addressLine1)}</cbc:Line>
        </cac:AddressLine>
        <cac:AddressLine>
          <cbc:Line>${escapeXml(addressLine2)}</cbc:Line>
        </cac:AddressLine>
        <cac:Country>
          <cbc:IdentificationCode listID="ISO3166-1" listAgencyID="6">${escapeXml(
            cleanValue(supplier.country_code, "CHN")
          )}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(cleanValue(supplier.supplier_name))}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${escapeXml(cleanValue(supplier.contact_number))}</cbc:Telephone>
        <cbc:ElectronicMail>${escapeXml(cleanValue(supplier.email, ""))}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
}

function generateBuyerParty() {
  return `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${TIENHOCK_INFO.tin}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="BRN">${TIENHOCK_INFO.reg_no}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="SST">${TIENHOCK_INFO.sst_id_xml || "NA"}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TTX">NA</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName>${TIENHOCK_INFO.city_xml}</cbc:CityName>
        <cbc:PostalZone>${TIENHOCK_INFO.postcode}</cbc:PostalZone>
        <cbc:CountrySubentityCode>${TIENHOCK_INFO.country_code}</cbc:CountrySubentityCode>
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
  </cac:AccountingCustomerParty>`;
}

function generateBuyerDelivery(invoice, currencyCode) {
  const shipmentId = cleanValue(invoice.shipping_number, invoice.self_billed_no);
  const shippingMethod = cleanValue(invoice.shipping_method, "NA");

  return `
  <cac:Delivery>
    <cac:DeliveryParty>
      <cac:PartyIdentification>
        <cbc:ID schemeID="TIN">${TIENHOCK_INFO.tin}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyIdentification>
        <cbc:ID schemeID="BRN">${TIENHOCK_INFO.reg_no}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:CityName>${TIENHOCK_INFO.city_xml}</cbc:CityName>
        <cbc:PostalZone>${TIENHOCK_INFO.postcode}</cbc:PostalZone>
        <cbc:CountrySubentityCode>${TIENHOCK_INFO.country_code}</cbc:CountrySubentityCode>
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
    </cac:DeliveryParty>
    <cac:Shipment>
      <cbc:ID>${escapeXml(shipmentId)}</cbc:ID>
      <cac:FreightAllowanceCharge>
        <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
        <cbc:AllowanceChargeReason>${escapeXml(shippingMethod)}</cbc:AllowanceChargeReason>
        <cbc:Amount currencyID="${escapeXml(currencyCode)}">0.00</cbc:Amount>
      </cac:FreightAllowanceCharge>
    </cac:Shipment>
  </cac:Delivery>`;
}

function generatePaymentBlocks(invoice, currencyCode, issueDate, issueTime) {
  const paymentReference = cleanValue(invoice.payment_reference, "");
  const paymentNote = paymentReference
    ? `Payment reference ${paymentReference}`
    : cleanValue(invoice.notes, "Payment details not provided");

  let paymentXml = `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>01</cbc:PaymentMeansCode>`;

  if (paymentReference) {
    paymentXml += `
    <cac:PayeeFinancialAccount>
      <cbc:ID>${escapeXml(paymentReference)}</cbc:ID>
    </cac:PayeeFinancialAccount>`;
  }

  paymentXml += `
  </cac:PaymentMeans>
  <cac:PaymentTerms>
    <cbc:Note>${escapeXml(paymentNote)}</cbc:Note>
  </cac:PaymentTerms>`;

  if (paymentReference) {
    paymentXml += `
  <cac:PrepaidPayment>
    <cbc:ID>${escapeXml(paymentReference)}</cbc:ID>
    <cbc:PaidAmount currencyID="${escapeXml(currencyCode)}">${formatAmount(
      invoice.total_foreign_amount || invoice.payable_amount_myr || 0
    )}</cbc:PaidAmount>
    <cbc:PaidDate>${issueDate}</cbc:PaidDate>
    <cbc:PaidTime>${issueTime}</cbc:PaidTime>
  </cac:PrepaidPayment>`;
  }

  return paymentXml;
}

function generateTaxSubtotal(totalTaxableAmount, totalTaxAmountMyr, taxType, currencyCode) {
  return `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${escapeXml(currencyCode)}">${formatAmount(totalTaxableAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="MYR">${formatAmount(totalTaxAmountMyr)}</cbc:TaxAmount>
      <cbc:Percent>0.00</cbc:Percent>
      <cac:TaxCategory>
        <cbc:ID>${escapeXml(cleanValue(taxType, "06"))}</cbc:ID>
        <cac:TaxScheme>
          <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">OTH</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`;
}

function generateInvoiceLines(lines, currencyCode, fxRate) {
  return lines
    .map((line, index) => {
      const lineNumber = line.line_number || index + 1;
      const quantity = Number(line.quantity || 1);
      const amountForeign = Number(line.amount_foreign || 0);
      const unitPriceForeign =
        Number(line.unit_price_foreign || 0) || (quantity > 0 ? amountForeign / quantity : 0);
      const taxAmount = getLineTaxAmount(line, amountForeign, fxRate);
      const taxAmountMyr = getLineTaxAmountMyr(line, taxAmount, fxRate);
      const taxType = cleanValue(line.tax_type, "06");
      const taxRate = Number(line.tax_rate || 0);
      const taxExemptionReason = cleanValue(line.tax_exemption_reason, "");

      return `
  <cac:InvoiceLine>
    <cbc:ID>${lineNumber.toString().padStart(3, "0")}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${formatAmount(quantity, 3)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currencyCode}">${formatAmount(amountForeign)}</cbc:LineExtensionAmount>
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason></cbc:AllowanceChargeReason>
      <cbc:MultiplierFactorNumeric>0.00</cbc:MultiplierFactorNumeric>
      <cbc:Amount currencyID="${currencyCode}">0.00</cbc:Amount>
    </cac:AllowanceCharge>
    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason></cbc:AllowanceChargeReason>
      <cbc:MultiplierFactorNumeric>0.00</cbc:MultiplierFactorNumeric>
      <cbc:Amount currencyID="${currencyCode}">0.00</cbc:Amount>
    </cac:AllowanceCharge>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="MYR">${formatAmount(taxAmountMyr)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currencyCode}">${formatAmount(amountForeign)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="MYR">${formatAmount(taxAmountMyr)}</cbc:TaxAmount>
        <cbc:Percent>${formatAmount(taxRate)}</cbc:Percent>
        <cac:TaxCategory>
          <cbc:ID>${escapeXml(taxType)}</cbc:ID>
          ${
            taxType === "E"
              ? `<cbc:TaxExemptionReason>${escapeXml(
                  taxExemptionReason || "Tax exemption"
                )}</cbc:TaxExemptionReason>`
              : ""
          }
          <cac:TaxScheme>
            <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">OTH</cbc:ID>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${escapeXml(cleanValue(line.description, "NA"))}</cbc:Description>
      <cac:OriginCountry>
        <cbc:IdentificationCode>CHN</cbc:IdentificationCode>
      </cac:OriginCountry>
      <cac:CommodityClassification>
        <cbc:ItemClassificationCode listID="CLASS">${escapeXml(
          cleanValue(line.classification_code, "034")
        )}</cbc:ItemClassificationCode>
      </cac:CommodityClassification>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currencyCode}">${formatAmount(unitPriceForeign, 4)}</cbc:PriceAmount>
    </cac:Price>
    <cac:ItemPriceExtension>
      <cbc:Amount currencyID="${currencyCode}">${formatAmount(amountForeign)}</cbc:Amount>
    </cac:ItemPriceExtension>
  </cac:InvoiceLine>`;
    })
    .join("");
}

function generateAdditionalReferences(invoice) {
  const customsReference = cleanValue(invoice.customs_form_reference, "");
  const orderReference = cleanValue(invoice.order_no, "");
  const shippingNumber = cleanValue(invoice.shipping_number, "");

  return `
  <cac:BillingReference>
    <cac:AdditionalDocumentReference>
      <cbc:ID>${escapeXml(orderReference || invoice.self_billed_no)}</cbc:ID>
    </cac:AdditionalDocumentReference>
  </cac:BillingReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>${escapeXml(customsReference)}</cbc:ID>
    <cbc:DocumentType>${customsReference ? "CustomsImportForm" : ""}</cbc:DocumentType>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>${escapeXml(orderReference)}</cbc:ID>
    <cbc:DocumentType>${orderReference ? "OrderReference" : ""}</cbc:DocumentType>
    <cbc:DocumentDescription>${escapeXml(cleanValue(invoice.platform, ""))}</cbc:DocumentDescription>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>${escapeXml(shippingNumber)}</cbc:ID>
    <cbc:DocumentType>${shippingNumber ? "ShippingReference" : ""}</cbc:DocumentType>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>${escapeXml(cleanValue(invoice.shipping_method, ""))}</cbc:ID>
  </cac:AdditionalDocumentReference>`;
}

export async function SelfBilledInvoiceTemplate(invoiceData) {
  try {
    if (!invoiceData || !invoiceData.supplier || !Array.isArray(invoiceData.lines)) {
      throw {
        type: "validation",
        code: "SELF_BILLED_DATA",
        message: "Self-billed invoice data, supplier, and lines are required",
        invoiceNo: invoiceData?.self_billed_no || "Unknown",
      };
    }

    if (invoiceData.lines.length === 0) {
      throw {
        type: "validation",
        code: "SELF_BILLED_LINES",
        message: "Self-billed invoice must contain at least one line",
        invoiceNo: invoiceData.self_billed_no,
      };
    }

    const { issueDate, issueTime } = getCurrentIssueDateTime();
    const currencyCode = cleanValue(invoiceData.currency_code, "CNY");
    const totalForeign = Number(invoiceData.total_foreign_amount || 0);
    const fxRate = Number(invoiceData.fx_rate || 1);
    const taxAmount = invoiceData.lines.reduce((sum, line) => {
      const amountForeign = Number(line.amount_foreign || 0);
      return sum + getLineTaxAmount(line, amountForeign, fxRate);
    }, 0);
    const taxAmountMyr = invoiceData.lines.reduce((sum, line) => {
      const amountForeign = Number(line.amount_foreign || 0);
      const lineTaxAmount = getLineTaxAmount(line, amountForeign, fxRate);
      return sum + getLineTaxAmountMyr(line, lineTaxAmount, fxRate);
    }, 0);
    const totalIncludingTax = totalForeign + taxAmount;
    const firstTaxType = cleanValue(invoiceData.lines[0]?.tax_type, "06");

    let xml = TEMPLATE_HEADER;

    xml += `
  <cbc:ID>${escapeXml(invoiceData.self_billed_no)}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listVersionID="1.0">11</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${escapeXml(currencyCode)}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>MYR</cbc:TaxCurrencyCode>`;

    xml += `
  <cac:InvoicePeriod>
    <cbc:StartDate>${escapeXml(invoiceData.purchase_date)}</cbc:StartDate>
    <cbc:EndDate>${escapeXml(invoiceData.purchase_date)}</cbc:EndDate>
    <cbc:Description>${escapeXml(cleanValue(invoiceData.transaction_type, "Importation of goods"))}</cbc:Description>
  </cac:InvoicePeriod>`;

    xml += generateAdditionalReferences(invoiceData);
    xml += generateSupplierParty(invoiceData.supplier);
    xml += generateBuyerParty();
    xml += generateBuyerDelivery(invoiceData, currencyCode);
    xml += generatePaymentBlocks(invoiceData, currencyCode, issueDate, issueTime);

    xml += `
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason></cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="${escapeXml(currencyCode)}">0.00</cbc:Amount>
  </cac:AllowanceCharge>
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>true</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReason></cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="${escapeXml(currencyCode)}">0.00</cbc:Amount>
  </cac:AllowanceCharge>`;

    if (currencyCode !== "MYR") {
      xml += `
  <cac:TaxExchangeRate>
    <cbc:SourceCurrencyCode>${escapeXml(currencyCode)}</cbc:SourceCurrencyCode>
    <cbc:TargetCurrencyCode>MYR</cbc:TargetCurrencyCode>
    <cbc:CalculationRate>${formatAmount(fxRate, 8)}</cbc:CalculationRate>
  </cac:TaxExchangeRate>`;
    }

    xml += `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="MYR">${formatAmount(taxAmountMyr)}</cbc:TaxAmount>
    ${generateTaxSubtotal(totalForeign, taxAmountMyr, firstTaxType, currencyCode)}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${escapeXml(currencyCode)}">${formatAmount(totalForeign)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${escapeXml(currencyCode)}">${formatAmount(totalForeign)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${escapeXml(currencyCode)}">${formatAmount(totalIncludingTax)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${escapeXml(currencyCode)}">0.00</cbc:AllowanceTotalAmount>
    <cbc:ChargeTotalAmount currencyID="${escapeXml(currencyCode)}">0.00</cbc:ChargeTotalAmount>
    <cbc:PayableRoundingAmount currencyID="${escapeXml(currencyCode)}">0.00</cbc:PayableRoundingAmount>
    <cbc:PayableAmount currencyID="${escapeXml(currencyCode)}">${formatAmount(totalIncludingTax)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

    xml += generateInvoiceLines(invoiceData.lines, escapeXml(currencyCode), fxRate);
    xml += TEMPLATE_FOOTER;

    return xml;
  } catch (error) {
    if (error.type === "validation") {
      throw error;
    }

    throw {
      type: "validation",
      code: "SELF_BILLED_TEMPLATE",
      message: `Failed to transform self-billed invoice: ${error.message}`,
      invoiceNo: invoiceData?.self_billed_no || "Unknown",
    };
  }
}
