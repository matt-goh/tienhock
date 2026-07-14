// src/pages/GreenTarget/Customers/CustomerListPage.tsx
import {
  type MouseEvent,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  IconSearch,
  IconPlus,
  IconTrash,
  IconUserPlus,
  IconX,
  IconRotateClockwise,
  IconPhone,
  IconMapPin,
  IconId,
  IconFileInvoice,
  IconUsers,
} from "@tabler/icons-react";
import { toast } from "react-hot-toast";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import Button from "../../../components/Button";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { greenTargetApi } from "../../../routes/greentarget/api";
import { useAuth } from "../../../contexts/AuthContext";
import Checkbox from "../../../components/Checkbox";

interface CustomerLocationSummary {
  location_id: number;
  site: string | null;
  address: string;
}

interface Customer {
  customer_id: number;
  name: string;
  phone_number: string | null;
  last_activity_date: string | null;
  has_active_rental: boolean;
  locations: CustomerLocationSummary[];
}

interface SignupLocation {
  site: string;
  address: string;
}

interface Signup {
  signup_id: number;
  name: string;
  id_number: string | null;
  phone_number: string | null;
  address: string | null;
  locations: SignupLocation[] | null;
  einvoice_requested: boolean;
  payment_method: "cash" | "online" | "qr";
  status: "pending" | "processed" | "rejected";
  customer_id: number | null;
  submitted_at: string;
  processed_at: string | null;
  processed_by: string | null;
}

