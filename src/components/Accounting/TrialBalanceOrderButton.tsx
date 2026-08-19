// src/components/Accounting/TrialBalanceOrderButton.tsx
//
// Toolbar button for the Trial Balance page. Clicking it opens the order
// modal; hovering it shows the Manual/Standard order mode selection so the
// user can switch modes without opening the modal.
import React, { useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconCheck,
  IconListNumbers,
  IconLock,
  IconSortAscending,
} from "@tabler/icons-react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import Button from "../Button";
import {
  type TrialBalanceOrderMode,
  type TrialBalanceOrderPreference,
} from "../../utils/accounting/trialBalanceOrder";

interface TrialBalanceOrderButtonProps {
  preference: TrialBalanceOrderPreference;
  onModeChange: (mode: TrialBalanceOrderMode) => void;
  onOpen: () => void;
}

const TrialBalanceOrderButton: React.FC<TrialBalanceOrderButtonProps> = ({
  preference,
  onModeChange,
  onOpen,
}) => {
  const { t } = useTranslation("accounting");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStandardMode: boolean = preference.mode === "standard";

  const cancelClose = (): void => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = (): void => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setIsPopoverOpen(false), 150);
  };

  const handleModeChange = (mode: TrialBalanceOrderMode): void => {
    onModeChange(mode);
    setIsPopoverOpen(false);
  };

  const handleOpen = (): void => {
    setIsPopoverOpen(false);
    onOpen();
  };

  const modeOptionClasses = (isActive: boolean): string =>
    clsx(
      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
      isActive
        ? "bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
        : "text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700"
    );

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setIsPopoverOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <Button
        size="sm"
        variant="outline"
        icon={IconSortAscending}
        iconSize={16}
        onClick={handleOpen}
        title={t("Trial Balance Order")}
      >
        {t(isStandardMode ? "Standard Order" : "Manual Order")}
      </Button>

      {isPopoverOpen && (
        <div
          className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-lg border border-default-200 bg-white py-1 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-800"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <button
            type="button"
            onClick={() => handleModeChange("custom")}
            className={modeOptionClasses(!isStandardMode)}
          >
            <IconAdjustmentsHorizontal size={16} className="flex-shrink-0" />
            <span className="flex-1 truncate">{t("Manual Order")}</span>
            {!isStandardMode && (
              <IconCheck size={16} className="flex-shrink-0 text-sky-600 dark:text-sky-400" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("standard")}
            className={modeOptionClasses(isStandardMode)}
          >
            <IconLock size={16} className="flex-shrink-0" />
            <span className="flex-1 truncate">{t("Standard Order")}</span>
            {isStandardMode && (
              <IconCheck size={16} className="flex-shrink-0 text-sky-600 dark:text-sky-400" />
            )}
          </button>
          <div className="my-1 border-t border-default-200 dark:border-gray-700" />
          <button
            type="button"
            onClick={handleOpen}
            className={clsx(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
              "text-default-700 dark:text-gray-200 hover:bg-default-100 dark:hover:bg-gray-700"
            )}
          >
            <IconListNumbers size={16} className="flex-shrink-0" />
            <span className="flex-1 truncate">{t("Edit order...")}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default TrialBalanceOrderButton;
