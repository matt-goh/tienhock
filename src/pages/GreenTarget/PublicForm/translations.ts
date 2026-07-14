// Translations for the public Green Target customer registration form.
// Framework-free: a plain object keyed by language. BM is the default.

export type FormLanguage = "ms" | "en" | "zh";

export const LANGUAGE_LABELS: Record<FormLanguage, string> = {
  ms: "BM",
  en: "EN",
  zh: "中文",
};

type FormStrings = {
  title: string;
  subtitle: string;
  nameLabel: string;
  namePlaceholder: string;
  idLabel: string;
  idPlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  locationsTitle: string;
  locationLabel: string;
  siteLabel: string;
  sitePlaceholder: string;
  addressLabel: string;
  addressPlaceholder: string;
  addLocation: string;
  removeLocation: string;
  paymentLabel: string;
  paymentCash: string;
  paymentOnline: string;
  paymentQr: string;
  qrCompany: string;
  qrHint: string;
  downloadQr: string;
  paymentNote: string;
  einvoiceRequestLabel: string;
  einvoiceRequestHint: string;
  einvoiceTitle: string;
  idTypeLabel: string;
  idTypePlaceholder: string;
  einvoiceIdLabel: string;
  einvoiceIdPlaceholder: string;
  tinLabel: string;
  tinPlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  optionalLabel: string;
  submit: string;
  submitting: string;
  nameRequired: string;
  idRequired: string;
  phoneRequired: string;
  locationRequired: string;
  paymentRequired: string;
  einvoiceFieldsRequired: string;
  invalidEmail: string;
  invalidEinvoiceIdentity: string;
  einvoiceUnavailable: string;
  rateLimited: string;
  submitError: string;
  successTitle: string;
  successMessage: string;
  submitAnother: string;
};