interface ApiError {
  status?: number;
  message?: string;
  data?: {
    message?: string;
  };
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
  const [signupToDelete, setSignupToDelete] = useState<Signup | null>(null);
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
      const apiError: ApiError = err as ApiError;
      if (apiError.status === 409) {
        toast.error(
          apiError.data?.message ||
            apiError.message ||
            "This signup cannot be converted. Refresh and review its status."
        );
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

  const handleConfirmSignupDelete = async (): Promise<void> => {
    if (!signupToDelete || processingSignup) return;

    try {
      setProcessingSignup(true);
      await greenTargetApi.deleteRejectedCustomerSignup(
        signupToDelete.signup_id
      );
      toast.success("Rejected signup deleted");
      setSignupToDelete(null);
      fetchSignups();
    } catch (err: unknown) {
      const apiError: ApiError = err as ApiError;
      console.error("Error deleting rejected signup:", err);
      toast.error(
        apiError.data?.message ||
          apiError.message ||
          "Failed to delete rejected signup. Please try again."
      );
      fetchSignups();
    } finally {
      setProcessingSignup(false);
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
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return customers.filter((customer: Customer) => {
      const matchesSearch =
        customer.name.toLowerCase().includes(normalizedSearch) ||
        (customer.phone_number &&
          customer.phone_number.toLowerCase().includes(normalizedSearch)) ||
        (customer.locations || []).some(
          (location: CustomerLocationSummary) =>
            (location.site || "").toLowerCase().includes(normalizedSearch) ||
            location.address.toLowerCase().includes(normalizedSearch)
        );

      // Using has_active_rental for filtering active/inactive status
      const matchesStatus = showInactive ? true : customer.has_active_rental;

      return matchesSearch && matchesStatus;
    });
  }, [customers, searchTerm, showInactive]);

  const getSignupLocations = (signup: Signup): SignupLocation[] => {
    if (Array.isArray(signup.locations) && signup.locations.length > 0) {
      return signup.locations;
    }
    return signup.address
      ? [{ site: "", address: signup.address }]
      : [];
  };

  return (
    <div className="space-y-5 pb-6">
      <header className="rounded-xl border border-default-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <IconUsers size={23} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-default-900 dark:text-gray-100">
                Green Target Customers
              </h1>
              <p className="text-sm text-default-500 dark:text-gray-400">
                Review signup requests and manage customer service sites.
              </p>
            </div>
          </div>
          <Button
            onClick={(): void => navigate("/greentarget/customers/new")}
            icon={IconPlus}
            variant="outline"
            color="sky"
          >
            Add Customer
          </Button>
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border border-default-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col gap-3 border-b border-default-200 px-4 pt-4 dark:border-gray-700 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-default-900 dark:text-gray-100">
                Signup requests
              </h2>
              <p className="text-sm text-default-500 dark:text-gray-400">
                Customer-submitted registrations awaiting staff review.
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              {signups.length} {activeSignupTab}
            </span>
          </div>
          <div className="flex gap-1 overflow-x-auto overflow-y-hidden pb-px">
            {SIGNUP_TABS.map((tab: { key: StatusTab; label: string }) => (
              <button
                key={tab.key}
                type="button"
                onClick={(): void => setActiveSignupTab(tab.key)}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeSignupTab === tab.key
                    ? "border-emerald-600 text-emerald-700 dark:text-emerald-300"
                    : "border-transparent text-default-500 hover:text-default-800 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {signupsLoading ? (
            <div className="flex w-full items-center justify-center py-10">
              <LoadingSpinner />
            </div>
          ) : signups.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-default-200 py-10 text-center dark:border-gray-700">
              <IconUserPlus size={28} className="mx-auto text-default-400" />
              <p className="mt-2 text-sm text-default-500 dark:text-gray-400">
                No {activeSignupTab} signup requests.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {signups.map((signup: Signup) => {
                const signupLocations: SignupLocation[] =
                  getSignupLocations(signup);
                return (
                  <article
                    key={signup.signup_id}
                    className="rounded-xl border border-default-200 bg-default-50/50 p-4 dark:border-gray-700 dark:bg-gray-900/20"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-default-900 dark:text-gray-100">
                            {signup.name}
                          </h3>
                          {signup.einvoice_requested && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                              <IconFileInvoice size={13} /> e-Invoice verified
                            </span>
                          )}
                        </div>
                        <div className="mt-2 grid gap-1.5 text-sm text-default-600 dark:text-gray-300 sm:grid-cols-2">
                          <div className="flex items-center gap-2">
                            <IconId size={16} className="text-default-400" />
                            <span className="truncate">{signup.id_number || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <IconPhone size={16} className="text-default-400" />
                            <span>{signup.phone_number || "—"}</span>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {signupLocations.map(
                            (location: SignupLocation, index: number) => (
                              <div
                                key={`${location.site}-${location.address}-${index}`}
                                className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-gray-800"
                              >
                                <IconMapPin
                                  size={16}
                                  className="mt-0.5 shrink-0 text-emerald-600"
                                />
                                <div className="min-w-0">
                                  <span className="font-semibold text-default-800 dark:text-gray-100">
                                    {location.site || "Site not set"}
                                  </span>
                                  <span className="text-default-500 dark:text-gray-400">
                                    {` — ${location.address}`}
                                  </span>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            {PAYMENT_LABELS[signup.payment_method]}
                          </span>
                          <span className="text-xs text-default-400">
                            {formatSignupDate(signup.submitted_at)}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                        {signup.status === "pending" && (
                          <>
                            <Button
                              onClick={(): void => setSignupToConvert(signup)}
                              icon={IconUserPlus}
                              variant="outline"
                              color="sky"
                              size="sm"
                            >
                              Create
                            </Button>
                            <Button
                              onClick={(): void => setSignupToReject(signup)}
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
                            onClick={(): void =>
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
                          <>
                            <Button
                              onClick={(): Promise<void> =>
                                handleRestore(signup)
                              }
                              icon={IconRotateClockwise}
                              variant="outline"
                              size="sm"
                            >
                              Restore
                            </Button>
                            <Button
                              onClick={(): void => setSignupToDelete(signup)}
                              icon={IconTrash}
                              variant="outline"
                              color="rose"
                              size="sm"
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="rounded-xl border border-default-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold text-default-900 dark:text-gray-100">
                Customers ({filteredCustomers.length})
              </h2>
              <p className="text-sm text-default-500 dark:text-gray-400">
                Search by customer, phone, site or address.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Checkbox
                checked={showInactive}
                onChange={setShowInactive}
                label="Show inactive"
                checkedColor="text-emerald-600 dark:text-emerald-400"
              />
              <div className="relative min-w-0 sm:w-80">
                <IconSearch
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-default-400"
                  size={19}
                />
                <input
                  type="search"
                  placeholder="Search customers or sites"
                  className="h-10 w-full rounded-lg border border-default-300 bg-white pl-10 pr-3 text-sm text-default-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-100"
                  value={searchTerm}
                  onChange={(event): void => setSearchTerm(event.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex w-full items-center justify-center rounded-xl border border-default-200 bg-white py-12 dark:border-gray-700 dark:bg-gray-800">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300">
            {error}
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-default-200 bg-white py-12 text-center dark:border-gray-700 dark:bg-gray-800">
            <IconUsers size={30} className="mx-auto text-default-400" />
            <p className="mt-2 text-sm text-default-500 dark:text-gray-400">
              No customers match these filters.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-default-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="max-h-[calc(100vh-220px)] overflow-auto">
              <table className="min-w-[900px] w-full divide-y divide-default-200 dark:divide-gray-700">
                <thead className="sticky top-0 z-10 bg-default-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                      Sites
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                      Last Activity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-default-500 dark:text-gray-400">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default-100 dark:divide-gray-700">
                  {filteredCustomers.map((customer: Customer) => (
                    <tr
                      key={customer.customer_id}
                      onClick={(): void =>
                        navigate(`/greentarget/customers/${customer.customer_id}`)
                      }
                      className="cursor-pointer transition-colors hover:bg-default-50 dark:hover:bg-gray-700/60"
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-default-900 dark:text-gray-100">
                          {customer.name}
                        </div>
                        <div className="text-xs text-default-400">
                          Customer #{customer.customer_id}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-sm flex-wrap gap-1.5">
                          {(customer.locations || []).slice(0, 2).map(
                            (location: CustomerLocationSummary) => (
                              <span
                                key={location.location_id}
                                title={location.address}
                                className="max-w-[150px] truncate rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                              >
                                {location.site || "Site not set"}
                              </span>
                            )
                          )}
                          {(customer.locations || []).length > 2 && (
                            <span className="rounded-full bg-default-100 px-2 py-1 text-xs text-default-500 dark:bg-gray-700 dark:text-gray-300">
                              +{customer.locations.length - 2}
                            </span>
                          )}
                          {(customer.locations || []).length === 0 && (
                            <span className="text-xs text-default-400">No locations</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-default-600 dark:text-gray-300">
                        {customer.phone_number || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-default-600 dark:text-gray-300">
                        {formatDate(customer.last_activity_date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            customer.has_active_rental
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {customer.has_active_rental ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Button
                          onClick={(event: MouseEvent<HTMLButtonElement>): void => {
                            event.stopPropagation();
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
      </section>

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
        message={`Create a new Green Target customer from "${signupToConvert?.name}" with ${
          signupToConvert ? getSignupLocations(signupToConvert).length : 0
        } service location(s)?`}
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

      <ConfirmationDialog
        isOpen={!!signupToDelete}
        onClose={(): void => setSignupToDelete(null)}
        onConfirm={handleConfirmSignupDelete}
        title="Delete Rejected Signup"
        message={`Permanently delete the rejected signup from "${signupToDelete?.name}"? This action cannot be undone.`}
        confirmButtonText={processingSignup ? "Deleting..." : "Delete"}
        variant="danger"
      />
    </div>
  );
};

export default CustomerListPage;
