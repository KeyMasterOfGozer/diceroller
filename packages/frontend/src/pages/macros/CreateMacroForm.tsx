import { useState } from 'react';
import { validate } from '@dnd-dice-roller/dice-engine';
import { macrosApi, type Macro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CategorySelect } from './CategorySelect';

interface CreateMacroFormProps {
  charId: string;
  sortOrder: number;
  onCreated: (macro: Macro) => void;
  onCancel: () => void;
}

export function CreateMacroForm({ charId, sortOrder, onCreated, onCancel }: CreateMacroFormProps) {
  const { toast } = useToast();
  const [name, setName]                   = useState('');
  const [notation, setNotation]           = useState('');
  const [category, setCategory]           = useState('Utility');
  const [description, setDescription]     = useState('');
  const [critThreshold, setCritThreshold] = useState(20);

  const notationError = validate(notation) ?? '';

  function handleCategoryChange(v: string) {
    setCategory(v);
    if (v !== 'Attack') setCritThreshold(20);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (notationError) return;
    try {
      const macro = await macrosApi.create(charId, {
        name, notation, category, description,
        sortOrder,
        type: 'standard', macroIds: [],
        ...(category === 'Attack' && critThreshold !== 20 ? { critThreshold } : {}),
      });
      onCreated(macro);
    } catch (err) {
      toast({ title: 'Failed to create macro', description: (err as Error).message, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">New macro</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="macro-name">Name *</Label>
              <Input
                id="macro-name" required
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Longsword Attack"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="macro-notation">Notation *</Label>
              <Input
                id="macro-notation" required
                value={notation} onChange={e => setNotation(e.target.value)}
                placeholder={category === 'Attack' ? '1d20+{{prof}}+{{str}} [To Hit]; 1d8+{{str}} [Damage]' : '2d6+{{str}}'}
                className={cn(notationError && 'border-destructive focus-visible:ring-destructive')}
              />
              {notationError && <p className="text-xs text-destructive">{notationError}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="macro-category">Category</Label>
              <CategorySelect id="macro-category" value={category} onChange={handleCategoryChange} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="macro-desc">Description</Label>
              <Input id="macro-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
            </div>
            {category === 'Attack' && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="macro-crit-threshold">
                  Crit on roll of <strong>{critThreshold}–20</strong>
                </Label>
                <Input
                  id="macro-crit-threshold" type="number" min={1} max={20}
                  value={critThreshold}
                  onChange={e => setCritThreshold(Math.min(20, Math.max(1, Number(e.target.value))))}
                  className="w-24"
                />
                <p className="text-xs text-muted-foreground">
                  Default 20. Set to 19 for Improved Critical, 18 for Superior Critical.
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="sm" disabled={!!notationError || !notation || !name}>
              Create
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
