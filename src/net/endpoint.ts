/** Full https URL of the CloudBase mailbox. Empty hides the online buttons.
 *  `VITE_MAILBOX_URL` points a dev build at cloudbase/functions/mailbox/local.js instead. */
const LOCAL = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_MAILBOX_URL ?? '';
export const MAILBOX_URL = LOCAL;

/** https anywhere, or plain http on this machine for the local mailbox. */
export function mailboxUsable(url: string): boolean {
  if (url.startsWith('https://')) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
}
