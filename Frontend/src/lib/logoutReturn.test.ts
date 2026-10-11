import { describe, expect, it } from 'vitest';
import { classifyLogoutReturn } from './logoutReturn';

describe('classifyLogoutReturn', () => {
	it('sends join and coded piece links straight back', () => {
		expect(classifyLogoutReturn('/join/9CJM7VRU?event=e1')).toEqual({ kind: 'path', path: '/join/9CJM7VRU' });
		expect(classifyLogoutReturn('/piece/p1?code=9CJM7VRU')).toEqual({
			kind: 'path',
			path: '/piece/p1?code=9CJM7VRU'
		});
	});

	it('asks for an owner lookup on a bare piece or any group page', () => {
		expect(classifyLogoutReturn('/piece/p1')).toEqual({ kind: 'piece', pieceId: 'p1' });
		expect(classifyLogoutReturn('/piece/p1/review')).toEqual({ kind: 'piece', pieceId: 'p1' });
		expect(classifyLogoutReturn('/groups/g1')).toEqual({ kind: 'group', groupId: 'g1' });
		expect(classifyLogoutReturn('/groups/g1/admin?tab=x')).toEqual({ kind: 'group', groupId: 'g1' });
	});

	it('has nowhere special to go for other pages or unsafe values', () => {
		expect(classifyLogoutReturn('/home')).toBeNull();
		expect(classifyLogoutReturn('/settings')).toBeNull();
		expect(classifyLogoutReturn('/groups')).toBeNull();
		expect(classifyLogoutReturn('https://evil.example/groups/g1')).toBeNull();
		expect(classifyLogoutReturn('//evil.example/join/X')).toBeNull();
		expect(classifyLogoutReturn(null)).toBeNull();
	});
});
