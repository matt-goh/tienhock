// Public (unauthenticated), mobile-first Green Target customer registration form.
// Served on greentarget.tienhock.com and at /greentarget-form.
// A Vite development-only route renders this component with previewMode enabled.
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  IconCheck,
  IconDownload,
  IconMapPin,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { API_BASE_URL } from "../../../configs/config";
import Checkbox from "../../../components/Checkbox";
import GreenTargetLogo from "../../../utils/GreenTargetLogo";
import {
  translations,
  LANGUAGE_LABELS,
  type FormLanguage,
} from "./translations";

type PaymentMethod = "cash" | "online" | "qr";
type IdentityType = "BRN" | "NRIC" | "PASSPORT" | "ARMY";

interface SignupLocation {
  clientId: number;
  site: string;
  address: string;
}

interface SelectOption {
  id: string;
  name: string;
}

interface SignupErrorResponse {
  code?: string;
  message?: string;
}

interface CustomerSignupPageProps {
  previewMode?: boolean;
}

const QR_IMAGE_PATH = "/greentarget-duitnow-qr.jpg";
const MAX_LOCATIONS = 20;
const SABAH_STATE_CODE = "12";

const ID_TYPE_OPTIONS: SelectOption[] = [
  { id: "BRN", name: "BRN" },
  { id: "NRIC", name: "NRIC" },
  { id: "PASSPORT", name: "PASSPORT" },
  { id: "ARMY", name: "ARMY" },
];

const inputClassName =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-500/20 lg:py-3";

const createBlankLocation = (clientId: number): SignupLocation => ({
  clientId,
  site: "",
  address: "",
});

