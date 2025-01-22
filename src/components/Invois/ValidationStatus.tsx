import React from "react";
import { IconCheck, IconLoader2 } from "@tabler/icons-react";

interface ValidationStatusProps {
  phase:
    | "INITIALIZATION"
    | "VALIDATION"
    | "SUBMISSION"
    | "CONFIRMATION"
    | "COOLDOWN"
    | null;
  totalInvoices?: number;
}

const ValidationStatus: React.FC<ValidationStatusProps> = ({
  phase,
  totalInvoices = 0,
}) => {
  const phases = [
    {
      id: "INITIALIZATION",
      label: "Preparing Submission",
      sublabel: `Preparing ${totalInvoices} invoice(s)...`,
    },
    {
      id: "VALIDATION",
      label: "Validating Invoice Data",
      sublabel: "Checking format and contents...",
    },
    {
      id: "SUBMISSION",
      label: "Submitting to MyInvois",
      sublabel: "Processing submission...",
    },
    {
      id: "CONFIRMATION",
      label: "Confirming Submission",
      sublabel: "Verifying status...",
    },
  ];

  const currentPhaseIndex = phases.findIndex((p) => p.id === phase);

  return (
    <div className="absolute inset-x-0 top-0 bg-white rounded-b-xl z-10 border border-default-200 shadow-lg h-[250px]">
      <div className="h-full flex items-center justify-center py-4">
        <div className="w-full px-8">
          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-1 mb-6">
            <div
              className="bg-sky-500 h-1 rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(
                  5,
                  phase ? (currentPhaseIndex + 1) * 25 : 0
                )}%`,
              }}
            />
          </div>

          {/* Phase steps */}
          <div className="space-y-4">
            {phases.map((p, index) => {
              const isComplete = currentPhaseIndex > index;
              const isCurrent = currentPhaseIndex === index;

              return (
                <div key={p.id} className="flex items-start space-x-4">
                  <div className="flex-shrink-0 mt-0.5">
                    {isComplete ? (
                      <div className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
                        <IconCheck
                          size={14}
                          className="text-white"
                          stroke={2.5}
                        />
                      </div>
                    ) : isCurrent ? (
                      <div className="w-5 h-5 flex items-center justify-center">
                        <IconLoader2
                          size={20}
                          className="text-sky-500 animate-spin"
                          stroke={1.5}
                        />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-gray-200" />
                    )}
                  </div>
                  <div className="-mt-0.5">
                    <p
                      className={`font-medium ${
                        isCurrent
                          ? "text-sky-500"
                          : isComplete
                          ? "text-gray-900"
                          : "text-gray-400"
                      }`}
                    >
                      {p.label}
                    </p>
                    {isCurrent && (
                      <p className="text-sm text-gray-500 mt-0.5">
                        {p.sublabel}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ValidationStatus;
