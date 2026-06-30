import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { api } from "../routes/utils/api";
import type {
  GeneralStockRow,
  GeneralStockSearchResponse,
} from "../types/types";

const DEFAULT_SEARCH_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 250;

interface GeneralStockSearchParams {
  search: string;
  dateFrom: string;
  dateTo: string;
  limit: number;
  offset: number;
  lineIds?: number[];
}

interface UseGeneralStockSearchOptions {
  initialDateTo?: string;
  limit?: number;
}

interface UseGeneralStockSearchResult {
  rows: GeneralStockRow[];
  searchRows: GeneralStockRow[];
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  dateFrom: string;
  setDateFrom: Dispatch<SetStateAction<string>>;
  dateTo: string;
  setDateTo: Dispatch<SetStateAction<string>>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
  ensureRows: (lineIds: number[]) => Promise<void>;
  getRowById: (lineId: number | null | undefined) => GeneralStockRow | null;
}

const mergeRows = (
  currentRows: GeneralStockRow[],
  incomingRows: GeneralStockRow[]
): GeneralStockRow[] => {
  const rowsById: Map<number, GeneralStockRow> = new Map(
    currentRows.map((row: GeneralStockRow) => [row.line_id, row])
  );

  incomingRows.forEach((row: GeneralStockRow) => {
    rowsById.set(row.line_id, row);
  });

  return Array.from(rowsById.values());
};

const buildSearchEndpoint = (params: GeneralStockSearchParams): string => {
  const searchParams: URLSearchParams = new URLSearchParams();
  searchParams.set("limit", String(params.limit));
  searchParams.set("offset", String(params.offset));

  const trimmedSearch: string = params.search.trim();
  if (trimmedSearch) searchParams.set("search", trimmedSearch);
  if (params.dateFrom) searchParams.set("date_from", params.dateFrom);
  if (params.dateTo) searchParams.set("date_to", params.dateTo);
  if (params.lineIds && params.lineIds.length > 0) {
    searchParams.set("line_ids", params.lineIds.join(","));
  }

  return `/api/general-purchases/general-stock/search?${searchParams.toString()}`;
};

export const useGeneralStockSearch = ({
  initialDateTo = "",
  limit = DEFAULT_SEARCH_LIMIT,
}: UseGeneralStockSearchOptions = {}): UseGeneralStockSearchResult => {
  const [rows, setRows] = useState<GeneralStockRow[]>([]);
  const [searchRows, setSearchRows] = useState<GeneralStockRow[]>([]);
  const [query, setQuery] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>(initialDateTo);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextOffset, setNextOffset] = useState<number>(0);
  const searchRequestIdRef = useRef<number>(0);

  const rowsById: Map<number, GeneralStockRow> = useMemo(
    () =>
      new Map(
        rows.map((row: GeneralStockRow) => [row.line_id, row])
      ),
    [rows]
  );

  useEffect(() => {
    setDateTo(initialDateTo);
  }, [initialDateTo]);

  const fetchRows = useCallback(
    async (offset: number): Promise<void> => {
      const isFirstPage: boolean = offset === 0;
      const requestId: number = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;

      if (isFirstPage) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const response: GeneralStockSearchResponse =
          await api.get<GeneralStockSearchResponse>(
            buildSearchEndpoint({
              search: query,
              dateFrom,
              dateTo,
              limit,
              offset,
            })
          );
        const incomingRows: GeneralStockRow[] = response.rows || [];
        if (requestId !== searchRequestIdRef.current) return;

        setSearchRows((currentRows: GeneralStockRow[]) =>
          isFirstPage ? incomingRows : mergeRows(currentRows, incomingRows)
        );
        setRows((currentRows: GeneralStockRow[]) =>
          mergeRows(currentRows, incomingRows)
        );
        setHasMore(Boolean(response.has_more));
        setNextOffset(response.next_offset || offset + incomingRows.length);
      } catch (error: unknown) {
        if (requestId !== searchRequestIdRef.current) return;
        console.error("Error loading general stock rows:", error);
        if (isFirstPage) setSearchRows([]);
        setHasMore(false);
        setNextOffset(offset);
      } finally {
        if (requestId !== searchRequestIdRef.current) return;
        if (isFirstPage) {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [dateFrom, dateTo, limit, query]
  );

  useEffect(() => {
    const timer: number = window.setTimeout(() => {
      void fetchRows(0);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [fetchRows]);

  const loadMore = useCallback((): void => {
    if (!hasMore || loading || loadingMore) return;
    void fetchRows(nextOffset);
  }, [fetchRows, hasMore, loading, loadingMore, nextOffset]);

  const ensureRows = useCallback(
    async (lineIds: number[]): Promise<void> => {
      const missingLineIds: number[] = Array.from(new Set(lineIds)).filter(
        (lineId: number) => Number.isInteger(lineId) && !rowsById.has(lineId)
      );

      if (missingLineIds.length === 0) return;

      try {
        const response: GeneralStockSearchResponse =
          await api.get<GeneralStockSearchResponse>(
            buildSearchEndpoint({
              search: "",
              dateFrom: "",
              dateTo: "",
              limit: Math.min(Math.max(missingLineIds.length, 1), 200),
              offset: 0,
              lineIds: missingLineIds,
            })
          );
        const incomingRows: GeneralStockRow[] = response.rows || [];
        setRows((currentRows: GeneralStockRow[]) =>
          mergeRows(currentRows, incomingRows)
        );
      } catch (error: unknown) {
        console.error("Error loading selected general stock rows:", error);
      }
    },
    [rowsById]
  );

  const getRowById = useCallback(
    (lineId: number | null | undefined): GeneralStockRow | null => {
      if (!lineId) return null;
      return rowsById.get(lineId) || null;
    },
    [rowsById]
  );

  return {
    rows,
    searchRows,
    query,
    setQuery,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    ensureRows,
    getRowById,
  };
};
