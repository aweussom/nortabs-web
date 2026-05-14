/**
 * Manual version stamp for cache-busting `catalog.json` and `enrichment.json`
 * fetches. Bump this string when:
 *   - The catalog shape changes
 *   - A new crawl/enrichment is pushed that users need to pick up
 *   - JS that depends on a new catalog field is shipped
 *
 * Plain JS changes (UI tweaks, etc.) usually don't need a bump — they
 * arrive via the HTML's normal cache cycle and don't risk inconsistency.
 *
 * Format: ISO date + optional dash-suffix counter (e.g. '2026-05-14-2').
 */
export const APP_VERSION = '2026-05-14-1';
