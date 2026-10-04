// Web: no push notifications (the settings section is hidden on web).
export type PushStatus = 'unknown' | 'granted' | 'denied' | 'unavailable';

export function usePushRegistration(): { status: PushStatus; register: () => Promise<boolean> } {
  return { status: 'unavailable', register: async () => false };
}

export function useNotificationSetup() {}
