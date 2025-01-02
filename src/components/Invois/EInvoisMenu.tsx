import { useEffect, useState, useCallback, useRef } from "react";
import Button from "../../components/Button";
import toast from "react-hot-toast";
import { IconFileInvoice, IconCalendar, IconPlug } from "@tabler/icons-react";
import { InvoiceData } from "../../types/types";
import { api } from "../../routes/utils/api";

interface TokenInfo {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  apiEndpoint: string;
  tokenInfo?: TokenInfo;
  tokenCreationTime?: number;
  error?: string;
  details?: any;
}

interface SubmissionInfo {
  startDate: Date;
  endDate: Date;
  selectedInvoices: InvoiceData[];
}

interface SubmissionResponse {
  message: string;
  submissionUid: string;
  success: boolean;
}

interface EInvoisMenuProps {
  selectedInvoices: InvoiceData[];
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
}

const ApiStatusDisplay: React.FC<{ loginResponse: LoginResponse }> = ({
  loginResponse,
}) => (
  <div className="flex items-center gap-2 p-4 rounded border">
    <IconPlug
      size={20}
      className={loginResponse.success ? "text-green-600" : "text-red-600"}
    />
    <div className="flex-1">
      <p
        className={`font-medium ${
          loginResponse.success ? "text-green-600" : "text-red-600"
        }`}
      >
        {loginResponse.message}
      </p>
      <p className="text-sm text-default-600">
        API Endpoint: {loginResponse.apiEndpoint}
      </p>
      {loginResponse.error && (
        <p className="text-sm text-red-600 mt-1">{loginResponse.error}</p>
      )}
    </div>
  </div>
);

const SubmissionInfoDisplay: React.FC<{ info: SubmissionInfo }> = ({
  info,
}) => (
  <div className="mt-4 p-4 bg-default-100 border border-default-400 rounded">
    <h2 className="font-bold text-default-800 mb-2">Submission Information:</h2>
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <IconCalendar size={18} className="text-default-500" />
        <div>
          <p className="text-sm text-default-600">Date Range:</p>
          <p className="font-medium">
            {formatDate(info.startDate)} - {formatDate(info.endDate)}
          </p>
        </div>
      </div>
      <div>
        <p className="text-sm text-default-600">Selected Invoices:</p>
        <p className="font-medium">{info.selectedInvoices.length} invoice(s)</p>
      </div>
      {info.selectedInvoices.length > 0 && (
        <div>
          <p className="text-sm text-default-600">Total Amount:</p>
          <p className="font-medium">
            RM{" "}
            {info.selectedInvoices
              .reduce(
                (sum, invoice) => sum + parseFloat(invoice.totalAmount),
                0
              )
              .toFixed(2)}
          </p>
        </div>
      )}
    </div>
  </div>
);

const SubmissionResult: React.FC<{ response: SubmissionResponse }> = ({
  response,
}) => (
  <div className="mt-4 p-4 bg-green-100 border border-green-400 rounded">
    <h3 className="font-bold text-green-800">Submission Details</h3>
    <p>Message: {response.message}</p>
    <p>Submission ID: {response.submissionUid}</p>
  </div>
);

const formatDate = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const EInvoisMenu: React.FC<EInvoisMenuProps> = ({
  selectedInvoices,
  dateRange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(
    null
  );
  const [submissionResponse, setSubmissionResponse] =
    useState<SubmissionResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const submissionInfo: SubmissionInfo = {
    startDate: dateRange.start || new Date(),
    endDate: dateRange.end || new Date(),
    selectedInvoices: selectedInvoices,
  };

  const isTokenValid = useCallback((loginData: LoginResponse): boolean => {
    if (!loginData.tokenInfo || !loginData.tokenCreationTime) return false;
    const expirationTime =
      loginData.tokenCreationTime + loginData.tokenInfo.expiresIn * 1000;
    return Date.now() < expirationTime;
  }, []);

  const connectToMyInvois = useCallback(async () => {
    const storedLoginData = localStorage.getItem("myInvoisLoginData");
    if (storedLoginData) {
      const parsedData = JSON.parse(storedLoginData);
      if (isTokenValid(parsedData)) {
        setLoginResponse(parsedData);
        return;
      }
    }

    try {
      const data = await api.post("/api/einvoice/login");
      if (data.success && data.tokenInfo) {
        const loginDataWithTime = {
          ...data,
          tokenCreationTime: Date.now(),
        };
        localStorage.setItem(
          "myInvoisLoginData",
          JSON.stringify(loginDataWithTime)
        );
        setLoginResponse(loginDataWithTime);
      } else {
        setLoginResponse(data);
      }
    } catch (err) {
      setLoginResponse({
        success: false,
        message: "An error occurred while connecting to MyInvois API.",
        apiEndpoint: "Unknown",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [isTokenValid]);

  useEffect(() => {
    if (isOpen) {
      connectToMyInvois();
    }
  }, [isOpen, connectToMyInvois]);

  useEffect(() => {
    const checkTokenValidity = () => {
      if (loginResponse && !isTokenValid(loginResponse)) {
        toast.error(
          "Your session has expired. Please refresh the page to log in again."
        );
        setLoginResponse(null);
        localStorage.removeItem("myInvoisLoginData");
      }
    };

    const intervalId = setInterval(checkTokenValidity, 60000); // Check every minute

    return () => clearInterval(intervalId);
  }, [loginResponse, isTokenValid]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSubmitInvoice = async () => {
    if (!loginResponse?.success || !isTokenValid(loginResponse)) {
      toast.error(
        "Your session has expired. Please refresh the page to log in again."
      );
      return;
    }

    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice to submit");
      return;
    }

    setIsSubmitting(true);
    setSubmissionResponse(null);

    try {
      const invoiceId = selectedInvoices[0].id;
      const data = await api.post("/api/einvoice/submit", { invoiceId });

      if (data.success) {
        toast.success(data.message);
        setSubmissionResponse(data);
      } else {
        toast.error(data.message || "Submission failed. Please try again.");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unknown error occurred during submission";
      toast.error(errorMessage);
      console.error("Submission error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        icon={IconFileInvoice}
        variant="outline"
      >
        e-Invois
      </Button>
      {isOpen && (
        <div className="absolute right-0 mt-1 w-96 bg-white rounded-lg shadow-lg z-10">
          <div className="p-4">
            <h2 className="text-xl font-bold mb-4">Submit to e-Invois</h2>

            {!loginResponse ? (
              <div className="p-4 text-default-600">
                Connecting to MyInvois API...
              </div>
            ) : (
              <>
                <ApiStatusDisplay loginResponse={loginResponse} />

                <SubmissionInfoDisplay info={submissionInfo} />

                {selectedInvoices.length === 0 ? (
                  <p className="mt-4 text-amber-600">
                    Please select invoices to submit to e-Invois
                  </p>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleSubmitInvoice}
                    disabled={isSubmitting || !loginResponse.success}
                    className="mt-4 w-full"
                  >
                    {isSubmitting
                      ? "Submitting..."
                      : "Submit Selected Invoices"}
                  </Button>
                )}

                {submissionResponse && (
                  <SubmissionResult response={submissionResponse} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EInvoisMenu;
