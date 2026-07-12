// src/pages/GreenTarget/PublicForm/CustomerSignupPage.tsx
// Public (unauthenticated), mobile-first Green Target customer registration form.
// Served on greentarget.tienhock.com and at /greentarget-form for dev/testing.
// Self-contained: no Navbar, no auth context, no shared app form components.
import { useState, FormEvent } from "react";
import { IconCheck, IconDownload } from "@tabler/icons-react";
import { API_BASE_URL } from "../../../configs/config";
import {
  translations,
  LANGUAGE_LABELS,
  FormLanguage,
} from "./translations";

type PaymentMethod = "cash" | "online" | "qr";

const QR_IMAGE_PATH = "/greentarget-duitnow-qr.jpg";

// The form is served by Cloudflare Pages (greentarget.tienhock.com) while the API
// lives at api.tienhock.com (Cloudflare Tunnel) — always a cross-origin call, so
// use the configured API base (prod: https://api.tienhock.com, dev: localhost:5000).

const CustomerSignupPage = () => {
  const [lang, setLang] = useState<FormLanguage>("ms");
  const t = translations[lang];

  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const paymentOptions: { value: PaymentMethod; label: string }[] = [
    { value: "cash", label: t.paymentCash },
    { value: "online", label: t.paymentOnline },
    { value: "qr", label: t.paymentQr },
  ];

  const resetForm = () => {
    setName("");
    setIdNumber("");
    setPhone("");
    setAddress("");
    setPaymentMethod("");
    setError(null);
    setSubmitted(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t.nameRequired);
      return;
    }
    if (!paymentMethod) {
      setError(t.paymentRequired);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/greentarget/api/customer-signups`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            id_number: idNumber.trim(),
            phone_number: phone.trim(),
            address: address.trim(),
            payment_method: paymentMethod,
          }),
        }
      );

      if (response.status === 429) {
        setError(t.rateLimited);
        return;
      }
      if (!response.ok) {
        setError(t.submitError);
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setError(t.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  const LanguageSwitcher = () => (
    <div className="flex items-center gap-1 rounded-full bg-white/20 p-1 text-sm">
      {(Object.keys(LANGUAGE_LABELS) as FormLanguage[]).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          className={`rounded-full px-3 py-1 font-medium transition-colors ${
            lang === code
              ? "bg-white text-green-700"
              : "text-white hover:bg-white/20"
          }`}
        >
          {LANGUAGE_LABELS[code]}
        </button>
      ))}
    </div>
  );

  const QrBlock = () => (
    <div className="mt-4 flex flex-col items-center rounded-xl border border-green-200 bg-green-50 p-4">
      <img
        src={QR_IMAGE_PATH}
        alt="DuitNow QR"
        className="w-56 max-w-full rounded-lg bg-white p-2 shadow-sm"
      />
      <p className="mt-2 text-center text-sm font-medium text-green-800">
        {t.qrCompany}
      </p>
      <p className="mt-1 text-center text-xs text-green-700">{t.qrHint}</p>
      <a
        href={QR_IMAGE_PATH}
        download="greentarget-duitnow-qr.jpg"
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
      >
        <IconDownload size={18} />
        {t.downloadQr}
      </a>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="bg-green-700 px-5 pb-6 pt-5 text-white">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold tracking-wide">Green Target</span>
            <LanguageSwitcher />
          </div>
        </div>

        <div className="px-5 pb-16">
          {submitted ? (
            <div className="mt-10 flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <IconCheck size={36} className="text-green-600" />
              </div>
              <h1 className="mt-4 text-xl font-bold text-gray-800">
                {t.successTitle}
              </h1>
              <p className="mt-1 text-gray-600">{t.successMessage}</p>
              {paymentMethod === "qr" && <QrBlock />}
              <button
                type="button"
                onClick={resetForm}
                className="mt-6 rounded-full border border-green-600 px-5 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-green-50"
              >
                {t.submitAnother}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <h1 className="text-xl font-bold text-gray-800">{t.title}</h1>
                <p className="mt-1 text-sm text-gray-500">{t.subtitle}</p>
              </div>

              {/* Name (required) */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t.nameLabel}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  maxLength={255}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* IC / Company No. */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t.idLabel}{" "}
                  <span className="text-xs font-normal text-gray-400">
                    ({t.optional})
                  </span>
                </label>
                <input
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder={t.idPlaceholder}
                  maxLength={50}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t.phoneLabel}{" "}
                  <span className="text-xs font-normal text-gray-400">
                    ({t.optional})
                  </span>
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t.phonePlaceholder}
                  maxLength={30}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Address */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t.addressLabel}{" "}
                  <span className="text-xs font-normal text-gray-400">
                    ({t.optional})
                  </span>
                </label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t.addressPlaceholder}
                  maxLength={500}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Payment method */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t.paymentLabel} <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {paymentOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPaymentMethod(opt.value)}
                      className={`rounded-lg border px-2 py-3 text-sm font-medium transition-colors ${
                        paymentMethod === opt.value
                          ? "border-green-600 bg-green-50 text-green-700 ring-1 ring-green-600"
                          : "border-gray-300 bg-white text-gray-700 hover:border-green-400"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {paymentMethod === "qr" && <QrBlock />}
              </div>

              {/* Same-day payment note */}
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-700">
                  {t.paymentNote}
                </p>
              </div>

              {error && (
                <p className="text-sm font-medium text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-green-600 py-3 text-base font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? t.submitting : t.submit}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerSignupPage;
