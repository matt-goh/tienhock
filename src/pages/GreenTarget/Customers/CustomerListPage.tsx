// src/pages/GreenTarget/Customers/CustomerListPage.tsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconPlus,
  IconTrash,
  IconSquare,
  IconSquareCheckFilled,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { greenTargetApi } from "../../../routes/greentarget/api";

interface Customer {
  customer_id: number;
  name: string;
  phone_number: string;
  last_activity_date: string;
  has_active_rental: boolean;
}

const CustomerListPage = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showInactive, setShowInactive] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getCustomers();
      setCustomers(data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch customers. Please try again later.");
      console.error("Error fetching customers:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (customerToDelete) {
      try {
        // Delete the customer from the database
        const response = await greenTargetApi.deleteCustomer(
          customerToDelete.customer_id
        );

        // Check if the response contains an error message
        if (
          response.error ||
          (response.message && response.message.includes("Cannot delete"))
        ) {
          // Show error toast with the server's message
          toast.error(
            response.message || "Cannot delete customer: unknown error occurred"
          );
        } else {
          // Only show success and update state if there's no error
          setCustomers(
            customers.filter(
              (c) => c.customer_id !== customerToDelete.customer_id
            )
          );
          toast.success("Customer deleted successfully");
        }

        setShowDeleteDialog(false);
        setCustomerToDelete(null);
      } catch (err) {
        console.error("Error deleting customer:", err);
        toast.error("Failed to delete customer. Please try again.");
      }
    }
  };

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Not set";
    const date = new Date(dateString);
    // Format as DD/MM/YYYY
    return `${date.getDate().toString().padStart(2, "0")}/${(
      date.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${date.getFullYear()}`;
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      // Search in both name and phone number
      const matchesSearch =
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.phone_number &&
          customer.phone_number
            .toLowerCase()
            .includes(searchTerm.toLowerCase()));

      // Using has_active_rental for filtering active/inactive status
      const matchesStatus = showInactive ? true : customer.has_active_rental;

      return matchesSearch && matchesStatus;
    });
  }, [customers, searchTerm, showInactive]);

  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-default-700 dark:text-gray-200 font-bold">
          Customers ({filteredCustomers.length})
        </h1>
        <div className="flex space-x-3">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowInactive(!showInactive)}
              className="p-2 rounded-full transition-opacity duration-200 hover:bg-default-100 dark:hover:bg-gray-700 dark:bg-gray-800 active:bg-default-200 flex items-center"
            >
              {showInactive ? (
                <IconSquareCheckFilled
                  className="text-blue-600"
                  width={20}
                  height={20}
                />
              ) : (
                <IconSquare
                  className="text-default-400"
                  width={20}
                  height={20}
                />
              )}
              <span className="ml-2 font-medium">Show Inactive</span>
            </button>
          </div>
          <div className="relative">
            <IconSearch
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-default-400"
              size={22}
            />
            <input
              type="text"
              placeholder="Search"
              className="w-full pl-11 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 focus:border-default-500 dark:focus:border-gray-500 rounded-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            onClick={() => navigate("/greentarget/customers/new")}
            icon={IconPlus}
            variant="outline"
          >
            Add Customer
          </Button>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-default-500 dark:text-gray-400">No customers found.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
              <thead className="bg-default-50 dark:bg-gray-900/50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Customer Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Phone Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Last Activity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-default-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
            </table>
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
              <table className="min-w-full divide-y divide-default-200 dark:divide-gray-700">
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-default-200 dark:divide-gray-700">
                  {filteredCustomers.map((customer) => (
                    <tr
                      key={customer.customer_id}
                      onClick={() =>
                        navigate(`/greentarget/customers/${customer.customer_id}`)
                      }
                      className="hover:bg-default-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <td className="px-6 py-2 whitespace-nowrap">
                        <div className="font-medium text-default-900 dark:text-gray-100">
                          {customer.name}
                        </div>
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-default-600 dark:text-gray-300">
                        {customer.customer_id}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-default-600 dark:text-gray-300">
                        {customer.phone_number || "N/A"}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-default-600 dark:text-gray-300">
                        {formatDate(customer.last_activity_date)}
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs rounded-full font-medium ${
                            customer.has_active_rental
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {customer.has_active_rental ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-2 whitespace-nowrap text-right font-medium">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDeleteDialog(true);
                            setCustomerToDelete(customer);
                          }}
                          variant="outline"
                          color="rose"
                          size="sm"
                          icon={IconTrash}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Customer"
        message={`Are you sure you want to remove ${customerToDelete?.name} from the system? This action cannot be undone.`}
        confirmButtonText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default CustomerListPage;
