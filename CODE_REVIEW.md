# Code Review — Action Items

## Critical Issues

- [x] **God component** — Extracted `history.ts`, `CategorySelect.tsx`, `MacroPicker.tsx`, `CreateMacroForm.tsx`, `CreateComboForm.tsx`, `MacroCard.tsx`, `RollHistory.tsx`; `MacrosPage.tsx` reduced from 1,214 to ~170 lines.

- [x] **O(n²) history grouping** — `groupHistory` and `groupComboEntries` rewritten in `history.ts` using single-pass `Map` builds.

- [x] **Silent swallow in `handleRollCombo`** — `MacroCard.handleRollCombo` collects failures and shows a toast.

- [x] **Serial `await` in loop in `handleRollCombo`** — `MacroCard.handleRollCombo` uses `Promise.all` for `addRoll` calls within each macro.

- [x] **`window.confirm()` for delete** — Replaced with shared `ConfirmDialog` component in `MacroCard`.

- [x] **Validation state in data state** — `editState.notationError` removed; computed via `useMemo` in `MacroCard` and inline in `CreateMacroForm`.

- [x] **`ConfirmDialog.onConfirm` swallows errors** — Shared `ConfirmDialog` in `src/components/ConfirmDialog.tsx` surfaces errors and closes only on success. `AdminPage` updated to use it.

---

## Minor Polish

- [x] **Repeated `isCombo` recomputation** — Gone; `MacroCard` computes `const isCombo = macro.type === 'combo'` once at the top.

- [x] **IIFE anti-pattern for attack result display** — Gone; extracted into `RollResults` sub-component inside `MacroCard`.

- [x] **Redundant history entry fields** — Removed `macroName` and `attackName`; replaced with single `label` field. Dexie v2 migration backfills `label` from legacy fields on existing records. `ComboHistoryItem.macroName` and `HistoryGroup.attackName` renamed to `label` throughout.

- [x] **`statusBadge` is a function, not a component** — Renamed to `StatusBadge`, called as `<StatusBadge user={u} />`.

- [x] **`fmtDate`/`fmtTime` belong in `lib/utils`** — Moved to `lib/utils.ts` as `formatISODate` and `formatTimestamp`; removed from `AdminPage.tsx`.

- [x] **`LOG_GROUPS` env-var loop in `admin.ts`** — Replaced with explicit `LAMBDA_KEYS` array and `flatMap`.

---

## Reference: Refactored Snippets

### `groupHistory` — O(n) single-pass version

```ts
function groupHistory(entries: RollHistoryEntry[]): HistoryGroup[] {
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
        kind: 'combo',
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
        kind: 'attack',
        attackId:   entry.attackId,
        attackName: entry.attackName ?? 'Attack',
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
```

### `handleRollCombo` — parallel writes, surfaced failures

```ts
async function handleRollCombo(combo: Macro) {
  const validMacros = (combo.macroIds ?? [])
    .map(id => macros.find(m => m.macroId === id))
    .filter((m): m is Macro => !!m && m.type !== 'combo');

  if (validMacros.length === 0) return;

  const comboId  = crypto.randomUUID();
  const rolledAt = new Date();
  const results: ComboEntry[] = [];
  const failures: string[]    = [];

  await Promise.all(validMacros.map(async m => {
    try {
      if (m.category === 'Attack') {
        const atkResult = rollAttack(m.notation, { variables: vars, critThreshold: m.critThreshold ?? 20, advantageMode });
        results.push({ kind: 'attack', macroName: m.name, atkResult });
        const attackId = crypto.randomUUID();
        await Promise.all([
          addRoll({ characterId: charId!, notation: m.notation, result: atkResult.toHit,   rolledAt, macroName: m.name, comboId, comboName: combo.name, attackId, attackPart: 'to-hit',  attackName: m.name }),
          atkResult.damage
            ? addRoll({ characterId: charId!, notation: m.notation, result: atkResult.damage, rolledAt, macroName: m.name, comboId, comboName: combo.name, attackId, attackPart: 'damage', attackName: m.name })
            : Promise.resolve(),
        ]);
      } else {
        const result = roll(m.notation, { variables: vars, advantageMode });
        results.push({ kind: 'roll', macroName: m.name, result });
        await addRoll({ characterId: charId!, notation: m.notation, result, rolledAt, macroName: m.name, comboId, comboName: combo.name });
      }
    } catch {
      failures.push(m.name);
    }
  }));

  if (failures.length > 0) {
    toast({ title: `Skipped: ${failures.join(', ')}`, description: 'One or more macros failed to roll.', variant: 'destructive' });
  }

  setComboResults(prev => ({ ...prev, [combo.macroId]: results }));
  setLastRollKey('combo-' + comboId);
  setHistory(await getRollHistory(charId!, 30));
}
```
