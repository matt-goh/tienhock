import { api } from "../utils/api";
import type {
  GreenTargetDebtorSubScheduleQuery,
  GreenTargetDebtorSubScheduleResponse,
  GreenTargetDebtorSubScheduleRow,
} from "../../types/greenTargetDebtorSubSchedule";

const CD_SD_SUB_SCHEDULE_ENDPOINT =
  "/greentarget/api/debtors/sub-schedule/CD_SD";
const MAX_PAGE_LIMIT = 1000;

const buildSubScheduleQuery = (
  query: GreenTargetDebtorSubScheduleQuery
): string => {
  const params = new URLSearchParams({
    year: String(query.year),
    month: String(query.month),
    page: String(query.page ?? 1),
    limit: String(query.limit ?? 100),
    includeZero: "1",
  });

  const search: string = query.search?.trim() ?? "";
  if (search) params.set("search", search);
  if (query.hideZero) params.set("hideZero", "1");

  return `${CD_SD_SUB_SCHEDULE_ENDPOINT}?${params.toString()}`;
};

export const getGreenTargetDebtorSubSchedule = async (
  query: GreenTargetDebtorSubScheduleQuery
): Promise<GreenTargetDebtorSubScheduleResponse> => {
  return api.get<GreenTargetDebtorSubScheduleResponse>(
    buildSubScheduleQuery(query)
  );
};

export const getAllGreenTargetDebtorSubScheduleRows = async (
  query: Omit<GreenTargetDebtorSubScheduleQuery, "page" | "limit">
): Promise<GreenTargetDebtorSubScheduleResponse> => {
  let page: number = 1;
  let firstResponse: GreenTargetDebtorSubScheduleResponse | null = null;
  const rows: GreenTargetDebtorSubScheduleRow[] = [];

  for (;;) {
    const response: GreenTargetDebtorSubScheduleResponse =
      await getGreenTargetDebtorSubSchedule({
        ...query,
        page,
        limit: MAX_PAGE_LIMIT,
      });

    if (!firstResponse) firstResponse = response;
    rows.push(...response.rows);

    const totalPages: number = Math.max(1, response.total_pages);
    if (page >= totalPages) break;
    page += 1;
  }

  if (!firstResponse) {
    throw new Error("The CD/SD debtor schedule returned no response.");
  }

  return {
    ...firstResponse,
    rows,
    page: 1,
    limit: rows.length,
    total_pages: 1,
  };
};
