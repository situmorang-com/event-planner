// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			admin: boolean;
			/** The team name this browser picked (§4.4), or '' when none is set or trusted. */
			who: string;
			/** The admin app's language (header toggle, cookie); English by default. */
			lang: 'en' | 'id';
			/** Light, dark, or the device's own setting (header toggle, cookie); system by default. */
			theme: 'system' | 'light' | 'dark';
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
