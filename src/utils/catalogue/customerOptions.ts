// src/utils/catalogue/customerOptions.ts
// Shared option lists for the Tien Hock customer pages (form + details view).
import { SelectOption } from "../../components/FormComponents";

export const closenessOptions: SelectOption[] = [
  { id: "Local", name: "Local" },
  { id: "Outstation", name: "Outstation" },
];

export const idTypeOptions: SelectOption[] = [
  { id: "", name: "Select..." },
  { id: "BRN", name: "BRN" },
  { id: "NRIC", name: "NRIC" },
  { id: "PASSPORT", name: "PASSPORT" },
  { id: "ARMY", name: "ARMY" },
];

export const stateOptions: SelectOption[] = [
  { id: "01", name: "JOHOR" },
  { id: "02", name: "KEDAH" },
  { id: "03", name: "KELANTAN" },
  { id: "04", name: "MELAKA" },
  { id: "05", name: "NEGERI SEMBILAN" },
  { id: "06", name: "PAHANG" },
  { id: "07", name: "PULAU PINANG" },
  { id: "08", name: "PERAK" },
  { id: "09", name: "PERLIS" },
  { id: "10", name: "SELANGOR" },
  { id: "11", name: "TERENGGANU" },
  { id: "12", name: "SABAH" },
  { id: "13", name: "SARAWAK" },
  { id: "14", name: "WILAYAH PERSEKUTUAN KUALA LUMPUR" },
  { id: "15", name: "WILAYAH PERSEKUTUAN LABUAN" },
  { id: "16", name: "WILAYAH PERSEKUTUAN PUTRAJAYA" },
  { id: "17", name: "NOT APPLICABLE" },
];

export const getStateName = (code?: string | null): string => {
  if (!code) return "";
  return stateOptions.find((s) => s.id === code)?.name || code;
};

export const getIdNumberPlaceholder = (idType?: string | null): string => {
  switch (idType) {
    case "BRN":
      return "Company Business Registration Number";
    case "NRIC":
      return "Customer IC Number";
    default:
      return "";
  }
};
