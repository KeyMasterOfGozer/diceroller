import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Row {
  id: number;
  key: string;
  value: string;
  keyError?: string;
  valueError?: string;
}

interface Props {
  initialValue: Record<string, number>;
  onChange: (vars: Record<string, number>, isValid: boolean) => void;
}

let rowCounter = 0;
function makeRow(key = '', value = ''): Row {
  return { id: rowCounter++, key, value };
}

function toRows(vars: Record<string, number>): Row[] {
  return Object.entries(vars)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => makeRow(k, String(v)));
}

function validate(rows: Row[]): Row[] {
  const trimmedKeys = rows.map(r => r.key.trim());
  return rows.map((row, i) => {
    const keyTrimmed = row.key.trim();
    const isDuplicate = trimmedKeys.filter((k, j) => k === keyTrimmed && j !== i).length > 0;
    const keyError = !keyTrimmed
      ? 'Required'
      : isDuplicate
      ? 'Duplicate'
      : !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(keyTrimmed)
      ? 'Letters, digits, underscores only'
      : undefined;

    const num = Number(row.value);
    const valueError = row.value.trim() === ''
      ? 'Required'
      : isNaN(num)
      ? 'Must be a number'
      : !Number.isInteger(num)
      ? 'Must be an integer'
      : undefined;

    return { ...row, keyError, valueError };
  });
}

export function VarsEditor({ initialValue, onChange }: Props) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initialValue));

  function apply(newRows: Row[]) {
    const validated = validate(newRows);
    setRows(validated);
    const isValid = validated.every(r => !r.keyError && !r.valueError);
    if (isValid) {
      const vars: Record<string, number> = {};
      validated.forEach(r => { vars[r.key.trim()] = Number(r.value); });
      onChange(vars, true);
    } else {
      onChange({}, false);
    }
  }

  function addRow() {
    apply([...rows, makeRow()]);
  }

  function removeRow(id: number) {
    apply(rows.filter(r => r.id !== id));
  }

  function updateKey(id: number, val: string) {
    apply(rows.map(r => r.id === id ? { ...r, key: val } : r));
  }

  function updateValue(id: number, val: string) {
    apply(rows.map(r => r.id === id ? { ...r, value: val } : r));
  }

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Variable</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground w-36">Value</th>
                <th className="w-9" />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-2 py-1.5">
                    <Input
                      className={`h-7 font-mono text-xs ${row.keyError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      value={row.key}
                      onChange={e => updateKey(row.id, e.target.value)}
                      placeholder="variable_name"
                      spellCheck={false}
                    />
                    {row.keyError && (
                      <p className="mt-0.5 text-xs text-destructive">{row.keyError}</p>
                    )}
                  </td>
                  <td className="px-2 py-1.5 w-36">
                    <Input
                      type="number"
                      step="1"
                      className={`h-7 font-mono text-xs text-right ${row.valueError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      value={row.value}
                      onChange={e => updateValue(row.id, e.target.value)}
                      placeholder="0"
                    />
                    {row.valueError && (
                      <p className="mt-0.5 text-xs text-destructive">{row.valueError}</p>
                    )}
                  </td>
                  <td className="px-1 py-1.5 w-9">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 0 && (
        <p className="py-3 text-center text-sm text-muted-foreground">
          No variables yet.
        </p>
      )}

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add variable
      </Button>
    </div>
  );
}
