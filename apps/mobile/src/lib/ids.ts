import * as Crypto from 'expo-crypto';

/** Client-generated row IDs so offline creates keep a stable identity. */
export function newId(): string {
  return Crypto.randomUUID();
}