export const translations: Record<FormLanguage, FormStrings> = {
  ms: {
    title: "Pendaftaran Pelanggan",
    subtitle: "Sila isi semua maklumat di bawah untuk mendaftar.",
    nameLabel: "Nama Penuh / Nama Syarikat",
    namePlaceholder: "Masukkan nama penuh atau nama syarikat",
    idLabel: "No. IC / No. Syarikat",
    idPlaceholder: "Masukkan No. IC atau No. Pendaftaran Syarikat",
    phoneLabel: "No. Telefon",
    phonePlaceholder: "Contoh: 0123456789",
    locationsTitle: "Lokasi",
    locationLabel: "Lokasi",
    siteLabel: "Tapak",
    sitePlaceholder: "Contoh: Kolombong",
    addressLabel: "Alamat",
    addressPlaceholder: "Masukkan alamat penuh",
    addLocation: "Tambah lokasi",
    removeLocation: "Buang lokasi",
    paymentLabel: "Kaedah pembayaran",
    paymentCash: "Tunai",
    paymentOnline: "Online Transfer",
    paymentQr: "QR",
    qrCompany: "GREEN TARGET WASTE TREATMENT",
    qrHint: "Imbas kod QR DuitNow ini untuk membayar.",
    downloadQr: "Muat turun kod QR",
    paymentNote:
      "Pembayaran hendaklah dibuat pada hari yang sama selepas tong diterima.",
    einvoiceRequestLabel: "Saya memerlukan e-Invois",
    einvoiceRequestHint:
      "Tandakan hanya jika anda memerlukan e-Invois untuk bil Green Target.",
    einvoiceTitle: "Maklumat e-Invois",
    idTypeLabel: "Jenis ID",
    idTypePlaceholder: "Pilih jenis ID",
    einvoiceIdLabel: "No. ID",
    einvoiceIdPlaceholder: "Masukkan nombor pengenalan",
    tinLabel: "No. TIN",
    tinPlaceholder: "Contoh: C21636482050",
    emailLabel: "E-mel",
    emailPlaceholder: "nama@syarikat.com",
    optionalLabel: "(Pilihan)",
    submit: "Hantar",
    submitting: "Mengesah dan menghantar...",
    nameRequired: "Sila isi nama penuh atau nama syarikat.",
    idRequired: "Sila isi No. IC atau No. Syarikat.",
    phoneRequired: "Sila isi nombor telefon.",
    locationRequired: "Sila isi tapak dan alamat untuk setiap lokasi.",
    paymentRequired: "Sila pilih kaedah pembayaran.",
    einvoiceFieldsRequired: "Sila lengkapkan Jenis ID, No. ID dan No. TIN.",
    invalidEmail: "Sila masukkan alamat e-mel yang sah.",
    invalidEinvoiceIdentity: "No. TIN dan maklumat pengenalan tidak dapat disahkan.",
    einvoiceUnavailable:
      "Pengesahan e-Invois tidak tersedia buat sementara waktu. Sila cuba lagi.",
    rateLimited: "Terlalu banyak penghantaran. Sila cuba sebentar lagi.",
    submitError: "Gagal menghantar. Sila cuba lagi.",
    successTitle: "Terima kasih!",
    successMessage: "Pendaftaran anda telah diterima.",
    submitAnother: "Hantar satu lagi",
  },
  en: {
    title: "Customer Registration",
    subtitle: "Please complete all details below to register.",
    nameLabel: "Full Name / Company Name",
    namePlaceholder: "Enter a full name or company name",
    idLabel: "IC No. / Company No.",
    idPlaceholder: "Enter an IC or company registration number",
    phoneLabel: "Telephone No.",
    phonePlaceholder: "e.g. 0123456789",
    locationsTitle: "Locations",
    locationLabel: "Location",
    siteLabel: "Site",
    sitePlaceholder: "e.g. Kolombong",
    addressLabel: "Address",
    addressPlaceholder: "Enter the full address",
    addLocation: "Add location",
    removeLocation: "Remove location",
    paymentLabel: "Payment method",
    paymentCash: "Cash",
    paymentOnline: "Online Transfer",
    paymentQr: "QR",
    qrCompany: "GREEN TARGET WASTE TREATMENT",
    qrHint: "Scan this DuitNow QR code to pay.",
    downloadQr: "Download QR code",
    paymentNote: "Payment must be made on the same day the bin is received.",
    einvoiceRequestLabel: "I need an e-Invoice",
    einvoiceRequestHint:
      "Select this only if you need e-Invoices for your Green Target bills.",
    einvoiceTitle: "e-Invoice Information",
    idTypeLabel: "ID Type",
    idTypePlaceholder: "Select an ID type",
    einvoiceIdLabel: "ID Number",
    einvoiceIdPlaceholder: "Enter an ID number",
    tinLabel: "TIN No.",
    tinPlaceholder: "e.g. C21636482050",
    emailLabel: "Email",
    emailPlaceholder: "name@company.com",
    optionalLabel: "(Optional)",
    submit: "Submit",
    submitting: "Validating and submitting...",
    nameRequired: "Please enter a full name or company name.",
    idRequired: "Please enter an IC or company number.",
    phoneRequired: "Please enter a telephone number.",
    locationRequired: "Please enter a site and address for every location.",
    paymentRequired: "Please select a payment method.",
    einvoiceFieldsRequired: "Please enter an ID Type, ID Number and TIN No.",
    invalidEmail: "Please enter a valid email address.",
    invalidEinvoiceIdentity: "The TIN and identity details could not be verified.",
    einvoiceUnavailable:
      "e-Invoice validation is temporarily unavailable. Please try again.",
    rateLimited: "Too many submissions. Please try again later.",
    submitError: "Failed to submit. Please try again.",
    successTitle: "Thank you!",
    successMessage: "Your registration has been received.",
    submitAnother: "Submit another",
  },
  zh: {
    title: "客户登记",
    subtitle: "请填写以下所有资料以完成登记。",
    nameLabel: "全名 / 公司名称",
    namePlaceholder: "请输入全名或公司名称",
    idLabel: "身份证号码 / 公司注册号码",
    idPlaceholder: "请输入身份证号码或公司注册号码",
    phoneLabel: "电话号码",
    phonePlaceholder: "例如：0123456789",
    locationsTitle: "地点",
    locationLabel: "地点",
    siteLabel: "地点名称",
    sitePlaceholder: "例如：Kolombong",
    addressLabel: "地址",
    addressPlaceholder: "请输入完整地址",
    addLocation: "添加地点",
    removeLocation: "删除地点",
    paymentLabel: "付款方式",
    paymentCash: "现金",
    paymentOnline: "网上转账",
    paymentQr: "QR",
    qrCompany: "GREEN TARGET WASTE TREATMENT",
    qrHint: "扫描此 DuitNow QR 码付款。",
    downloadQr: "下载 QR 码",
    paymentNote: "收到垃圾桶后，须在同一天内完成付款。",
    einvoiceRequestLabel: "我需要电子发票",
    einvoiceRequestHint: "仅在您需要 Green Target 账单电子发票时勾选。",
    einvoiceTitle: "电子发票资料",
    idTypeLabel: "证件类型",
    idTypePlaceholder: "请选择证件类型",
    einvoiceIdLabel: "证件号码",
    einvoiceIdPlaceholder: "请输入证件号码",
    tinLabel: "税务识别号码（TIN）",
    tinPlaceholder: "例如：C21636482050",
    emailLabel: "电子邮箱",
    emailPlaceholder: "name@company.com",
    optionalLabel: "（选填）",
    submit: "提交",
    submitting: "正在验证并提交...",
    nameRequired: "请输入全名或公司名称。",
    idRequired: "请输入身份证号码或公司注册号码。",
    phoneRequired: "请输入电话号码。",
    locationRequired: "请为每个地点填写地点名称和地址。",
    paymentRequired: "请选择付款方式。",
    einvoiceFieldsRequired: "请填写证件类型、证件号码和税务识别号码。",
    invalidEmail: "请输入有效的电子邮箱地址。",
    invalidEinvoiceIdentity: "无法验证 TIN 和身份证明资料。",
    einvoiceUnavailable: "电子发票验证暂时无法使用，请稍后再试。",
    rateLimited: "提交次数过多，请稍后再试。",
    submitError: "提交失败，请重试。",
    successTitle: "谢谢！",
    successMessage: "我们已收到您的登记资料。",
    submitAnother: "再次提交",
  },
};
