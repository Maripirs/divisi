/**
 * Keep-warm pinger for the Divisi backend.
 *
 * The backend runs on Render's free plan, which spins the instance down
 * after ~15 minutes of no traffic. The next real visitor then pays a 30s+
 * cold start, which surfaced on the frontend as "couldn't reach the
 * server" / "No piece found with that id" cards that a refresh cleared.
 *
 * This is a standalone Cloudflare Worker (not the SvelteKit frontend
 * Worker) whose only job is a scheduled GET to /health every few minutes,
 * via a Cron Trigger (see wrangler.jsonc). Cloudflare's scheduler is
 * punctual, unlike GitHub Actions' `schedule:`, which drifts under load.
 *
 * Nothing calls the `fetch` handler; it exists only so `wrangler dev` and
 * a manual browser hit have something to return.
 */

const HEALTH_URL = 'https://divisi.onrender.com/health';

async function ping() {
	try {
		const res = await fetch(HEALTH_URL, {
			// A cold start (this very ping is what wakes the instance) can
			// take ~30s. Well under the Worker's wall-time budget, and if it
			// does get cut short the next tick a few minutes later still
			// lands on a now-warming instance.
			signal: AbortSignal.timeout(60_000),
			cf: { cacheTtl: 0 }
		});
		console.log(`keepwarm: ${res.status} ${res.statusText}`);
	} catch (err) {
		// A failed ping still triggered the wake-up. Log and move on; the
		// schedule retries on its own cadence.
		console.log(`keepwarm: ${err instanceof Error ? err.message : String(err)}`);
	}
}

export default {
	async scheduled(_event, _env, ctx) {
		ctx.waitUntil(ping());
	},

	async fetch() {
		await ping();
		return new Response('keepwarm: pinged ' + HEALTH_URL + '\n', {
			headers: { 'content-type': 'text/plain' }
		});
	}
};
