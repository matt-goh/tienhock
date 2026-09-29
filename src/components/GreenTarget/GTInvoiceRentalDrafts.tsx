import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import Button from "../Button";
import PillSelect, { type PillSelectOption } from "../PillSelect";
import { FormListbox, type SelectOption } from "../FormComponents";
import { greenTargetApi } from "../../routes/greentarget/api";
import { api } from "../../routes/utils/api";
import { formatLocationDisplay } from "../../utils/greenTarget/formatLocationDisplay";
import type { GreenTargetNewInvoiceRental } from "../../types/greenTargetTypes";

export interface GTInvoiceRentalDraft extends GreenTargetNewInvoiceRental {
  uid: string;
  edited: boolean;
  locationInitialized: boolean;
  location_address?: string | null;
  location_site?: string | null;
}

export const createGTInvoiceRentalDraft = (
  driver: string = ""
): GTInvoiceRentalDraft => ({
  uid: crypto.randomUUID(),
  driver,
  location_id: null,
  tong_no: null,
  edited: false,
  locationInitialized: false,
});

interface Driver {
  id: string;
  name: string;
}

interface RentalLocation {
  location_id: number;
  customer_id: number;
  site: string | null;
  address: string;
  phone_number: string | null;
}

interface Dumpster {
  tong_no: string;
}

interface LocationDraft {
  address: string;
  site: string;
  phone_number: string;
}

const locationFields: ReadonlyArray<{
  name: keyof LocationDraft;
  label: string;
  maxLength: number;
}> = [
  { name: "address", label: "Address", maxLength: 255 },
  { name: "site", label: "Site (optional)", maxLength: 100 },
  { name: "phone_number", label: "Location phone (optional)", maxLength: 20 },
];

interface GTInvoiceRentalDraftsProps {
  customerId: number;
  customerPhone: string;
  drafts: GTInvoiceRentalDraft[];
  onChange: React.Dispatch<React.SetStateAction<GTInvoiceRentalDraft[]>>;
  disabled: boolean;
}

