export type RoomLayoutRow = { benches: number };
export type SeatQueueRow = { studentId: string; roll: number | null; registrationNumber?: string | null; classId: string | null; sectionId: string | null; name: string; groupName: string | null };

export function validateLayout(layout: unknown): RoomLayoutRow[] {
  if (!Array.isArray(layout) || layout.length < 1 || layout.length > 30) throw new Error('রুমে ১ থেকে ৩০টি সারি থাকতে হবে');
  const rows = layout.map((row) => ({ benches: Number((row as { benches?: unknown })?.benches) }));
  if (rows.some((row) => !Number.isInteger(row.benches) || row.benches < 1 || row.benches > 20)) throw new Error('প্রতি সারিতে ১ থেকে ২০টি বেঞ্চ থাকতে হবে');
  return rows;
}

export const layoutCapacity = (layout: RoomLayoutRow[], perBench = 1) => layout.reduce((sum, row) => sum + row.benches, 0) * perBench;

export function seatPositions(layout: RoomLayoutRow[], perBench: 1 | 2 | 3) {
  const out: Array<{ benchRow: number; benchColumn: number; benchSlot: number; benchPosition: 'left' | 'middle' | 'right' | null }> = [];
  const positions = perBench === 2 ? ['left', 'right'] : perBench === 3 ? ['left', 'middle', 'right'] : [null];
  layout.forEach((row, rowIndex) => { for (let bench = 1; bench <= row.benches; bench += 1) for (let slot = 1; slot <= perBench; slot += 1) out.push({ benchRow: rowIndex + 1, benchColumn: bench, benchSlot: slot, benchPosition: positions[slot - 1] as 'left' | 'middle' | 'right' | null }); });
  return out;
}

const compareRoll = (a: SeatQueueRow, b: SeatQueueRow) => (a.roll === null ? 1 : b.roll === null ? -1 : a.roll - b.roll);
export function orderByRoll(rows: SeatQueueRow[], mode: 'roll_mix' | 'class_roll', classOrder: string[]) {
  const order = new Map(classOrder.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => {
    const classCompare = (order.get(a.classId ?? '') ?? Number.MAX_SAFE_INTEGER) - (order.get(b.classId ?? '') ?? Number.MAX_SAFE_INTEGER);
    const rollCompare = compareRoll(a, b);
    const primary = mode === 'roll_mix' ? rollCompare : classCompare;
    const secondary = mode === 'roll_mix' ? classCompare : rollCompare;
    return primary || secondary || String(a.sectionId ?? '').localeCompare(String(b.sectionId ?? '')) || a.name.localeCompare(b.name, 'bn');
  });
}

export function orderByRegistration<T extends { registrationNumber?: string | null; name: string }>(rows: T[]) {
  return [...rows].sort((a, b) => String(a.registrationNumber ?? '').localeCompare(String(b.registrationNumber ?? ''), undefined, { numeric: true }) || a.name.localeCompare(b.name, 'bn'));
}
