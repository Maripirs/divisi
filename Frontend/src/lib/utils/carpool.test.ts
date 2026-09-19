import { describe, expect, it } from 'vitest';
import {
	contactEmailError,
	destinationCoordinatesPayload,
	driverOfferError,
	eventFieldsMissing,
	formatContactPhone,
	originCoordinatesPayload,
	postMatchesDirection,
	riderRequestError,
	selectDefaultCarpoolEventId
} from './carpool';

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

describe('formatContactPhone', () => {
	it('formats a plain 10-digit US number', () => {
		expect(formatContactPhone('5551234567')).toBe('(555) 123-4567');
	});

	it('reformats an already-punctuated 10-digit number the same way', () => {
		expect(formatContactPhone('555.123.4567')).toBe('(555) 123-4567');
		expect(formatContactPhone('555-123-4567')).toBe('(555) 123-4567');
		expect(formatContactPhone('(555) 123-4567')).toBe('(555) 123-4567');
	});

	it('formats an 11-digit number with a leading country code 1', () => {
		expect(formatContactPhone('15551234567')).toBe('+1 (555) 123-4567');
		expect(formatContactPhone('+15551234567')).toBe('+1 (555) 123-4567');
		expect(formatContactPhone('+1 555 123 4567')).toBe('+1 (555) 123-4567');
	});

	it('leaves anything else exactly as typed rather than guess', () => {
		expect(formatContactPhone('+44 20 7123 4567')).toBe('+44 20 7123 4567');
		expect(formatContactPhone('12345')).toBe('12345');
		expect(formatContactPhone('ext 4567')).toBe('ext 4567');
	});

	it('trims surrounding whitespace', () => {
		expect(formatContactPhone('  5551234567  ')).toBe('(555) 123-4567');
	});
});

describe('contactEmailError', () => {
	it('passes an empty or blank value: the field is optional', () => {
		expect(contactEmailError('')).toBe(false);
		expect(contactEmailError('   ')).toBe(false);
	});

	it('passes a plausible address', () => {
		expect(contactEmailError('alex@example.com')).toBe(false);
		expect(contactEmailError('  alex@example.com  ')).toBe(false);
	});

	it('rejects an obviously malformed value', () => {
		expect(contactEmailError('not an email')).toBe(true);
		expect(contactEmailError('alex@')).toBe(true);
		expect(contactEmailError('@example.com')).toBe(true);
		expect(contactEmailError('alex@example')).toBe(true);
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

describe('originCoordinatesPayload', () => {
	it('returns an empty object with no coordinates at all (Places unavailable, or none picked)', () => {
		expect(originCoordinatesPayload({})).toEqual({});
		expect(originCoordinatesPayload({ latitude: null, longitude: null })).toEqual({});
		expect(originCoordinatesPayload({ latitude: '', longitude: '' })).toEqual({});
	});

	it('returns an empty object with only one half of the pair set (never sends a half-set pair)', () => {
		expect(originCoordinatesPayload({ latitude: '37.7', longitude: null })).toEqual({});
		expect(originCoordinatesPayload({ latitude: null, longitude: '-122.4' })).toEqual({});
	});

	it('defaults precision to approximate when coordinates are present but no exact choice was recorded', () => {
		expect(originCoordinatesPayload({ latitude: '37.7', longitude: '-122.4' })).toEqual({
			origin_latitude: 37.7,
			origin_longitude: -122.4,
			origin_precision: 'approximate'
		});
	});

	it('carries an explicit exact precision through, and rejects any other value back to approximate', () => {
		expect(originCoordinatesPayload({ latitude: '37.7', longitude: '-122.4', precision: 'exact' })).toMatchObject({
			origin_precision: 'exact'
		});
		expect(
			originCoordinatesPayload({ latitude: '37.7', longitude: '-122.4', precision: 'bogus' })
		).toMatchObject({ origin_precision: 'approximate' });
	});

	it('accepts numbers directly (a guest proxy body already parsed as JSON), not just form-field strings', () => {
		expect(originCoordinatesPayload({ latitude: 37.7, longitude: -122.4 })).toMatchObject({
			origin_latitude: 37.7,
			origin_longitude: -122.4
		});
	});

	it('includes place_id only when one was actually captured', () => {
		expect(originCoordinatesPayload({ latitude: '37.7', longitude: '-122.4' }).origin_place_id).toBeUndefined();
		expect(
			originCoordinatesPayload({ latitude: '37.7', longitude: '-122.4', placeId: 'abc123' }).origin_place_id
		).toBe('abc123');
	});
});

describe('postMatchesDirection', () => {
	it('matches a post whose direction exactly equals the filter', () => {
		expect(postMatchesDirection('there', 'there')).toBe(true);
		expect(postMatchesDirection('back', 'back')).toBe(true);
	});

	it('rejects a post whose direction is the other leg', () => {
		expect(postMatchesDirection('there', 'back')).toBe(false);
		expect(postMatchesDirection('back', 'there')).toBe(false);
	});

	it('always matches a round-trip post, on either leg', () => {
		expect(postMatchesDirection('round_trip', 'there')).toBe(true);
		expect(postMatchesDirection('round_trip', 'back')).toBe(true);
	});
});

describe('destinationCoordinatesPayload', () => {
	it('returns an empty object with no coordinates, and never carries a precision field at all', () => {
		expect(destinationCoordinatesPayload({})).toEqual({});
		expect(destinationCoordinatesPayload({ latitude: '37.7', longitude: null })).toEqual({});
	});

	it('passes real coordinates through with no rounding/precision concept', () => {
		expect(destinationCoordinatesPayload({ latitude: '37.7', longitude: '-122.4', placeId: 'venue-1' })).toEqual({
			destination_latitude: 37.7,
			destination_longitude: -122.4,
			destination_place_id: 'venue-1'
		});
	});
});
