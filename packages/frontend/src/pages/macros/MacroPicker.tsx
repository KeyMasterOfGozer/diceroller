import { Plus, X } from 'lucide-react';
import { type Macro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface MacroPickerProps {
  label: string;
  standardMacros: Macro[];
  selectedIds: string[];
  pickValue: string;
  onPickChange: (v: string) => void;
  onAdd: (id: string) => void;
  onRemove: (index: number) => void;
}

export function MacroPicker({ label, standardMacros, selectedIds, pickValue, onPickChange, onAdd, onRemove }: MacroPickerProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {standardMacros.length === 0 ? (
        <p className="text-xs text-muted-foreground">No standard macros yet — create some first.</p>
      ) : (
        <>
          <div className="flex gap-2">
            <select
              value={pickValue}
              onChange={e => onPickChange(e.target.value)}
              className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select macro…</option>
              {standardMacros.map(m => (
                <option key={m.macroId} value={m.macroId}>{m.name}</option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pickValue}
              onClick={() => onAdd(pickValue)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {selectedIds.length > 0 ? (
            <div className="rounded-md border divide-y">
              {selectedIds.map((id, i) => {
                const m = standardMacros.find(x => x.macroId === id);
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2">
                    <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                    <span className="flex-1 text-sm font-medium">{m?.name ?? id}</span>
                    <span className="hidden truncate font-mono text-xs text-muted-foreground sm:block max-w-[14rem]">
                      {m?.notation}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(i)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Add at least one macro.</p>
          )}
        </>
      )}
    </div>
  );
}
