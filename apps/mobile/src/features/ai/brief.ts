import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { StoredBrief, todayInTimeZone, weekStart } from '@notion2/shared';
import { useTimeZone } from '@/features/auth/useMe';
import { invoke } from './api';

export const briefKey = (week: string) => ['weekly-brief', week] as const;

export function parseBrief(value: unknown): StoredBrief | null {
  const parsed = StoredBrief.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** This week's brief: generated server-side on the first open of the week, then cached. */
export function useWeeklyBrief() {
  const week = weekStart(todayInTimeZone(useTimeZone()));
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: briefKey(week),
    staleTime: 5 * 60_000,
    networkMode: 'offlineFirst',
    queryFn: async () => parseBrief((await invoke('weekly-brief', {})).proposed_changes),
  });
  const regenerate = useCallback(async () => {
    const brief = parseBrief((await invoke('weekly-brief', { force: true })).proposed_changes);
    qc.setQueryData(briefKey(week), brief);
    return brief;
  }, [qc, week]);
  return { ...query, regenerate };
}
