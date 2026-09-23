import type { Cookies } from "@sveltejs/kit";

export interface UserPrefs {
	viewMode: "list" | "grid";
	itemsPerPage: number;
}

export const DEFAULT_PREFS: UserPrefs = {
	viewMode: "list",
	itemsPerPage: 20,
};

export function getUserPrefs(cookies: Cookies): UserPrefs {
	const prefsCookie = cookies.get("user_prefs");

	if (!prefsCookie) return DEFAULT_PREFS;

	try {
		const parsed = JSON.parse(decodeURIComponent(prefsCookie));
		return {
			viewMode: parsed.viewMode === "grid" ? "grid" : "list",
			itemsPerPage:
				typeof parsed.itemsPerPage === "number" ? parsed.itemsPerPage : 20,
		};
	} catch {
		return DEFAULT_PREFS;
	}
}
