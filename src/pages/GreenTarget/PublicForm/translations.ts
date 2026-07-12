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
  addressLabel: string;
  addressPlaceholder: string;
  paymentLabel: string;
  paymentCash: string;
  paymentOnline: string;
  paymentQr: string;
  qrCompany: string;
  qrHint: string;
  downloadQr: string;
  paymentNote: string;
  submit: string;
  submitting: string;
  optional: string;
  required: string;
  nameRequired: string;
  paymentRequired: string;
  rateLimited: string;
  submitError: string;
  successTitle: string;
  successMessage: string;
  submitAnother: string;
};

export const translations: Record<FormLanguage, FormStrings> = {
  ms: {
    title: "Pendaftaran Pelanggan",
    subtitle: "Sila isi maklumat di bawah untuk mendaftar.",
    nameLabel: "Nama penuh @ Syarikat",
    namePlaceholder: "Nama penuh atau nama syarikat",
    idLabel: "No. IC @ No. Syarikat",
    idPlaceholder: "No. Kad Pengenalan atau No. Pendaftaran Syarikat",
    phoneLabel: "No. Telefon",
    phonePlaceholder: "Contoh: 0123456789",
    addressLabel: "Alamat",
    addressPlaceholder: "Alamat penuh",
    paymentLabel: "Kaedah pembayaran",
    paymentCash: "Tunai",
    paymentOnline: "Online Transfer",
    paymentQr: "QR",
    qrCompany: "GREEN TARGET WASTE TREATMENT",
    qrHint: "Imbas kod QR DuitNow ini untuk membayar.",
    downloadQr: "Muat turun kod QR",
    paymentNote:
      "Pembayaran hendaklah dibuat pada hari yang sama selepas tong diterima.",
    submit: "Hantar",
    submitting: "Menghantar...",
    optional: "pilihan",
    required: "wajib",
    nameRequired: "Sila isi nama.",
    paymentRequired: "Sila pilih kaedah pembayaran.",
    rateLimited: "Terlalu banyak penghantaran. Sila cuba sebentar lagi.",
    submitError: "Gagal menghantar. Sila cuba lagi.",
    successTitle: "Terima kasih!",
    successMessage: "Pendaftaran anda telah diterima.",
    submitAnother: "Hantar satu lagi",
  },
  en: {
    title: "Customer Registration",
    subtitle: "Please fill in the details below to register.",
    nameLabel: "Full name @ Company",
    namePlaceholder: "Full name or company name",
    idLabel: "IC No. @ Company No.",
    idPlaceholder: "IC number or company registration number",
    phoneLabel: "Telephone No.",
    phonePlaceholder: "e.g. 0123456789",
    addressLabel: "Address",
    addressPlaceholder: "Full address",
    paymentLabel: "Payment method",
    paymentCash: "Cash",
    paymentOnline: "Online Transfer",
    paymentQr: "QR",
    qrCompany: "GREEN TARGET WASTE TREATMENT",
    qrHint: "Scan this DuitNow QR code to pay.",
    downloadQr: "Download QR code",
    paymentNote:
      "Payment must be made on the same day the bin is received.",
    submit: "Submit",
    submitting: "Submitting...",
    optional: "optional",
    required: "required",
    nameRequired: "Please enter a name.",
    paymentRequired: "Please select a payment method.",
    rateLimited: "Too many submissions. Please try again later.",
    submitError: "Failed to submit. Please try again.",
    successTitle: "Thank you!",
    successMessage: "Your registration has been received.",
    submitAnother: "Submit another",
  },
  zh: {
    title: "客户登记",
    subtitle: "请填写以下信息进行登记。",
    nameLabel: "全名 @ 公司名称",
    namePlaceholder: "全名或公司名称",
    idLabel: "身份证号 @ 公司注册号",
    idPlaceholder: "身份证号码或公司注册号码",
    phoneLabel: "电话号码",
    phonePlaceholder: "例如：0123456789",
    addressLabel: "地址",
    addressPlaceholder: "完整地址",
    paymentLabel: "付款方式",
    paymentCash: "现金",
    paymentOnline: "网上转账",
    paymentQr: "QR",
    qrCompany: "GREEN TARGET WASTE TREATMENT",
    qrHint: "扫描此 DuitNow QR 码付款。",
    downloadQr: "下载 QR 码",
    paymentNote: "付款须在收到垃圾桶的当天完成。",
    submit: "提交",
    submitting: "提交中...",
    optional: "选填",
    required: "必填",
    nameRequired: "请填写姓名。",
    paymentRequired: "请选择付款方式。",
    rateLimited: "提交次数过多，请稍后再试。",
    submitError: "提交失败，请重试。",
    successTitle: "谢谢！",
    successMessage: "我们已收到您的登记。",
    submitAnother: "再次提交",
  },
};
