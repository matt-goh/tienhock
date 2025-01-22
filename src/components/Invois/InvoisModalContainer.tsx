import React from "react";
import { IconX } from "@tabler/icons-react";
import { StatusIndicator } from "../StatusIndicator";
import LoadingSpinner from "../../components/LoadingSpinner";
import { LoginResponse, SubmissionResponse } from "../../types/types";
import SuccessDisplay from "./SuccessDisplay";

interface InvoisModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  loginResponse: LoginResponse | null;
  children: React.ReactNode;
  submissionResponse: SubmissionResponse | null;
  handleClose: () => void;
}

const InvoisModalContainer: React.FC<InvoisModalContainerProps> = ({
  isOpen,
  onClose,
  loginResponse,
  children,
  submissionResponse,
  handleClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-14 w-[450px] bg-white rounded-xl shadow-xl border border-default-200 z-50">
      {submissionResponse?.success ? (
        <SuccessDisplay response={submissionResponse} onClose={handleClose} />
      ) : (
        <>
          {/* Fixed Header */}
          <div className="flex items-center justify-between p-4 border-b border-default-200">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-default-900">
                Submit to MyInvois
              </h2>
              {loginResponse && (
                <StatusIndicator success={loginResponse.success} />
              )}
            </div>
            <button
              onClick={onClose}
              className="text-default-500 hover:text-default-700 transition-colors"
            >
              <IconX size={20} />
            </button>
          </div>

          {/* Content with relative positioning */}
          <div className="relative min-h-[200px]">
            {!loginResponse ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <LoadingSpinner hideText />
                  <p className="mt-2 text-default-600">
                    Connecting to MyInvois API...
                  </p>
                </div>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
                <div className="p-4">{children}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default InvoisModalContainer;
