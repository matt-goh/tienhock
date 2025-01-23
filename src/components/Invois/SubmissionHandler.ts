// src/components/einvoice/SubmissionHandler.ts
import {
  SubmissionTracker,
  InitialSubmissionResponse,
  ProcessingStatusResponse,
  DocumentStatus,
  BatchStatistics,
  ValidationDetail,
  SubmissionState,
  DocumentSummaryStatus,
} from "../../types/types";

export class SubmissionHandler {
  private tracker: SubmissionTracker;
  private updateCallback: (state: SubmissionState) => void;
  private pollingInterval: NodeJS.Timer | null = null;

  constructor(
    batchSize: number,
    updateCallback: (state: SubmissionState) => void
  ) {
    this.updateCallback = updateCallback;
    this.tracker = {
      submissionUid: "",
      batchInfo: {
        size: batchSize,
        submittedAt: new Date().toISOString(),
      },
      statistics: {
        totalDocuments: batchSize,
        processed: 0,
        accepted: 0,
        rejected: 0,
        processing: 0,
        completed: 0,
      },
      documents: {},
      processingUpdates: [],
      overallStatus: "InProgress",
    };
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private updateState(
    phase: SubmissionState["phase"],
    error?: {
      type: "VALIDATION" | "SYSTEM" | "API";
      message: string;
      details?: any;
    }
  ) {
    this.updateCallback({
      phase,
      tracker: this.tracker,
      ...(error && { error }),
    });
  }

  private updateStatistics() {
    const stats: BatchStatistics = {
      totalDocuments: this.tracker.batchInfo.size,
      processed: 0,
      accepted: 0,
      rejected: 0,
      processing: 0,
      completed: 0,
    };

    Object.values(this.tracker.documents).forEach((doc) => {
      switch (doc.currentStatus) {
        case "ACCEPTED":
          stats.accepted++;
          stats.processed++;
          break;
        case "REJECTED":
          stats.rejected++;
          stats.processed++;
          break;
        case "PROCESSING":
          stats.processing++;
          stats.processed++;
          break;
        case "COMPLETED":
          stats.completed++;
          stats.processed++;
          break;
        case "FAILED":
          stats.rejected++;
          stats.processed++;
          break;
      }
    });

    this.tracker.statistics = stats;

    // Update overall status based on statistics
    if (stats.processed === stats.totalDocuments) {
      if (stats.completed === stats.totalDocuments) {
        this.tracker.overallStatus = "Valid";
      } else if (stats.rejected === stats.totalDocuments) {
        this.tracker.overallStatus = "Invalid";
      } else {
        this.tracker.overallStatus = "Partial";
      }
    }
  }

  private updateDocumentStatus(
    invoiceNo: string,
    status: DocumentStatus["currentStatus"],
    details?: {
      uuid?: string;
      errors?: ValidationDetail[];
      summary?: DocumentSummaryStatus;
    }
  ) {
    const timestamp = new Date().toISOString();
    const existingDoc = this.tracker.documents[invoiceNo] || {
      invoiceNo,
      currentStatus: status,
      history: [],
    };

    const historyEntry = {
      timestamp,
      status,
      details,
    };

    this.tracker.documents[invoiceNo] = {
      ...existingDoc,
      currentStatus: status,
      uuid: details?.uuid || existingDoc.uuid,
      errors: details?.errors || existingDoc.errors,
      summary: details?.summary || existingDoc.summary,
    };

    this.updateStatistics();
  }

  private processValidationErrors(error: any, invoiceNo: string) {
    const errors: ValidationDetail[] = [];

    // Process nested error details
    if (error.details && Array.isArray(error.details)) {
      error.details.forEach((detail: any) => {
        errors.push({
          code: detail.code,
          message: detail.message,
          target: detail.target,
          propertyPath: detail.propertyPath,
        });
      });
    } else if (error.message) {
      // Handle simple error message
      errors.push({
        code: error.code || "ERR",
        message: error.message,
      });
    }

    return errors;
  }

  handleInitialResponse(response: InitialSubmissionResponse) {
    this.tracker.submissionUid = response.submissionUid;
    this.tracker.initialResponse = response;

    if (response.rejectedDocuments.length === this.tracker.batchInfo.size) {
      this.tracker.overallStatus = "Invalid";
      this.tracker.batchInfo.completedAt = new Date().toISOString();
      this.updateState("COMPLETED");
    }

    if (
      response.acceptedDocuments.length === 0 &&
      response.rejectedDocuments.length > 0
    ) {
      response.rejectedDocuments.forEach((doc) => {
        const errors = this.processValidationErrors(
          doc.error,
          doc.invoiceCodeNumber
        );
        this.updateDocumentStatus(doc.invoiceCodeNumber, "REJECTED", {
          errors,
        });
      });

      // Explicitly set overall status to Invalid
      this.tracker.overallStatus = "Invalid";
      this.tracker.batchInfo.completedAt = new Date().toISOString();
      this.updateState("COMPLETED");
      return;
    }

    // Process accepted documents
    response.acceptedDocuments.forEach((doc) => {
      this.updateDocumentStatus(doc.invoiceCodeNumber, "ACCEPTED", {
        uuid: doc.uuid,
      });
    });

    // Process rejected documents
    response.rejectedDocuments.forEach((doc) => {
      const errors = this.processValidationErrors(
        doc.error,
        doc.invoiceCodeNumber
      );
      this.updateDocumentStatus(doc.invoiceCodeNumber, "REJECTED", {
        errors,
      });
    });

    // Update state
    if (response.acceptedDocuments.length > 0) {
      this.updateState("SUBMISSION");
    } else {
      // If all documents were rejected in validation
      this.tracker.overallStatus = "Invalid";
      this.tracker.batchInfo.completedAt = new Date().toISOString();
      this.updateState("COMPLETED");
    }
  }

  handleProcessingUpdate(response: ProcessingStatusResponse) {
    const timestamp = new Date().toISOString();

    this.tracker.processingUpdates.push({
      timestamp,
      status: response,
      // Filter out undefined values and ensure string type
      affectedDocuments: response.documentSummary
        .map((doc) => doc.internalId)
        .filter((id): id is string => id !== undefined),
    });

    // Update status for each document in the summary
    response.documentSummary.forEach((doc) => {
      if (doc.internalId) {
        // Only process if internalId exists
        const status = this.mapApiStatus(doc.status);
        this.updateDocumentStatus(doc.internalId, status, { summary: doc });
      }
    });

    // Update overall status
    this.tracker.overallStatus = response.overallStatus;

    // If we have a final status, mark as complete
    if (response.overallStatus !== "InProgress") {
      this.tracker.finalStatus = response;
      this.tracker.batchInfo.completedAt = timestamp;
      this.updateState("COMPLETED");
      this.stopPolling();
    } else {
      this.updateState("PROCESSING");
    }
  }

  handleError(error: any, phase: SubmissionState["phase"]) {
    const errorDetails = {
      type: "API" as const,
      message: error.message || "An error occurred during submission",
      details: error,
    };

    this.updateState(phase, errorDetails);
    this.stopPolling();
  }

  private mapApiStatus(
    apiStatus: DocumentSummaryStatus["status"]
  ): DocumentStatus["currentStatus"] {
    switch (apiStatus) {
      case "Submitted":
        return "PROCESSING";
      case "Valid":
        return "COMPLETED";
      case "Invalid":
      case "Rejected":
        return "FAILED";
      default:
        return "PROCESSING";
    }
  }

  getState(): SubmissionState {
    return {
      phase: this.tracker.finalStatus ? "COMPLETED" : "PROCESSING",
      tracker: this.tracker,
    };
  }

  getCurrentStatistics(): BatchStatistics {
    return this.tracker.statistics;
  }

  getDocumentStatuses() {
    return this.tracker.documents;
  }

  cleanup() {
    this.stopPolling();
  }
}

export const createSubmissionHandler = (
  batchSize: number,
  updateCallback: (state: SubmissionState) => void
) => {
  return new SubmissionHandler(batchSize, updateCallback);
};
