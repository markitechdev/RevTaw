/**
 * Supabase Auth limits requests per IP address. RevTaw calls Auth from its
 * server, so it forwards the student's address in `Sb-Forwarded-For` (honoured
 * only with the secret key and when IP address forwarding is on). Only a
 * plain IPv4 or IPv6 literal is forwarded.
 */
export function forwardableAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const address = value.split(",")[0]?.trim() ?? "";
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(address)) return address;
  if (/^[0-9a-f:]+$/i.test(address) && address.includes(":") && address.length <= 45) return address;
  return null;
}
