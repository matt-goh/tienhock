// src/utils/payroll/useEffectiveRates.ts
// Resolves the rate effective for a payroll month for a set of
// {employee_id, job_id, pay_code_id} tuples by calling the backend, which reuses
// the same get_effective_pay_rate() SQL function payroll processing uses. This
// keeps work-log entry/detail rate previews in step with the payslip without
// re-implementing the resolution rule on the client. See pay_rate_schedules.
import { useCallback, useState } from "react";
import { api } from "../../routes/utils/api";

export interface EffectiveRate {
  rate_biasa: number | null;
  rate_ahad: number | null;
  rate_umum: number | null;
}

export interface ResolveTuple {
  employee_id?: string | null;
  job_id?: string | null;
  pay_code_id: string;
}

const keyOf = (employeeId?: string | null, jobId?: string | null, payCodeId?: string) =>
  `${employeeId ?? ""}|${jobId ?? ""}|${payCodeId ?? ""}`;

export const useEffectiveRates = () => {
  const [rateMap, setRateMap] = useState<Record<string, EffectiveRate>>({});

  // Fetch the effective rates for (year, month) for the given tuples and store
  // them. Safe to call repeatedly; an empty/invalid input clears the map.
  const resolveEffectiveRates = useCallback(
    async (
      year: number | null | undefined,
      month: number | null | undefined,
      tuples: ResolveTuple[],
    ) => {
      // Preserve the previous object identity whenever the content is
      // unchanged: consumers keep rateMap-derived callbacks in effect
      // dependency arrays, and a fresh-but-equal object would re-trigger
      // those effects in a feedback loop of /resolve calls.
      const setIfChanged = (next: Record<string, EffectiveRate>) =>
        setRateMap((prev) =>
          JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
        );
      if (!year || !month || !Array.isArray(tuples) || tuples.length === 0) {
        setIfChanged({});
        return;
      }
      try {
        const map: Record<string, EffectiveRate> = await api.post(
          "/api/pay-rate-schedules/resolve",
          { year, month, items: tuples },
        );
        setIfChanged(map && typeof map === "object" ? map : {});
      } catch (err) {
        // Non-fatal: callers fall back to base/override rates on null.
        console.error("Error resolving effective rates:", err);
        setIfChanged({});
      }
    },
    [],
  );

  // Returns the month-effective rate for a tuple, or null when none is known
  // (caller should then keep its existing base/override rate).
  const getEffectiveRate = useCallback(
    (
      employeeId?: string | null,
      jobId?: string | null,
      payCodeId?: string,
    ): EffectiveRate | null => rateMap[keyOf(employeeId, jobId, payCodeId)] ?? null,
    [rateMap],
  );

  return { resolveEffectiveRates, getEffectiveRate };
};
