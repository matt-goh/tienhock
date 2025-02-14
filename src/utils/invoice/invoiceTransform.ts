import { ExtendedInvoiceData, InvoiceData, ProductItem } from "../../types/types";

export const uiToApiFormat = (uiData: ExtendedInvoiceData): InvoiceData => {
  // Filter out total rows and transform products
  const regularProducts = uiData.products
    .filter(product => !product.istotal && !product.issubtotal)
    .map(product => ({
      code: product.code,
      description: product.description || "",
      quantity: product.quantity || 0,
      price: product.price || 0,
      freeProduct: product.freeProduct || 0,
      returnProduct: product.returnProduct || 0,
      tax: product.tax || 0,
      discount: product.discount || 0,
      total: calculateTotal(product)
    }));

  return {
    billNumber: uiData.billNumber,
    salespersonId: uiData.salespersonId,
    customerId: uiData.customerId,
    createdDate: uiData.createdDate,
    paymentType: uiData.paymentType,
    products: regularProducts,
    totalMee: calculateCategoryTotal(regularProducts, "1-"),
    totalBihun: calculateCategoryTotal(regularProducts, "2-"),
    totalNonTaxable: calculateNonTaxableTotal(regularProducts),
    totalTaxable: calculateTaxableTotal(regularProducts),
    totalAdjustment: calculateAdjustments(regularProducts)
  };
};

export const apiToUiFormat = (apiData: InvoiceData): ExtendedInvoiceData => {
  // Transform base products
  const baseProducts = apiData.products.map(product => ({
    ...product,
    issubtotal: false,
    istotal: false
  }));

  // Add subtotals and total rows
  const productsWithTotals = addCalculatedTotalRows(baseProducts);

  return {
    ...apiData,
    products: productsWithTotals
  };
};

function calculateTotal(product: ProductItem): string {
  if (product.istotal || product.issubtotal) {
    return product.total || "0";
  }

  const quantity = product.quantity || 0;
  const price = product.price || 0;
  const discount = product.discount || 0;
  const tax = product.tax || 0;
  const returnQty = product.returnProduct || 0;

  // Calculate base total
  const baseTotal = (quantity - returnQty) * price;
  
  // Apply discounts and tax
  const afterDiscount = baseTotal - discount;
  const final = afterDiscount + tax;

  return final.toFixed(2);
}

function calculateCategoryTotal(products: ProductItem[], prefix: string): number {
  return products
    .filter(product => product.code.startsWith(prefix))
    .reduce((sum, product) => {
      return sum + parseFloat(calculateTotal(product));
    }, 0);
}

function calculateNonTaxableTotal(products: ProductItem[]): number {
  return products
    .filter(product => 
      product.code.startsWith('S-') || 
      product.code.startsWith('MEQ-')
    )
    .reduce((sum, product) => {
      return sum + parseFloat(calculateTotal(product));
    }, 0);
}

function calculateTaxableTotal(products: ProductItem[]): number {
  return products
    .filter(product => 
      !product.code.startsWith('S-') && 
      !product.code.startsWith('MEQ-')
    )
    .reduce((sum, product) => {
      return sum + (product.tax || 0);
    }, 0);
}

function calculateAdjustments(products: ProductItem[]): number {
  return products.reduce((sum, product) => {
    return sum + (product.discount || 0);
  }, 0);
}

function addCalculatedTotalRows(products: ProductItem[]): ProductItem[] {
  const result: ProductItem[] = [...products];
  let currentSubtotal = 0;

  // Calculate running total
  const runningTotal = products.reduce((total, product) => {
    if (product.issubtotal || product.istotal) return total;
    return total + parseFloat(calculateTotal(product));
  }, 0);

  // Add subtotal for every 5 items
  products.forEach((product, index) => {
    if (!product.issubtotal && !product.istotal) {
      currentSubtotal += parseFloat(calculateTotal(product));
    }

    if ((index + 1) % 5 === 0 || index === products.length - 1) {
      result.push({
        code: `SUBTOTAL-${Math.floor(index / 5) + 1}`,
        description: `Subtotal ${Math.floor(index / 5) + 1}`,
        quantity: 0,
        price: 0,
        freeProduct: 0,
        returnProduct: 0,
        tax: 0,
        discount: 0,
        total: currentSubtotal.toFixed(2),
        issubtotal: true,
        istotal: false
      });
    }
  });

  // Add final total row
  result.push({
    code: 'TOTAL',
    description: 'Total',
    quantity: 0,
    price: 0,
    freeProduct: 0,
    returnProduct: 0,
    tax: 0,
    discount: 0,
    total: runningTotal.toFixed(2),
    issubtotal: false,
    istotal: true
  });

  return result;
}