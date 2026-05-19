import { Employee } from "../../types/types";

const getSortableJoinedDate = (dateJoined: string): number => {
  const parsedDate: number = Date.parse(dateJoined);
  return Number.isNaN(parsedDate) ? Number.POSITIVE_INFINITY : parsedDate;
};

const compareStaffByCanonicalOrder = <T extends Employee>(
  firstStaff: T,
  secondStaff: T,
): number => {
  const firstJoined: number = getSortableJoinedDate(firstStaff.dateJoined);
  const secondJoined: number = getSortableJoinedDate(secondStaff.dateJoined);

  if (firstJoined !== secondJoined) {
    return firstJoined - secondJoined;
  }

  return firstStaff.id.localeCompare(secondStaff.id);
};

const groupStaffRowsByName = <T extends Employee>(
  staffs: T[],
): Map<string, T[]> => {
  const byName: Map<string, T[]> = new Map<string, T[]>();

  for (const staff of staffs) {
    const current: T[] | undefined = byName.get(staff.name);
    if (current) {
      current.push(staff);
    } else {
      byName.set(staff.name, [staff]);
    }
  }

  return byName;
};

/**
 * Collapses staff rows so each employee `name` appears only once.
 * Multi-ID employees share a single leave entitlement (the backend
 * aggregates by name), and this util mirrors that on the UI side.
 *
 * The "winner" per name is the senior sibling: earliest `dateJoined`,
 * tie-broken by `id` ASC. Matches the backend's canonical pick.
 */
export const groupStaffsByName = <T extends Employee>(staffs: T[]): T[] => {
  const groupedStaffs: Map<string, T[]> = groupStaffRowsByName(staffs);
  const canonicalStaffs: T[] = [];

  for (const staffGroup of groupedStaffs.values()) {
    const canonicalStaff: T | undefined = [...staffGroup].sort(
      compareStaffByCanonicalOrder,
    )[0];
    if (canonicalStaff) canonicalStaffs.push(canonicalStaff);
  }

  return canonicalStaffs;
};

export const getGroupedStaffIdsByEmployeeId = <T extends Employee>(
  staffs: T[],
): Map<string, string[]> => {
  const groupedStaffs: Map<string, T[]> = groupStaffRowsByName(staffs);
  const groupedIdsByEmployeeId: Map<string, string[]> = new Map<
    string,
    string[]
  >();

  for (const staffGroup of groupedStaffs.values()) {
    const groupedIds: string[] = [...staffGroup]
      .sort(compareStaffByCanonicalOrder)
      .map((staff: T) => staff.id);

    for (const staff of staffGroup) {
      groupedIdsByEmployeeId.set(staff.id, groupedIds);
    }
  }

  return groupedIdsByEmployeeId;
};
