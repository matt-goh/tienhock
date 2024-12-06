// transformInvoiceData.ts

const formatAmount = (amount) => {
  // Convert strings to numbers and handle invalid inputs
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  
  // Check if it's a valid number
  if (isNaN(num)) {
    return 0.00; // Return 0 for invalid numbers
  }
  
  return Number(num.toFixed(2));
};

const calculateLineItemTax = (price, qty) => {
  // Convert inputs to numbers
  const numPrice = typeof price === 'string' ? parseFloat(price) : Number(price);
  const numQty = typeof qty === 'string' ? parseFloat(qty) : Number(qty);
  
  // Check if either value is invalid
  if (isNaN(numPrice) || isNaN(numQty)) {
    return 0.00;
  }
  
  return formatAmount(numPrice * numQty * 0.06);
};

const calculateTaxAndTotals = (invoiceData) => {
  const normalItems = invoiceData.orderDetails
    .filter(detail => !detail.isTotal && !detail.isSubtotal && !detail.isLess && !detail.isTax);
    
  const subtotal = formatAmount(
    normalItems.reduce((sum, detail) => {
      const amount = typeof detail.total === 'string' ? parseFloat(detail.total) : Number(detail.total);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0)
  );

  const standardCharge = formatAmount(
    normalItems.reduce((sum, detail) => {
      const price = typeof detail.price === 'string' ? parseFloat(detail.price) : Number(detail.price);
      const qty = typeof detail.qty === 'string' ? parseFloat(detail.qty) : Number(detail.qty);
      return sum + ((!isNaN(price) && !isNaN(qty)) ? price * qty * 0.1 : 0);
    }, 0)
  );

  const focAmount = formatAmount(
    normalItems
      .filter(detail => detail.isFoc)
      .reduce((sum, detail) => {
        const price = typeof detail.price === 'string' ? parseFloat(detail.price) : Number(detail.price);
        const qty = typeof detail.qty === 'string' ? parseFloat(detail.qty) : Number(detail.qty);
        return sum + ((!isNaN(price) && !isNaN(qty)) ? price * qty : 0);
      }, 0)
  );

  const itemLevelTax = formatAmount(
    normalItems.reduce((sum, detail) => sum + calculateLineItemTax(detail.price, detail.qty), 0)
  );

  // Handle optional values
  const tax = formatAmount(invoiceData.tax || 0);
  const discount = formatAmount(invoiceData.discount || 0);
  const rounding = formatAmount(invoiceData.rounding || 0);

  return {
    subtotal,
    tax,
    standardCharge,
    focAmount,
    itemLevelTax,
    discount,
    rounding,
    total: formatAmount(subtotal + tax - discount + rounding + standardCharge)
  };
};

export function transformInvoiceToMyInvoisFormat(invoiceData) {
  const [day, month, year] = invoiceData.date.split('/');
  const invoiceDate = `${year}-${month}-${day}`;
  const currentTime = new Date().toISOString().split('T')[1].split('.')[0] + 'Z';

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
  }
};