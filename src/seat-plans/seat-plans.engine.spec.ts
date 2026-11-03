import { describe, expect, it } from 'vitest';
import { layoutCapacity, orderByRoll, seatPositions, validateLayout } from './seat-plans.engine.js';

describe('seat plan room layout engine', () => {
  it('validates irregular rows and computes capacity', () => {
    const layout = validateLayout([{ benches: 4 }, { benches: 3 }, { benches: 5 }]);
    expect(layoutCapacity(layout, 2)).toBe(24);
    expect(seatPositions(layout, 1)).toHaveLength(12);
  });
  it('orders roll mix before class roll', () => {
    const rows = [
      { studentId: 'a', roll: 2, classId: 'c6', sectionId: 's6', name: 'আ', groupName: null },
      { studentId: 'b', roll: 1, classId: 'c7', sectionId: 's7', name: 'আ', groupName: null },
      { studentId: 'c', roll: 1, classId: 'c6', sectionId: 's6', name: 'আ', groupName: null },
    ];
    expect(orderByRoll(rows, 'roll_mix', ['c6', 'c7']).map((r) => r.studentId)).toEqual(['c', 'b', 'a']);
    expect(orderByRoll(rows, 'class_roll', ['c6', 'c7']).map((r) => r.studentId)).toEqual(['c', 'a', 'b']);
  });
});
