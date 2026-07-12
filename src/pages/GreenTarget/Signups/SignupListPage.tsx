// src/pages/GreenTarget/Signups/SignupListPage.tsx
// Staff review queue for public Green Target customer signup submissions.
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
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

type StatusTab = "pending" | "processed" | "rejected";

const PAYMENT_LABELS: Record<Signup["payment_method"], string> = {
  cash: "Cash",
  online: "Online Transfer",
  qr: "QR",
};

const SignupListPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StatusTab>("pending");
  const [signupToConvert, setSignupToConvert] = useState<Signup | null>(null);
  const [signupToReject, setSignupToReject] = useState<Signup | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchSignups = useCallback(async () => {
    try {
      setLoading(true);
      const data = await greenTargetApi.getCustomerSignups(activeTab);
      setSignups(data);
    } catch (err) {
      console.error("Error fetching signups:", err);
      toast.error("Failed to fetch signups. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchSignups();
  }, [fetchSignups]);

  const handleConfirmConvert = async () => {
    if (!signupToConvert) return;
    try {
      setProcessing(true);
      const response = await greenTargetApi.convertCustomerSignup(
        signupToConvert.signup_id,
        user?.id
      );
      toast.success("Customer created successfully");
      setSignupToConvert(null);
      navigate(`/greentarget/customers/${response.customer.customer_id}`);
    } catch (err: any) {
      if (err?.status === 409) {
        toast.error("This signup has already been processed.");
        fetchSignups();
      } else {
        toast.error("Failed to create customer. Please try again.");
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!signupToReject) return;
    try {
      setProcessing(true);
      await greenTargetApi.updateCustomerSignupStatus(
        signupToReject.signup_id,
        "rejected"
      );
      toast.success("Signup rejected");
      setSignupToReject(null);
      fetchSignups();
    } catch (err) {
      toast.error("Failed to reject signup. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const handleRestore = async (signup: Signup) => {
    try {
      await greenTargetApi.updateCustomerSignupStatus(
        signup.signup_id,
        "pending"
      );
      toast.success("Signup restored to pending");
      fetchSignups();
    } catch (err) {
      toast.error("Failed to restore signup. Please try again.");
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${date.getFullYear()} ${date
      .getHours()
      .toString()
      .padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  };

  const tabs: { key: StatusTab; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "processed", label: "Processed" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-default-700 dark:text-gray-200 font-bold">
          Signup Requests ({signups.length})
        </h1>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-default-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.key
                ? "border-green-600 text-green-700 dark:text-green-400"
                : "border-transparent text-default-500 dark:text-gray-400 hover:text-default-700 dark:hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-20 w-full flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : signups.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-default-500 dark:text-gray-400">
            No {activeTab} signups.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {signups.map((signup) => (
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
                      {formatDate(signup.submitted_at)}
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

      <ConfirmationDialog
        isOpen={!!signupToConvert}
        onClose={() => setSignupToConvert(null)}
        onConfirm={handleConfirmConvert}
        title="Create Customer"
        message={`Create a new Green Target customer from "${signupToConvert?.name}"? This will add them to the customer list${
          signupToConvert?.address ? " along with their address" : ""
        }.`}
        confirmButtonText={processing ? "Creating..." : "Create Customer"}
        variant="default"
      />

      <ConfirmationDialog
        isOpen={!!signupToReject}
        onClose={() => setSignupToReject(null)}
        onConfirm={handleConfirmReject}
        title="Reject Signup"
        message={`Reject the signup from "${signupToReject?.name}"? You can restore it later from the Rejected tab.`}
        confirmButtonText={processing ? "Rejecting..." : "Reject"}
        variant="danger"
      />
    </div>
  );
};

export default SignupListPage;