// The parent keys this section by customer so location requests and dialogs
// cannot outlive the customer they belong to.
const GTInvoiceRentalDrafts: React.FC<GTInvoiceRentalDraftsProps> = ({
  customerId,
  customerPhone,
  drafts,
  onChange,
  disabled,
}) => {
  const { t } = useTranslation("greentarget");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [dumpsters, setDumpsters] = useState<Dumpster[]>([]);
  const [locations, setLocations] = useState<RentalLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState<boolean>(true);
  const [referenceError, setReferenceError] = useState<boolean>(false);
  const [locationError, setLocationError] = useState<boolean>(false);
  const [reload, setReload] = useState<number>(0);
  const [locationRentalUid, setLocationRentalUid] = useState<string | null>(null);
  const [locationDraft, setLocationDraft] = useState<LocationDraft>({ address: "", site: "", phone_number: "" });
  const [savingLocation, setSavingLocation] = useState<boolean>(false);
  const savingLocationRef = useRef<boolean>(false);

  useEffect((): (() => void) => {
    let active: boolean = true;
    setReferenceError(false);
    const load = async (): Promise<void> => {
      const results: [PromiseSettledResult<Driver[]>, PromiseSettledResult<Dumpster[]>] = await Promise.allSettled([
        api.get("/api/staffs/get-drivers"),
        greenTargetApi.getDumpsters(),
      ]);
      if (!active) return;
      const [driverResult, dumpsterResult] = results;
      if (driverResult.status === "fulfilled") {
        setDrivers(driverResult.value);
        const firstDriver: string = driverResult.value[0]?.name || "";
        onChange((current: GTInvoiceRentalDraft[]): GTInvoiceRentalDraft[] =>
          current.map((draft: GTInvoiceRentalDraft): GTInvoiceRentalDraft =>
            draft.driver ? draft : { ...draft, driver: firstDriver }
          )
        );
      }
      if (dumpsterResult.status === "fulfilled") setDumpsters(dumpsterResult.value);
      setReferenceError(results.some((result: PromiseSettledResult<Driver[] | Dumpster[]>): boolean => result.status === "rejected"));
    };
    void load();
    return (): void => { active = false; };
  }, [onChange, reload]);

  useEffect((): (() => void) => {
    let active: boolean = true;
    setLocationsLoading(true);
    setLocationError(false);
    const load = async (): Promise<void> => {
      try {
        const rows: RentalLocation[] = await greenTargetApi.getLocationsByCustomer(customerId);
        if (!active) return;
        setLocations(rows);
        onChange((current: GTInvoiceRentalDraft[]): GTInvoiceRentalDraft[] =>
          current.map((draft: GTInvoiceRentalDraft): GTInvoiceRentalDraft =>
            draft.locationInitialized ? draft : {
              ...draft,
              location_id: rows[0]?.location_id || null,
              location_address: rows[0]?.address || null,
              location_site: rows[0]?.site || null,
              locationInitialized: true,
            }
          )
        );
      } catch (error: unknown) {
        if (!active) return;
        console.error("Failed to load invoice locations:", error);
        setLocationError(true);
      } finally {
        if (active) setLocationsLoading(false);
      }
    };
    void load();
    return (): void => { active = false; };
  }, [customerId, onChange, reload]);

  const updateDraft = (uid: string, patch: Partial<GTInvoiceRentalDraft>): void => {
    onChange((current: GTInvoiceRentalDraft[]): GTInvoiceRentalDraft[] =>
      current.map((draft: GTInvoiceRentalDraft): GTInvoiceRentalDraft =>
        draft.uid === uid ? { ...draft, ...patch, edited: true } : draft
      )
    );
  };

  const addRental = (): void => {
    onChange((current: GTInvoiceRentalDraft[]): GTInvoiceRentalDraft[] => [
      ...current,
      {
        ...createGTInvoiceRentalDraft(current[current.length - 1]?.driver || drivers[0]?.name || ""),
        location_id: locations[0]?.location_id || null,
        location_address: locations[0]?.address || null,
        location_site: locations[0]?.site || null,
        locationInitialized: !locationsLoading && !locationError,
      },
    ]);
  };

  const closeLocation = (): void => {
    if (!savingLocationRef.current) setLocationRentalUid(null);
  };

  const saveLocation = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();
    if (savingLocationRef.current || !locationRentalUid) return;
    if (!locationDraft.address.trim()) {
      toast.error(t("Address is required"));
      return;
    }
    savingLocationRef.current = true;
    setSavingLocation(true);
    try {
      const response: { location: RentalLocation } = await greenTargetApi.createLocation({
        customer_id: customerId,
        address: locationDraft.address.trim(),
        site: locationDraft.site.trim(),
        phone_number: locationDraft.phone_number.trim(),
      });
      setLocations((current: RentalLocation[]): RentalLocation[] => [...current, response.location]);
      updateDraft(locationRentalUid, {
        location_id: response.location.location_id,
        location_address: response.location.address,
        location_site: response.location.site,
        locationInitialized: true,
      });
      setLocationRentalUid(null);
      toast.success(t("Location added."));
    } catch (error: unknown) {
      console.error("Failed to add invoice location:", error);
      toast.error(t("Failed add location."));
    } finally {
      savingLocationRef.current = false;
      setSavingLocation(false);
    }
  };

  const driverOptions: PillSelectOption<string>[] = drivers.map((driver: Driver): PillSelectOption<string> => ({ value: driver.name, label: driver.name }));
  const locationOptions: SelectOption[] = [
    { id: "", name: locationsLoading ? t("Loading locations...") : t("No specific location") },
    ...locations.map((location: RentalLocation): SelectOption => ({
      id: location.location_id,
      name: formatLocationDisplay(location.site, location.address),
    })),
  ];
  const dumpsterOptions: SelectOption[] = [
    { id: "", name: t("No dumpster") },
    ...dumpsters.map((dumpster: Dumpster): SelectOption => ({ id: dumpster.tong_no, name: dumpster.tong_no })),
  ];

  return (
    <section className="space-y-4 border-t border-default-200 p-4 dark:border-gray-700 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-default-800 dark:text-gray-100">
          {t("New rentals")}
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-default-100 px-2 py-0.5 text-xs tabular-nums text-default-600 dark:bg-gray-700 dark:text-gray-300">{drafts.length}</span>
        </h2>
        <Button type="button" icon={IconPlus} variant="outline" color="sky" size="sm" onClick={addRental} disabled={disabled}>{t("Add new rental")}</Button>
      </div>
      {(referenceError || locationError) && (
        <div className="flex items-center gap-3 text-sm text-amber-700 dark:text-amber-300" role="alert">
          <span>{t("Some rental options could not be loaded.")}</span>
          <Button type="button" variant="outline" disabled={disabled} onClick={(): void => setReload((current: number): number => current + 1)}>{t("Retry")}</Button>
        </div>
      )}
      {drafts.map((draft: GTInvoiceRentalDraft, index: number): React.ReactElement => (
        <div key={draft.uid} className="space-y-3 rounded-xl border border-default-200 bg-default-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-default-700 dark:text-gray-200">{t("New rental {{number}}", { number: index + 1 })}</span>
            <button type="button" disabled={disabled} title={t("Remove rental")} aria-label={t("Remove rental")}
              onClick={(): void => onChange((current: GTInvoiceRentalDraft[]): GTInvoiceRentalDraft[] => current.filter((row: GTInvoiceRentalDraft): boolean => row.uid !== draft.uid))}
              className="rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-900/20">
              <IconTrash size={18} />
            </button>
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium text-default-700 dark:text-gray-200">{t("Driver")} <span className="text-red-500">*</span></span>
            <PillSelect options={driverOptions} value={draft.driver} onChange={(driver: string): void => updateDraft(draft.uid, { driver })} size="md" disabled={disabled} ariaLabel={t("Driver")} />
            {drivers.length === 0 && <p className="text-xs text-default-500">{t("A driver must be available before creating a rental.")}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <FormListbox name={`rental_location_${draft.uid}`} label={t("Service location (optional)")} value={draft.location_id?.toString() || ""}
                options={locationOptions} anchor="bottom start" disabled={disabled || locationsLoading}
                onChange={(value: string): void => {
                  const selectedLocation: RentalLocation | undefined = locations.find((row: RentalLocation): boolean => row.location_id === Number(value));
                  updateDraft(draft.uid, {
                    location_id: value ? Number(value) : null,
                    location_address: selectedLocation?.address || null,
                    location_site: selectedLocation?.site || null,
                    locationInitialized: true,
                  });
                }} />
              <button type="button" disabled={disabled || locationsLoading} className="text-sm text-sky-600 hover:underline disabled:opacity-50 dark:text-sky-400"
                onClick={(): void => {
                  setLocationDraft({ address: "", site: "", phone_number: customerPhone });
                  setLocationRentalUid(draft.uid);
                }}>{t("Add location")}</button>
            </div>
            <FormListbox name={`rental_dumpster_${draft.uid}`} label={t("Dumpster (optional)")} value={draft.tong_no || ""}
              options={dumpsterOptions} anchor="bottom start" disabled={disabled}
              onChange={(value: string): void => updateDraft(draft.uid, { tong_no: value || null })} />
          </div>
        </div>
      ))}
      {drafts.length === 0 && <p className="text-sm text-default-500 dark:text-gray-400">{t("Add a new rental or select an existing rental below.")}</p>}
      <Dialog open={locationRentalUid !== null} onClose={closeLocation} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <DialogTitle className="text-lg font-semibold text-default-900 dark:text-gray-100">{t("Add location")}</DialogTitle>
            <form onSubmit={saveLocation} className="mt-4 space-y-4">
              {locationFields.map((field: (typeof locationFields)[number]): React.ReactElement => (
                <label key={field.name} className="block space-y-1 text-sm text-default-700 dark:text-gray-200">
                  <span>{t(field.label)}{field.name === "address" && <span className="ml-1 text-red-500">*</span>}</span>
                  <input value={locationDraft[field.name]} required={field.name === "address"} maxLength={field.maxLength}
                    type={field.name === "phone_number" ? "tel" : "text"} disabled={savingLocation}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setLocationDraft((current: LocationDraft): LocationDraft => ({ ...current, [field.name]: event.target.value }))}
                    className="block w-full rounded-lg border border-default-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-700" />
                </label>
              ))}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" disabled={savingLocation} onClick={closeLocation}>{t("Cancel")}</Button>
                <Button type="submit" disabled={savingLocation}>{savingLocation ? t("Saving...") : t("Add location")}</Button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>
    </section>
  );
};

export default GTInvoiceRentalDrafts;
