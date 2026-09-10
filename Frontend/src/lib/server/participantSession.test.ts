import { describe, expect, it } from 'vitest';
import {
	backendCookieHeader,
	extractParticipantToken,
	PARTICIPANT_COOKIE,
	readSetCookie
} from './participantSession';

describe('extractParticipantToken', () => {
	it('returns null when there is no Set-Cookie at all', () => {
		expect(extractParticipantToken(null)).toBeNull();
		expect(extractParticipantToken([])).toBeNull();
	});

	it('returns null when no divisi_participant cookie is present', () => {
		expect(
			extractParticipantToken('divisi_session=abc.def; Path=/; HttpOnly; Secure; SameSite=Lax')
		).toBeNull();
	});

	it('pulls the token out of a single Set-Cookie line with attributes', () => {
		const line =
			'divisi_participant=eyJhbGciOi.J9.sig; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=None';
		expect(extractParticipantToken(line)).toBe('eyJhbGciOi.J9.sig');
	});

	it('finds it among several Set-Cookie lines (array form)', () => {
		expect(
			extractParticipantToken([
				'other=1; Path=/',
				'divisi_participant=tok-123; Path=/; HttpOnly',
				'again=2; Path=/'
			])
		).toBe('tok-123');
	});

	it('finds it in a comma-folded single header', () => {
		const folded =
			'other=1; Path=/, divisi_participant=tok-xyz; Path=/; HttpOnly; Secure; SameSite=None';
		expect(extractParticipantToken(folded)).toBe('tok-xyz');
	});

	it('url-decodes the value', () => {
		expect(extractParticipantToken('divisi_participant=a%2Bb%3Dc; Path=/')).toBe('a+b=c');
	});

	it('returns null for an explicit blank value (a delete)', () => {
		expect(extractParticipantToken('divisi_participant=; Max-Age=0; Path=/')).toBeNull();
	});
});

describe('readSetCookie', () => {
	it('reads every Set-Cookie line off a Response', () => {
		const headers = new Headers();
		headers.append('set-cookie', 'a=1; Path=/');
		headers.append('set-cookie', 'divisi_participant=tok; Path=/');
		const res = new Response(null, { headers });
		const lines = readSetCookie(res);
		expect(extractParticipantToken(lines)).toBe('tok');
	});
});

describe('backendCookieHeader', () => {
	it('is undefined when there is no token', () => {
		expect(backendCookieHeader(null)).toBeUndefined();
	});
	it('formats the Cookie header value for a forwarded request', () => {
		expect(backendCookieHeader('tok-123')).toBe(`${PARTICIPANT_COOKIE}=tok-123`);
	});
	it('url-encodes a token with reserved characters', () => {
		expect(backendCookieHeader('a+b=c')).toBe(`${PARTICIPANT_COOKIE}=a%2Bb%3Dc`);
	});
});
