// src/components/Catalogue/CustomerCard.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Customer } from "../../types/types";
import {
  IconTrash,
  IconUser,
  IconPhone,
  IconId,
  IconFileInvoice,
  IconCheck,
  IconBuildingStore,
  IconBuildingSkyscraper,
  IconPencil,
  IconHistory,
} from "@tabler/icons-react";

interface CustomerCardProps {
  customer: Customer;
  onDeleteClick: (customer: Customer) => void;
  branchInfo?: {
    isInBranchGroup: boolean;
    isMainBranch: boolean;
    groupName?: string;
    groupId?: number;
    branches?: { id: string; name: string; isMain: boolean }[];
  };
  onManageBranchesClick?: (customer: Customer) => void;
}

const CustomerCard: React.FC<CustomerCardProps> = ({
  customer,
  onDeleteClick,
  branchInfo,
  onManageBranchesClick,
}) => {
  const { t } = useTranslation("catalogue");
  const [isCardHovered, setIsCardHovered] = useState(false);
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/catalogue/customer/${customer.id}`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteClick(customer);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/catalogue/customer/${customer.id}/edit`);
  };

  const handleTransactionsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/catalogue/customer/${customer.id}?tab=transactions`);
  };

  const handleManageBranchesClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onManageBranchesClick?.(customer);
  };

  // Branches include this customer, so the siblings are everyone else.
  const siblingBranchCount = Math.max(
    (branchInfo?.branches?.length ?? 0) - 1,
    0
  );

  // Determine e-Invoice status based on having both tin_number and id_number
  const hasEInvoiceInfo =
    Boolean(customer.tin_number) && Boolean(customer.id_number);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border ${
        isCardHovered ? "border-sky-200 dark:border-sky-700 shadow-md" : "border-default-200 dark:border-gray-700"
      } transition-all duration-200 cursor-pointer bg-white dark:bg-gray-800`}
      onClick={handleClick}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {/* Card Header */}
      <div
        className={`px-4 py-3 border-b ${
          isCardHovered
            ? "bg-sky-50 dark:bg-sky-900/30 border-sky-100 dark:border-sky-800"
            : "bg-default-50 dark:bg-gray-900/50 border-default-100 dark:border-gray-700"
        } transition-colors duration-200`}
      >
        <div className="flex justify-between items-center gap-2">
          <h3
            className="font-semibold text-default-800 dark:text-gray-100 truncate flex-1 min-w-0"
            title={customer.name}
          >
            {customer.name}
          </h3>
          <div
            className={`flex items-center gap-1.5 flex-shrink-0 transition-opacity duration-150 ${
              isCardHovered ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <button
              onClick={handleEditClick}
              className="p-1.5 rounded-full bg-white dark:bg-gray-700 hover:bg-sky-50 dark:hover:bg-sky-900/50 text-default-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-150 shadow-sm"
              title={t("Edit customer")}
            >
              <IconPencil size={16} stroke={1.5} />
            </button>
            <button
              onClick={handleTransactionsClick}
              className="p-1.5 rounded-full bg-white dark:bg-gray-700 hover:bg-sky-50 dark:hover:bg-sky-900/50 text-default-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors duration-150 shadow-sm"
              title={t("Transaction History")}
            >
              <IconHistory size={16} stroke={1.5} />
            </button>
            <button
              onClick={handleDeleteClick}
              className="p-1.5 rounded-full bg-white dark:bg-gray-700 hover:bg-rose-50 dark:hover:bg-rose-900/50 text-default-500 dark:text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors duration-150 shadow-sm"
              title={t("Delete customer")}
            >
              <IconTrash size={16} stroke={1.5} />
            </button>
          </div>
        </div>
        <div className="text-sm text-default-500 dark:text-gray-400 mt-0.5 flex items-center">
          <span className="truncate">{customer.id}</span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-3">
        {/* Salesman field - Always show */}
        <div className="flex items-start">
          <IconUser
            size={16}
            className="text-default-400 dark:text-gray-500 mt-0.5 flex-shrink-0 mr-2"
          />
          <div className="text-sm text-default-700 dark:text-gray-200 flex-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300">
              {customer.salesman || t("Unassigned")}
            </span>
          </div>
        </div>

        {/* Phone Number - Only if exists */}
        {customer.phone_number && (
          <div className="flex items-center">
            <IconPhone
              size={16}
              className="text-default-400 dark:text-gray-500 flex-shrink-0 mr-2"
            />
            <div className="text-sm text-default-700 dark:text-gray-200 flex-1 truncate">
              {customer.phone_number}
            </div>
          </div>
        )}

        {/* ID Number - Only if exists */}
        {customer.id_number && (
          <div className="flex items-center">
            <IconId size={16} className="text-default-400 dark:text-gray-500 flex-shrink-0 mr-2" />
            <div className="text-sm text-default-700 dark:text-gray-200 flex-1 truncate">
              {customer.id_number}
            </div>
          </div>
        )}

        {/* E-Invoice Status - Only show if ready*/}
        {hasEInvoiceInfo ? (
          <div className="flex items-center">
            <IconFileInvoice
              size={16}
              className="text-default-400 dark:text-gray-500 flex-shrink-0 mr-2"
            />
            <div className="flex items-center">
              <span className="text-sm text-default-700 dark:text-gray-200 mr-1">
                {t("e-Invoice:")}
              </span>
              <span className="inline-flex items-center text-xs font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/50 rounded-full px-2 py-0.5">
                <IconCheck size={12} className="mr-1" /> {t("Ready")}
              </span>
            </div>
          </div>
        ) : null}

        {/* Branch Status - Only show if part of a branch group */}
        {branchInfo?.isInBranchGroup && (
          <div className="flex items-center">
            {branchInfo.isMainBranch ? (
              <IconBuildingSkyscraper
                size={16}
                className="text-indigo-500 flex-shrink-0 mr-2"
              />
            ) : (
              <IconBuildingStore
                size={16}
                className="text-indigo-400 flex-shrink-0 mr-2"
              />
            )}
            <div className="flex items-center space-x-1 min-w-0">
              <span className="text-sm text-default-700 dark:text-gray-200 mr-1">
                {t("Branch:")}
              </span>
              {onManageBranchesClick ? (
                <button
                  type="button"
                  onClick={handleManageBranchesClick}
                  title={
                    siblingBranchCount > 0
                      ? t(
                          siblingBranchCount === 1
                            ? "Manage {{group}} ({{total}} other branch)"
                            : "Manage {{group}} ({{total}} other branches)",
                          {
                            group: branchInfo.groupName,
                            total: siblingBranchCount,
                          }
                        )
                      : t("Manage {{group}}", { group: branchInfo.groupName })
                  }
                  className={`inline-flex items-center max-w-full truncate text-xs font-medium rounded-full px-2 py-0.5 transition-colors hover:ring-1 hover:ring-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    branchInfo.isMainBranch
                      ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                      : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                  }`}
                >
                  {branchInfo.groupName}
                </button>
              ) : (
                <span
                  className={`inline-flex items-center max-w-full truncate text-xs font-medium rounded-full px-2 py-0.5 ${
                    branchInfo.isMainBranch
                      ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                      : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                  }`}
                >
                  {branchInfo.groupName}
                </span>
              )}
              {branchInfo.isMainBranch && (
                <span
                  className={`inline-flex items-center flex-shrink-0 text-xs font-medium rounded-full px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300`}
                >
                  {t("Main")}
                </span>
              )}
              {siblingBranchCount > 0 && (
                <span className="text-xs text-default-500 dark:text-gray-400 flex-shrink-0 whitespace-nowrap">
                  +{siblingBranchCount}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerCard;
