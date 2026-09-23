import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "../Button";
import { FormInput, FormListbox, SelectOption } from "../FormComponents";
import { AdjustmentDocLine, ProductItem } from "../../types/types";
import { addMoney, multiplyMoney, roundMoney } from "../../utils/moneyUtils";

interface Props {
  products: ProductItem[];
  disabled: boolean;
  onAdd: (line: AdjustmentDocLine) => void;
  onEditingChange: (editing: boolean) => void;
}

const CreditNotePriceCorrection: React.FC<Props> = ({
  products,
  disabled,
  onAdd,
  onEditingChange,
}) => {
  const { t } = useTranslation("adjustments");
  const [selectedIndex, setSelectedIndex] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [correctedPrice, setCorrectedPrice] = useState<string>("");
  const [taxCredit, setTaxCredit] = useState<string>("0");
  const items: ProductItem[] = products.filter(
    (product: ProductItem): boolean =>
      !product.issubtotal &&
      !product.istotal &&
      Number(product.quantity) > 0 &&
      Number(product.price) > 0 &&
      !["DISC", "OTH", "LESS", "REFUND"].includes(product.code)
  );
  const product: ProductItem | undefined =
    selectedIndex === "" ? undefined : items[Number(selectedIndex)];
  const unitDifference: number = roundMoney(
    Number(product?.price || 0) - Number(correctedPrice)
  );
  const amount: number = addMoney(
    multiplyMoney(unitDifference, Number(quantity)),
    Number(taxCredit)
  );
  const canAdd: boolean =
    Boolean(product) &&
    correctedPrice.trim() !== "" &&
    Number.isFinite(Number(correctedPrice)) &&
    Number(correctedPrice) >= 0 &&
    unitDifference > 0 &&
    Math.abs(Number(correctedPrice) - roundMoney(Number(correctedPrice))) < 0.000001 &&
    Number.isFinite(Number(quantity)) &&
    Number(quantity) > 0 &&
    Number(quantity) <= Number(product?.quantity) &&
    taxCredit.trim() !== "" &&
    Number.isFinite(Number(taxCredit)) &&
    Number(taxCredit) >= 0 &&
    Math.abs(Number(taxCredit) - roundMoney(Number(taxCredit))) < 0.000001 &&
    Number(taxCredit) <= Number(product?.tax || 0) &&
    Number.isFinite(amount);

  const addCorrection = (): void => {
    if (!product || !canAdd || disabled) return;
    onAdd({
      code: product.code,
      description: `${product.description || product.code} - Price correction RM ${Number(product.price).toFixed(2)} to RM ${Number(correctedPrice).toFixed(2)}`,
      quantity: Number(quantity),
      price: unitDifference,
      tax: Number(taxCredit),
      total: amount,
      issubtotal: false,
    });
    setSelectedIndex("");
    setQuantity("");
    setCorrectedPrice("");
    setTaxCredit("0");
    onEditingChange(false);
  };

  return (
    <div className="mb-4 rounded-lg border border-sky-200 dark:border-sky-800 p-3 space-y-3">
      <h3 className="font-medium text-default-900 dark:text-gray-100">
        {t("Correct an item's price")}
      </h3>
      <p className="text-xs text-default-500 dark:text-gray-400">
        {t(
          "Select the original item and enter the correct unit price. The credit uses only the price difference, not the full item value. The first correction replaces the untouched default discount row."
        )}
      </p>
      <FormListbox
        name="correction-original-item"
        label={t("Original invoice item")}
        value={selectedIndex}
        disabled={disabled}
        options={[
          { id: "", name: t("Select an invoice item") },
          ...items.map((item: ProductItem, index: number): SelectOption => ({
            id: String(index),
            name: `${item.code} — ${item.description || ""}`,
          })),
        ]}
        onChange={(index: string): void => {
          const selected: ProductItem | undefined =
            index === "" ? undefined : items[Number(index)];
          setSelectedIndex(index);
          setQuantity(selected ? String(selected.quantity) : "");
          setCorrectedPrice("");
          setTaxCredit(Number(selected?.tax || 0) > 0 ? "" : "0");
          onEditingChange(Boolean(selected));
        }}
      />
      {product && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormInput
              name="correction-original-price"
              label={t("Original unit price")}
              value={Number(product.price).toFixed(2)}
              disabled
            />
            <FormInput
              name="correction-quantity"
              label={t("Affected quantity")}
              type="number"
              min={0}
              max={Number(product.quantity)}
              step="any"
              value={quantity}
              disabled={disabled}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                setQuantity(event.target.value)
              }
            />
            <FormInput
              name="correction-price"
              label={t("Correct unit price")}
              type="number"
              min={0}
              max={Number(product.price)}
              step="0.01"
              value={correctedPrice}
              disabled={disabled}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                setCorrectedPrice(event.target.value)
              }
            />
          </div>
          {Number(product.tax || 0) > 0 && (
            <FormInput
              name="correction-tax"
              label={t("Tax to credit (enter 0 if unchanged)")}
              type="number"
              min={0}
              max={Number(product.tax)}
              step="0.01"
              value={taxCredit}
              disabled={disabled}
              onChange={(event: React.ChangeEvent<HTMLInputElement>): void =>
                setTaxCredit(event.target.value)
              }
            />
          )}
          <p className="text-sm text-default-700 dark:text-gray-300">
            {canAdd
              ? t("Credit: {{quantity}} × RM {{difference}} + RM {{tax}} tax = RM {{amount}}", {
                  quantity,
                  difference: unitDifference.toFixed(2),
                  tax: Number(taxCredit).toFixed(2),
                  amount: amount.toFixed(2),
                })
              : t("Enter a lower, non-negative price and a quantity within the original billed quantity. Confirm any tax credit.")}
          </p>
          <Button variant="outline" size="sm" disabled={disabled || !canAdd} onClick={addCorrection}>
            {t("Add price correction")}
          </Button>
        </>
      )}
    </div>
  );
};

export default CreditNotePriceCorrection;
