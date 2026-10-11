/**
 * Canvas-owned skill share API path.
 *
 * Served by ingress / static-server / the Vite dev server. It is not an
 * agent-server route, even though it lives under `/api` so the deployment
 * session key can protect it the same way as the rest of the stack.
 */
export const SKILL_SHARE_CODES_API_PATH = "/api/canvas/skill-share-codes";
