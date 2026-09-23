import type { Handle } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { buildSecurityHeaders } from "$lib/security-headers";

const securityHeaders = buildSecurityHeaders(dev);

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value);
  }
  return response;
};
