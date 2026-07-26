import { Layers } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { type HistoryGroup, groupComboEntries } from './history';

interface RollHistoryProps {
  groups: HistoryGroup[];
  lastRollKey: string | null;
}

export function RollHistory({ groups, lastRollKey }: RollHistoryProps) {
  if (groups.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent rolls</h2>
      <div className="flex flex-col gap-1.5">
        {groups.map((group, gi) => {
          if (group.kind === 'combo') {
            return <ComboGroup key={group.comboId} group={group} isNew={lastRollKey === 'combo-' + group.comboId} />;
          }
          if (group.kind === 'attack') {
            return <AttackGroup key={group.attackId} group={group} isNew={lastRollKey === 'attack-' + group.attackId} />;
          }
          return <SingleGroup key={group.entry.id ?? gi} group={group} isNew={lastRollKey === String(group.entry.id)} />;
        })}
      </div>
    </div>
  );
}

// ── Combo group ───────────────────────────────────────────────────────────────

function ComboGroup({ group, isNew }: { group: Extract<HistoryGroup, { kind: 'combo' }>; isNew: boolean }) {
  return (
    <div className={cn('rounded-md border overflow-hidden transition-colors', isNew && 'animate-roll-in border-primary/30 bg-primary/5')}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Layers className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-semibold">{group.comboName}</span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{formatDate(group.rolledAt)}</span>
      </div>
      {groupComboEntries(group.entries).map((item, ei) => {
        if (item.kind === 'attack') {
          return (
            <div key={item.attackId} className="border-b px-3 py-2 last:border-0">
              <div className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs text-muted-foreground truncate">{item.label}</span>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="flex flex-wrap gap-2">
                    {item.toHit.result.components.map((comp, ci) => (
                      <div key={ci} className="flex items-center gap-1">
                        {comp.label && <span className="text-xs text-muted-foreground">{comp.label}</span>}
                        <span className={cn(
                          'text-lg font-bold tabular-nums leading-none',
                          item.isCrit && 'text-green-600 dark:text-green-400',
                          item.toHit.result.isNatural1 && 'text-destructive',
                        )}>{comp.subtotal}</span>
                      </div>
                    ))}
                  </div>
                  {item.damage && (
                    <div className="flex flex-wrap gap-2">
                      {item.damage.result.components.map((comp, ci) => (
                        <div key={ci} className="flex items-center gap-1">
                          {comp.label && <span className="text-xs text-muted-foreground">{comp.label}</span>}
                          <span className={cn(
                            'text-lg font-bold tabular-nums leading-none',
                            item.isCrit && 'text-green-600 dark:text-green-400',
                          )}>{comp.subtotal}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.isCrit && <CritBadge />}
                  {item.toHit.result.isNatural1 && <FumbleBadge />}
                </div>
              </div>
            </div>
          );
        }
        const entry = item.entry;
        return (
          <div key={entry.id ?? ei} className="flex items-center gap-3 border-b px-3 py-2 last:border-0">
            <span className="w-28 shrink-0 text-xs text-muted-foreground truncate">{entry.label}</span>
            <div className="flex flex-wrap gap-2">
              {entry.result.components.map((comp, ci) => (
                <div key={ci} className="flex items-center gap-1">
                  {comp.label && <span className="text-xs text-muted-foreground">{comp.label}</span>}
                  <span className={cn(
                    'text-lg font-bold tabular-nums leading-none',
                    entry.result.isNatural20 && comp.dice.some(d => d.sides === 20) && 'text-green-600 dark:text-green-400',
                    entry.result.isNatural1  && comp.dice.some(d => d.sides === 20) && 'text-destructive',
                  )}>{comp.subtotal}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Standalone attack group ───────────────────────────────────────────────────

function AttackGroup({ group, isNew }: { group: Extract<HistoryGroup, { kind: 'attack' }>; isNew: boolean }) {
  const { toHit, damage, isCrit } = group;
  return (
    <div className={cn('rounded-md border overflow-hidden transition-colors', isNew && 'animate-roll-in border-primary/30 bg-primary/5')}>
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">⚔</span>
          <span className="text-xs font-semibold">{group.label}</span>
          {isCrit && <CritBadge />}
          {toHit.result.isNatural1 && <FumbleBadge />}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{formatDate(group.rolledAt)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2">
        <div className="flex flex-wrap gap-2">
          {toHit.result.components.map((comp, ci) => (
            <div key={ci} className="flex items-center gap-1">
              {comp.label && <span className="text-xs text-muted-foreground">{comp.label}</span>}
              <span className={cn(
                'text-lg font-bold tabular-nums leading-none',
                isCrit && 'text-green-600 dark:text-green-400',
                toHit.result.isNatural1 && 'text-destructive',
              )}>{comp.subtotal}</span>
            </div>
          ))}
        </div>
        {damage && (
          <div className="flex flex-wrap gap-2">
            {damage.result.components.map((comp, ci) => (
              <div key={ci} className="flex items-center gap-1">
                {comp.label && <span className="text-xs text-muted-foreground">{comp.label}</span>}
                <span className={cn(
                  'text-lg font-bold tabular-nums leading-none',
                  isCrit && 'text-green-600 dark:text-green-400',
                )}>{comp.subtotal}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Single roll ───────────────────────────────────────────────────────────────

function SingleGroup({ group, isNew }: { group: Extract<HistoryGroup, { kind: 'single' }>; isNew: boolean }) {
  const { entry } = group;
  return (
    <div className={cn(
      'rounded-md border px-3 py-2 text-sm transition-colors',
      isNew && 'animate-roll-in border-primary/30 bg-primary/5',
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground truncate">{entry.notation}</span>
        <span className="text-xs text-muted-foreground shrink-0">{formatDate(entry.rolledAt)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {entry.result.components.map((comp, ci) => (
          <div key={ci} className="flex items-center gap-1.5">
            {comp.label && <span className="text-xs text-muted-foreground">{comp.label}</span>}
            <span className={cn(
              'text-lg font-bold tabular-nums leading-none',
              entry.result.isNatural20 && comp.dice.some(d => d.sides === 20) && 'text-green-600 dark:text-green-400',
              entry.result.isNatural1  && comp.dice.some(d => d.sides === 20) && 'text-destructive',
            )}>{comp.subtotal}</span>
            {ci < entry.result.components.length - 1 && (
              <span className="text-muted-foreground/50">·</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared badge components ───────────────────────────────────────────────────

function CritBadge() {
  return (
    <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
      CRIT
    </span>
  );
}

function FumbleBadge() {
  return (
    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
      FUMBLE
    </span>
  );
}
