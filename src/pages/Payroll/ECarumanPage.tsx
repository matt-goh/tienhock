// src/pages/Payroll/ECarumanPage.tsx
import { useState } from "react";
import {
  IconFileDownload,
  IconBuildingBank,
  IconShieldCheck,
  IconUmbrella,
  IconReceipt,
} from "@tabler/icons-react";
import StyledListbox from "../../components/StyledListbox";

const ECarumanPage: React.FC = () => {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  // Generate month options for StyledListbox
  const monthOptions = [
    { id: 1, name: "January" },
    { id: 2, name: "February" },
    { id: 3, name: "March" },
    { id: 4, name: "April" },
    { id: 5, name: "May" },
    { id: 6, name: "June" },
    { id: 7, name: "July" },
    { id: 8, name: "August" },
    { id: 9, name: "September" },
    { id: 10, name: "October" },
    { id: 11, name: "November" },
    { id: 12, name: "December" },
  ];

  // Generate year options for StyledListbox (current year and 2 years back)
  const yearOptions = Array.from({ length: 3 }, (_, i) => ({
    id: currentDate.getFullYear() - i,
    name: String(currentDate.getFullYear() - i),
  }));

  const handleDownload = (type: "epf" | "socso" | "sip" | "income_tax") => {
    // TODO: Implement file generation and download
    console.log(`Downloading ${type} file for ${selectedMonth}/${selectedYear}`);
  };

  const contributionButtons = [
    {
      id: "epf" as const,
      label: "EPF / KWSP",
      description: "Download EPF contribution file",
      icon: IconBuildingBank,
      color: "bg-blue-600 hover:bg-blue-700",
    },
    {
      id: "socso" as const,
      label: "SOCSO / PERKESO",
      description: "Download SOCSO contribution file",
      icon: IconShieldCheck,
      color: "bg-green-600 hover:bg-green-700",
    },
    {
      id: "sip" as const,
      label: "SIP / EIS",
      description: "Download SIP contribution file",
      icon: IconUmbrella,
      color: "bg-purple-600 hover:bg-purple-700",
    },
    {
      id: "income_tax" as const,
      label: "Income Tax / PCB",
      description: "Download PCB contribution file",
      icon: IconReceipt,
      color: "bg-orange-600 hover:bg-orange-700",
    },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">e-Caruman</h1>
        <p className="mt-1 text-sm text-gray-500">
          Generate contribution files for government submission
        </p>
      </div>

      {/* Month/Year Selection */}
      <div className="mb-8 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Select Period</h2>
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Month
            </label>
            <StyledListbox
              value={selectedMonth}
              onChange={(value) => setSelectedMonth(Number(value))}
              options={monthOptions}
              className="w-52"
              rounded="lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <StyledListbox
              value={selectedYear}
              onChange={(value) => setSelectedYear(Number(value))}
              options={yearOptions}
              className="w-[9rem]"
              rounded="lg"
            />
          </div>
        </div>
      </div>

      {/* Contribution Buttons */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Download Contribution Files
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Select the contribution type to generate and download the file for{" "}
          <span className="font-medium text-gray-700">
            {monthOptions.find((m) => m.id === selectedMonth)?.name} {selectedYear}
          </span>
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contributionButtons.map((button) => {
            const Icon = button.icon;
            return (
              <button
                key={button.id}
                onClick={() => handleDownload(button.id)}
                className={`${button.color} text-white rounded-lg p-4 flex items-center gap-4 transition-colors`}
              >
                <div className="p-3 bg-white/20 rounded-lg">
                  <Icon size={28} stroke={1.5} />
                </div>
                <div className="text-left">
                  <div className="font-medium text-lg">{button.label}</div>
                  <div className="text-sm text-white/80">{button.description}</div>
                </div>
                <div className="ml-auto">
                  <IconFileDownload size={24} stroke={1.5} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ECarumanPage;
