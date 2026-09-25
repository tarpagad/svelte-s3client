import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	isStarred,
	markRecent,
	recentEntries,
	starredKeys,
	toggleStar,
} from "./activity";

const mem = new Map<string, string>();

beforeEach(() => {
	mem.clear();
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => mem.get(k) ?? null,
		setItem: (k: string, v: string) => void mem.set(k, v),
		removeItem: (k: string) => void mem.delete(k),
	});
});

describe("stars", () => {
	it("toggles on and off", () => {
		expect(toggleStar("c1", "b1", "docs/a.txt")).toBe(true);
		expect(isStarred("c1", "b1", "docs/a.txt")).toBe(true);
		expect(toggleStar("c1", "b1", "docs/a.txt")).toBe(false);
		expect(isStarred("c1", "b1", "docs/a.txt")).toBe(false);
	});

	it("scopes by connection and bucket", () => {
		toggleStar("c1", "b1", "a.txt");
		expect(isStarred("c1", "b2", "a.txt")).toBe(false);
		expect(isStarred("c2", "b1", "a.txt")).toBe(false);
		expect(starredKeys("c1", "b1")).toEqual(["a.txt"]);
		expect(starredKeys("c1", "b2")).toEqual([]);
	});

	it("caps at100 entries, dropping the oldest", () => {
		for (let i = 0; i < 105; i++) toggleStar("c", "b", `k${i}`);
		const keys = starredKeys("c", "b");
		expect(keys.length).toBe(100);
		expect(keys).not.toContain("k0");
		expect(keys).toContain("k104");
	});
});

describe("recents", () => {
	it("newest first and deduped", () => {
		markRecent("c", "b", "one.txt");
		markRecent("c", "b", "two.txt");
		markRecent("c", "b", "one.txt");
		const entries = recentEntries("c", "b");
		expect(entries.map((e) => e.k)).toEqual(["one.txt", "two.txt"]);
	});

	it("caps at50 entries", () => {
		for (let i = 0; i < 60; i++) markRecent("c", "b", `k${i}`);
		expect(recentEntries("c", "b", 100).length).toBe(50);
		expect(recentEntries("c", "b")[0].k).toBe("k59");
	});
});
