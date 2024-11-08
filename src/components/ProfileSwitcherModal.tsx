"use client";

import React, { useState, useEffect, Fragment } from "react";
import { Staff, ActiveSession } from "../types/types";
import { useProfile } from "../contexts/ProfileContext";
import {
  Dialog,
  Transition,
  TransitionChild,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { IconDevices2, IconUserCircle, IconSearch } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import { websocketService } from "../services/websocketService";
import { API_BASE_URL } from "../config";
import { toast } from "react-hot-toast";
import clsx from "clsx";

interface ProfileSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileSwitcherModal({
  isOpen,
  onClose,
}: ProfileSwitcherModalProps) {
  const { activeSessions, switchProfile } = useProfile();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSessions, setShowSessions] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchStaffList();
      setShowSessions(false);
      setSearchQuery("");
    }
  }, [isOpen]);

  const fetchStaffList = async () => {
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/staffs/office`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Invalid data format received");
      }

      setStaffList(data);
    } catch (error) {
      console.error("Error fetching staff list:", error);
      setError(
        error instanceof Error ? error.message : "Failed to load staff list"
      );
    }
  };

  const handleProfileSelect = async (staff: Staff) => {
    try {
      await switchProfile(staff);
      toast.success(`Switched to ${staff.id}'s profile`);
      onClose();
    } catch (error) {
      console.error("Error switching profile:", error);
      setError("Failed to switch profile");
      toast.error("Failed to switch profile");
    }
  };

  const filteredStaff = staffList.filter((staff) =>
    staff.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentSessionId = websocketService.getSessionId();

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="mx-auto w-full max-w-xl rounded-xl bg-white p-6 shadow-xl text-left align-middle transform transition-all">
                <div className="flex justify-between items-center mb-4">
                  <DialogTitle className="text-lg font-bold text-default-900">
                    {showSessions ? "Active Sessions" : "Switch Profile"}
                  </DialogTitle>
                  <button
                    onClick={() => setShowSessions(!showSessions)}
                    className="p-2 rounded-lg hover:bg-default-100 active:bg-default-200 transition-colors duration-200"
                  >
                    <IconDevices2 stroke={1.5} />
                  </button>
                </div>

                {!showSessions ? (
                  <>
                    <div className="relative mb-4">
                      <IconSearch
                        className="absolute left-3 top-2.5 text-default-400"
                        size={20}
                      />
                      <input
                        type="text"
                        placeholder="Search staff..."
                        className={clsx(
                          "w-full pl-10 pr-4 py-2 border border-default-300 rounded-lg",
                          "focus:border-default-500"
                        )}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto space-y-2">
                      {filteredStaff.length === 0 ? (
                        <div className="text-center py-8 text-default-500">
                          {searchQuery ? (
                            <>
                              <p className="font-medium">No staff found</p>
                              <p className="text-sm mt-1">
                                No results for "{searchQuery}"
                              </p>
                            </>
                          ) : (
                            <p className="font-medium">No staff available</p>
                          )}
                        </div>
                      ) : (
                        filteredStaff.map((staff) => (
                          <button
                            key={staff.id}
                            onClick={() => handleProfileSelect(staff)}
                            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-default-100 active:bg-default-200 transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <IconUserCircle
                                className="text-default-700"
                              />
                              <span className="font-medium text-default-700">{staff.name}</span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div className="max-h-[60vh] overflow-y-auto space-y-3">
                    {activeSessions.map((session) => {
                      const sessionStaff = staffList.find(
                        (s) => s.id === session.staffId
                      );
                      return (
                        <div
                          key={session.sessionId}
                          className="p-3 rounded-lg border border-default-200"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-default-900">
                                {sessionStaff?.name || "No profile selected"}
                              </p>
                              <p className="text-sm text-default-500">
                                {session.deviceInfo.deviceType} -{" "}
                                {session.deviceInfo.userAgent}
                              </p>
                            </div>
                            {session.sessionId === currentSessionId && (
                              <span className="text-xs text-center bg-sky-100 text-sky-800 px-3 py-1 rounded-full">
                                Current Device
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-default-400 mt-1">
                            Active{" "}
                            {formatDistanceToNow(new Date(session.lastActive))}{" "}
                            ago
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}

                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
