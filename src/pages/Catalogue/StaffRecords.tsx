import React, { useMemo } from "react";
import { IconUsers, IconArrowLeft } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { Employee } from "../../types/types";
import { useStaffsCache } from "../../utils/catalogue/useStaffsCache";
import LoadingSpinner from "../../components/LoadingSpinner";
import Button from "../../components/Button";

const StaffRecords = () => {
  const { allStaffs: employees, loading, error } = useStaffsCache();
  const navigate = useNavigate();

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

  const activeEmployees = useMemo(() => {
    return employees.filter((employee) => !employee.dateResigned);
  }, [employees]);

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
    <div className="w-full max-w-full mx-auto px-4 sm:px-6 lg:px-8 pb-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
