import { Employee } from "../../types/types";

/**
 * Collapses staff rows so each employee `name` appears only once.
 * Multi-ID employees share a single leave entitlement (the backend
 * aggregates by name), and this util mirrors that on the UI side.
 *
 * The "winner" per name is the senior sibling: earliest `dateJoined`,
 * tie-broken by `id` ASC. Matches the backend's canonical pick.
 */
export const groupStaffsByName = <T extends Employee>(staffs: T[]): T[] => {
  const byName = new Map<string, T>();

  for (const staff of staffs) {
    const current = byName.get(staff.name);
    if (!current) {
      byName.set(staff.name, staff);
      continue;
    }

    const currentJoined = Date.parse(current.dateJoined);
    const candidateJoined = Date.parse(staff.dateJoined);

    const currentSortable = Number.isNaN(currentJoined)
      ? Number.POSITIVE_INFINITY
      : currentJoined;
    const candidateSortable = Number.isNaN(candidateJoined)
      ? Number.POSITIVE_INFINITY
      : candidateJoined;

    if (
      candidateSortable < currentSortable ||
      (candidateSortable === currentSortable && staff.id < current.id)
    ) {
      byName.set(staff.name, staff);
    }
  }

  return Array.from(byName.values());
};
