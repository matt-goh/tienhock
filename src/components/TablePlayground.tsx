import React, { useState, useEffect, Fragment, useCallback } from "react";
import Table from "../components/Table";
import { ColumnConfig, Job, Product } from "../types/types";

type JobSelection = Job | null;

const TablePlayground: React.FC = () => {
  const [selectedJob, setSelectedJob] = useState<JobSelection>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [changedProducts, setChangedProducts] = useState<Set<string>>(
    new Set()
  );
  const [originalProducts, setOriginalProducts] = useState<Product[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const productColumns: ColumnConfig[] = [
    { id: "id", header: "ID", type: "string", width: 50 },
    { id: "name", header: "Name", type: "string" },
    {
      id: "amount",
      header: "Amount",
      type: "number",
      width: 50,
    },
    { id: "remark", header: "Remark", type: "string", width: 300 },
  ];

  const initialData: Product[] = [
    {
      id: "P001",
      name: "Laptop",
      amount: 1299.99,
      remark: "High-performance gaming laptop",
    },
    {
      id: "P002",
      name: "Smartphone",
      amount: 799.99,
      remark: "Latest model with advanced camera",
    },
    {
      id: "P003",
      name: "Wireless Headphones",
      amount: 199.99,
      remark: "Noise-cancelling with long battery life",
    },
    {
      id: "P004",
      name: "4K Smart TV",
      amount: 899.99,
      remark: "55-inch OLED display",
    },
    {
      id: "P005",
      name: "Coffee Maker",
      amount: 79.99,
      remark: "Programmable with built-in grinder",
    },
  ];

  const handleDataChange = useCallback(
    (updatedData: Product[]) => {
      setProducts(updatedData);
      const newChangedProducts = new Set(changedProducts);
      updatedData.forEach((product, index) => {
        const originalProduct = originalProducts[index];
        if (JSON.stringify(product) !== JSON.stringify(originalProduct)) {
          newChangedProducts.add(product.id);
        } else {
          newChangedProducts.delete(product.id);
        }
      });
      setChangedProducts(newChangedProducts);
    },
    [originalProducts, changedProducts]
  );

  const handleDeleteProducts = useCallback(
    async (selectedIds: string[]) => {
      if (!selectedJob) return;
    },
    [selectedJob]
  );

  return (
    <div className={`flex justify-center py-[60px]`}>
      <div className="flex flex-col items-start w-full max-w-4xl px-4">
        <Table
          initialData={initialData}
          columns={productColumns.map((col) => ({
            ...col,
            type: isEditing && col.type === "readonly" ? "string" : col.type,
          }))}
          onShowDeleteButton={() => {}}
          onDelete={handleDeleteProducts}
          onChange={() => handleDataChange}
          isEditing={isEditing}
        />
      </div>
    </div>
  );
};

export default TablePlayground;
