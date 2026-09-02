/** Shared state for the header's "a track you had generating is done" alert
 * (`$lib/components/OmrJobAlerts.svelte`, rendered inside `AppHeader` on
 * every main screen). `AppHeader` is mounted per-page, so it mounts and
 * unmounts on every navigation — keeping the job list, the poll timer, and
 * the set of already-seen job ids in this module (not the component) means
 * none of that is lost or restarted on each nav.
 *
 * Data comes from the `/omr/jobs` proxy route, which forwards the
 * Backend's `GET /omr/jobs` (the caller's own OMR jobs, newest first).
 * `ensureFresh()` fetches on mount if the last fetch is stale, and while
 * any job is still `pending`/`running` a ~20s poll keeps the list current
 * so a "just finished" flip shows up even if the admin never navigates.
 * The poll stops as soon as nothing is active. */
import { browser } from '$app/environment';
import type { OmrJobListItem } from '$lib/server/backendTypes';

/** Job ids the user has already seen the alert for, persisted so a
 * dismissed alert stays dismissed across reloads. */
const SEEN_KEY = 'divisi:omrJobsSeen';
const POLL_MS = 20_000;
/** Skip a refetch on mount if we already fetched this recently — a burst
 * of navigations between header pages shouldn't each fire a request. */
const STALE_MS = 15_000;

function loadSeen(): string[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(SEEN_KEY);
		const parsed = raw ? (JSON.parse(raw) as unknown) : [];
		return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
	} catch {
		return [];
	}
}

function saveSeen(ids: string[]): void {
	if (!browser) return;
	try {
		localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
	} catch {
		// Private mode / quota exceeded — the alert just won't remember
		// dismissals across reloads, which is a fine degradation.
	}
}

const state = $state({
	jobs: [] as OmrJobListItem[],
	seen: loadSeen()
});

let lastFetch = 0;
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function isActive(job: OmrJobListItem): boolean {
	return job.status === 'pending' || job.status === 'running';
}

function syncPolling(): void {
	const active = state.jobs.some(isActive);
	if (active && timer === null) {
		timer = setInterval(() => {
			// Don't poll a backgrounded tab — the user isn't looking, and a
			// long-running job that finishes while they're away is caught by
			// the `ensureFresh` fetch when they navigate back anyway.
			if (typeof document !== 'undefined' && document.hidden) return;
			void refetch();
		}, POLL_MS);
	} else if (!active && timer !== null) {
		clearInterval(timer);
		timer = null;
	}
}

async function refetch(): Promise<void> {
	if (inFlight) return inFlight;
	inFlight = (async () => {
		try {
			const res = await fetch('/omr/jobs');
			if (!res.ok) return;
			const jobs = (await res.json()) as OmrJobListItem[];
			state.jobs = jobs;
			lastFetch = Date.now();
			// Drop seen-ids the Backend no longer returns so the stored set
			// can't grow without bound.
			const live = new Set(jobs.map((j) => j.id));
			const pruned = state.seen.filter((id) => live.has(id));
			if (pruned.length !== state.seen.length) {
				state.seen = pruned;
				saveSeen(pruned);
			}
			syncPolling();
		} catch {
			// Network hiccup — keep whatever we had; the next poll (or nav)
			// tries again.
		} finally {
			inFlight = null;
		}
	})();
	return inFlight;
}

export const omrJobs = {
	/** Finished jobs worth nagging about that the user hasn't dismissed —
	 * what the alert actually shows. A `done` job only counts while its
	 * auto-imported draft is still waiting: once the admin accepts or
	 * discards it (on the group's Tracks tab), `pending_generated_version_id`
	 * clears and the next fetch drops the alert on its own, no dismissal
	 * needed. A `failed` job always counts until dismissed. */
	get unseen(): OmrJobListItem[] {
		return state.jobs.filter((j) => {
			if (state.seen.includes(j.id)) return false;
			if (j.status === 'failed') return true;
			return j.status === 'done' && j.pending_generated_version_id !== null;
		});
	},

	/** Called from `OmrJobAlerts` on mount. Fetches if the list is stale,
	 * otherwise just makes sure the poll timer matches the current jobs. */
	ensureFresh(): void {
		if (!browser) return;
		if (Date.now() - lastFetch > STALE_MS) void refetch();
		else syncPolling();
	},

	/** Mark every job that belongs to one group (or the no-group bucket)
	 * as seen — used when the user clicks through the alert to that group's
	 * Tracks tab, so acting on one batch clears its whole notification. */
	dismissGroup(groupId: string | null): void {
		const toAdd = this.unseen.filter((j) => j.group_id === groupId).map((j) => j.id);
		if (toAdd.length === 0) return;
		state.seen = [...state.seen, ...toAdd];
		saveSeen(state.seen);
	},

	/** Dismiss everything currently showing — the alert's × button. */
	dismissAll(): void {
		const toAdd = this.unseen.map((j) => j.id);
		if (toAdd.length === 0) return;
		state.seen = [...state.seen, ...toAdd];
		saveSeen(state.seen);
	}
};
