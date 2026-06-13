import { type RollResult } from '@dnd-dice-roller/dice-engine';
import { cn } from '@/lib/utils';

export function RollResultDisplay({ result }: { result: RollResult }) {
  return (
    <div className={cn(
      'mt-3 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2.5 animate-roll-in',
      result.isNatural20 && 'border-green-500 dark:border-green-600',
      result.isNatural1  && 'border-destructive',
    )}>
      {result.components.map((comp, i) => (
        <div key={i} className="flex flex-col items-center min-w-[3rem]">
          {comp.label && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none mb-0.5">
              {comp.label}
            </span>
          )}
          <span className={cn(
            'text-3xl font-black tabular-nums leading-none',
            result.isNatural20 && comp.dice.some(d => d.sides === 20) && 'text-green-600 dark:text-green-400',
            result.isNatural1  && comp.dice.some(d => d.sides === 20) && 'text-destructive',
          )}>
            {comp.subtotal}
          </span>
          {comp.dice.length > 0 && (
            <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
              {comp.dice.map((die, j) => (
                <span
                  key={j}
                  className={cn(
                    'rounded px-1 py-0.5 font-mono text-[10px] leading-none',
                    die.dropped
                      ? 'text-muted-foreground/40 line-through'
                      : die.value === die.sides
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : die.value === 1
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-background text-muted-foreground',
                  )}
                >
                  {die.value}
                </span>
              ))}
              {comp.modifier !== 0 && (
                <span className="rounded px-1 py-0.5 font-mono text-[10px] leading-none bg-background text-muted-foreground">
                  {comp.modifier > 0 ? `+${comp.modifier}` : comp.modifier}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
