/** Public (client-safe) configuration. Never put server secrets in EXPO_PUBLIC_* vars. */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  authAppleEnabled: process.env.EXPO_PUBLIC_AUTH_APPLE === '1',
  authGoogleEnabled: process.env.EXPO_PUBLIC_AUTH_GOOGLE === '1',
  /** Domain that receives forwarded email (Postmark inbound), e.g. in.example.com. */
  inboundEmailDomain: process.env.EXPO_PUBLIC_INBOUND_EMAIL_DOMAIN ?? '',
  /** Public web app origin, used for client links (`<appUrl>/p/<token>`). */
  appUrl: process.env.EXPO_PUBLIC_APP_URL ?? '',
};
