import { useState } from 'react';
import { Layers } from 'lucide-react';
import { macrosApi, type Macro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CategorySelect } from './CategorySelect';
import { MacroPicker } from './MacroPicker';

interface CreateComboFormProps {
  charId: string;
  sortOrder: number;
  standardMacros: Macro[];
  onCreated: (macro: Macro) => void;
  onCancel: () => void;
}

export function CreateComboForm({ charId, sortOrder, standardMacros, onCreated, onCancel }: CreateComboFormProps) {
  const { toast } = useToast();
  const [name, setName]             = useState('');
  const [category, setCategory]     = useState('Utility');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickValue, setPickValue]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length === 0) return;
    try {
      const combo = await macrosApi.create(charId, {
        name, notation: '', category, description,
        sortOrder,
        type: 'combo', macroIds: selectedIds,
      });
      onCreated(combo);
    } catch (err) {
      toast({ title: 'Failed to create combo', description: (err as Error).message, variant: 'destructive' });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4" />
          New combo
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="combo-name">Name *</Label>
              <Input
                id="combo-name" required
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Full Attack"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="combo-category">Category</Label>
              <CategorySelect id="combo-category" value={category} onChange={setCategory} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="combo-desc">Description</Label>
              <Input id="combo-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <MacroPicker
            label="Macros to include *"
            standardMacros={standardMacros}
            selectedIds={selectedIds}
            pickValue={pickValue}
            onPickChange={setPickValue}
            onAdd={id => setSelectedIds(prev => [...prev, id])}
            onRemove={i => setSelectedIds(prev => prev.filter((_, idx) => idx !== i))}
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="submit" size="sm" disabled={selectedIds.length === 0 || !name.trim()}>
              Create combo
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
