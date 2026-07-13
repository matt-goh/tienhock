// src/pages/GreenTarget/Customers/CustomerListPage.tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconPlus,
  IconTrash,
  IconSquare,
  IconSquareCheckFilled,
  IconUserPlus,
  IconX,
  IconRotateClockwise,
  IconPhone,
  IconMapPin,
  IconId,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { greenTargetApi } from "../../../routes/greentarget/api";
import { useAuth } from "../../../contexts/AuthContext";

interface Customer {
  customer_id: number;
  name: string;
  phone_number: string;
  last_activity_date: string;
  has_active_rental: boolean;
}

interface Signup {
  signup_id: number;
  name: string;
  id_number: string | null;
  phone_number: string | null;
  address: string | null;
  payment_method: "cash" | "online" | "qr";
  status: "pending" | "processed" | "rejected";
  customer_id: number | null;
  submitted_at: string;
  processed_at: string | null;
  processed_by: string | null;
}

interface ApiError {
  status?: number;
}

type StatusTab = "pending" | "processed" | "rejected";

const PAYMENT_LABELS: Record<Signup["payment_method"], string> = {
  cash: "Cash",
  online: "Online Transfer",
  qr: "QR",
};

const SIGNUP_TABS: { key: StatusTab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "processed", label: "Processed" },
  { key: "rejected", label: "Rejected" },
];

