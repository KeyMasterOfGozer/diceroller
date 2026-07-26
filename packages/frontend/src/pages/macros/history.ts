import type { RollHistoryEntry } from '@/lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ComboHistoryItem =
  | { kind: 'roll';   entry: RollHistoryEntry }
  | { kind: 'attack'; attackId: string; label: string; toHit: RollHistoryEntry; damage: RollHistoryEntry | null; isCrit: boolean };

export type HistoryGroup =
  | { kind: 'single'; entry: RollHistoryEntry }
  | { kind: 'combo';  comboId: string; comboName: string; entries: RollHistoryEntry[]; rolledAt: Date }
  | { kind: 'attack'; attackId: string; label: string; toHit: RollHistoryEntry; damage: RollHistoryEntry | null; isCrit: boolean; rolledAt: Date };

// ── Pure grouping functions — O(n) single-pass ────────────────────────────────

export function groupHistory(entries: RollHistoryEntry[]): HistoryGroup[] {
  const comboMap  = new Map<string, RollHistoryEntry[]>();
  const attackMap = new Map<string, RollHistoryEntry[]>();

  for (const entry of entries) {
    if (entry.comboId) {
      const bucket = comboMap.get(entry.comboId) ?? [];
      bucket.push(entry);
      comboMap.set(entry.comboId, bucket);
    } else if (entry.attackId) {
      const bucket = attackMap.get(entry.attackId) ?? [];
      bucket.push(entry);
      attackMap.set(entry.attackId, bucket);
    }
  }

  const groups: HistoryGroup[] = [];
  const seen = { combos: new Set<string>(), attacks: new Set<string>() };

  for (const entry of entries) {
    if (entry.comboId) {
      if (seen.combos.has(entry.comboId)) continue;
      seen.combos.add(entry.comboId);
      groups.push({
        kind:      'combo',
        comboId:   entry.comboId,
        comboName: entry.comboName ?? 'Combo',
        entries:   comboMap.get(entry.comboId)!,
        rolledAt:  entry.rolledAt,
      });
    } else if (entry.attackId) {
      if (seen.attacks.has(entry.attackId)) continue;
      seen.attacks.add(entry.attackId);
      const attackEntries = attackMap.get(entry.attackId)!;
      const toHit  = attackEntries.find(e => e.attackPart === 'to-hit') ?? entry;
      const damage = attackEntries.find(e => e.attackPart === 'damage') ?? null;
      groups.push({
        kind:       'attack',
        attackId:   entry.attackId,
        label: entry.label ?? 'Attack',
        toHit, damage,
        isCrit:   toHit.result.isNatural20,
        rolledAt: entry.rolledAt,
      });
    } else {
      groups.push({ kind: 'single', entry });
    }
  }

  return groups;
}

export function groupComboEntries(entries: RollHistoryEntry[]): ComboHistoryItem[] {
  const attackMap = new Map<string, RollHistoryEntry[]>();
  for (const entry of entries) {
    if (entry.attackId) {
      const bucket = attackMap.get(entry.attackId) ?? [];
      bucket.push(entry);
      attackMap.set(entry.attackId, bucket);
    }
  }

  const items: ComboHistoryItem[]  = [];
  const seenAttacks = new Set<string>();

  for (const entry of entries) {
    if (entry.attackId) {
      if (seenAttacks.has(entry.attackId)) continue;
      seenAttacks.add(entry.attackId);
      const attackEntries = attackMap.get(entry.attackId)!;
      const toHit  = attackEntries.find(e => e.attackPart === 'to-hit') ?? entry;
      const damage = attackEntries.find(e => e.attackPart === 'damage') ?? null;
      items.push({ kind: 'attack', attackId: entry.attackId, label: entry.label ?? 'Attack', toHit, damage, isCrit: toHit.result.isNatural20 });
    } else {
      items.push({ kind: 'roll', entry });
    }
  }

  return items;
}
