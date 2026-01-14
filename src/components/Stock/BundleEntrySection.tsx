// src/components/Stock/BundleEntrySection.tsx
import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import WorkerEntryGrid from "./WorkerEntryGrid";
import { ProductionEntry, ProductionWorker } from "../../types/types";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import { getBundleItems } from "../../config/specialItems";

interface BundleEntrySectionProps {
  selectedDate: string;
  initialTab?: BundleTab;
}

export interface BundleEntrySectionHandle {
  hasUnsavedChanges: () => boolean;
}

type BundleTab = "BUNDLE_BP" | "BUNDLE_BH" | "BUNDLE_MEE";

const TAB_CONFIG: Record<
  BundleTab,
  {
    label: string;
    shortLabel: string;
    description: string;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  BUNDLE_BP: {
    label: "Best Partner",
    shortLabel: "BP",
    description: "Bundle for Best Partner customer",
    color: "text-emerald-700 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/40",
    borderColor: "border-emerald-500",
  },
  BUNDLE_BH: {
    label: "Bihun Bundle",
    shortLabel: "BH",
    description: "General bihun bundle",
    color: "text-blue-700 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/40",
    borderColor: "border-blue-500",
  },
  BUNDLE_MEE: {
    label: "Mee Bundle",
    shortLabel: "MEE",
    description: "General mee bundle",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/40",
    borderColor: "border-green-500",
  },
};

