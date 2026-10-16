/**
 * One file out of a zip, in the browser, with no library: LinkedIn sends its data export as a
 * zip, and the organizer shouldn't have to unpack it to hand over Connections.csv. Reads the
 * central directory, so it doesn't trip on entries whose sizes sit in a trailing descriptor.
 * Null when no entry's name ends with `suffix` (case aside) or the zip isn't readable.
 */
export async function fileFromZip(data: ArrayBuffer, suffix: string): Promise<string | null> {
	const view = new DataView(data);
	const bytes = new Uint8Array(data);
	// End of central directory: 22 bytes, plus a comment of up to 64 KB, at the very end.
	let end = -1;
	for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 65_557); i--)
		if (view.getUint32(i, true) === 0x06054b50) {
			end = i;
			break;
		}
	if (end < 0) return null;
	const count = view.getUint16(end + 10, true);
	let at = view.getUint32(end + 16, true);
	const decoder = new TextDecoder();
	const want = suffix.toLowerCase();
	for (let n = 0; n < count && view.getUint32(at, true) === 0x02014b50; n++) {
		const method = view.getUint16(at + 10, true);
		const size = view.getUint32(at + 20, true);
		const nameLength = view.getUint16(at + 28, true);
		const skip = nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
		const local = view.getUint32(at + 42, true);
		const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
		at += 46 + skip;
		if (!name.toLowerCase().endsWith(want)) continue;
		const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
		const raw = bytes.subarray(start, start + size);
		if (method === 0) return decoder.decode(raw);
		if (method !== 8) return null;
		const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
		return new Response(stream).text();
	}
	return null;
}
