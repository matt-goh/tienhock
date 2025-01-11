// transformInvoiceData.ts

const formatAmount = (amount) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  return isNaN(num) ? 0.00 : Number(num.toFixed(2));
};

const formatDate = (dateStr) => {
  if (!dateStr) {
    console.warn('No date provided, using current date');
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  try {
    // Handle DD/MM/YYYY format (which is what our database returns)
    if (typeof dateStr === 'string' && dateStr.includes('/')) {
      const [day, month, year] = dateStr.split('/').map(part => part.trim());
      if (day && month && year) {
        // Validate the parts
        const numDay = parseInt(day, 10);
        const numMonth = parseInt(month, 10);
        const numYear = parseInt(year, 10);
        
        if (numDay >= 1 && numDay <= 31 && 
            numMonth >= 1 && numMonth <= 12 && 
            numYear >= 1900 && numYear <= 9999) {
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else {
          console.warn('Invalid date parts:', { day, month, year });
        }
      }
    }

    // Try parsing as ISO date
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    console.warn('Failed to parse date:', dateStr);
    const today = new Date();
    return today.toISOString().split('T')[0];
  } catch (error) {
    console.error('Error parsing date:', error, 'for date string:', dateStr);
    const today = new Date();
    return today.toISOString().split('T')[0];
  }
};

const formatTime = (timeStr) => {
  try {
    if (!timeStr) {
      const now = new Date();
      return now.toTimeString().split(' ')[0] + 'Z';
    }

    // If time already has 'Z' suffix and is in correct format, return as is
    if (timeStr.match(/^\d{2}:\d{2}:\d{2}Z$/)) {
      return timeStr;
    }

    // Handle ISO string format
    if (timeStr.includes('T')) {
      const time = timeStr.split('T')[1].split('.')[0];
      return time + 'Z';
    }

    // Handle plain time format (HH:mm:ss)
    if (timeStr.match(/^\d{2}:\d{2}:\d{2}$/)) {
      return timeStr + 'Z';
    }

    // If none of the above, generate current time
    const now = new Date();
    return now.toTimeString().split(' ')[0] + 'Z';
  } catch (error) {
    console.error('Error formatting time:', error, 'for time string:', timeStr);
    const now = new Date();
    return now.toTimeString().split(' ')[0] + 'Z';
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
    const [day, month, year] = dateStr.split('/').map(Number);
    const inputDate = new Date(year, month - 1, day);
    inputDate.setHours(0, 0, 0, 0);
    
    return inputDate >= earliestDate && inputDate <= today;
  } catch (error) {
    console.error('Error in isDateWithinRange:', error);
    return false;
  }
};

const validateInvoiceData = (invoiceData) => {
  const validationErrors = [];

  // First validate if date exists
  if (!invoiceData.date) {
    validationErrors.push('Invoice date is required');
  } else {
    // Split this into two separate try-catch blocks
    try {
      // First parse the date to ensure format is correct
      const [day, month, year] = invoiceData.date.split('/').map(Number);
      const inputDate = new Date(year, month - 1, day);
      
      if (isNaN(inputDate.getTime())) {
        throw new Error('Invalid date format');
      }
      
      // Then check the date range
      const isValid = isDateWithinRange(invoiceData.date);
      if (!isValid) {
        validationErrors.push(
          'Invoice date must be within the last 3 days. Please check the date and try again.'
        );
      }
    } catch (error) {
      validationErrors.push('Invalid date format. Date should be in DD/MM/YYYY format.');
    }
  }

  // Check if orderDetails exists and is an array
  if (!Array.isArray(invoiceData?.orderDetails)) {
    validationErrors.push('Invoice must contain at least one order detail');
  } else if (invoiceData.orderDetails.length === 0) {
    validationErrors.push('Invoice must contain at least one order detail');
  }

  // Validate required fields
  const requiredFields = {
    invoiceno: 'Invoice number',
    date: 'Invoice date',
    time: 'Invoice time',
    type: 'Invoice type'
  };

  Object.entries(requiredFields).forEach(([field, label]) => {
    if (!invoiceData[field]) {
      validationErrors.push(`${label} is required`);
    }
  });

  // If any validation errors were found, throw an error with all the details
  if (validationErrors.length > 0) {
    throw {
      type: 'validation',
      errors: validationErrors,
      invoiceNo: invoiceData.invoiceno || 'Unknown invoice number',
    };
  }

  // If validation passes, return sanitized data
  return {
    ...invoiceData,
    date: invoiceData.date,  // Don't modify the date if it's valid
    time: invoiceData.time || new Date().toISOString().split('T')[1].split('.')[0] + 'Z',
    invoiceno: invoiceData.invoiceno || 'UNKNOWN',
    tax: invoiceData.tax || '0',
    orderDetails: invoiceData.orderDetails.map(detail => ({
      ...detail,
      qty: Number(detail.qty || 0),
      price: Number(detail.price || 0),
      total: detail.total || '0',
      isfoc: Boolean(detail.isfoc),
      isreturned: Boolean(detail.isreturned),
      istotal: Boolean(detail.istotal),
      issubtotal: Boolean(detail.issubtotal),
      isless: Boolean(detail.isless),
      istax: Boolean(detail.istax)
    }))
  };
};

// Helper function to get payment details based on invoice type
const getPaymentDetails = (invoiceType) => {
  // Default to cash (01) if type is not provided
  const type = invoiceType?.toUpperCase();

  // Payment mapping
  switch (type) {
    case 'I': // Invoice
      return {
        code: "03", // Bank Transfer
        description: "Payment via bank transfer"
      };
    case 'C': // Cash
    default:
      return {
        code: "01", // Cash
        description: "Payment method is cash"
      };
  }
};

// Helper function to calculate line item tax
const calculateLineTax = (item, subtotal, totalTax) => {
  const itemTotal = typeof item.total === 'string' ? parseFloat(item.total) : Number(item.total);
  if (subtotal === 0) return 0;
  return formatAmount((itemTotal / subtotal) * totalTax);
};

const calculateTaxAndTotals = (invoiceData) => {
  // Filter normal items (not special rows)
  const normalItems = invoiceData.orderDetails.filter(detail => 
    !detail.istotal && !detail.issubtotal && !detail.isless && !detail.istax
  );
  
  // Calculate subtotal from normal items
  const subtotal = formatAmount(
    normalItems.reduce((sum, detail) => {
      const amount = typeof detail.total === 'string' ? parseFloat(detail.total) : Number(detail.total);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0)
  );

  // Calculate total tax from tax rows
  const totalTax = formatAmount(
    invoiceData.orderDetails
      .filter(detail => detail.istax)
      .reduce((sum, detail) => {
        const amount = typeof detail.total === 'string' ? parseFloat(detail.total) : Number(detail.total);
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0)
  );

  // Calculate tax for each line item
  const lineItemsWithTax = normalItems.map(item => ({
    ...item,
    lineTax: calculateLineTax(item, subtotal, totalTax)
  }));

  // Calculate final total
  const total = formatAmount(subtotal + totalTax);

  return {
    subtotal,
    tax: totalTax,
    total,
    lineItemsWithTax
  };
};

// Handle multiple invoice lines
const generateInvoiceLines = (orderDetails) => {
  // First use calculateTaxAndTotals to get all the calculations
  const {
    lineItemsWithTax
  } = calculateTaxAndTotals({ orderDetails });

  // Generate invoice lines with tax calculations
  return lineItemsWithTax.map(item => {
    const lineAmount = formatAmount(
      (typeof item.qty === 'string' ? parseFloat(item.qty) : Number(item.qty)) * 
      (typeof item.price === 'string' ? parseFloat(item.price) : Number(item.price))
    );

    return {
      "ID": [{ 
        "_": item.id.toString() 
      }],
      "InvoicedQuantity": [{ 
        "_": Number(item.qty), 
        "unitCode": "NMP" 
      }],
      "LineExtensionAmount": [{ 
        "_": lineAmount,
        "currencyID": "MYR" 
      }], // Sum of amount payable (inclusive of applicable discounts and charges), excluding any applicable taxes (e.g., sales tax, service tax).
      "AllowanceCharge": [
        {
          "ChargeIndicator": [{ "_": false }],
          "AllowanceChargeReason": [{ "_": "-" }],
          "MultiplierFactorNumeric": [{ "_": 0 }],
          "Amount": [{ "_": 0, "currencyID": "MYR" }]
        },
        {
          "ChargeIndicator": [{ "_": false }],
          "AllowanceChargeReason": [{ "_": "-" }],
          "MultiplierFactorNumeric": [{ "_": 0 }],
          "Amount": [{ "_": 0, "currencyID": "MYR" }]
        }
      ],
      "TaxTotal": [ // Tax for individual items (not needed)
        {
          "TaxAmount": [{ "_": 0, "currencyID": "MYR" }], // The amount of tax payable.
          "TaxSubtotal": [
            {
              "TaxableAmount": [{ "_": 0, "currencyID": "MYR" }], // The amount of tax payable.
              "TaxAmount": [{ "_": 0, "currencyID": "MYR" }], // The amount of tax payable
              "BaseUnitMeasure": [{ "_": Number(item.qty), "unitCode": "NMP" }],
              "PerUnitAmount": [{ "_": formatAmount(item.price), "currencyID": "MYR" }],
              "TaxCategory": [
                {
                  "ID": [{ "_": "E" }], // 01	Sales Tax 02	Service Tax 03	Tourism Tax 04	High-Value Goods Tax 05	Sales Tax on Low Value Goods 06	Not Applicable E Tax exemption (where applicable)
                  "TaxExemptionReason": [{ "_": "-" }],
                  "TaxScheme": [{ 
                    "ID": [{ "_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6" }]
                  }]
                }
              ]
            }
          ]
        }
      ],
      "Item": [
        {
          "CommodityClassification": [
            { "ItemClassificationCode": [{ "_": "", "listID": "PTC" }] },
            { "ItemClassificationCode": [{ "_": "022", "listID": "CLASS" }] } // O22 = Others
          ],
          "Description": [{ "_": item.productname }],
          "OriginCountry": [{ "IdentificationCode": [{ "_": "MYS" }] }]
        }
      ],
      "Price": [{ 
        "PriceAmount": [{ 
          "_": formatAmount(item.price), 
          "currencyID": "MYR" 
        }] 
      }],
      "ItemPriceExtension": [{ 
        "Amount": [{ 
          "_": formatAmount(lineAmount), 
          "currencyID": "MYR" 
        }] 
      }] // Amount of each individual item / service within the invoice, excluding any taxes, charges or discounts
    };
  });
};

export function transformInvoiceToMyInvoisFormat(rawInvoiceData) {
  try {
    if (!rawInvoiceData) {
      throw {
        type: 'validation',
        message: 'No invoice data provided',
        invoiceNo: 'Unknown'
      };
    }
    // Validate and sanitize input data
    const invoiceData = validateInvoiceData(rawInvoiceData);
    
    // Format the date using our robust date formatter
    const invoiceDate = formatDate(invoiceData.date);
    const formattedTime = formatTime(invoiceData.time);

    // Payment means function
    const paymentDetails = getPaymentDetails(invoiceData.type);

    // Total amounts calculation
    const totals = calculateTaxAndTotals(invoiceData);

    // Allowing multi-lines invoice
    const invoiceLines = generateInvoiceLines(invoiceData.orderDetails);

    return {
      "_D": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
      "_A": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      "_B": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
      "Invoice": [
        {
          "ID": [{ "_": invoiceData.invoiceno }],
          "IssueDate": [{ "_": invoiceDate }],
          "IssueTime": [{ "_": formattedTime }],
          "InvoiceTypeCode": [{ "_": "01", "listVersionID": "1.0" }],
          "DocumentCurrencyCode": [{ "_": "MYR" }],
          "TaxCurrencyCode": [{ "_": "MYR" }],
          "InvoicePeriod": [
            {
              "StartDate": [{ "_": invoiceDate }],
              "EndDate": [{ "_": invoiceDate }],
              "Description": [{ "_": "Not Applicable" }]
            }
          ],
          "BillingReference": [
            {
              "AdditionalDocumentReference": [
                {
                  "ID": [{ "_": "-" }]
                }
              ]
            }
          ],
          "AdditionalDocumentReference": [
            {
              "ID": [{ "_": "" }],
              "DocumentType": [{ "_": "" }]
            },
            {
              "ID": [{ "_": "" }],
              "DocumentType": [{ "_": "" }],
              "DocumentDescription": [{ "_": "" }]
            },
            {
              "ID": [{ "_": "" }],
              "DocumentType": [{ "_": "" }]
            },
            {
              "ID": [{ "_": "" }]
            }
          ],
          "AccountingSupplierParty": [
            {
              "AdditionalAccountID": [{ "_": "", "schemeAgencyName": "CertEX" }],
              "Party": [
                {
                  "IndustryClassificationCode": [{ "_": "10741", "name": "Manufacture of meehoon, noodles and other related products" }],
                  "PartyIdentification": [
                    { "ID": [{ "_": "C21636482050", "schemeID": "TIN" }] },
                    { "ID": [{ "_": "201101025173", "schemeID": "BRN" }] },
                    { "ID": [{ "_": "-", "schemeID": "SST" }] },
                    { "ID": [{ "_": "-", "schemeID": "TTX" }] }
                  ],
                  "PostalAddress": [
                    {
                      "CityName": [{ "_": "KOTA KINABALU" }],
                      "PostalZone": [{ "_": "88811" }],
                      "CountrySubentityCode": [{ "_": "12" }],
                      "AddressLine": [
                        { "Line": [{ "_": "CL.215145645, KG KIBABAIG, PENAMPANG" }] },
                        { "Line": [{ "_": "" }] },
                        { "Line": [{ "_": "" }] }
                      ],
                      "Country": [
                        {
                          "IdentificationCode": [{ "_": "MYS", "listID": "ISO3166-1", "listAgencyID": "6" }]
                        }
                      ]
                    }
                  ],
                  "PartyLegalEntity": [
                    {
                      "RegistrationName": [{ "_": "TIEN HOCK FOOD INDUSTRIES S/B" }],
                    }
                  ],
                  "Contact": [
                    {
                      "Telephone": [{ "_": "+60-168329291" }],
                      "ElectronicMail": [{ "_": "tienhockfood@gmail.com" }]
                    }
                  ]
                }
              ]
            }
          ],
          "AccountingCustomerParty": [ // needs rework
            {
              "Party": [
                {
                  "PostalAddress": [
                    {
                      "CityName": [{ "_": "Kota Kinabalu" }],
                      "PostalZone": [{ "_": "50480" }],
                      "CountrySubentityCode": [{ "_": "12" }],
                      "AddressLine": [
                        { "Line": [{ "_": "Lot 66" }] },
                        { "Line": [{ "_": "Bangunan Merdeka" }] },
                        { "Line": [{ "_": "Persiaran Jaya" }] }
                      ],
                      "Country": [
                        {
                          "IdentificationCode": [{ "_": "MYS", "listID": "ISO3166-1", "listAgencyID": "6" }]
                        }
                      ]
                    }
                  ],
                  "PartyLegalEntity": [
                    {
                      "RegistrationName": [{ "_": "Timothy Goh Vun Bing" }], // Recipient name
                    }
                  ],
                  "PartyIdentification": [
                    { "ID": [{ "_": "IG28358919010", "schemeID": "TIN" }] }, // Recipient TIN
                    { "ID": [{ "_": "981223125953", "schemeID": "NRIC" }] }, //ubl:Invoice / cac:AccountingSupplierParty / cac:Party / cac:PartyIdentification / cbc:ID [@schemeID=’NRIC’] OR / ubl:Invoice / cac:AccountingSupplierParty / cac:Party / cac:PartyIdentification / cbc:ID [@schemeID=’BRN’]
                    { "ID": [{ "_": "-", "schemeID": "SST" }] },
                    { "ID": [{ "_": "-", "schemeID": "TTX" }] }
                  ],
                  "Contact": [
                    {
                      "Telephone": [{ "_": "+60-172464931" }],
                      "ElectronicMail": [{ "_": "gvbtim98@gmail.com" }]
                    }
                  ]
                }
              ]
            }
          ],
          "Delivery": [ // needs rework
            {
              "DeliveryParty": [
                {
                  "PartyLegalEntity": [
                    { "RegistrationName": [{ "_": "Timothy Goh Vun Bing" }] } // Recipient name
                  ],
                  "PostalAddress": [
                    {
                      "CityName": [{ "_": "" }],
                      "PostalZone": [{ "_": "" }],
                      "CountrySubentityCode": [{ "_": "17" }],
                      "AddressLine": [
                        { "Line": [{ "_": "" }] },
                        { "Line": [{ "_": "" }] },
                        { "Line": [{ "_": "" }] }
                      ],
                      "Country": [
                        {
                          "IdentificationCode": [{ "_": "MYS", "listID": "ISO3166-1", "listAgencyID": "6" }]
                        }
                      ]
                    }
                  ],
                  "PartyIdentification": [
                    {
                      "ID": [
                        {
                          "_": "IG28358919010", // Recipient TIN
                          "schemeID": "TIN"
                        }
                      ]
                    },
                    {
                      "ID": [
                        {
                          "_": "-",
                          "schemeID": "BRN"
                        }
                      ]
                    }
                  ]
                }
              ],
              "Shipment": [
                {
                  "ID": [
                    {
                      "_": ""
                    }
                  ],
                  "FreightAllowanceCharge": [
                    {
                      "ChargeIndicator": [
                        {
                          "_": false
                        }
                      ],
                      "AllowanceChargeReason": [
                        {
                          "_": ""
                        }
                      ],
                      "Amount": [
                        {
                          "_": 0,
                          "currencyID": "MYR"
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ],
          "PaymentMeans": [
            {
              "PaymentMeansCode": [{ "_": paymentDetails.code }], // 01 Cash 02 Cheque 03 Bank Transfer 04 Credit Card 05 Debit Card 06 e-Wallet / Digital Wallet 07	Digital Bank 08	Others
              "PayeeFinancialAccount": [{ "ID": [{ "_": "-"  }] }]
            }
          ],
          "PaymentTerms": [
            {
              "Note": [
                {
                  "_": paymentDetails.description // In our case, cash = 01, invoice = 03 (bank transfer)
                }
              ]
            }
          ],
          "PrepaidPayment": [
            {
              "ID": [
                {
                  "_": "-"
                }
              ],
              "PaidAmount": [
                {
                  "_": 0,
                  "currencyID": "MYR"
                }
              ],
              "PaidDate": [
                {
                  "_": invoiceDate
                }
              ],
              "PaidTime": [
                {
                  "_": formattedTime
                }
              ]
            }
          ],
          "AllowanceCharge": [
            {
              "ChargeIndicator": [{ "_": false }],
              "AllowanceChargeReason": [{ "_": "" }],
              "Amount": [{ "_": 0, "currencyID": "MYR" }]
            },
            {
              "ChargeIndicator": [{ "_": false }],
              "AllowanceChargeReason": [{ "_": "" }],
              "Amount": [{ "_": 0, "currencyID": "MYR" }]
            }
          ],
          "TaxTotal": [
            {
              "TaxAmount": [{ "_": totals.tax, "currencyID": "MYR" }], // Total amount of tax payable
              "TaxSubtotal": [
                {
                  "TaxableAmount": [{ "_": totals.tax, "currencyID": "MYR" }], // (Optional) Sum of amount chargeable for each tax type
                  "TaxAmount": [{ "_": totals.tax, "currencyID": "MYR" }], // Total amount of tax payable for each tax type
                  "TaxCategory": [
                    {
                      "ID": [{ "_": totals.tax > 0 ? "01" : "E" }], // 01	Sales Tax 02	Service Tax 03	Tourism Tax 04	High-Value Goods Tax 05	Sales Tax on Low Value Goods 06	Not Applicable E	Tax exemption (where applicable)
                      "TaxScheme": [{ "ID": [{ "_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6" }] }]
                    }
                  ]
                }
              ]
            }
          ],
          "LegalMonetaryTotal": [{
            "LineExtensionAmount": [{ "_": totals.subtotal, "currencyID": "MYR" }], // (Optional) Sum of total amount payable (inclusive of applicable line item and invoice level discounts and charges), excluding any applicable taxes (e.g., sales tax, service tax).
            "TaxExclusiveAmount": [{ "_": totals.subtotal, "currencyID": "MYR" }], // Sum of amount payable (inclusive of applicable discounts and charges), excluding any applicable taxes (e.g., sales tax, service tax).
            "TaxInclusiveAmount": [{ "_": totals.total, "currencyID": "MYR" }], // Sum of amount payable inclusive of total taxes chargeable (e.g., sales tax, service tax).
            "AllowanceTotalAmount": [{ "_": totals.total, "currencyID": "MYR" }], // (Optional) Total amount deducted from the original price of the product(s) or service(s).
            "ChargeTotalAmount": [{ "_": totals.subtotal, "currencyID": "MYR" }], // (Optional) Total charge associated with the product(s) or service(s) imposed before tax.
            "PayableRoundingAmount": [{ "_": 0, "currencyID": "MYR" }], // (Optional) Rounding amount added to the amount payable.
            "PayableAmount": [{ "_": totals.total, "currencyID": "MYR" }] // Sum of amount payable (inclusive of total taxes chargeable and any rounding adjustment) excluding any amount paid in advance.
          }],
          "InvoiceLine": invoiceLines
        }
      ]
    };
} catch (error) {
  // If it's a validation error, pass it through
  if (error.type === 'validation') {
    throw error;
  }
  // For any other errors, wrap them
  throw {
    type: 'validation',
    message: `Failed to transform invoice: ${error.message}`,
    invoiceNo: rawInvoiceData?.invoiceno || 'Unknown'
  };
}
}