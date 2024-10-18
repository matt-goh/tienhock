export function generateDummyInvoice() {
  const invoiceNumber = `INV${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;
  const currentDate = new Date();
  const invoiceDate = currentDate.toISOString().split('T')[0];
  const invoiceTime = currentDate.toISOString().split('T')[1].split('.')[0] + 'Z';
  return {
    "_D": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
    "_A": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "_B": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "Invoice": [
      {
        "ID": [{ "_": invoiceNumber }],
        "IssueDate": [{ "_": invoiceDate }],
        "IssueTime": [{ "_": invoiceTime }],
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
                "IndustryClassificationCode": [{ "_": "46510", "name": "Wholesale of computer hardware, software and peripherals" }],
                "PartyIdentification": [
                  { "ID": [{ "_": "IG7139779050", "schemeID": "TIN" }] },
                  { "ID": [{ "_": "NA", "schemeID": "BRN" }] },
                  { "ID": [{ "_": "NA", "schemeID": "SST" }] },
                  { "ID": [{ "_": "NA", "schemeID": "TTX" }] }
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
                "PartyLegalEntity": [
                  {
                    "RegistrationName": [{ "_": "Supplier's Name" }],
                  }
                ],
                "Contact": [
                  {
                    "Telephone": [{ "_": "+60-123456789" }],
                    "ElectronicMail": [{ "_": "supplier@email.com" }]
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
                    "RegistrationName": [{ "_": "Buyer's Name" }],
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
                  { "RegistrationName": [{ "_": "Recipient's Name" }] }
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
            "PaymentMeansCode": [
              {
                "_": "03"
              }
            ],
            "PayeeFinancialAccount": [
              {
                "ID": [
                  {
                    "_": "1234567890123"
                  }
                ]
              }
            ]
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
            "ChargeIndicator": [
              {
                "_": false
              }
            ],
            "AllowanceChargeReason": [
              {
                "_": "Sample Description"
              }
            ],
            "Amount": [
              {
                "_": 100,
                "currencyID": "MYR"
              }
            ]
          },
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
        ],
        "TaxTotal": [
          {
            "TaxAmount": [{ "_": 87.63, "currencyID": "MYR" }],
            "TaxSubtotal": [
              {
                "TaxableAmount": [{ "_": 87.63, "currencyID": "MYR" }],
                "TaxAmount": [{ "_": 87.63, "currencyID": "MYR" }],
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
            "LineExtensionAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
            "TaxExclusiveAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
            "TaxInclusiveAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
            "AllowanceTotalAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
            "ChargeTotalAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
            "PayableRoundingAmount": [{ "_": 0.3, "currencyID": "MYR" }],
            "PayableAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
          }
        ],
        "InvoiceLine": [{
          "ID": [{ "_": "1234" }],
          "InvoicedQuantity": [{ "_": 1, "unitCode": "C62" }],
          "LineExtensionAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
          "AllowanceCharge": [{
            "ChargeIndicator": [{ "_": false }],
            "AllowanceChargeReason": [{ "_": "Sample Description" }],
            "MultiplierFactorNumeric": [{ "_": 0.15 }],
            "Amount": [{ "_": 100, "currencyID": "MYR" }]
          },
          {
            "ChargeIndicator": [{ "_": true }],
            "AllowanceChargeReason": [{ "_": "Sample Description" }],
            "MultiplierFactorNumeric": [{ "_": 0.1 }],
            "Amount": [{ "_": 100, "currencyID": "MYR" }]
          }
          ],
          "TaxTotal": [
            {
              "TaxAmount": [{ "_": 60.00, "currencyID": "MYR" }],
              "TaxSubtotal": [
                {
                  "TaxableAmount": [{ "_": 1000.00, "currencyID": "MYR" }],
                  "TaxAmount": [{ "_": 60.00, "currencyID": "MYR" }],
                  "BaseUnitMeasure": [{ "_": 1, "unitCode": "C62" }],
                  "PerUnitAmount": [{ "_": 10, "currencyID": "MYR" }],
                  "TaxCategory": [
                    {
                      "ID": [{ "_": "E" }],
                      "TaxExemptionReason": [{ "_": "Exempt New Means of Transport" }],
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
        "Price": [{ "PriceAmount": [{ "_": 17, "currencyID": "MYR" }] }],
        "ItemPriceExtension": [{ "Amount": [{ "_": 100, "currencyID": "MYR" }] }]
      }]
      }
    ]
  };
}