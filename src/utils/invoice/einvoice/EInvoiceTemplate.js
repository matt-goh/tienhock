// EInvoiceTemplate.js

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

const calculateTaxAndTotals = (invoiceData) => {
  // Get the provided values directly
  const subtotal = formatAmount(invoiceData.amount || 0);

  // Group tax items by tax category (taxed, exempt, etc.)
  const taxGroups = {
    ["01"]: { amount: 0, taxable: 0 }, // Sales Tax
    ["02"]: { amount: 0, taxable: 0 }, // Service Tax
    ["06"]: { amount: 0, taxable: 0 }, // Not Applicable
    ["E"]: { amount: 0, taxable: 0 }, // Tax exemption
  };

  // Calculate tax by category
  invoiceData.orderDetails.forEach((detail) => {
    const taxAmount = parseFloat(detail.tax) || 0;
    const lineAmount = (detail.qty || 0) * (Number(detail.price) || 0);

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

  // Calculate total tax
  const totalTax = formatAmount(
    Object.values(taxGroups).reduce((sum, group) => sum + group.amount, 0)
  );

  // Use the totalamountpayable as the total
  const total = formatAmount(invoiceData.totalamountpayable || 0);

  return {
    subtotal,
    tax: totalTax,
    total,
    taxSubtotals,
  };
};

// Handle multiple invoice lines
const generateInvoiceLines = (orderDetails) => {
  // First filter out any subtotal rows, we only want regular items
  const regularItems = orderDetails.filter((item) => !item.issubtotal);

  // Generate invoice lines with item's own tax values
  return regularItems.map((item) => {
    const lineAmount = formatAmount(
      (item.qty || 0) * (Number(item.price) || 0)
    );

    // Get the tax directly from the item's own tax field
    const productTax = formatAmount(Number(item.tax) || 0);

    // Determine tax category based on tax amount
    const taxCategory = productTax > 0 ? "01" : "06"; // 01 for Sales Tax, 06 for Not Applicable

    return {
      ID: [
        {
          _: item.id ? item.id.toString() : `00${index + 1}`.slice(-3),
        },
      ],
      InvoicedQuantity: [
        {
          _: Number(item.qty),
          unitCode: "NMP",
        },
      ],
      LineExtensionAmount: [
        {
          _: lineAmount,
          currencyID: "MYR",
        },
      ],
      AllowanceCharge: [
        {
          ChargeIndicator: [{ _: false }],
          AllowanceChargeReason: [{ _: "-" }],
          MultiplierFactorNumeric: [{ _: 0 }],
          Amount: [{ _: 0, currencyID: "MYR" }],
        },
        {
          ChargeIndicator: [{ _: false }],
          AllowanceChargeReason: [{ _: "-" }],
          MultiplierFactorNumeric: [{ _: 0 }],
          Amount: [{ _: 0, currencyID: "MYR" }],
        },
      ],
      TaxTotal: [
        {
          TaxAmount: [{ _: productTax, currencyID: "MYR" }],
          TaxSubtotal: [
            {
              TaxableAmount: [{ _: lineAmount, currencyID: "MYR" }],
              TaxAmount: [{ _: productTax, currencyID: "MYR" }],
              BaseUnitMeasure: [{ _: Number(item.qty), unitCode: "NMP" }],
              PerUnitAmount: [
                {
                  _:
                    Number(item.qty) > 0
                      ? formatAmount(productTax / Number(item.qty))
                      : 0,
                  currencyID: "MYR",
                },
              ],
              TaxCategory: [
                {
                  ID: [{ _: taxCategory }], // 01	Sales Tax 02	Service Tax 03	Tourism Tax 04	High-Value Goods Tax 05	Sales Tax on Low Value Goods 06	Not Applicable E Tax exemption (where applicable)
                  TaxScheme: [
                    {
                      ID: [
                        {
                          _: "OTH",
                          schemeID: "UN/ECE 5153",
                          schemeAgencyID: "6",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      Item: [
        {
          CommodityClassification: [
            { ItemClassificationCode: [{ _: "", listID: "PTC" }] },
            { ItemClassificationCode: [{ _: "022", listID: "CLASS" }] }, // O22 = Others
          ],
          Description: [{ _: item.productname }],
          OriginCountry: [{ IdentificationCode: [{ _: "MYS" }] }],
        },
      ],
      Price: [
        {
          PriceAmount: [
            {
              _: formatAmount(item.price),
              currencyID: "MYR",
            },
          ],
        },
      ],
      ItemPriceExtension: [
        {
          Amount: [
            {
              _: formatAmount(lineAmount),
              currencyID: "MYR",
            },
          ],
        },
      ],
    };
  });
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
    });

    // Generate invoice lines
    const invoiceLines = generateInvoiceLines(sanitizedOrderDetails);

    return {
      _D: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
      _A: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      _B: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
      Invoice: [
        {
          ID: [{ _: rawInvoiceData.id }],
          IssueDate: [{ _: formattedDate }],
          IssueTime: [{ _: formattedTime }],
          InvoiceTypeCode: [{ _: "01", listVersionID: "1.0" }],
          DocumentCurrencyCode: [{ _: "MYR" }],
          TaxCurrencyCode: [{ _: "MYR" }],
          InvoicePeriod: [
            {
              StartDate: [{ _: formattedDate }],
              EndDate: [{ _: formattedDate }],
              Description: [{ _: "Not Applicable" }],
            },
          ],
          BillingReference: [
            {
              AdditionalDocumentReference: [
                {
                  ID: [{ _: "-" }],
                },
              ],
            },
          ],
          AdditionalDocumentReference: [
            {
              ID: [{ _: "" }],
              DocumentType: [{ _: "" }],
            },
            {
              ID: [{ _: "" }],
              DocumentType: [{ _: "" }],
              DocumentDescription: [{ _: "" }],
            },
            {
              ID: [{ _: "" }],
              DocumentType: [{ _: "" }],
            },
            {
              ID: [{ _: "" }],
            },
          ],
          AccountingSupplierParty: [
            {
              AdditionalAccountID: [{ _: "", schemeAgencyName: "CertEX" }],
              Party: [
                {
                  IndustryClassificationCode: [
                    {
                      _: "10741",
                      name: "Manufacture of meehoon, noodles and other related products",
                    },
                  ],
                  PartyIdentification: [
                    { ID: [{ _: "C21636482050", schemeID: "TIN" }] },
                    { ID: [{ _: "201101025173", schemeID: "BRN" }] },
                    { ID: [{ _: "-", schemeID: "SST" }] },
                    { ID: [{ _: "-", schemeID: "TTX" }] },
                  ],
                  PostalAddress: [
                    {
                      CityName: [{ _: "KOTA KINABALU" }],
                      PostalZone: [{ _: "88811" }],
                      CountrySubentityCode: [{ _: "12" }],
                      AddressLine: [
                        {
                          Line: [{ _: "CL.215145645, KG KIBABAIG, PENAMPANG" }],
                        },
                        { Line: [{ _: "" }] },
                        { Line: [{ _: "" }] },
                      ],
                      Country: [
                        {
                          IdentificationCode: [
                            {
                              _: "MYS",
                              listID: "ISO3166-1",
                              listAgencyID: "6",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                  PartyLegalEntity: [
                    {
                      RegistrationName: [
                        { _: "TIEN HOCK FOOD INDUSTRIES S/B" },
                      ],
                    },
                  ],
                  Contact: [
                    {
                      Telephone: [{ _: "0168329291" }],
                      ElectronicMail: [{ _: "tienhockfood@gmail.com" }],
                    },
                  ],
                },
              ],
            },
          ],
          AccountingCustomerParty: [
            {
              Party: [
                {
                  PostalAddress: [
                    {
                      CityName: [{ _: customerData.city || "" }],
                      PostalZone: [{ _: "" }],
                      CountrySubentityCode: [{ _: customerData.state || "" }],
                      AddressLine: [
                        { Line: [{ _: customerData.address || "" }] },
                        { Line: [{ _: "" }] },
                        { Line: [{ _: "" }] },
                      ],
                      Country: [
                        {
                          IdentificationCode: [
                            {
                              _: "MYS",
                              listID: "ISO3166-1",
                              listAgencyID: "6",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                  PartyLegalEntity: [
                    {
                      RegistrationName: [{ _: customerData.name }],
                    },
                  ],
                  PartyIdentification: [
                    {
                      ID: [
                        { _: customerData.tin_number || "-", schemeID: "TIN" },
                      ],
                    },
                    {
                      ID: [
                        {
                          _: customerData.id_number || "-",
                          schemeID: customerData.id_type || "BRN",
                        },
                      ],
                    },
                    { ID: [{ _: "-", schemeID: "SST" }] },
                    { ID: [{ _: "-", schemeID: "TTX" }] },
                  ],
                  Contact: [
                    {
                      Telephone: [
                        { _: formatPhoneNumber(customerData.phone_number) },
                      ],
                      ElectronicMail: [{ _: customerData.email || "" }],
                    },
                  ],
                },
              ],
            },
          ],
          AllowanceCharge: [
            {
              ChargeIndicator: [{ _: false }],
              AllowanceChargeReason: [{ _: "" }],
              Amount: [{ _: 0, currencyID: "MYR" }],
            },
            {
              ChargeIndicator: [{ _: false }],
              AllowanceChargeReason: [{ _: "" }],
              Amount: [{ _: 0, currencyID: "MYR" }],
            },
          ],
          TaxTotal: [
            {
              TaxAmount: [{ _: totals.tax, currencyID: "MYR" }],
              // Convert tax subtotals array into proper structure
              ...totals.taxSubtotals.map((subtotal) => ({
                TaxSubtotal: [
                  {
                    TaxableAmount: [
                      { _: subtotal.taxableAmount, currencyID: "MYR" },
                    ],
                    TaxAmount: [{ _: subtotal.taxAmount, currencyID: "MYR" }],
                    TaxCategory: [
                      {
                        ID: [{ _: subtotal.category }],
                        ...(subtotal.category === "E"
                          ? {
                              TaxExemptionReason: [{ _: "Tax Exemption" }],
                            }
                          : {}),
                        TaxScheme: [
                          {
                            ID: [
                              {
                                _: "OTH",
                                schemeID: "UN/ECE 5153",
                                schemeAgencyID: "6",
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              })),
            },
          ],
          LegalMonetaryTotal: [
            {
              LineExtensionAmount: [{ _: totals.subtotal, currencyID: "MYR" }], // (Optional) Sum of total amount payable (inclusive of applicable line item and invoice level discounts and charges), excluding any applicable taxes (e.g., sales tax, service tax).
              TaxExclusiveAmount: [{ _: totals.subtotal, currencyID: "MYR" }], // Sum of amount payable (inclusive of applicable discounts and charges), excluding any applicable taxes (e.g., sales tax, service tax).
              TaxInclusiveAmount: [{ _: totals.total, currencyID: "MYR" }], // Sum of amount payable inclusive of total taxes chargeable (e.g., sales tax, service tax).
              AllowanceTotalAmount: [{ _: 0, currencyID: "MYR" }], // (Optional) Total amount deducted from the original price of the product(s) or service(s).
              ChargeTotalAmount: [{ _: totals.subtotal, currencyID: "MYR" }], // (Optional) Total charge associated with the product(s) or service(s) imposed before tax.
              PayableRoundingAmount: [
                { _: rawInvoiceData.rounding || 0, currencyID: "MYR" },
              ], // (Optional) Rounding amount added to the amount payable.
              PayableAmount: [{ _: totals.total, currencyID: "MYR" }], // Sum of amount payable (inclusive of total taxes chargeable and any rounding adjustment) excluding any amount paid in advance.
            },
          ],
          InvoiceLine: invoiceLines,
        },
      ],
    };
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