const CustomerSignupPage = ({
  previewMode = false,
}: CustomerSignupPageProps): JSX.Element => {
  const [lang, setLang] = useState<FormLanguage>("ms");
  const t = translations[lang];
  const nextLocationId = useRef<number>(1);

  const [name, setName] = useState<string>("");
  const [idNumber, setIdNumber] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [locations, setLocations] = useState<SignupLocation[]>([
    createBlankLocation(0),
  ]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [einvoiceRequested, setEinvoiceRequested] = useState<boolean>(false);
  const [idType, setIdType] = useState<IdentityType | "">("");
  const [einvoiceIdNumber, setEinvoiceIdNumber] = useState<string>("");
  const [einvoiceIdNumberEdited, setEinvoiceIdNumberEdited] =
    useState<boolean>(false);
  const [tinNumber, setTinNumber] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);

  useEffect((): void => {
    document.title = previewMode
      ? `${t.title} UI Preview | Green Target`
      : `${t.title} | Green Target`;
  }, [previewMode, t.title]);

  const paymentOptions: { value: PaymentMethod; label: string }[] = [
    { value: "cash", label: t.paymentCash },
    { value: "online", label: t.paymentOnline },
    { value: "qr", label: t.paymentQr },
  ];

  const resetForm = (): void => {
    nextLocationId.current = 1;
    setName("");
    setIdNumber("");
    setPhone("");
    setLocations([createBlankLocation(0)]);
    setPaymentMethod("");
    setEinvoiceRequested(false);
    setIdType("");
    setEinvoiceIdNumber("");
    setEinvoiceIdNumberEdited(false);
    setTinNumber("");
    setEmail("");
    setError(null);
    setSubmitted(false);
  };

  const handleIdNumberChange = (value: string): void => {
    setIdNumber(value);
    if (!einvoiceIdNumberEdited) {
      setEinvoiceIdNumber(value);
    }
  };

  const handleEinvoiceIdNumberChange = (value: string): void => {
    setEinvoiceIdNumber(value);
    setEinvoiceIdNumberEdited(true);
  };

  const updateLocation = (
    clientId: number,
    field: "site" | "address",
    value: string
  ): void => {
    setLocations((currentLocations: SignupLocation[]) =>
      currentLocations.map((location: SignupLocation) =>
        location.clientId === clientId
          ? { ...location, [field]: value }
          : location
      )
    );
  };

  const addLocation = (): void => {
    if (locations.length >= MAX_LOCATIONS) return;
    const clientId = nextLocationId.current;
    nextLocationId.current += 1;
    setLocations((currentLocations: SignupLocation[]) => [
      ...currentLocations,
      createBlankLocation(clientId),
    ]);
  };

  const removeLocation = (clientId: number): void => {
    setLocations((currentLocations: SignupLocation[]) =>
      currentLocations.length === 1
        ? currentLocations
        : currentLocations.filter(
            (location: SignupLocation) => location.clientId !== clientId
          )
    );
  };

  const getResponseError = (
    status: number,
    responseBody: SignupErrorResponse
  ): string => {
    if (status === 429) return t.rateLimited;

    switch (responseBody.code) {
      case "EINVOICE_FIELDS_REQUIRED":
        return t.einvoiceFieldsRequired;
      case "INVALID_EMAIL":
        return t.invalidEmail;
      case "EINVOICE_IDENTITY_INVALID":
        return t.invalidEinvoiceIdentity;
      case "EINVOICE_VALIDATION_UNAVAILABLE":
        return t.einvoiceUnavailable;
      default:
        return t.submitError;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    const normalizedLocations = locations.map((location: SignupLocation) => ({
      site: location.site.trim(),
      address: location.address.trim(),
    }));

    if (!name.trim()) {
      setError(t.nameRequired);
      return;
    }
    if (!idNumber.trim()) {
      setError(t.idRequired);
      return;
    }
    if (!phone.trim()) {
      setError(t.phoneRequired);
      return;
    }
    if (
      normalizedLocations.length === 0 ||
      normalizedLocations.some(
        (location: { site: string; address: string }) =>
          !location.site || !location.address
      )
    ) {
      setError(t.locationRequired);
      return;
    }
    if (!paymentMethod) {
      setError(t.paymentRequired);
      return;
    }
    if (
      einvoiceRequested &&
      (!idType || !einvoiceIdNumber.trim() || !tinNumber.trim())
    ) {
      setError(t.einvoiceFieldsRequired);
      return;
    }
    if (
      einvoiceRequested &&
      email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      setError(t.invalidEmail);
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
            locations: normalizedLocations,
            payment_method: paymentMethod,
            einvoice_requested: einvoiceRequested,
            id_type: einvoiceRequested ? idType : null,
            einvoice_id_number: einvoiceRequested
              ? einvoiceIdNumber.trim()
              : null,
            tin_number: einvoiceRequested ? tinNumber.trim() : null,
            email: einvoiceRequested && email.trim() ? email.trim() : null,
            state: einvoiceRequested ? SABAH_STATE_CODE : null,
          }),
        }
      );

      const responseBody: SignupErrorResponse = await response
        .json()
        .catch((): SignupErrorResponse => ({}));

      if (!response.ok) {
        setError(getResponseError(response.status, responseBody));
        return;
      }

      setSubmitted(true);
    } catch (submitError: unknown) {
      console.error("Error submitting Green Target signup:", submitError);
      setError(t.submitError);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreviewSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
  };

  const LanguageSwitcher = (): JSX.Element => (
    <div className="flex shrink-0 items-center gap-1 self-end whitespace-nowrap rounded-full bg-white/15 p-1 text-sm sm:self-auto lg:mt-12 lg:self-start">
      {(Object.keys(LANGUAGE_LABELS) as FormLanguage[]).map(
        (code: FormLanguage) => (
          <button
            key={code}
            type="button"
            onClick={(): void => setLang(code)}
            className={`whitespace-nowrap rounded-full px-2.5 py-1 font-medium transition-colors sm:px-3 ${
              lang === code
                ? "bg-white text-green-800 shadow-sm"
                : "text-white hover:bg-white/15"
            }`}
          >
            {LANGUAGE_LABELS[code]}
          </button>
        )
      )}
    </div>
  );

  const QrBlock = (): JSX.Element => (
    <div className="mt-4 flex flex-col items-center rounded-2xl border border-green-200 bg-green-50 p-4">
      <img
        src={QR_IMAGE_PATH}
        alt="DuitNow QR"
        className="w-56 max-w-full rounded-xl bg-white p-2 shadow-sm"
      />
      <p className="mt-2 text-center text-sm font-semibold text-green-900">
        {t.qrCompany}
      </p>
      <p className="mt-1 text-center text-xs text-green-700">{t.qrHint}</p>
      <a
        href={QR_IMAGE_PATH}
        download="greentarget-duitnow-qr.jpg"
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-800"
      >
        <IconDownload size={18} />
        {t.downloadQr}
      </a>
    </div>
  );

  const RequiredMark = (): JSX.Element => (
    <span className="text-red-500" aria-hidden="true">
      *
    </span>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-gray-100 px-0 py-0 sm:px-5 sm:py-8 lg:px-8 lg:py-8 xl:px-12 2xl:px-6">
      <div className="mx-auto max-w-2xl overflow-hidden bg-white shadow-xl sm:rounded-3xl lg:grid lg:max-w-7xl lg:grid-cols-[280px_minmax(0,1fr)] lg:rounded-[2rem] xl:grid-cols-[320px_minmax(0,1fr)] 2xl:max-w-[1500px] 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <header className="bg-gradient-to-br from-green-800 to-green-600 px-5 py-5 text-white sm:px-8 lg:relative lg:flex lg:min-h-full lg:overflow-hidden lg:px-8 lg:py-10">
          <span
            aria-hidden="true"
            className="hidden lg:absolute lg:-right-20 lg:-top-20 lg:block lg:h-64 lg:w-64 lg:rounded-full lg:bg-white/5"
          />
          <span
            aria-hidden="true"
            className="hidden lg:absolute lg:-bottom-24 lg:-left-24 lg:block lg:h-72 lg:w-72 lg:rounded-full lg:border lg:border-white/10"
          />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-4 lg:relative lg:z-10 lg:flex-1 lg:flex-col lg:items-stretch lg:justify-start">
            <div className="flex shrink-0 items-center gap-3 lg:flex-col lg:items-start lg:gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white p-1 shadow-sm lg:h-24 lg:w-24 lg:rounded-3xl lg:p-2">
                <GreenTargetLogo
                  width={48}
                  height={48}
                  className="lg:h-20 lg:w-20"
                />
              </div>
              <div>
                <p className="whitespace-nowrap text-lg font-bold tracking-wide lg:text-2xl">
                  Green Target
                </p>
                <p className="text-xs text-green-100 lg:mt-1 lg:text-sm">
                  Waste Treatment
                </p>
              </div>
            </div>

            <div aria-hidden="true" className="hidden lg:block lg:pt-14">
              <div className="lg:h-px lg:w-14 lg:bg-green-300/70" />
              <h2 className="lg:mt-6 lg:text-3xl lg:font-bold lg:leading-tight">
                {t.title}
              </h2>
              <p className="lg:mt-3 lg:text-sm lg:leading-6 lg:text-green-100">
                {t.subtitle}
              </p>

              <div className="lg:mt-10 lg:space-y-5">
                <div className="lg:flex lg:items-center lg:gap-3">
                  <span className="lg:flex lg:h-8 lg:w-8 lg:shrink-0 lg:items-center lg:justify-center lg:rounded-full lg:border lg:border-white/30 lg:text-xs lg:font-bold">
                    01
                  </span>
                  <span className="lg:text-sm lg:font-medium lg:text-green-50">
                    {t.nameLabel}
                  </span>
                </div>
                <div className="lg:flex lg:items-center lg:gap-3">
                  <span className="lg:flex lg:h-8 lg:w-8 lg:shrink-0 lg:items-center lg:justify-center lg:rounded-full lg:border lg:border-white/30 lg:text-xs lg:font-bold">
                    02
                  </span>
                  <span className="lg:text-sm lg:font-medium lg:text-green-50">
                    {t.locationsTitle}
                  </span>
                </div>
                <div className="lg:flex lg:items-center lg:gap-3">
                  <span className="lg:flex lg:h-8 lg:w-8 lg:shrink-0 lg:items-center lg:justify-center lg:rounded-full lg:border lg:border-white/30 lg:text-xs lg:font-bold">
                    03
                  </span>
                  <span className="lg:text-sm lg:font-medium lg:text-green-50">
                    {t.paymentLabel}
                  </span>
                </div>
              </div>
            </div>
            <LanguageSwitcher />
          </div>
        </header>

        <main className="px-5 pb-14 pt-6 sm:px-8 lg:px-10 lg:pb-12 lg:pt-10 xl:px-12">
          {previewMode && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
            >
              Development UI preview — submissions are disabled.
            </div>
          )}
          {submitted ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center lg:min-h-[calc(100vh-8rem)]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <IconCheck size={36} className="text-green-700" />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-gray-900">
                {t.successTitle}
              </h1>
              <p className="mt-2 text-gray-600">{t.successMessage}</p>
              {paymentMethod === "qr" && <QrBlock />}
              <button
                type="button"
                onClick={resetForm}
                className="mt-7 rounded-full border border-green-700 px-5 py-2.5 text-sm font-semibold text-green-800 transition-colors hover:bg-green-50"
              >
                {t.submitAnother}
              </button>
            </div>
          ) : (
            <form
              onSubmit={previewMode ? handlePreviewSubmit : handleSubmit}
              className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] lg:items-start lg:gap-x-6 lg:gap-y-6 lg:space-y-0"
            >
              <div className="lg:col-span-2">
                <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
                <p className="mt-1 text-sm text-gray-500">{t.subtitle}</p>
              </div>

              <section className="grid gap-4 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:p-5">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    {t.nameLabel} <RequiredMark />
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(event): void => setName(event.target.value)}
                    placeholder={t.namePlaceholder}
                    maxLength={255}
                    required
                    autoComplete="name"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    {t.idLabel} <RequiredMark />
                  </label>
                  <input
                    type="text"
                    value={idNumber}
                    onChange={(event): void =>
                      handleIdNumberChange(event.target.value)
                    }
                    placeholder={t.idPlaceholder}
                    maxLength={50}
                    required
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                    {t.phoneLabel} <RequiredMark />
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(event): void => setPhone(event.target.value)}
                    placeholder={t.phonePlaceholder}
                    maxLength={20}
                    required
                    autoComplete="tel"
                    className={inputClassName}
                  />
                </div>
              </section>

              <section className="space-y-3 lg:col-start-1 lg:row-span-5 lg:row-start-3 lg:rounded-3xl lg:border lg:border-gray-200 lg:bg-gray-50/70 lg:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">
                      {t.locationsTitle}
                    </h2>
                    <p className="text-xs text-gray-500">
                      {locations.length} {t.locationLabel.toLowerCase()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addLocation}
                    disabled={locations.length >= MAX_LOCATIONS}
                    className="inline-flex items-center gap-1.5 rounded-full border border-green-700 px-3 py-2 text-sm font-semibold text-green-800 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <IconPlus size={17} />
                    {t.addLocation}
                  </button>
                </div>

                {locations.map((location: SignupLocation, index: number) => (
                  <div
                    key={location.clientId}
                    className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700">
                          <IconMapPin size={17} />
                        </span>
                        {t.locationLabel} {index + 1}
                      </div>
                      {locations.length > 1 && (
                        <button
                          type="button"
                          onClick={(): void => removeLocation(location.clientId)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                          aria-label={`${t.removeLocation} ${index + 1}`}
                        >
                          <IconTrash size={16} />
                          {t.removeLocation}
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[180px_1fr] lg:grid-cols-1">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                          {t.siteLabel} <RequiredMark />
                        </label>
                        <input
                          type="text"
                          value={location.site}
                          onChange={(event): void =>
                            updateLocation(
                              location.clientId,
                              "site",
                              event.target.value
                            )
                          }
                          placeholder={t.sitePlaceholder}
                          maxLength={100}
                          required
                          className={inputClassName}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                          {t.addressLabel} <RequiredMark />
                        </label>
                        <textarea
                          value={location.address}
                          onChange={(event): void =>
                            updateLocation(
                              location.clientId,
                              "address",
                              event.target.value
                            )
                          }
                          placeholder={t.addressPlaceholder}
                          maxLength={255}
                          rows={2}
                          required
                          className={`${inputClassName} resize-y`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </section>

              <section className="rounded-2xl border border-green-200 bg-green-50/60 p-4 lg:col-start-2 lg:row-start-3 lg:p-5">
                <Checkbox
                  checked={einvoiceRequested}
                  onChange={setEinvoiceRequested}
                  checkedColor="text-green-700"
                  uncheckedColor="text-green-700 hover:!text-green-800 dark:!text-green-700 dark:hover:!text-green-800"
                  ariaLabel={t.einvoiceRequestLabel}
                  label={t.einvoiceRequestLabel}
                  className="items-start [&_span]:!text-green-950 [&_span]:hover:!text-green-800"
                  buttonClassName="mt-0.5 rounded hover:!bg-green-100 dark:hover:!bg-green-100"
                />
                <p className="ml-7 mt-1 text-xs text-green-800">
                  {t.einvoiceRequestHint}
                </p>

                {einvoiceRequested && (
                  <div className="mt-4 border-t border-green-200 pt-4">
                    <h2 className="mb-3 text-sm font-bold text-green-950">
                      {t.einvoiceTitle}
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                          {t.idTypeLabel} <RequiredMark />
                        </label>
                        <select
                          value={idType}
                          onChange={(event): void =>
                            setIdType(event.target.value as IdentityType | "")
                          }
                          required={einvoiceRequested}
                          className={inputClassName}
                        >
                          <option value="">{t.idTypePlaceholder}</option>
                          {ID_TYPE_OPTIONS.map((option: SelectOption) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                          {t.einvoiceIdLabel} <RequiredMark />
                        </label>
                        <input
                          type="text"
                          value={einvoiceIdNumber}
                          onChange={(event): void =>
                            handleEinvoiceIdNumberChange(event.target.value)
                          }
                          placeholder={t.einvoiceIdPlaceholder}
                          maxLength={50}
                          required={einvoiceRequested}
                          className={inputClassName}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                          {t.tinLabel} <RequiredMark />
                        </label>
                        <input
                          type="text"
                          value={tinNumber}
                          onChange={(event): void =>
                            setTinNumber(event.target.value)
                          }
                          placeholder={t.tinPlaceholder}
                          maxLength={20}
                          required={einvoiceRequested}
                          className={inputClassName}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
                          {t.emailLabel}{" "}
                          <span className="font-normal text-gray-500">
                            {t.optionalLabel}
                          </span>
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(event): void => setEmail(event.target.value)}
                          placeholder={t.emailPlaceholder}
                          maxLength={255}
                          autoComplete="email"
                          className={inputClassName}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="lg:col-start-2 lg:row-start-4 lg:rounded-2xl lg:border lg:border-gray-200 lg:bg-white lg:p-5 lg:shadow-sm">
                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  {t.paymentLabel} <RequiredMark />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {paymentOptions.map(
                    (option: { value: PaymentMethod; label: string }) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={(): void => setPaymentMethod(option.value)}
                        className={`rounded-xl border px-2 py-3 text-sm font-semibold transition ${
                          paymentMethod === option.value
                            ? "border-green-700 bg-green-50 text-green-800 ring-1 ring-green-700"
                            : "border-gray-300 bg-white text-gray-700 hover:border-green-500"
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  )}
                </div>
                {paymentMethod === "qr" && <QrBlock />}
              </section>

              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 lg:col-start-2 lg:row-start-5">
                <p className="text-sm font-semibold text-red-700">
                  {t.paymentNote}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 lg:col-start-2"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-green-700 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60 lg:col-start-2"
              >
                {submitting ? t.submitting : t.submit}
              </button>
            </form>
          )}
        </main>
      </div>
    </div>
  );
};

export default CustomerSignupPage;
