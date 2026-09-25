/**
 * Pure key-mapping helpers for move/copy operations. Kept free of SDK
 * imports so they can be unit tested directly (same pattern as zip-path).
 */

function ensureTrailingSlash(prefix: string): string {
	if (prefix === "" || prefix.endsWith("/")) return prefix;
	return `${prefix}/`;
}

/** Last path segment of a key ("a/b/c.txt" -> "c.txt", "a/b/" -> "b"). */
function lastSegment(key: string): string {
	const withoutSlash = key.endsWith("/") ? key.slice(0, -1) : key;
	const parts = withoutSlash.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? withoutSlash;
}

/**
 * Destination folder prefix for moving/renaming a folder itself:
 * parent + name. The caller computes this (the UI knows the tree),
 * mapping then just re-bases children under it.
 */
export function folderDestPrefix(destParent: string, folderName: string): string {
	const parent = ensureTrailingSlash(destParent);
	return `${parent}${folderName}/`;
}

/**
 * Destination for an explicitly selected file: Drive semantics — the
 * item keeps its name and lands directly under the destination.
 */
export function destKeyForKey(key: string, destPrefix: string): string {
	return `${destPrefix}${lastSegment(key)}`;
}

/**
 * Destination for an object underneath a moved/renamed folder prefix:
 * children keep their relative paths under the (already named) prefix.
 */
export function destKeyForPrefix(
	key: string,
	srcPrefix: string,
	destPrefix: string,
): string {
	const src = ensureTrailingSlash(srcPrefix);
	return `${destPrefix}${key.slice(src.length)}`;
}

/** True when `maybeChild` is `prefix` itself or nested below it. */
export function isInsidePrefix(prefix: string, maybeChild: string): boolean {
	const src = ensureTrailingSlash(prefix);
	const dest = ensureTrailingSlash(maybeChild);
	return dest === src || dest.startsWith(src);
}
