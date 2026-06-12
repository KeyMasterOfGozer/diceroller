import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useCharactersStore } from '@/store/characters';
import { charactersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { DndBeyondImportSection } from './DndBeyondImportSection';

export default function CharacterPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { characters, updateCharacter } = useCharactersStore();
  const { toast } = useToast();

  const char = characters.find(c => c.characterId === id);
  const [name, setName] = useState(char?.name ?? '');
  const [charClass, setCharClass] = useState(char?.class ?? '');
  const [level, setLevel] = useState(char?.level ?? 1);
  const [notes, setNotes] = useState(char?.notes ?? '');
  const [vars, setVars] = useState<Record<string, number>>({});
  const [varsJson, setVarsJson] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    charactersApi.getVars(id).then(v => {
      setVars(v);
      setVarsJson(JSON.stringify(v, null, 2));
    }).catch(() => {});
  }, [id]);

  if (!char) {
    return <p className="text-muted-foreground">Character not found.</p>;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Parse vars JSON
      let parsedVars: Record<string, number> = vars;
      try { parsedVars = JSON.parse(varsJson); } catch { toast({ title: 'Invalid variables JSON', variant: 'destructive' }); setIsSaving(false); return; }

      await Promise.all([
        updateCharacter(char!.characterId, { name, class: charClass, level, notes }),
        charactersApi.putVars(char!.characterId, parsedVars),
      ]);
      toast({ title: 'Character saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">{char.name}</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="class">Class</Label>
              <Input id="class" value={charClass} onChange={e => setCharClass(e.target.value)} placeholder="Wizard" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="level">Level</Label>
              <Input id="level" type="number" min={1} max={20} value={level} onChange={e => setLevel(Number(e.target.value))} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Variables</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              JSON map of variable names → integer values. Used in macro notation as <code className="font-mono">{'{{varName}}'}</code>.
            </p>
            <textarea
              className="h-48 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={varsJson}
              onChange={e => setVarsJson(e.target.value)}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            <Save className="mr-1.5 h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      {/* D&D Beyond import */}
      <DndBeyondImportSection
        characterId={char.characterId}
        onImported={updatedVars => {
          setVars(updatedVars);
          setVarsJson(JSON.stringify(updatedVars, null, 2));
        }}
      />
    </div>
  );
}
