import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { executeDbWrite } from './db-write';
import { supabase } from './supabase';
import { configureWriteQueue } from './write-queue';

export { DB_WRITE_KEY } from './write-queue';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Render from the persisted cache immediately; refresh in the background.
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      networkMode: 'offlineFirst',
      retry: 2,
    },
  },
});

configureWriteQueue(queryClient, (write) => executeDbWrite(supabase, write));

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'notion2-cache-v1',
  throttleTime: 500,
});

if (Platform.OS !== 'web') {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );
}

export async function clearLocalData() {
  queryClient.clear();
  await persister.removeClient();
}
