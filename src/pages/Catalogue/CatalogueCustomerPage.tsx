import React, { useState, useEffect, useCallback, useMemo } from "react";
import Table from "../../components/Table/Table";
import { ColumnConfig, Customer, Employee } from "../../types/types";
import toast from "react-hot-toast";
import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { IconCheck, IconChevronDown, IconSearch } from "@tabler/icons-react";
import { API_BASE_URL } from "../../config";

const CustomerCataloguePage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editedCustomers, setEditedCustomers] = useState<Customer[]>([]);
  const [salesmen, setSalesmen] = useState<string[]>(["All Salesmen"]);
  const [selectedSalesman, setSelectedSalesman] =
    useState<string>("All Salesmen");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const customerColumns: ColumnConfig[] = useMemo(() => {
    const baseColumns: ColumnConfig[] = [
      {
        id: "id",
        header: "ID",
        type: isEditing ? "string" : "readonly",
        width: 150,
      },
      {
        id: "name",
        header: "Name",
        type: isEditing ? "string" : "readonly",
        width: 400,
      },
      {
        id: "closeness",
        header: "L/O",
        type: isEditing ? "listbox" : "readonly",
        width: 150,
        options: ["Local", "Outstation"],
      },
      {
        id: "tin_number",
        header: "TIN Number",
        type: isEditing ? "number" : "readonly",
        width: 250,
      },
    ];

    if (selectedSalesman === "All Salesmen" || isEditing) {
      baseColumns.splice(3, 0, {
        id: "salesman",
        header: "Salesman",
        type: isEditing ? "listbox" : "readonly",
        width: 150,
        options: salesmen.filter((s) => s !== "All Salesmen"),
      });
    }

    return baseColumns;
  }, [isEditing, selectedSalesman, salesmen]);

  const fetchSalesmen = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/staffs?salesmenOnly=true`
      );
      if (!response.ok) throw new Error("Failed to fetch salesmen");
      const data: Employee[] = await response.json();
      const salesmenIds = data.map((employee) => employee.id);
      setSalesmen(["All Salesmen", ...salesmenIds]);
    } catch (error) {
      console.error("Error fetching salesmen:", error);
      toast.error("Failed to fetch salesmen. Please try again.");
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/customers`);
      if (!response.ok) throw new Error("Failed to fetch customers");
      const data = await response.json();
      setCustomers(data);
    } catch (error) {
      console.error("Error fetching customers:", error);
      toast.error("Failed to fetch customers. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
    fetchSalesmen();
  }, [fetchCustomers, fetchSalesmen]);

  useEffect(() => {
    if (isEditing) {
      setEditedCustomers([...customers]);
    }
  }, [isEditing, customers]);

  const handleDataChange = useCallback((updatedData: Customer[]) => {
    setTimeout(() => setEditedCustomers(updatedData), 0);
  }, []);

  const handleDeleteCustomers = useCallback(
    async (selectedIndices: number[]) => {
      const customersToDelete = selectedIndices.map(
        (index) => customers[index]
      );
      const customerIdsToDelete = customersToDelete.map(
        (customer) => customer.id
      );

      try {
        const response = await fetch(`${API_BASE_URL}/api/customers`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerIds: customerIdsToDelete }),
        });

        if (!response.ok) {
          throw new Error("Failed to delete customers on the server");
        }

        setCustomers((prevCustomers) =>
          prevCustomers.filter(
            (customer) => !customerIdsToDelete.includes(customer.id)
          )
        );

        toast.success("Selected customers deleted successfully");
        setIsEditing(false);
      } catch (error) {
        console.error("Error deleting selected customers:", error);
        toast.error("Failed to delete customers. Please try again.");
      }
    },
    [customers]
  );

  const handleSave = useCallback(async () => {
    try {
      // Check for invalid customer objects
      const invalidCustomer = editedCustomers.find(
        (customer) =>
          !customer || typeof customer.id !== "string" || !customer.id.trim()
      );
      if (invalidCustomer) {
        toast.error("All customers must have a valid ID");
        return;
      }

      // Check for duplicate customer IDs
      const customerIds = new Set();
      const duplicateCustomerId = editedCustomers.find((customer) => {
        if (customerIds.has(customer.id)) {
          return true;
        }
        customerIds.add(customer.id);
        return false;
      });

      if (duplicateCustomerId) {
        toast.error(`Duplicate Customer ID: ${duplicateCustomerId.id}`);
        return;
      }

      // Find changed customers
      const changedCustomers = editedCustomers.filter((editedCustomer) => {
        const originalCustomer = customers.find(
          (cust) => cust.id === editedCustomer.id
        );
        if (!originalCustomer) return true; // New customer
        return ["name", "closeness", "salesman", "tin_number"].some(
          (key) =>
            editedCustomer[key as keyof Customer] !==
            originalCustomer[key as keyof Customer]
        );
      });

      if (changedCustomers.length === 0) {
        toast("No changes detected");
        setIsEditing(false);
        return;
      }

      const customersToUpdate = changedCustomers.map((customer) => ({
        ...customer,
        newId: customer.id !== customer.originalId ? customer.id : undefined,
        id: customer.originalId || customer.id,
      }));

      const response = await fetch(
        `${API_BASE_URL}/api/customers/batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customers: customersToUpdate,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "An error occurred while saving customers"
        );
      }

      const result = await response.json();

      // Update local state with the changes
      setCustomers((prevCustomers) => {
        const updatedCustomers = [...prevCustomers];
        result.customers.forEach((updatedCustomer: Customer) => {
          const index = updatedCustomers.findIndex(
            (cust) => cust.id === updatedCustomer.id
          );
          if (index !== -1) {
            updatedCustomers[index] = {
              ...updatedCustomer,
              originalId: updatedCustomer.id,
            };
          } else {
            updatedCustomers.push({
              ...updatedCustomer,
              originalId: updatedCustomer.id,
            });
          }
        });
        return updatedCustomers;
      });

      setIsEditing(false);
      toast.success("Changes saved successfully");
    } catch (error) {
      console.error("Error updating customers:", error);
      toast.error((error as Error).message);
    }
  }, [editedCustomers, customers]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
    setEditedCustomers([]);
  }, []);

  const handleToggleEditing = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const filteredCustomers = useMemo(() => {
    let filtered = isEditing ? editedCustomers : customers;

    if (selectedSalesman !== "All Salesmen") {
      filtered = filtered.filter(
        (customer) => customer.salesman === selectedSalesman
      );
    }

    if (searchTerm) {
      const lowercasedSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (customer) =>
          customer.id.toLowerCase().includes(lowercasedSearch) ||
          customer.name.toLowerCase().includes(lowercasedSearch)
      );
    }

    return filtered;
  }, [selectedSalesman, searchTerm, isEditing, editedCustomers, customers]);

  const renderSalesmanListbox = () => (
    <>
      <span className="font-semibold mr-2">Salesman:</span>
      <Listbox value={selectedSalesman} onChange={setSelectedSalesman}>
        <div className="relative">
          <ListboxButton className="w-48 rounded-lg border border-default-300 bg-white py-2 pl-3 pr-10 text-left focus:outline-none focus:border-default-400">
            <span className="block truncate">{selectedSalesman}</span>
            <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
              <IconChevronDown
                className="h-5 w-5 text-default-400"
                aria-hidden="true"
              />
            </span>
          </ListboxButton>
          <ListboxOptions className="absolute z-10 w-full p-1 mt-1 border bg-white max-h-60 rounded-lg overflow-auto focus:outline-none shadow-lg">
            {salesmen.map((salesman) => (
              <ListboxOption
                key={salesman}
                className={({ active }) =>
                  `relative cursor-pointer select-none rounded py-2 pl-3 pr-9 ${
                    active ? "bg-default-100 text-default-900" : "text-default-900"
                  }`
                }
                value={salesman}
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate ${
                        selected ? "font-medium" : "font-normal"
                      }`}
                    >
                      {salesman}
                    </span>
                    {selected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-default-600">
                        <IconCheck className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </>
                )}
              </ListboxOption>
            ))}
          </ListboxOptions>
        </div>
      </Listbox>
    </>
  );

  if (loading) {
    return <p className="mt-4 text-center">Loading...</p>;
  }

  return (
    <div className={`relative`}>
      <div className="flex flex-col items-start">
        <div className={`w-full flex justify-between items-center mb-4`}>
          {isEditing ? (
            <div></div>
          ) : (
            <div className="flex items-center">{renderSalesmanListbox()}</div>
          )}
          <div
            className={`w-auto text-lg text-center font-medium text-default-700`}
          >
            Customer Catalogue
          </div>
          {isEditing ? (
            <div></div>
          ) : (
            <div className="flex items-center mr-20">
              <div className="flex">
                <div className="relative w-full mx-3">
                  <IconSearch
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400"
                    size={22}
                  />
                  <input
                    type="text"
                    placeholder="Search"
                    className="w-full pl-11 py-2 border focus:border-default-500 rounded-full"
                    value={searchTerm}
                    onChange={handleSearchChange}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="w-full">
          <div className="relative">
            <Table
              initialData={filteredCustomers}
              columns={customerColumns}
              onShowDeleteButton={() => {}}
              onDelete={handleDeleteCustomers}
              onChange={handleDataChange}
              isEditing={isEditing}
              onToggleEditing={handleToggleEditing}
              onSave={handleSave}
              onCancel={handleCancel}
              tableKey="customerCatalogue"
            />
            {filteredCustomers.length === 0 && (
              <p className="mt-4 text-center text-default-700 w-full">
                No customers found.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerCataloguePage;
