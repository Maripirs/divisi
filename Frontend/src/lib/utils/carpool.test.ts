import { describe, expect, it } from 'vitest';
import { driverOfferError, eventFieldsMissing, riderRequestError } from './carpool';

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
