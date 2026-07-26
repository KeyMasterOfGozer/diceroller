import Dexie, { type Table } from 'dexie';
import type { RollResult } from '@dnd-dice-roller/dice-engine';

// ── Schema types ──────────────────────────────────────────────────────────────

export interface RollHistoryEntry {
  id?: number;
  characterId: string;
  notation: string;
  result: RollResult;
  rolledAt: Date;
  /** Display name for this entry: attack macro name (standalone), or constituent macro name (within a combo). */
  label?: string;
  /** UUID grouping all rolls from one combo trigger. */
  comboId?: string;
  /** Display name of the parent combo macro — used as the group header. */
  comboName?: string;
  /** UUID grouping the to-hit and damage rolls of one attack macro. */
  attackId?: string;
  /** Which part of the attack this entry represents. */
  attackPart?: 'to-hit' | 'damage';
}

export interface UserPrefs {
  id?: number;
  historyLimitPerCharacter: number;  // default 500
}

// ── Database ──────────────────────────────────────────────────────────────────

class DiceRollerDB extends Dexie {
  rollHistory!: Table<RollHistoryEntry>;
  prefs!: Table<UserPrefs>;

  constructor() {
    super('DiceRollerDB');
    this.version(1).stores({
      rollHistory: '++id, characterId, rolledAt, [characterId+rolledAt]',
      prefs: '++id',
    });
    // v2: consolidate macroName + attackName → label; delete the old fields.
    this.version(2).stores({
      rollHistory: '++id, characterId, rolledAt, [characterId+rolledAt]',
      prefs: '++id',
    }).upgrade(tx =>
      tx.table('rollHistory').toCollection().modify((entry: Record<string, unknown>) => {
        if (!entry['label']) {
          const legacy = entry['attackName'] ?? entry['macroName'];
          if (legacy !== undefined) entry['label'] = legacy;
        }
        delete entry['attackName'];
        delete entry['macroName'];
      })
    );
  }
}

export const db = new DiceRollerDB();

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function addRoll(entry: Omit<RollHistoryEntry, 'id'>): Promise<number> {
  const id = await db.rollHistory.add(entry);

  // Enforce per-character history limit
  const prefs = await db.prefs.toCollection().first();
  const limit = prefs?.historyLimitPerCharacter ?? 500;
  const total = await db.rollHistory.where('characterId').equals(entry.characterId).count();

  if (total > limit) {
    // Delete oldest entries over the limit
    const oldest = await db.rollHistory
      .where('characterId').equals(entry.characterId)
      .sortBy('rolledAt');
    const toDelete = oldest.slice(0, total - limit).map(e => e.id!);
    await db.rollHistory.bulkDelete(toDelete);
  }

  return id as number;
}

export async function getRollHistory(characterId: string, limit = 50): Promise<RollHistoryEntry[]> {
  const all = await db.rollHistory
    .where('characterId').equals(characterId)
    .toArray();
  return all
    .sort((a, b) => b.rolledAt.getTime() - a.rolledAt.getTime())
    .slice(0, limit);
}

export async function clearCharacterHistory(characterId: string): Promise<void> {
  await db.rollHistory.where('characterId').equals(characterId).delete();
}

export async function clearAllHistory(): Promise<void> {
  await db.rollHistory.clear();
}

export async function getTotalHistoryCount(): Promise<number> {
  return db.rollHistory.count();
}

export async function getPrefs(): Promise<UserPrefs> {
  const prefs = await db.prefs.toCollection().first();
  return prefs ?? { historyLimitPerCharacter: 500 };
}

export async function savePrefs(prefs: Omit<UserPrefs, 'id'>): Promise<void> {
  const existing = await db.prefs.toCollection().first();
  if (existing?.id) {
    await db.prefs.update(existing.id, prefs);
  } else {
    await db.prefs.add(prefs);
  }
}
