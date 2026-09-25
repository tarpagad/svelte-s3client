import { describe, expect, it } from "vitest";
import {
	destKeyForKey,
	destKeyForPrefix,
	folderDestPrefix,
	isInsidePrefix,
} from "./move-path";

describe("destKeyForKey", () => {
	it("keeps the file name at the root destination", () => {
		expect(destKeyForKey("docs/a.txt", "")).toBe("a.txt");
	});
	it("lands directly under a folder destination", () => {
		expect(destKeyForKey("a.txt", "archive/")).toBe("archive/a.txt");
	});
	it("uses only the base name of nested keys", () => {
		expect(destKeyForKey("docs/2024/report.pdf", "backup/")).toBe(
			"backup/report.pdf",
		);
	});
	it("tolerates a destination without a trailing slash", () => {
		expect(destKeyForKey("a.txt", "archive")).toBe("archivea.txt");
	});
});

describe("destKeyForPrefix", () => {
	it("re-bases folder children under the new folder prefix", () => {
		expect(
			destKeyForPrefix("photos/2024/img.png", "photos/", "archive/photos/"),
		).toBe("archive/photos/2024/img.png");
	});
	it("normalizes a source prefix without a trailing slash", () => {
		expect(destKeyForPrefix("photos/img.png", "photos", "archive/photos/")).toBe(
			"archive/photos/img.png",
		);
	});
	it("supports rename in place (new name already in destPrefix)", () => {
		expect(destKeyForPrefix("photos/a.txt", "photos/", "holiday/")).toBe(
			"holiday/a.txt",
		);
	});
	it("maps the folder marker itself to the destination marker", () => {
		expect(destKeyForPrefix("photos/", "photos/", "archive/photos/")).toBe(
			"archive/photos/",
		);
	});
});

describe("folderDestPrefix", () => {
	it("joins parent and name", () => {
		expect(folderDestPrefix("archive", "photos")).toBe("archive/photos/");
	});
	it("handles the root parent", () => {
		expect(folderDestPrefix("", "photos")).toBe("photos/");
	});
	it("keeps an existing trailing slash on the parent", () => {
		expect(folderDestPrefix("archive/", "photos")).toBe("archive/photos/");
	});
});

describe("isInsidePrefix", () => {
	it("detects nested destinations", () => {
		expect(isInsidePrefix("photos/", "photos/sub")).toBe(true);
	});
	it("detects the folder itself", () => {
		expect(isInsidePrefix("photos/", "photos")).toBe(true);
	});
	it("does not match sibling prefixes sharing a string prefix", () => {
		expect(isInsidePrefix("photos/", "photos-old/")).toBe(false);
	});
	it("root contains everything", () => {
		expect(isInsidePrefix("", "anything/at/all")).toBe(true);
	});
});
