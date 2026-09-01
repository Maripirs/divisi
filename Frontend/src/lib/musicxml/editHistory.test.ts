import { describe, it, expect } from 'vitest';
import { EditHistory } from './editHistory';

describe('EditHistory', () => {
	it('starts empty', () => {
		const h = new EditHistory();
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
		expect(h.undo('a')).toBeUndefined();
		expect(h.redo('a')).toBeUndefined();
	});

	it('undo returns the recorded snapshot and enables redo', () => {
		const h = new EditHistory();
		h.record('v0');
		expect(h.canUndo).toBe(true);
		expect(h.undo('v1')).toBe('v0');
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(true);
	});

	it('round-trips undo then redo', () => {
		const h = new EditHistory();
		h.record('v0');
		h.record('v1');
		expect(h.undo('v2')).toBe('v1');
		expect(h.undo('v1')).toBe('v0');
		expect(h.redo('v0')).toBe('v1');
		expect(h.redo('v1')).toBe('v2');
		expect(h.canRedo).toBe(false);
	});

	it('recording a new edit clears the redo stack', () => {
		const h = new EditHistory();
		h.record('v0');
		h.undo('v1');
		expect(h.canRedo).toBe(true);
		h.record('v1b');
		expect(h.canRedo).toBe(false);
	});

	it('caps the undo stack, dropping the oldest', () => {
		const h = new EditHistory(3);
		h.record('v0');
		h.record('v1');
		h.record('v2');
		h.record('v3'); // pushes v0 off
		expect(h.undo('v4')).toBe('v3');
		expect(h.undo('v3')).toBe('v2');
		expect(h.undo('v2')).toBe('v1');
		expect(h.undo('v1')).toBeUndefined(); // v0 was dropped
	});

	it('reset clears both stacks', () => {
		const h = new EditHistory();
		h.record('v0');
		h.undo('v1');
		h.reset();
		expect(h.canUndo).toBe(false);
		expect(h.canRedo).toBe(false);
	});
});
