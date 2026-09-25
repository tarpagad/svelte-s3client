/**
 * Client-only activity store for Drive-style favorites and recents
 * (ADR-0006). Lives in localStorage: never read server-side, contains
 * only key names (no credentials), and escapes the 4 KB cookie budget.
 * All calls are no-ops during SSR.
 */

const KEY = "s3-client-activity";
const MAX_STARRED = 100;
const MAX_RECENT = 50;

export interface RecentEntry {
	/** connection id */
	c: string;
	/** bucket */
	b: string;
	/** object key */
	k: string;
	/** last activity, epoch ms */
	t: number;
}

interface StarredEntry {
	c: string;
	b: string;
	k: string;
}

interface Store {
	starred: StarredEntry[];
	recent: RecentEntry[];
}

const fresh = (): Store => ({ starred: [], recent: [] });

function storage(): Storage | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

function load(): Store {
	const s = storage();
	if (!s) return fresh();
	try {
		const raw = s.getItem(KEY);
		if (!raw) return fresh();
		const parsed = JSON.parse(raw) as Partial<Store>;
		return {
			starred: Array.isArray(parsed.starred) ? parsed.starred : [],
			recent: Array.isArray(parsed.recent) ? parsed.recent : [],
		};
	} catch {
		return fresh();
	}
}

function save(store: Store): void {
	const s = storage();
	if (!s) return;
	try {
		s.setItem(KEY, JSON.stringify(store));
	} catch {
		// quota or privacy mode — activity is best-effort only
	}
}

function match(entry: { c: string; b: string; k: string }, c: string, b: string, k: string) {
	return entry.c === c && entry.b === b && entry.k === k;
}

export function isStarred(c: string, b: string, k: string): boolean {
	return load().starred.some((e) => match(e, c, b, k));
}

/** Toggle a star; returns the new starred state. */
export function toggleStar(c: string, b: string, k: string): boolean {
	const store = load();
	const idx = store.starred.findIndex((e) => match(e, c, b, k));
	if (idx >= 0) {
		store.starred.splice(idx, 1);
		save(store);
		return false;
	}
	store.starred.unshift({ c, b, k });
	if (store.starred.length > MAX_STARRED) store.starred.length = MAX_STARRED;
	save(store);
	return true;
}

/** Starred keys for one bucket, most recently starred first. */
export function starredKeys(c: string, b: string): string[] {
	return load()
		.starred.filter((e) => e.c === c && e.b === b)
		.map((e) => e.k);
}

/** Record an upload/download/preview touch; LRU-capped per bucket. */
export function markRecent(c: string, b: string, k: string): void {
	const store = load();
	store.recent = store.recent.filter((e) => !match(e, c, b, k));
	store.recent.unshift({ c, b, k, t: Date.now() });
	if (store.recent.length > MAX_RECENT) store.recent.length = MAX_RECENT;
	save(store);
}

/** Recent entries for one bucket, newest first. */
export function recentEntries(c: string, b: string, limit = 20): RecentEntry[] {
	return load()
		.recent.filter((e) => e.c === c && e.b === b)
		.slice(0, limit);
}
