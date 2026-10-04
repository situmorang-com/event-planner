import { ORG_NAME, PRIVACY_URL } from './config';
import { secret } from './db';
import type { MessagingEnv } from './messaging';
import { publicBaseUrl } from './urls';

/** The deployment's side of a message, read once per request; messaging.ts stays config-free. */
export function messagingEnv(url: URL): MessagingEnv {
	return { org: ORG_NAME, privacyUrl: PRIVACY_URL, base: publicBaseUrl(url).base, secret };
}
