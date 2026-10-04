import { useMemo } from 'react';
import { buildToday, todayInTimeZone } from '@notion2/shared';
import { useClients } from '@/features/clients/api';
import { useTasks } from '@/features/tasks/api';
import { useTimeZone } from '@/features/auth/useMe';

export function useToday() {
  const tasks = useTasks();
  const clients = useClients();
  const timeZone = useTimeZone();
  const today = todayInTimeZone(timeZone);
  const view = useMemo(
    () => buildToday({ tasks: tasks.data ?? [], clients: clients.data ?? [], today, timeZone }),
    [tasks.data, clients.data, today, timeZone],
  );
  return {
    view,
    today,
    tasks: tasks.data,
    isLoading: tasks.isPending || clients.isPending,
    refetch: () => Promise.all([tasks.refetch(), clients.refetch()]),
  };
}
