import { describe, expect, it } from "vitest";
import {
	TRASH_PREFIX,
	isExpired,
	isTrashKey,
	parseStamp,
	parseTrashKey,
	trashBatchPrefix,
	trashDestKey,
	trashStamp,
} from "./trash-path";

describe("trashStamp", () => {
	it("formats UTC parts with fixed width", () => {
		const d = new Date(Date.UTC(2026, 8, 25, 7, 5, 3));
		expect(trashStamp(d)).toBe("2026-09-25T07-05-03");
	});
	it("round-trips through parseStamp", () => {
		const d = new Date(Date.UTC(2026, 0, 1, 23, 59, 59));
		expect(parseStamp(trashStamp(d))?.getTime()).toBe(d.getTime());
	});
	it("rejects malformed stamps", () => {
		expect(parseStamp("nope")).toBeNull();
		expect(parseStamp("2026-9-25T07-05-03")).toBeNull();
	});
});

describe("trashDestKey / parseTrashKey", () => {
	it("round-trips a nested key", () => {
		const at = new Date(Date.UTC(2026, 8, 25, 12, 0, 0));
		const key = trashDestKey("photos/2024/img.png", at);
		expect(key).toBe(`${TRASH_PREFIX}2026-09-25T12-00-00/photos/2024/img.png`);
		const parsed = parseTrashKey(key);
		expect(parsed?.originalKey).toBe("photos/2024/img.png");
		expect(parsed?.deletedAt.getTime()).toBe(at.getTime());
	});
	it("round-trips a folder marker", () => {
		const at = new Date(Date.UTC(2026, 8, 25, 12, 0, 0));
		const parsed = parseTrashKey(trashDestKey("photos/", at));
		expect(parsed?.originalKey).toBe("photos/");
	});
	it("rejects non-trash and malformed keys", () => {
		expect(parseTrashKey("photos/a.png")).toBeNull();
		expect(parseTrashKey(TRASH_PREFIX)).toBeNull();
		expect(parseTrashKey(`${TRASH_PREFIX}not-a-stamp/a.png`)).toBeNull();
		expect(parseTrashKey(`${TRASH_PREFIX}2026-09-25T12-00-00/`)).toBeNull();
		expect(isTrashKey("x")).toBe(false);
		expect(isTrashKey(trashDestKey("x", new Date()))).toBe(true);
	});
	it("keeps lexicographic batch order chronological", () => {
		const a = trashBatchPrefix(trashStamp(new Date(Date.UTC(2026, 8, 25, 9, 0, 0))));
		const b = trashBatchPrefix(trashStamp(new Date(Date.UTC(2026, 8, 25, 10, 0, 0))));
		expect(a < b).toBe(true);
	});
});

describe("isExpired", () => {
	const now = new Date(Date.UTC(2026, 8, 25, 12, 0, 0));
	it("keeps entries inside the window", () => {
		const at = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
		expect(isExpired(at, now)).toBe(false);
	});
	it("expires entries past30 days", () => {
		const at = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
		expect(isExpired(at, now)).toBe(true);
	});
	it("boundary: exactly30 days old is still kept", () => {
		const at = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
		expect(isExpired(at, now)).toBe(false);
	});
});
