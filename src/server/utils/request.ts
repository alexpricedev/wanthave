import type { BunRequest } from "bun";

// Handlers that only care about a captured route parameter use these aliases.
// Bun infers `params` from the route string, so a bare `BunRequest` has no
// `slug`/`id` to read; spelling out the parameter keeps the handler reusable
// across every route that captures it (e.g. /l/:slug and /l/:slug/og.png) while
// still typechecking as a handler for those routes.
export type SlugRequest = BunRequest<`${string}:slug${string}`>;

export type IdRequest = BunRequest<`${string}:id${string}`>;
