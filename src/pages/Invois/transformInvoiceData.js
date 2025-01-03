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

  // Calculate FOC items total
  const focAmount = formatAmount(
    normalItems
      .filter(detail => detail.isfoc)
      .reduce((sum, detail) => {
        const price = typeof detail.price === 'string' ? parseFloat(detail.price) : Number(detail.price);
        const qty = typeof detail.qty === 'string' ? parseFloat(detail.qty) : Number(detail.qty);
        return sum + ((!isNaN(price) && !isNaN(qty)) ? price * qty : 0);
      }, 0)
  );

  // Standard service charge (10%)
  const standardCharge = formatAmount(subtotal * 0.10);

  // Calculate item level tax (6%)
  const itemLevelTax = formatAmount(subtotal * 0.06);

  // Handle optional values with default 0
  const tax = formatAmount(invoiceData.tax || 0);
  const discount = formatAmount(invoiceData.discount || 0);
  const rounding = formatAmount(invoiceData.rounding || 0);

  // Calculate final total
  const total = formatAmount(subtotal + tax - discount + rounding + standardCharge);

  const result = {
    subtotal,
    tax,
    standardCharge,
    focAmount,
    itemLevelTax,
    discount,
    rounding,
    total
  };

  return result;
};

const validateInvoiceData = (invoiceData) => {

  if (!invoiceData) {
    throw new Error('Invoice data is required');
  }

  // Check if orderDetails exists and is an array
  if (!Array.isArray(invoiceData?.orderDetails)) {
    console.error('Invalid orderDetails:', invoiceData?.orderDetails);
    throw new Error('Invoice must contain order details array');
  }

  // Ensure required fields have default values if missing
  const validatedData = {
    ...invoiceData,
    date: invoiceData.date || new Date().toISOString().split('T')[0],
    time: invoiceData.time || new Date().toISOString().split('T')[1].split('.')[0] + 'Z',
    invoiceno: invoiceData.invoiceno || 'UNKNOWN',
    tax: invoiceData.tax || '0',
    discount: invoiceData.discount || '0',
    rounding: invoiceData.rounding || '0',
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
  return validatedData;
};

export function transformInvoiceToMyInvoisFormat(rawInvoiceData) {
  try {
    if (!rawInvoiceData) {
      throw new Error('No invoice data provided');
    }

    // Validate and sanitize input data
    const invoiceData = validateInvoiceData(rawInvoiceData);
    
    // Format the date using our robust date formatter
    const invoiceDate = formatDate(invoiceData.date);

    const currentTime = invoiceData.time || new Date().toISOString().split('T')[1].split('.')[0] + 'Z';
    const totals = calculateTaxAndTotals(invoiceData);

  return {
    "_D": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "_A": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "_B": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "Invoice": [
      {
        "ID": [{ "_": "invoiceData.invoiceno" }],
        "IssueDate": [{ "_": invoiceDate }],
        "IssueTime": [{ "_": invoiceData.time || currentTime }],
        "InvoiceTypeCode": [{ "_": "01", "listVersionID": "1.0" }],
        "DocumentCurrencyCode": [{ "_": "MYR" }],
        "TaxCurrencyCode": [{ "_": "MYR" }],
        "InvoicePeriod": [
          {
            "StartDate": [{ "_": invoiceDate }],
            "EndDate": [{ "_": invoiceDate }],
            "Description": [{ "_": "Monthly" }]
          }
        ],
        "BillingReference": [
          {
            "AdditionalDocumentReference": [
              {
                "ID": [{ "_": "E12345678912" }]
              }
            ]
          }
        ],
        "AdditionalDocumentReference": [
          {
            "ID": [{ "_": "E12345678912" }],
            "DocumentType": [{ "_": "CustomsImportForm" }]
          },
          {
            "ID": [{ "_": "sa313321312" }],
            "DocumentType": [{ "_": "213312dddddd" }],
            "DocumentDescription": [{ "_": "NA" }]
          },
          {
            "ID": [{ "_": "E12345678912" }],
            "DocumentType": [{ "_": "K2" }]
          },
          {
            "ID": [{ "_": "CIF" }]
          }
        ],
        "AccountingSupplierParty": [
          {
            "AdditionalAccountID": [{ "_": "CPT-CCN-W-211111-KL-000002", "schemeAgencyName": "CertEX" }],
            "Party": [
              {
                "IndustryClassificationCode": [{ "_": "10741", "name": "	Manufacture of meehoon, noodles and other related products" }],
                "PartyIdentification": [
                  { "ID": [{ "_": "C21636482050", "schemeID": "TIN" }] },
                  { "ID": [{ "_": "NA", "schemeID": "BRN" }] },
                  { "ID": [{ "_": "NA", "schemeID": "SST" }] },
                  { "ID": [{ "_": "NA", "schemeID": "TTX" }] }
                ],
                "PostalAddress": [
                  {
                    "CityName": [{ "_": "Kota Kinabalu" }],
                    "PostalZone": [{ "_": "88811" }],
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
                    "RegistrationName": [{ "_": "Tien Hock Food Industries S/B" }],
                  }
                ],
                "Contact": [
                  {
                    "Telephone": [{ "_": "+60-88719715" }],
                    "ElectronicMail": [{ "_": "tienhockfood@gmail.com" }]
                  }
                ]
              }
            ]
          }
        ],
        "AccountingCustomerParty": [
          {
            "Party": [
              {
                "PostalAddress": [
                  {
                    "CityName": [{ "_": "Kuala Lumpur" }],
                    "PostalZone": [{ "_": "50480" }],
                    "CountrySubentityCode": [{ "_": "10" }],
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
                    "RegistrationName": [{ "_": "General Public" }],
                  }
                ],
                "PartyIdentification": [
                  { "ID": [{ "_": "EI00000000010", "schemeID": "TIN" }] },
                  { "ID": [{ "_": "NA", "schemeID": "BRN" }] },
                  { "ID": [{ "_": "NA", "schemeID": "SST" }] },
                  { "ID": [{ "_": "NA", "schemeID": "TTX" }] }
                ],
                "Contact": [
                  {
                    "Telephone": [{ "_": "+60-123456789" }],
                    "ElectronicMail": [{ "_": "buyer@email.com" }]
                  }
                ]
              }
            ]
          }
        ],
        "Delivery": [
          {
            "DeliveryParty": [
              {
                "PartyLegalEntity": [
                  { "RegistrationName": [{ "_": "General Public" }] }
                ],
                "PostalAddress": [
                  {
                    "CityName": [{ "_": "Kuala Lumpur" }],
                    "PostalZone": [{ "_": "50480" }],
                    "CountrySubentityCode": [{ "_": "10" }],
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
                "PartyIdentification": [
                  {
                    "ID": [
                      {
                        "_": "EI00000000010",
                        "schemeID": "TIN"
                      }
                    ]
                  },
                  {
                    "ID": [
                      {
                        "_": "NA",
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
                    "_": "1234"
                  }
                ],
                "FreightAllowanceCharge": [
                  {
                    "ChargeIndicator": [
                      {
                        "_": true
                      }
                    ],
                    "AllowanceChargeReason": [
                      {
                        "_": "Service charge"
                      }
                    ],
                    "Amount": [
                      {
                        "_": 100,
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
            "PaymentMeansCode": [{ "_": "03" }],
            "PayeeFinancialAccount": [{ "ID": [{ "_": "1234567890123"  }] }]
          }
        ],
        "PaymentTerms": [
          {
            "Note": [
              {
                "_": "Payment method is cash"
              }
            ]
          }
        ],
        "PrepaidPayment": [
          {
            "ID": [
              {
                "_": "E12345678912"
              }
            ],
            "PaidAmount": [
              {
                "_": 1,
                "currencyID": "MYR"
              }
            ],
            "PaidDate": [
              {
                "_": "2024-07-23"
              }
            ],
            "PaidTime": [
              {
                "_": "00:30:00Z"
              }
            ]
          }
        ],
        "AllowanceCharge": [
          {
            "ChargeIndicator": [{ "_": false }],
            "AllowanceChargeReason": [{ "_": "Sample Description" }],
            "Amount": [{ "_": formatAmount(totals.subtotal * 0.15), "currencyID": "MYR" }]
          },
          {
            "ChargeIndicator": [{ "_": true }],
            "AllowanceChargeReason": [{ "_": "Service charge" }],
            "Amount": [{ "_": formatAmount(totals.standardCharge), "currencyID": "MYR" }]
          }
        ],
        "TaxTotal": [
          {
            "TaxAmount": [{ "_": totals.itemLevelTax, "currencyID": "MYR" }],
            "TaxSubtotal": [
              {
                "TaxableAmount": [{ "_": totals.subtotal, "currencyID": "MYR" }],
                "TaxAmount": [{ "_": totals.itemLevelTax, "currencyID": "MYR" }],
                "TaxCategory": [
                  {
                    "ID": [{ "_": "01" }],
                    "TaxScheme": [{ "ID": [{ "_": "OTH", "schemeID": "UN/ECE 5153", "schemeAgencyID": "6" }] }]
                  }
                ]
              }
            ]
          }
        ],
        "LegalMonetaryTotal": [
          {
            "LineExtensionAmount": [{ "_": formatAmount(totals.subtotal), "currencyID": "MYR" }],
            "TaxExclusiveAmount": [{ "_": formatAmount(totals.subtotal), "currencyID": "MYR" }],
            "TaxInclusiveAmount": [{ "_": formatAmount(totals.subtotal + totals.itemLevelTax), "currencyID": "MYR" }],
            "AllowanceTotalAmount": [{ "_": formatAmount(totals.focAmount + totals.discount), "currencyID": "MYR" }],
            "ChargeTotalAmount": [{ "_": formatAmount(totals.standardCharge), "currencyID": "MYR" }],
            "PayableRoundingAmount": [{ "_": formatAmount(totals.rounding), "currencyID": "MYR" }],
            "PayableAmount": [{ "_": formatAmount(totals.total), "currencyID": "MYR" }]
          }
        ],
        "InvoiceLine": [{
          "ID": [{ "_": "1234" }],
          "InvoicedQuantity": [{ "_": 1, "unitCode": "C62" }],
          "LineExtensionAmount": [{ "_": formatAmount(totals.subtotal), "currencyID": "MYR" }],
          "AllowanceCharge": [
            {
              "ChargeIndicator": [{ "_": false }],
              "AllowanceChargeReason": [{ "_": "Sample Description" }],
              "MultiplierFactorNumeric": [{ "_": 0.15 }],
              "Amount": [{ "_": formatAmount(totals.subtotal * 0.15), "currencyID": "MYR" }]
            },
            {
              "ChargeIndicator": [{ "_": true }],
              "AllowanceChargeReason": [{ "_": "Service charge" }],
              "MultiplierFactorNumeric": [{ "_": 0.1 }],
              "Amount": [{ "_": formatAmount(totals.subtotal * 0.1), "currencyID": "MYR" }]
            }
          ],
          "TaxTotal": [
            {
              "TaxAmount": [{ "_": totals.itemLevelTax, "currencyID": "MYR" }],
              "TaxSubtotal": [
                {
                  "TaxableAmount": [{ "_": totals.subtotal, "currencyID": "MYR" }],
                  "TaxAmount": [{ "_": totals.itemLevelTax, "currencyID": "MYR" }],
                  "BaseUnitMeasure": [{ "_": 1, "unitCode": "C62" }],
                  "PerUnitAmount": [{ "_": formatAmount(totals.subtotal), "currencyID": "MYR" }],
                  "TaxCategory": [
                    {
                      "ID": [{ "_": "E" }],
                      "TaxExemptionReason": [{ "_": "NA" }],
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
                { "ItemClassificationCode": [{ "_": "9800.00.0010", "listID": "PTC" }] },
                { "ItemClassificationCode": [{ "_": "004", "listID": "CLASS" }] }
              ],
              "Description": [{ "_": "Consolidate Items" }],
              "OriginCountry": [{ "IdentificationCode": [{ "_": "MYS" }] }]
            }
          ],
          "Price": [{ "PriceAmount": [{ "_": formatAmount(totals.subtotal), "currencyID": "MYR" }] }],
          "ItemPriceExtension": [{ "Amount": [{ "_": formatAmount(totals.subtotal), "currencyID": "MYR" }] }]
        }]
      }
    ]
  };
} catch (error) {
  console.error('Error transforming invoice data:', error);
  throw new Error(`Failed to transform invoice: ${error.message}`);
}
}