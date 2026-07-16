import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../routes/utils/api";

interface AccountCodeFavouriteResponse {
  id: number;
  account_code: string;
  created_at: string;
}

interface UseAccountCodeFavouritesResult {
  favouriteCodes: Set<string>;
  pendingCodes: Set<string>;
  isLoading: boolean;
  toggleFavourite: (accountCode: string) => Promise<void>;
}

const useAccountCodeFavourites = (): UseAccountCodeFavouritesResult => {
  const { user } = useAuth();
  const [favouriteCodes, setFavouriteCodes] = useState<Set<string>>(
    new Set<string>()
  );
  const [pendingCodes, setPendingCodes] = useState<Set<string>>(
    new Set<string>()
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const favouriteCodesRef = useRef<Set<string>>(new Set<string>());
  const pendingCodesRef = useRef<Set<string>>(new Set<string>());
  const activeUserIdRef = useRef<string | null>(user?.id || null);
  const fetchRequestIdRef = useRef<number>(0);

  const replaceFavouriteCodes = useCallback((codes: Set<string>): void => {
    favouriteCodesRef.current = codes;
    setFavouriteCodes(codes);
  }, []);

  const replacePendingCodes = useCallback((codes: Set<string>): void => {
    pendingCodesRef.current = codes;
    setPendingCodes(codes);
  }, []);

  useEffect((): (() => void) | void => {
    const userId: string | null = user?.id || null;
    activeUserIdRef.current = userId;
    const requestId: number = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;
    replacePendingCodes(new Set<string>());

    if (!userId) {
      replaceFavouriteCodes(new Set<string>());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const fetchFavourites = async (): Promise<void> => {
      try {
        const rows = await api.get<AccountCodeFavouriteResponse[]>(
          "/api/account-code-favourites"
        );
        if (
          fetchRequestIdRef.current !== requestId ||
          activeUserIdRef.current !== userId
        ) {
          return;
        }
        replaceFavouriteCodes(
          new Set<string>(
            rows.map(
              (row: AccountCodeFavouriteResponse): string => row.account_code
            )
          )
        );
      } catch (error: unknown) {
        if (
          fetchRequestIdRef.current !== requestId ||
          activeUserIdRef.current !== userId
        ) {
          return;
        }
        console.error("Error fetching account code favourites:", error);
        replaceFavouriteCodes(new Set<string>());
        toast.error("Failed to load account favourites");
      } finally {
        if (
          fetchRequestIdRef.current === requestId &&
          activeUserIdRef.current === userId
        ) {
          setIsLoading(false);
        }
      }
    };

    void fetchFavourites();
    return (): void => {
      if (fetchRequestIdRef.current === requestId) {
        fetchRequestIdRef.current += 1;
      }
      if (activeUserIdRef.current === userId) {
        activeUserIdRef.current = null;
      }
    };
  }, [replaceFavouriteCodes, replacePendingCodes, user?.id]);

  const toggleFavourite = useCallback(
    async (accountCode: string): Promise<void> => {
      const userId: string | null = user?.id || null;
      if (!userId || pendingCodesRef.current.has(accountCode)) return;

      const wasFavourite: boolean = favouriteCodesRef.current.has(accountCode);
      const nextPendingCodes: Set<string> = new Set<string>(
        pendingCodesRef.current
      );
      nextPendingCodes.add(accountCode);
      replacePendingCodes(nextPendingCodes);

      const optimisticCodes: Set<string> = new Set<string>(
        favouriteCodesRef.current
      );
      if (wasFavourite) optimisticCodes.delete(accountCode);
      else optimisticCodes.add(accountCode);
      replaceFavouriteCodes(optimisticCodes);

      try {
        const encodedAccountCode: string = encodeURIComponent(accountCode);
        if (wasFavourite) {
          await api.delete(`/api/account-code-favourites/${encodedAccountCode}`);
        } else {
          await api.put(
            `/api/account-code-favourites/${encodedAccountCode}`,
            {}
          );
        }
      } catch (error: unknown) {
        if (activeUserIdRef.current === userId) {
          const revertedCodes: Set<string> = new Set<string>(
            favouriteCodesRef.current
          );
          if (wasFavourite) revertedCodes.add(accountCode);
          else revertedCodes.delete(accountCode);
          replaceFavouriteCodes(revertedCodes);
          toast.error(
            wasFavourite
              ? "Failed to remove account favourite"
              : "Failed to add account favourite"
          );
        }
        console.error("Error updating account code favourite:", error);
      } finally {
        if (activeUserIdRef.current === userId) {
          const remainingPendingCodes: Set<string> = new Set<string>(
            pendingCodesRef.current
          );
          remainingPendingCodes.delete(accountCode);
          replacePendingCodes(remainingPendingCodes);
        }
      }
    },
    [replaceFavouriteCodes, replacePendingCodes, user?.id]
  );

  return {
    favouriteCodes,
    pendingCodes,
    isLoading,
    toggleFavourite,
  };
};

export default useAccountCodeFavourites;
