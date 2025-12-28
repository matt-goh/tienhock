import React, { useMemo, useState } from "react";
import { IconUsers, IconArrowLeft, IconFileExport, IconLink } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { Employee } from "../../types/types";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";
import toast from "react-hot-toast";

const StaffRecords = () => {
  const { allStaffs: employees, loading, error } = useStaffsCache();
  const navigate = useNavigate();
  
  // Export state
  const [isGeneratingExport, setIsGeneratingExport] = useState<boolean>(false);

  const calculateAge = (birthdate: string): number => {
    if (!birthdate) return 0;
    const today = new Date();
    const birth = new Date(birthdate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }

    return age;
  };

  const formatMaritalStatus = (status: string): string => {
    if (status === "Married") return "BERKAHWIN";
    if (status === "Single") return "BUJANG";
    return status || "-";
  };

  const formatGender = (gender: string): string => {
    if (gender === "Male") return "M";
    if (gender === "Female") return "F";
    return gender || "-";
  };

  const formatDateJoined = (dateString: string): string => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear().toString();
    return `${day}.${month}.${year}`;
  };

  const formatDate = (
    dateString: string
  ): { day: string; month: string; year: string } => {
    if (!dateString) return { day: "-", month: "-", year: "-" };

    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear().toString();

    return { day, month, year };
  };

  const formatPhoneNumber = (phoneNumber: string): string => {
    if (!phoneNumber) return "-";
    
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, "");
    
    if (digits.length === 10) {
      // Format as XXX-XXX-XXXX
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11) {
      // Format as XXX-XXXX-XXXX
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    } else {
      // Return original if not 10 or 11 digits
      return phoneNumber;
    }
  };

  const formatRace = (race: string): string => {
    if (!race) return "-";
    const upperRace = race.toUpperCase();
    if (upperRace === "CINA") return "CHINESE";
    return upperRace;
  };

  const activeEmployees = useMemo(() => {
    return employees.filter((employee) => !employee.dateResigned);
  }, [employees]);

  // Export URL Generation
  const generateExportURL = () => {
    // Determine server URL based on environment
    const isProduction = window.location.hostname === 'tienhock.com';
    const baseURL = isProduction ? 'https://api.tienhock.com' : 'http://localhost:5001';
    const url = `${baseURL}/api/excel/staff-records-export?api_key=foodmaker`;
    
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Export URL copied to clipboard!");
    }).catch(() => {
      toast.error("Failed to copy URL to clipboard");
    });
  };

  // Text Export Generation
  const generateTextExport = async () => {
    if (!activeEmployees || activeEmployees.length === 0) {
      toast.error("No staff records available to export");
      return;
    }

    setIsGeneratingExport(true);
    try {
      // Define column headers
      const headers = [
        "Employee Name",
        "M/F",
        "Age",
        "Married",
        "Tel No.",
        "Date Join",
        "Department",
        "No IC / Passport",
        "KWSP No",
        "Income Tax No",
        "Bank Acc. No",
        "Date/Birth (DD.MM)",
        "Date/Birth (YYYY)",
        "Religion",
        "Race",
        "Citizenship"
      ];

      // Generate data rows
      const dataRows = activeEmployees.map((employee: Employee) => {
        const birthDateParts = formatDate(employee.birthdate);
        const dayMonth = `${birthDateParts.day}.${birthDateParts.month}`;
        const year = birthDateParts.year;
        
        return [
          employee.name || "",
          formatGender(employee.gender),
          calculateAge(employee.birthdate).toString(),
          formatMaritalStatus(employee.maritalStatus),
          formatPhoneNumber(employee.telephoneNo || ""),
          formatDateJoined(employee.dateJoined),
          employee.department || "",
          employee.icNo || "",
          employee.kwspNumber || "",
          employee.incomeTaxNo || "",
          employee.bankAccountNumber || "",
          dayMonth,
          year,
          (employee.agama || "").toUpperCase(),
          formatRace(employee.race || ""),
          (employee.nationality || "").toUpperCase()
        ];
      });

      // Combine headers and data
      const allRows = [
        headers,
        ...dataRows
      ];

      // Convert to text format (semicolon separated)
      const textContent = allRows.map(row => row.join(";")).join("\r\n");

      // Create and download the file
      const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `staff-records-export-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("Staff records export file downloaded successfully");
    } catch (error) {
      console.error("Error generating text export:", error);
      toast.error("Failed to generate text export");
    } finally {
      setIsGeneratingExport(false);
    }
  };


  if (loading) {
    return (
      <div className="mt-40 w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate("/catalogue/staff")}
            icon={IconArrowLeft}
            variant="outline"
            size="sm"
          >
            Back to Staff
          </Button>
          <h1 className="flex items-center text-2xl text-default-700 font-bold gap-2.5">
            <IconUsers size={28} stroke={2.5} className="text-default-700" />
            Staff Records ({activeEmployees.length})
          </h1>
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={generateTextExport}
            icon={IconFileExport}
            color="purple"
            variant="outline"
            disabled={activeEmployees.length === 0 || isGeneratingExport}
            size="sm"
          >
            Export
          </Button>
          <Button
            onClick={generateExportURL}
            icon={IconLink}
            color="orange"
            variant="outline"
            size="sm"
          >
            Export Link
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-default-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-default-50 border-b border-default-200">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Employee Name
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  M/F
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Age
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Married
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Tel No.
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Date Join
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  No IC / Passport
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  KWSP No
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Income Tax No
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Bank Acc. No
                </th>
                <th className="px-2 py-2 text-center text-xs font-semibold text-default-600 uppercase tracking-wider">
                  <div className="flex flex-col">
                    <span>Date/Birth</span>
                  </div>
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Religion
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Race
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-default-600 uppercase tracking-wider">
                  Citizenship
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-default-200">
              {activeEmployees.map((employee: Employee, index: number) => {
                const birthDateParts = formatDate(employee.birthdate);

                return (
                  <tr
                    key={employee.id}
                    className={index % 2 === 0 ? "bg-white" : "bg-default-25"}
                  >
                    <td className="px-2 py-2 text-xs text-default-900 font-medium">
                      {employee.name}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {formatGender(employee.gender)}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {calculateAge(employee.birthdate)}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {formatMaritalStatus(employee.maritalStatus)}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {employee.telephoneNo || "-"}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {formatDateJoined(employee.dateJoined)}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {employee.department || "-"}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {employee.icNo || "-"}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {employee.kwspNumber || "-"}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {employee.incomeTaxNo || "-"}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {employee.bankAccountNumber || "-"}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      <div className="flex">
                        <span className="w-16 text-center">
                          {birthDateParts.day}.{birthDateParts.month}.
                        </span>
                        <span className="w-12 text-center">
                          {birthDateParts.year}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {(employee.agama || "-").toUpperCase()}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {(employee.race || "-").toUpperCase()}
                    </td>
                    <td className="px-2 py-2 text-xs text-default-600">
                      {(employee.nationality || "-").toUpperCase()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {activeEmployees.length === 0 && (
        <div className="text-center py-16 bg-white rounded-lg border border-default-200">
          <IconUsers size={48} className="mx-auto text-default-300 mb-4" />
          <h3 className="text-lg font-medium text-default-800 mb-1">
            No active staff members found
          </h3>
          <p className="text-default-500">
            All staff members have been marked as resigned.
          </p>
        </div>
      )}
    </div>
  );
};

export default StaffRecords;
