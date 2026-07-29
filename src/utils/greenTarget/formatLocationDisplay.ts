// src/utils/greenTarget/formatLocationDisplay.ts

// Green Target locations optionally carry a short Site label alongside the
// required address. Wherever a rental's address is shown, the site is shown
// with it using this single format.
export const formatLocationDisplay = (
  site: string | null | undefined,
  address: string | null | undefined
): string => {
  const trimmedSite: string = site?.trim() ?? "";
  const trimmedAddress: string = address?.trim() ?? "";
  if (trimmedSite && trimmedAddress) {
    return `${trimmedSite} — ${trimmedAddress}`;
  }
  return trimmedSite || trimmedAddress;
};
