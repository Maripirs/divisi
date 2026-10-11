/** Canonical form of a group's join code as a person might type or read it
 * aloud. Codes are generated as 8 uppercase characters with no separator
 * (see Backend's `app/core/join_codes.py`), but people naturally write them
 * in chunks ("9cjm-7vru", "9CJM 7VRU"), so every place that takes a code
 * from a human (the `/join` form, a `/join/{code}` URL, a `?code=` link)
 * strips whitespace and dashes and uppercases first. The Backend applies
 * the same rule (`normalize_join_code`), so this is a convenience for
 * building tidy URLs and cookie names, not the only line of defense. */
export function normalizeJoinCode(raw: string): string {
	return raw.replace(/[\s\-\u2010-\u2015]+/g, '').toUpperCase();
}