const BundleEntrySection = forwardRef<BundleEntrySectionHandle, BundleEntrySectionProps>(({
  selectedDate,
  initialTab = "BUNDLE_BP",
}, ref) => {
  // Get bundle configs
  const bundleItems = getBundleItems();
  const bundleConfigMap = useMemo(() => {
    const map: Record<string, (typeof bundleItems)[0]> = {};
    bundleItems.forEach((item) => {
      map[item.id] = item;
    });
    return map;
  }, [bundleItems]);

  // State
  const [activeTab, setActiveTab] = useState<BundleTab>(initialTab);

  // Sync activeTab when initialTab prop changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const [entries, setEntries] = useState<
    Record<BundleTab, Record<string, number>>
  >({
    BUNDLE_BP: {},
    BUNDLE_BH: {},
    BUNDLE_MEE: {},
  });
  const [originalEntries, setOriginalEntries] = useState<
    Record<BundleTab, Record<string, number>>
  >({
    BUNDLE_BP: {},
    BUNDLE_BH: {},
    BUNDLE_MEE: {},
  });
  const [isSaving, setIsSaving] = useState(false);

  // Get staffs cache
  const { staffs, loading: isLoadingWorkers } = useStaffsCache();

  // Filter workers based on active tab
  const workers: ProductionWorker[] = useMemo(() => {
    const config = bundleConfigMap[activeTab];
    if (!config) return [];

    const jobFilter = config.workerJob;
    return staffs
      .filter((staff) => staff.job.includes(jobFilter))
      .map((staff) => ({
        id: staff.id,
        name: staff.name,
        job: staff.job,
      }));
  }, [staffs, activeTab, bundleConfigMap]);

  // Check for unsaved changes (current tab only)
  const hasUnsavedChanges = useMemo(() => {
    const currentEntries = entries[activeTab];
    const originalCurrentEntries = originalEntries[activeTab];

    const currentKeys = Object.keys(currentEntries);
    const originalKeys = Object.keys(originalCurrentEntries);

    if (currentKeys.length !== originalKeys.length) return true;

    for (const key of currentKeys) {
      if (currentEntries[key] !== originalCurrentEntries[key]) return true;
    }

    return false;
  }, [entries, originalEntries, activeTab]);

  // Check for any unsaved changes across all tabs
  const hasAnyUnsavedChanges = useMemo(() => {
    for (const tab of Object.keys(entries) as BundleTab[]) {
      const currentEntries = entries[tab];
      const originalCurrentEntries = originalEntries[tab];

      const currentKeys = Object.keys(currentEntries);
      const originalKeys = Object.keys(originalCurrentEntries);

      if (currentKeys.length !== originalKeys.length) return true;

      for (const key of currentKeys) {
        if (currentEntries[key] !== originalCurrentEntries[key]) return true;
      }
    }
    return false;
  }, [entries, originalEntries]);

  // Expose hasUnsavedChanges to parent via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => hasAnyUnsavedChanges,
  }), [hasAnyUnsavedChanges]);

  // Fetch existing entries when date changes
  useEffect(() => {
    const fetchExistingEntries = async () => {
      if (!selectedDate) return;

      const newEntries: Record<BundleTab, Record<string, number>> = {
        BUNDLE_BP: {},
        BUNDLE_BH: {},
        BUNDLE_MEE: {},
      };

      try {
        for (const bundleId of Object.keys(TAB_CONFIG) as BundleTab[]) {
          const response = await api.get(
            `/api/production-entries?date=${selectedDate}&product_id=${bundleId}`
          );

          const entriesMap: Record<string, number> = {};
          (response || []).forEach((entry: ProductionEntry) => {
            entriesMap[entry.worker_id] = Number(entry.bags_packed) || 0;
          });
          newEntries[bundleId] = entriesMap;
        }

        setEntries(newEntries);
        setOriginalEntries(JSON.parse(JSON.stringify(newEntries)));
      } catch (error) {
        console.error("Error fetching bundle entries:", error);
        setEntries({
          BUNDLE_BP: {},
          BUNDLE_BH: {},
          BUNDLE_MEE: {},
        });
        setOriginalEntries({
          BUNDLE_BP: {},
          BUNDLE_BH: {},
          BUNDLE_MEE: {},
        });
      }
    };

    fetchExistingEntries();
  }, [selectedDate]);

  // Handle entry change
  const handleEntryChange = useCallback(
    (workerId: string, value: number) => {
      setEntries((prev) => {
        const newTabEntries = { ...prev[activeTab] };
        if (value === 0) {
          delete newTabEntries[workerId];
        } else {
          newTabEntries[workerId] = value;
        }
        return {
          ...prev,
          [activeTab]: newTabEntries,
        };
      });
    },
    [activeTab]
  );

  // Handle save (current tab only)
  const handleSave = async () => {
    if (!selectedDate) {
      toast.error("Please select a date first");
      return;
    }

    const config = bundleConfigMap[activeTab];
    if (!config) {
      toast.error("Configuration error");
      return;
    }

    setIsSaving(true);
    try {
      const currentEntries = entries[activeTab];
      const entriesArray = Object.entries(currentEntries).map(
        ([worker_id, bags_packed]) => ({
          worker_id,
          bags_packed,
        })
      );

      // Include workers with 0 to clear old entries
      workers.forEach((worker) => {
        if (!currentEntries[worker.id]) {
          entriesArray.push({
            worker_id: worker.id,
            bags_packed: 0,
          });
        }
      });

      const response = await api.post("/api/production-entries/batch", {
        date: selectedDate,
        product_id: activeTab,
        entries: entriesArray,
      });

      toast.success(
        `${TAB_CONFIG[activeTab].label} saved: ${response.total_bags} total from ${response.entry_count} workers`
      );

      // Update original entries for this tab
      setOriginalEntries((prev) => ({
        ...prev,
        [activeTab]: { ...currentEntries },
      }));
    } catch (error) {
      console.error("Error saving bundle entries:", error);
      toast.error("Failed to save entries");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset (current tab only)
  const handleReset = () => {
    setEntries((prev) => ({
      ...prev,
      [activeTab]: { ...originalEntries[activeTab] },
    }));
  };

  // Get active config
  const activeConfig = bundleConfigMap[activeTab];

  return (
    <>
      {/* Worker Grid */}
      {activeConfig && (
        <WorkerEntryGrid
          workers={workers}
          entries={entries[activeTab]}
          onEntryChange={handleEntryChange}
          isLoading={isLoadingWorkers}
          disabled={isSaving}
          inputStep={activeConfig.inputStep}
          unitLabel={activeConfig.unit}
          defaultValue={activeConfig.defaultValue}
          onSave={handleSave}
          onReset={handleReset}
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={isSaving}
        />
      )}

      {/* Summary across all tabs */}
      {hasAnyUnsavedChanges && (
        <div className="mx-4 mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            You have unsaved changes in one or more bundle tabs. Save each tab
            individually.
          </p>
        </div>
      )}
    </>
  );
});

BundleEntrySection.displayName = "BundleEntrySection";

export default BundleEntrySection;
