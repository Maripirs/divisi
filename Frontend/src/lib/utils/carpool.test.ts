import { describe, expect, it } from 'vitest';
import { driverOfferError, eventFieldsMissing, riderRequestError, selectDefaultCarpoolEventId } from './carpool';

describe('driverOfferError', () => {
	it('requires an origin label', () => {
		expect(driverOfferError('', 3)).toBe('origin');
		expect(driverOfferError('   ', 3)).toBe('origin');
	});

	it('requires at least 1 seat', () => {
		expect(driverOfferError('Mission', null)).toBe('seats');
		expect(driverOfferError('Mission', 0)).toBe('seats');
		expect(driverOfferError('Mission', -1)).toBe('seats');
		expect(driverOfferError('Mission', NaN)).toBe('seats');
	});

	it('passes with an origin and at least 1 seat', () => {
		expect(driverOfferError('Mission', 1)).toBeNull();
		expect(driverOfferError('Mission', 4)).toBeNull();
	});
});

describe('riderRequestError', () => {
	it('requires an origin label', () => {
		expect(riderRequestError('')).toBe('origin');
		expect(riderRequestError('  ')).toBe('origin');
	});

	it('passes with any real origin', () => {
		expect(riderRequestError('Sunset')).toBeNull();
	});
});

describe('eventFieldsMissing', () => {
	it('flags a blank title, date, or destination', () => {
		expect(eventFieldsMissing('', '2026-09-16T18:00', 'Hall')).toBe(true);
		expect(eventFieldsMissing('Rehearsal', '', 'Hall')).toBe(true);
		expect(eventFieldsMissing('Rehearsal', '2026-09-16T18:00', '')).toBe(true);
	});

	it('passes once all three are filled', () => {
		expect(eventFieldsMissing('Rehearsal', '2026-09-16T18:00', 'Hall')).toBe(false);
	});
});

describe('selectDefaultCarpoolEventId', () => {
	const standing = { id: 'standing', is_standing: true };
	const dated = { id: 'dated-1', is_standing: false };

	it('picks the requested id when it matches a real event', () => {
		expect(selectDefaultCarpoolEventId([standing, dated], 'dated-1')).toBe('dated-1');
	});

	it('ignores a requested id that matches nothing and falls back to the standing event', () => {
		expect(selectDefaultCarpoolEventId([dated, standing], 'no-such-id')).toBe('standing');
	});

	it('prefers the standing event over "first in the list" with no request at all', () => {
		expect(selectDefaultCarpoolEventId([dated, standing], null)).toBe('standing');
	});

	it('falls back to the first event when none is standing (defensive, should not happen live)', () => {
		expect(selectDefaultCarpoolEventId([dated], null)).toBe('dated-1');
	});

	it('returns null for an empty list', () => {
		expect(selectDefaultCarpoolEventId([], null)).toBeNull();
	});
});
