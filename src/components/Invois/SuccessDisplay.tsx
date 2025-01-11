import { SubmissionResponse } from "../../types/types";
import { IconCheck } from "@tabler/icons-react";
import Button from "../Button";

const SuccessDisplay: React.FC<{
  response: SubmissionResponse;
  onClose: () => void;
}> = ({ response, onClose }) => {
  const formatDateTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col max-h-[600px]">
      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center gap-3 text-green-600">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <IconCheck size={24} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-green-700">
              Submission Successful
            </h2>
            <p className="text-green-600">{response.message}</p>
          </div>
        </div>

        {response.submissionInfo && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-green-700">
                  Submission ID
                </p>
                <p
                  className="text-green-600 truncate"
                  title={response.submissionInfo.submissionUid}
                >
                  {response.submissionInfo.submissionUid}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-green-700">Status</p>
                <p className="text-green-600">
                  {response.submissionInfo.overallStatus}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-green-700">Documents</p>
                <p className="text-green-600">
                  {response.acceptedDocuments.length}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-green-700">Received</p>
                <p className="text-green-600">
                  {formatDateTime(response.submissionInfo.dateTimeReceived)}
                </p>
              </div>
            </div>
          </div>
        )}

        {response.acceptedDocuments?.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium text-green-700">Accepted Documents</h3>
            <div className="space-y-2">
              {response.acceptedDocuments.map((doc) => (
                <div
                  key={doc.uuid}
                  className="bg-green-50 border border-green-300 p-3 rounded-lg"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-green-700">
                      #{doc.internalId}
                    </span>
                    <span className="text-green-600 text-sm">{doc.status}</span>
                  </div>
                  <div className="text-sm text-green-600 space-y-1">
                    <p className="font-mono">{doc.uuid}</p>
                    <p>{formatDateTime(doc.dateTimeValidated)}</p>
                    <p>Amount: RM {doc.totalPayableAmount.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-default-200">
        <Button
          onClick={onClose}
          className="w-full justify-center"
          variant="outline"
        >
          Done
        </Button>
      </div>
    </div>
  );
};

export default SuccessDisplay;
