/**
 * Pure helpers for the soft-delete trash namespace (ADR-0005). Trash
 * entries are self-describing: `.s3client-trash/<stamp>/<originalKey>`
 * — restore just strips the two prefix segments, so no metadata or
 * database is needed to know where an object came back from.
 */

export const TRASH_PREFIX = ".s3client-trash/";
export const TRASH_MAX_AGE_DAYS = 30;

/** UTC stamp `YYYY-MM-DDTHH-MM-SS` — lexicographic order == time order. */
export function trashStamp(date: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return (
		`${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}` +
		`T${p(date.getUTCHours())}-${p(date.getUTCMinutes())}-${p(date.getUTCSeconds())}`
	);
}

/** Prefix for one deletion batch (all items of one trash operation). */
export function trashBatchPrefix(stamp: string): string {
	return `${TRASH_PREFIX}${stamp}/`;
}

export function trashDestKey(originalKey: string, at: Date): string {
	return `${trashBatchPrefix(trashStamp(at))}${originalKey}`;
}

export function isTrashKey(key: string): boolean {
	return parseTrashKey(key) !== null;
}

const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})$/;

export function parseStamp(stamp: string): Date | null {
	const m = STAMP_RE.exec(stamp);
	if (!m) return null;
	const [, y, mo, d, h, mi, s] = m;
	return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

export function parseTrashKey(key: string): {
	originalKey: string;
	deletedAt: Date;
} | null {
	if (!key.startsWith(TRASH_PREFIX)) return null;
	const rest = key.slice(TRASH_PREFIX.length);
	const slash = rest.indexOf("/");
	if (slash <= 0) return null;
	const stamp = rest.slice(0, slash);
	const originalKey = rest.slice(slash + 1);
	const deletedAt = parseStamp(stamp);
	if (!deletedAt || originalKey === "") return null;
	return { originalKey, deletedAt };
}

export function isExpired(
	deletedAt: Date,
	now: Date,
	maxAgeDays: number = TRASH_MAX_AGE_DAYS,
): boolean {
	return now.getTime() - deletedAt.getTime() > maxAgeDays * 24 * 60 * 60 * 1000;
}