const CustomerListPage = (): JSX.Element => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [signups, setSignups] = useState<Signup[]>([]);
  const [signupsLoading, setSignupsLoading] = useState<boolean>(true);
  const [activeSignupTab, setActiveSignupTab] =
    useState<StatusTab>("pending");
  const [signupToConvert, setSignupToConvert] = useState<Signup | null>(null);
  const [signupToReject, setSignupToReject] = useState<Signup | null>(null);
  const [processingSignup, setProcessingSignup] = useState<boolean>(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(
    null
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [showInactive, setShowInactive] = useState<boolean>(true);

  const fetchSignups = useCallback(async (): Promise<void> => {
    try {
      setSignupsLoading(true);
      const data: Signup[] = await greenTargetApi.getCustomerSignups(
        activeSignupTab
      );
      setSignups(data);
    } catch (err: unknown) {
      console.error("Error fetching signups:", err);
      toast.error("Failed to fetch signups. Please try again later.");
    } finally {
      setSignupsLoading(false);
    }
  }, [activeSignupTab]);

  useEffect((): void => {
    fetchSignups();
  }, [fetchSignups]);

  useEffect((): void => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async (): Promise<void> => {
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

  const handleConfirmConvert = async (): Promise<void> => {
    if (!signupToConvert) return;

    try {
      setProcessingSignup(true);
      const response = await greenTargetApi.convertCustomerSignup(
        signupToConvert.signup_id,
        user?.id
      );
      toast.success("Customer created successfully");
      setSignupToConvert(null);
      navigate(`/greentarget/customers/${response.customer.customer_id}`);
    } catch (err: unknown) {
      if ((err as ApiError)?.status === 409) {
        toast.error("This signup has already been processed.");
        fetchSignups();
      } else {
        toast.error("Failed to create customer. Please try again.");
      }
    } finally {
      setProcessingSignup(false);
    }
  };

  const handleConfirmReject = async (): Promise<void> => {
    if (!signupToReject) return;

    try {
      setProcessingSignup(true);
      await greenTargetApi.updateCustomerSignupStatus(
        signupToReject.signup_id,
        "rejected"
      );
      toast.success("Signup rejected");
      setSignupToReject(null);
      fetchSignups();
    } catch (err: unknown) {
      console.error("Error rejecting signup:", err);
      toast.error("Failed to reject signup. Please try again.");
    } finally {
      setProcessingSignup(false);
    }
  };

  const handleRestore = async (signup: Signup): Promise<void> => {
    try {
      await greenTargetApi.updateCustomerSignupStatus(
        signup.signup_id,
        "pending"
      );
      toast.success("Signup restored to pending");
      fetchSignups();
    } catch (err: unknown) {
      console.error("Error restoring signup:", err);
      toast.error("Failed to restore signup. Please try again.");
    }
  };

  const handleConfirmDelete = async (): Promise<void> => {
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
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "Not set";
    const date = new Date(dateString);
    // Format as DD/MM/YYYY
    return `${date.getDate().toString().padStart(2, "0")}/${(
      date.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${date.getFullYear()}`;
  };

  const formatSignupDate = (dateString: string | null): string => {
    if (!dateString) return "";
    const date: Date = new Date(dateString);
    return `${date.getDate().toString().padStart(2, "0")}/${(
      date.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${date.getFullYear()} ${date
      .getHours()
      .toString()
      .padStart(2, "0")}:${date
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
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

  return (
    <div className="space-y-4">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl text-default-700 dark:text-gray-200 font-bold">
            Signup Requests ({signups.length})
          </h1>
        </div>

        <div className="flex gap-2 border-b border-default-200 dark:border-gray-700">
          {SIGNUP_TABS.map((tab: { key: StatusTab; label: string }) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveSignupTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeSignupTab === tab.key
                  ? "border-green-600 text-green-700 dark:text-green-400"
                  : "border-transparent text-default-500 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {signupsLoading ? (
          <div className="py-10 w-full flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : signups.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-default-500 dark:text-gray-400">
              No {activeSignupTab} signups.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {signups.map((signup: Signup) => (
              <div
                key={signup.signup_id}
                className="bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-default-900 dark:text-gray-100">
                      {signup.name}
                    </div>
                    <div className="mt-1 space-y-1 text-sm text-default-600 dark:text-gray-300">
                      {signup.id_number && (
                        <div className="flex items-center gap-2">
                          <IconId size={16} className="text-default-400" />
                          {signup.id_number}
                        </div>
                      )}
                      {signup.phone_number && (
                        <div className="flex items-center gap-2">
                          <IconPhone size={16} className="text-default-400" />
                          {signup.phone_number}
                        </div>
                      )}
                      {signup.address && (
                        <div className="flex items-start gap-2">
                          <IconMapPin
                            size={16}
                            className="text-default-400 mt-0.5 shrink-0"
                          />
                          <span>{signup.address}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        {PAYMENT_LABELS[signup.payment_method]}
                      </span>
                      <span className="text-xs text-default-400 dark:text-gray-500">
                        {formatSignupDate(signup.submitted_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    {signup.status === "pending" && (
                      <>
                        <Button
                          onClick={() => setSignupToConvert(signup)}
                          icon={IconUserPlus}
                          variant="outline"
                          color="sky"
                          size="sm"
                        >
                          Create
                        </Button>
                        <Button
                          onClick={() => setSignupToReject(signup)}
                          icon={IconX}
                          variant="outline"
                          color="rose"
                          size="sm"
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {signup.status === "processed" && signup.customer_id && (
                      <Button
                        onClick={() =>
                          navigate(
                            `/greentarget/customers/${signup.customer_id}`
                          )
                        }
                        variant="outline"
                        size="sm"
                      >
                        View Customer
                      </Button>
                    )}
                    {signup.status === "rejected" && (
                      <Button
                        onClick={() => handleRestore(signup)}
                        icon={IconRotateClockwise}
                        variant="outline"
                        size="sm"
                      >
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
              className="w-full pl-11 py-2 border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 text-default-900 dark:text-gray-100 placeholder:text-default-400 dark:placeholder:text-gray-400 focus:border-default-500 dark:focus:border-gray-500 rounded-full"
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

      {loading ? (
        <div className="py-10 w-full flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div>Error: {error}</div>
      ) : filteredCustomers.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-default-500 dark:text-gray-400">No customers found.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-default-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto max-h-[calc(100vh-200px)] overflow-y-auto">
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

      <ConfirmationDialog
        isOpen={!!signupToConvert}
        onClose={() => setSignupToConvert(null)}
        onConfirm={handleConfirmConvert}
        title="Create Customer"
        message={`Create a new Green Target customer from "${signupToConvert?.name}"? This will add them to the customer list${
          signupToConvert?.address ? " along with their address" : ""
        }.`}
        confirmButtonText={
          processingSignup ? "Creating..." : "Create Customer"
        }
        variant="default"
      />

      <ConfirmationDialog
        isOpen={!!signupToReject}
        onClose={() => setSignupToReject(null)}
        onConfirm={handleConfirmReject}
        title="Reject Signup"
        message={`Reject the signup from "${signupToReject?.name}"? You can restore it later from the Rejected tab.`}
        confirmButtonText={processingSignup ? "Rejecting..." : "Reject"}
        variant="danger"
      />
    </div>
  );
};

export default CustomerListPage;
