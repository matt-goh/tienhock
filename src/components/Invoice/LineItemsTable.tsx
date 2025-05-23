// src/components/Invoice/LineItemsTable.tsx
import React, { useState, useCallback, ChangeEvent, useEffect } from "react";
import { ProductItem, CustomProduct } from "../../types/types"; // Use Product type from cache
import { IconTrash } from "@tabler/icons-react";
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";
import { IconChevronDown, IconCheck } from "@tabler/icons-react";

interface LineItemsTableProps {
  items: ProductItem[]; // Still uses ProductItem for row data structure
  onItemsChange: (items: ProductItem[]) => void;
  customerProducts: CustomProduct[];
  productsCache: ProductItem[]; // Expect Product[] from cache hook
  readOnly?: boolean;
}

const LineItemsTable: React.FC<LineItemsTableProps> = ({
  items,
  onItemsChange,
  customerProducts,
  productsCache,
  readOnly = false,
}) => {
  const handleItemChange = useCallback(
    (index: number, field: keyof ProductItem, value: any) => {
      const newItems = [...items];
      const item = { ...newItems[index] };
      (item as any)[field] = value;
      if (field === "quantity" || field === "price" || field === "tax") {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const tax = Number(item.tax) || 0;
        item.total = (quantity * price + tax).toFixed(2);
      }
      newItems[index] = item;
      onItemsChange(newItems);
    },
    [items, onItemsChange]
  );

  const handleProductSelect = useCallback(
    (index: number, selectedProduct: ProductItem | null) => {
      if (!selectedProduct) return;
      const newItems = [...items];
      const item = { ...newItems[index] };
      const customProduct = customerProducts.find(
        (cp) => cp.product_id === String(selectedProduct.id) && cp.is_available
      );
      const price = customProduct
        ? Number(customProduct.custom_price)
        : Number(selectedProduct.price) || 0;

      item.code = String(selectedProduct.id);

      // Only set description automatically if it's NOT "OTH"
      if (String(selectedProduct.id) !== "OTH") {
        item.description = selectedProduct.description || "";
      }
      // For "OTH", keep the existing description or set empty if none exists
      else if (!item.description) {
        item.description = "";
      }

      item.price = price;
      item.tax = 0;
      const quantity = Number(item.quantity) || 0;
      item.total = (quantity * price).toFixed(2);

      newItems[index] = item;
      onItemsChange(newItems);
    },
    [items, onItemsChange, customerProducts]
  );

  const handleDeleteRow = useCallback(
    (index: number) => {
      const newItems = items.filter((_, i) => i !== index);
      onItemsChange(newItems);
    },
    [items, onItemsChange]
  );

  // --- Inline Cell Components ---

  const NumericInputCell = ({
    rowIndex,
    field,
    value,
    min = 0,
  }: {
    rowIndex: number;
    field: keyof ProductItem;
    value: number | undefined;
    min?: number;
  }) => {
    // Add local state to track input during typing
    const [localValue, setLocalValue] = useState<string>(
      value?.toString() || ""
    );

    // Update local state when prop value changes
    useEffect(() => {
      setLocalValue(value?.toString() || "");
    }, [value]);

    return (
      <input
        type="number"
        min={min}
        step={field === "price" || field === "tax" ? "0.1" : "1"}
        // Use local state for display during editing
        value={localValue}
        // Update local state only without triggering parent updates
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setLocalValue(e.target.value);
        }}
        // Only update parent state when finished typing
        onBlur={(e) => {
          const newValue =
            e.target.value === "" ? undefined : parseFloat(e.target.value);
          handleItemChange(rowIndex, field, newValue);
        }}
        className="w-full py-1 border border-transparent hover:border-default-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded bg-transparent text-right text-sm"
        disabled={readOnly}
      />
    );
  };

  const ProductComboboxCell = ({
    rowIndex,
    item,
  }: {
    rowIndex: number;
    item: ProductItem;
  }) => {
    const [query, setQuery] = useState("");
    const [selectedProductForCombobox, setSelectedProductForCombobox] =
      useState<ProductItem | null>(
        productsCache.find((p) => String(p.id) === item.code) || null
      );

    useEffect(() => {
      setSelectedProductForCombobox(
        productsCache.find((p) => String(p.id) === item.code) || null
      );
    }, [item.code, productsCache]); // Add productsCache dependency

    const filteredProducts =
      query === ""
        ? productsCache
        : productsCache.filter(
            (prod) =>
              (prod.description?.toLowerCase() ?? "").includes(
                query.toLowerCase()
              ) ||
              String(prod.id || "")
                .toLowerCase()
                .includes(query.toLowerCase())
          );

    return (
      <Combobox
        value={selectedProductForCombobox}
        onChange={(product: ProductItem | null) => {
          setSelectedProductForCombobox(product);
          handleProductSelect(rowIndex, product);
        }}
        disabled={readOnly}
      >
        <div className="relative">
          <ComboboxInput
            className="w-full px-2 py-1 border border-transparent hover:border-default-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded bg-transparent text-sm" // Added text-sm
            displayValue={(prod: ProductItem | null) =>
              prod?.description || item.description || ""
            }
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Product..."
          />
          {!readOnly && (
            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
              <IconChevronDown size={16} className="text-gray-400" />
            </ComboboxButton>
          )}
          <ComboboxOptions className="absolute z-30 mt-1 w-full min-w-[350px] max-h-60 overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm border border-default-200">
            {filteredProducts.length === 0 && query !== "" ? (
              <div className="relative cursor-default select-none py-2 px-4 text-gray-700">
                Nothing found.
              </div>
            ) : (
              filteredProducts.map((prod) => (
                <ComboboxOption
                  key={prod.id}
                  value={prod}
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2 pl-4 pr-4 ${
                      active ? "bg-sky-100 text-sky-900" : "text-gray-900"
                    }`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span
                        className={`block truncate ${
                          selected ? "font-medium" : "font-normal"
                        }`}
                      >
                        {prod.description} ({prod.id})
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-sky-600">
                          <IconCheck size={16} />
                        </span>
                      )}
                    </>
                  )}
                </ComboboxOption>
              ))
            )}
          </ComboboxOptions>
        </div>
      </Combobox>
    );
  };

  const DescriptionInputCell = ({
    rowIndex,
    value,
    isEditable,
  }: {
    rowIndex: number;
    value: string;
    isEditable: boolean;
  }) => {
    const [localValue, setLocalValue] = useState<string>(value || "");

    useEffect(() => {
      setLocalValue(value || "");
    }, [value]);

    if (!isEditable) {
      return (
        <span className="px-2 py-1 text-sm text-gray-900">{value || ""}</span>
      );
    }

    return (
      <input
        type="text"
        value={localValue}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setLocalValue(e.target.value);
        }}
        onBlur={(e) => {
          handleItemChange(rowIndex, "description", e.target.value);
        }}
        className="w-full py-1 px-2 border border-transparent hover:border-default-300 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded bg-transparent text-sm"
        placeholder="Enter custom description..."
        disabled={readOnly}
      />
    );
  };

  // --- Table Rendering ---
  return (
    <div>
      <table className="min-w-full divide-y divide-gray-200 border border-default-200 rounded-lg table-fixed">
        <colgroup>
          <col className="w-[10%]" />
          {/* Code */}
          <col className="w-[38%]" />
          {/* Product */}
          <col className="w-[8%]" />
          {/* QTY */}
          <col className="w-[10%]" />
          {/* Price */}
          <col className="w-[8%]" />
          {/* FOC */}
          <col className="w-[8%]" />
          {/* RTN */}
          <col className="w-[8%]" />
          {/* Tax */}
          <col className="w-[10%]" />
          {/* Total */}
          {!readOnly && <col className="w-[40px]" />}
          {/* Delete */}
        </colgroup>
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              ID
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Product
            </th>
            <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              QTY
            </th>
            <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Price
            </th>
            <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              FOC
            </th>
            <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              RTN
            </th>
            <th className="px-5 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tax
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total
            </th>
            {!readOnly && (
              <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {items.map((item, index) =>
            item.issubtotal ? (
              <tr
                key={item.uid || `subtotal-${index}`}
                className="bg-gray-100 font-medium group"
              >
                <td
                  colSpan={7}
                  className="px-3 py-1.5 text-right text-sm text-gray-700"
                >
                  Subtotal:
                </td>
                <td className="px-3 py-1.5 text-right text-sm text-gray-900">
                  {parseFloat(item.total || "0").toFixed(2)}
                </td>
                {!readOnly && (
                  <td className="px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(index)}
                      className="flex items-center text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                      title="Delete Subtotal Row"
                      disabled={readOnly}
                    >
                      <IconTrash size={16} />
                    </button>
                  </td>
                )}
              </tr>
            ) : (
              <tr key={item.uid || index} className="hover:bg-gray-50 group">
                <td className="px-3 py-1 whitespace-nowrap text-sm text-gray-500 align-middle">
                  {item.code}
                </td>
                <td className="px-1 py-1 text-sm text-gray-900 align-middle">
                  {item.code === "OTH" ? (
                    <div className="space-y-1">
                      <ProductComboboxCell rowIndex={index} item={item} />
                      <DescriptionInputCell
                        rowIndex={index}
                        value={item.description || ""}
                        isEditable={true}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <ProductComboboxCell rowIndex={index} item={item} />
                    </div>
                  )}
                </td>
                <td className="px-1 py-1 whitespace-nowrap text-sm text-gray-900 align-middle">
                  <NumericInputCell
                    rowIndex={index}
                    field="quantity"
                    value={item.quantity}
                  />
                </td>
                <td className="px-1 py-1 whitespace-nowrap text-sm text-gray-900 align-middle">
                  <NumericInputCell
                    rowIndex={index}
                    field="price"
                    value={item.price}
                  />
                </td>
                <td className="px-1 py-1 whitespace-nowrap text-sm text-gray-900 align-middle">
                  <NumericInputCell
                    rowIndex={index}
                    field="freeProduct"
                    value={item.freeProduct}
                  />
                </td>
                <td className="px-1 py-1 whitespace-nowrap text-sm text-gray-900 align-middle">
                  <NumericInputCell
                    rowIndex={index}
                    field="returnProduct"
                    value={item.returnProduct}
                  />
                </td>
                <td className="px-1 py-1 whitespace-nowrap text-sm text-gray-900 align-middle">
                  <NumericInputCell
                    rowIndex={index}
                    field="tax"
                    value={item.tax}
                  />
                </td>
                <td className="px-3 py-1 whitespace-nowrap text-sm text-gray-900 text-right align-middle">
                  {parseFloat(item.total || "0").toFixed(2)}
                </td>
                {!readOnly && (
                  <td className="px-2 py-1 text-center align-middle">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(index)}
                      className="flex items-center justify-center text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete Row"
                    >
                      <IconTrash size={16} />
                    </button>
                  </td>
                )}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
};

export default LineItemsTable;
