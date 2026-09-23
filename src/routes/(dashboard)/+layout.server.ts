import type { LayoutServerLoad } from "./$types";
import { listConnections } from "$lib/server/connections";
import { getServerContext } from "$lib/server/context";

export const load: LayoutServerLoad = async (event) => {
	const connections = await listConnections(getServerContext(event));
	return { connections };
};
