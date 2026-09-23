import { describe, expect, it } from "vitest";
import { sanitizeZipPath } from "./zip-path";

describe("sanitizeZipPath (zip-slip defence)", () => {
  it("passes through ordinary keys", () => {
    expect(sanitizeZipPath("docs/report.pdf")).toBe("docs/report.pdf");
    expect(sanitizeZipPath("file.txt")).toBe("file.txt");
    expect(sanitizeZipPath("a/b/c/deep.png")).toBe("a/b/c/deep.png");
  });

  it("strips leading slashes and drive letters", () => {
    expect(sanitizeZipPath("/etc/passwd")).toBe("etc/passwd");
    expect(sanitizeZipPath("C:/Windows/system32")).toBe("Windows/system32");
    expect(sanitizeZipPath("C:\\Users\\victim")).toBe("Users/victim");
  });

  it("removes .. segments at any position", () => {
    expect(sanitizeZipPath("../../etc/passwd")).toBe("etc/passwd");
    // .. is dropped, not applied — remaining segments stay inside the zip
    expect(sanitizeZipPath("safe/../../../escape.txt")).toBe("safe/escape.txt");
    expect(sanitizeZipPath("..\\..\\win.ini")).toBe("win.ini");
  });

  it("removes . and empty segments", () => {
    expect(sanitizeZipPath("./a/./b//c/")).toBe("a/b/c");
  });

  it("falls back when nothing survives", () => {
    expect(sanitizeZipPath("../..")).toBe("download");
    expect(sanitizeZipPath("")).toBe("download");
    expect(sanitizeZipPath("...")).toBe("...");
    expect(sanitizeZipPath("..", "fallback.txt")).toBe("fallback.txt");
  });
});
