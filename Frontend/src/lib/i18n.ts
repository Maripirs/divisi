/** Locale-aware internal link/redirect helper — Paraglide's `localizeHref`
 * doesn't run automatically on plain `href`/`goto`/`redirect` calls (only
 * inbound URLs are de-localized, by `src/hooks.ts`'s `reroute`), so every
 * internal path in this app goes through this instead of a raw string:
 * `<a href={lh('/home')}>`, `goto(lh('/home'))`, `redirect(303,
 * lh('/home'))`. Without it, a plain internal link would silently drop
 * the `/es` prefix on the very next click, since the URL carries no
 * fallback the way a locale cookie would (this app doesn't set one).
 * Works identically server- and client-side — `localizeHref`'s default
 * (no explicit `locale` option) reads the current request's/page's own
 * locale via Paraglide's async-local-storage-backed `getLocale()`, so this
 * needs no locale parameter threaded through call sites. Never use for an
 * external URL (YouTube embeds, etc.) — those aren't part of this app's
 * route tree at all. */
export { localizeHref as lh } from '$lib/paraglide/runtime';
