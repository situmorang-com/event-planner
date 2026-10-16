/**
 * Copies synchronously, inside the click, before a new tab takes the focus away: the async
 * clipboard API refuses a page that has lost focus. Falls back to it where execCommand is gone.
 */
export function copyNow(text: string): boolean {
	const area = document.createElement('textarea');
	area.value = text;
	area.setAttribute('readonly', '');
	area.style.position = 'fixed';
	area.style.opacity = '0';
	document.body.append(area);
	area.select();
	let ok = false;
	try {
		ok = document.execCommand('copy');
	} catch {
		ok = false;
	}
	area.remove();
	if (!ok) navigator.clipboard?.writeText(text).catch(() => {});
	return ok;
}
