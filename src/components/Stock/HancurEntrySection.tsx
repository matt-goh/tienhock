// src/components/Stock/HancurEntrySection.tsx
import { useState, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import { api } from "../../routes/utils/api";
import toast from "react-hot-toast";
import WorkerEntryGrid from "./WorkerEntryGrid";
import StyledListbox from "../StyledListbox";
import Button from "../Button";
import { ProductionEntry, ProductionWorker } from "../../types/types";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import {
  getHancurItem,
  getKarungHancurItem,
} from "../../config/specialItems";
import {
  IconDeviceFloppy,
  IconRefresh,
  IconPackage,
} from "@tabler/icons-react";

interface HancurEntrySectionProps {
  selectedDate: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export interface HancurEntrySectionHandle {
  hasUnsavedChanges: () => boolean;
}

const HancurEntrySection = forwardRef<HancurEntrySectionHandle, HancurEntrySectionProps>(({
  selectedDate,
  searchQuery,
  onSearchChange,
}, ref) => {
  // Get special item configs
  const hancurConfig = getHancurItem();
  const karungConfig = getKarungHancurItem();

  // State for Bihun Hancur entries (multiple workers)
  const [hancurEntries, setHancurEntries] = useState<Record<string, number>>(
    {}
  );
  const [originalHancurEntries, setOriginalHancurEntries] = useState<
    Record<string, number>
  >({});

  // State for Karung Hancur entry (single worker)
  const [karungWorkerId, setKarungWorkerId] = useState<string>(
    karungConfig?.singleWorkerEntry?.defaultWorkerId || "RAMBU"
  );
  const [karungValue, setKarungValue] = useState<number>(0);
  const [originalKarungWorkerId, setOriginalKarungWorkerId] = useState<string>(
    karungConfig?.singleWorkerEntry?.defaultWorkerId || "RAMBU"
  );
  const [originalKarungValue, setOriginalKarungValue] = useState<number>(0);

  const [isSaving, setIsSaving] = useState(false);

  // Get staffs cache
  const { staffs, loading: isLoadingWorkers } = useStaffsCache();

  // Filter workers for BH_PACKING job
  const workers: ProductionWorker[] = useMemo(() => {
    return staffs
      .filter((staff) => staff.job.includes("BH_PACKING"))
      .map((staff) => ({
        id: staff.id,
        name: staff.name,
        job: staff.job,
      }));
  }, [staffs]);

  // Worker options for Karung Hancur dropdown
  const workerOptions = useMemo(() => {
    return workers.map((worker) => ({
      id: worker.id,
      name: `${worker.name} (${worker.id})`,
    }));
  }, [workers]);

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    // Check Hancur entries
    const hancurKeys = Object.keys(hancurEntries);
    const originalHancurKeys = Object.keys(originalHancurEntries);
    if (hancurKeys.length !== originalHancurKeys.length) return true;
    for (const key of hancurKeys) {
      if (hancurEntries[key] !== originalHancurEntries[key]) return true;
    }

    // Check Karung entry
    if (karungWorkerId !== originalKarungWorkerId) return true;
    if (karungValue !== originalKarungValue) return true;

    return false;
  }, [
    hancurEntries,
    originalHancurEntries,
    karungWorkerId,
    originalKarungWorkerId,
    karungValue,
    originalKarungValue,
  ]);

  // Expose hasUnsavedChanges to parent via ref
  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => hasUnsavedChanges,
  }), [hasUnsavedChanges]);

  // Fetch existing entries when date changes
  useEffect(() => {
    const fetchExistingEntries = async () => {
      if (!selectedDate || !hancurConfig || !karungConfig) return;

      try {
        // Fetch Hancur entries
        const hancurResponse = await api.get(
          `/api/production-entries?date=${selectedDate}&product_id=${hancurConfig.id}`
        );
        const hancurMap: Record<string, number> = {};
        (hancurResponse || []).forEach((entry: ProductionEntry) => {
          hancurMap[entry.worker_id] = Number(entry.bags_packed) || 0;
        });
        setHancurEntries(hancurMap);
        setOriginalHancurEntries(hancurMap);

        // Fetch Karung Hancur entries
        const karungResponse = await api.get(
          `/api/production-entries?date=${selectedDate}&product_id=${karungConfig.id}`
        );
        if (karungResponse && karungResponse.length > 0) {
          // Take the first entry (there should only be one per day)
          const karungEntry = karungResponse[0] as ProductionEntry;
          setKarungWorkerId(karungEntry.worker_id);
          setKarungValue(Number(karungEntry.bags_packed) || 0);
          setOriginalKarungWorkerId(karungEntry.worker_id);
          setOriginalKarungValue(Number(karungEntry.bags_packed) || 0);
        } else {
          // Reset to defaults
          setKarungWorkerId(
            karungConfig.singleWorkerEntry?.defaultWorkerId || "RAMBU"
          );
          setKarungValue(0);
          setOriginalKarungWorkerId(
            karungConfig.singleWorkerEntry?.defaultWorkerId || "RAMBU"
          );
          setOriginalKarungValue(0);
        }
      } catch (error) {
        console.error("Error fetching hancur entries:", error);
        setHancurEntries({});
        setOriginalHancurEntries({});
        setKarungValue(0);
        setOriginalKarungValue(0);
      }
    };

    fetchExistingEntries();
  }, [selectedDate, hancurConfig, karungConfig]);

  // Handle Hancur entry change
  const handleHancurEntryChange = useCallback(
    (workerId: string, value: number) => {
      setHancurEntries((prev) => {
        const newEntries = { ...prev };
        if (value === 0) {
          delete newEntries[workerId];
        } else {
          newEntries[workerId] = value;
        }
        return newEntries;
      });
    },
    []
  );

  // Handle save
  const handleSave = async () => {
    if (!selectedDate || !hancurConfig || !karungConfig) {
      toast.error("Configuration error");
      return;
    }

    setIsSaving(true);
    try {
      // Prepare Hancur entries
      const hancurEntriesArray = Object.entries(hancurEntries).map(
        ([worker_id, bags_packed]) => ({
          worker_id,
          bags_packed,
        })
      );

      // Include workers with 0 to clear old entries
      workers.forEach((worker) => {
        if (!hancurEntries[worker.id]) {
          hancurEntriesArray.push({
            worker_id: worker.id,
            bags_packed: 0,
          });
        }
      });

      // Prepare Karung Hancur entries - combine old worker clear and new worker save
      const karungEntriesArray: { worker_id: string; bags_packed: number }[] = [];

      // If worker changed and had a value, include old worker with 0
      if (originalKarungWorkerId !== karungWorkerId && originalKarungValue > 0) {
        karungEntriesArray.push({ worker_id: originalKarungWorkerId, bags_packed: 0 });
      }

      // Add the new/current entry
      karungEntriesArray.push({ worker_id: karungWorkerId, bags_packed: karungValue });

      // Execute both saves in parallel - if either fails, both are rolled back logically
      await Promise.all([
        api.post("/api/production-entries/batch", {
          date: selectedDate,
          product_id: hancurConfig.id,
          entries: hancurEntriesArray,
        }),
        api.post("/api/production-entries/batch", {
          date: selectedDate,
          product_id: karungConfig.id,
          entries: karungEntriesArray,
        }),
      ]);

      const totalHancur = Object.values(hancurEntries).reduce(
        (sum, val) => sum + val,
        0
      );
      toast.success(
        `Saved: ${totalHancur.toFixed(2)} kg Hancur, ${karungValue} sack Karung`
      );

      // Update original values
      setOriginalHancurEntries({ ...hancurEntries });
      setOriginalKarungWorkerId(karungWorkerId);
      setOriginalKarungValue(karungValue);
    } catch (error) {
      console.error("Error saving hancur entries:", error);
      toast.error("Failed to save entries");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset
  const handleReset = () => {
    setHancurEntries({ ...originalHancurEntries });
    setKarungWorkerId(originalKarungWorkerId);
    setKarungValue(originalKarungValue);
  };

  if (!hancurConfig || !karungConfig) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
        <p className="text-red-600 dark:text-red-400">
          Configuration error: Hancur items not found
        </p>
      </div>
    );
  }

  return (<>
    <div>
      {/* Bihun Hancur Section */}
        <WorkerEntryGrid
          workers={workers}
          entries={hancurEntries}
          onEntryChange={handleHancurEntryChange}
          isLoading={isLoadingWorkers}
          disabled={isSaving}
          inputStep={0.01}
          unitLabel="kg"
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          hideFooter
        />

      {/* Karung Hancur Section */}
      <div className="border border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="border-b border-default-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2">
          <div className="flex items-center gap-2">
            <IconPackage size={16} className="text-amber-600 dark:text-amber-400" />
            <span className="font-medium text-sm text-default-900 dark:text-gray-100">
              Karung Hancur - Timbang
            </span>
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              sack
            </span>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-4">
            {/* Worker Selector */}
            <div className="flex-1 max-w-xs">
              <label className="mb-1.5 block text-sm font-medium text-default-700 dark:text-gray-300">
                Worker
              </label>
              <StyledListbox
                value={karungWorkerId}
                onChange={(value) => setKarungWorkerId(value as string)}
                options={workerOptions}
                placeholder="Select worker..."
                rounded="lg"
                anchor="top"
                className="w-full"
              />
            </div>

            {/* Sack Count Input */}
            <div className="w-40">
              <label className="mb-1.5 block text-sm font-medium text-default-700 dark:text-gray-300">
                Sacks
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={karungValue || ""}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setKarungValue(isNaN(val) ? 0 : val);
                }}
                disabled={isSaving}
                placeholder="0"
                className="w-full rounded-lg border border-default-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-default-900 dark:text-gray-100 pl-6 px-3 py-2 text-center text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
              />
            </div>

            {/* Info */}
            <div className="flex-1 text-sm text-default-500 dark:text-gray-400">
              <p>
                Default worker:{" "}
                <span className="font-medium text-default-700 dark:text-gray-300">
                  RAMBU
                </span>
              </p>
              <p>
                Pay code:{" "}
                <span className="font-mono text-xs bg-default-100 dark:bg-gray-700 px-1 rounded">
                  TIMBANG_HANCUR
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 px-4 py-3">
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-sm font-medium text-amber-700 dark:text-amber-300">
              Unsaved changes
            </span>
          )}
          <span className="text-sm text-default-500 dark:text-gray-400">
            Total Hancur:{" "}
            <span className="font-semibold text-default-900 dark:text-gray-100">
              {Object.values(hancurEntries)
                .reduce((sum, val) => sum + (Number(val) || 0), 0)
                .toFixed(2)}{" "}
              kg
            </span>
            {" | "}
            Karung:{" "}
            <span className="font-semibold text-default-900 dark:text-gray-100">
              {karungValue} sack
            </span>
          </span>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleReset}
            disabled={!hasUnsavedChanges || isSaving}
            color="default"
            icon={IconRefresh}
          >
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isSaving}
            color="sky"
            icon={IconDeviceFloppy}
          >
            {isSaving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </div>
    </div>
    </>
  );
});

HancurEntrySection.displayName = "HancurEntrySection";

export default HancurEntrySection;
