/**
 * Zip-slip defence for zip entry names. Selection prefixes come from the
 * request, so a crafted folder prefix (e.g. "../") would otherwise produce
 * entries that escape the extraction directory. Collapses backslashes,
 * strips drive letters/leading slashes, drops "." and ".." segments, and
 * removes empty segments. Returns the fallback name when nothing remains.
 */
export function sanitizeZipPath(path: string, fallback = "download"): string {
  const segments = path
    .replace(/\\/g, "/")
    .replace(/^([A-Za-z]:)?\/+/, "")
    .split("/")
    .filter((s) => s.length > 0 && s !== "." && s !== "..");
  return segments.length > 0 ? segments.join("/") : fallback;
}
