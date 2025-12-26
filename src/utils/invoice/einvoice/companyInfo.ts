// src/utils/invoice/einvoice/companyInfo.ts

export interface CompanyInfo {
  // Common fields
  name: string;
  tin: string;
  reg_no: string;
  msic_code: string;
  msic_description: string;
  phone: string;
  email: string;
  postcode: string;

  // XML-specific formatting
  sst_id_xml: string;
  address_xml: string;
  city_xml: string;
  country_code: string;

  // PDF-specific formatting
  office_phone_pdf?: string;
  sst_id_pdf: string;
  address_pdf: string;
  city_pdf: string;
  state_pdf: string;
}

export const TIENHOCK_INFO: CompanyInfo = {
  // Common fields
  name: "TIEN HOCK FOOD INDUSTRIES S/B",
  tin: "C21636482050",
  reg_no: "201101025173",
  msic_code: "10741",
  msic_description:
    "Manufacture of meehoon, noodles and other related products",
  phone: "088719795",
  email: "tienhockfood@gmail.com",
  postcode: "88811",

  // XML-specific formatting
  sst_id_xml: "-",
  address_xml: "CL.215145645, KG KIBABAIG, PENAMPANG",
  city_xml: "KOTA KINABALU",
  country_code: "12", // Sabah code for XML template

  // PDF-specific formatting
  sst_id_pdf: "-",
  address_pdf: "CL.215145645, Kg. Kibabaig, Penampang, Kota Kinabalu, Sabah",
  city_pdf: "Kota Kinabalu",
  state_pdf: "Sabah",
};

export const GREENTARGET_INFO: CompanyInfo = {
  // Common fields
  name: "GREEN TARGET WASTE TREATMENT IND. SDN BHD",
  tin: "C20134499080",
  reg_no: "200501030145",
  msic_code: "38210",
  msic_description: "Treatment and disposal of non-hazardous waste",
  phone: "0138829922",
  email: "greentarget2014@gmail.com",
  postcode: "88811",

  // XML-specific formatting
  sst_id_xml: "-",
  address_xml: "CL.215145645, KG KIBABAIG, PENAMPANG",
  city_xml: "KOTA KINABALU",
  country_code: "12", // Sabah code for XML template

  // PDF-specific formatting
  office_phone_pdf: "088719795",
  sst_id_pdf: "-",
  address_pdf: "CL.215145645, Kg. Kibabaig, Penampang, Kota Kinabalu, Sabah",
  city_pdf: "Kota Kinabalu",
  state_pdf: "Sabah",
};

export const JELLYPOLLY_INFO: CompanyInfo = {
  // Common fields
  name: "GOH THAI HO",
  tin: "IG7139779050",
  reg_no: "550308125181",
  msic_code: "10501",
  msic_description: "Manufacture of ice cream and other edible ice such as sorbet",
  phone: "0198829922",
  email: "tienhockfood@gmail.com",
  postcode: "88811",

  // XML-specific formatting
  sst_id_xml: "-",
  address_xml: "2KM, JALAN KASIGUI, KAMPUNG KIBABAIG, PENAMPANG",
  city_xml: "KOTA KINABALU",
  country_code: "12", // Sabah code for XML template

  // PDF-specific formatting
  office_phone_pdf: "088719795",
  sst_id_pdf: "-",
  address_pdf:
    "2KM, Jalan Kasigui, Kg. Kibabaig, Penampang, Kota Kinabalu, Sabah",
  city_pdf: "Kota Kinabalu",
  state_pdf: "Sabah",
};
