import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Dices, Trash2 } from 'lucide-react';
import { useCharactersStore } from '@/store/characters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export default function CharactersPage() {
  const { characters, createCharacter, deleteCharacter, setActiveCharacter } = useCharactersStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [charClass, setCharClass] = useState('');
  const [level, setLevel] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      const char = await createCharacter({ name: name.trim(), class: charClass, level });
      toast({ title: `${char.name} created!` });
      setShowForm(false);
      setName(''); setCharClass(''); setLevel(1);
      navigate(`/characters/${char.characterId}/macros`);
    } catch (err) {
      toast({ title: 'Failed to create character', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(id: string, charName: string) {
    if (!confirm(`Archive "${charName}"? You can still access it from the API.`)) return;
    try {
      await deleteCharacter(id);
      toast({ title: `${charName} archived` });
    } catch (err) {
      toast({ title: 'Failed to archive', description: (err as Error).message, variant: 'destructive' });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Characters</h1>
          <p className="text-sm text-muted-foreground">{characters.length} character{characters.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowForm(v => !v)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New character
        </Button>
      </div>

      {/* New character form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New character</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" required value={name} onChange={e => setName(e.target.value)} placeholder="Gandalf the Grey" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="class">Class</Label>
                  <Input id="class" value={charClass} onChange={e => setCharClass(e.target.value)} placeholder="Wizard" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="level">Level</Label>
                  <Input id="level" type="number" min={1} max={20} value={level} onChange={e => setLevel(Number(e.target.value))} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={isCreating}>
                  {isCreating ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Character list */}
      {characters.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Dices className="h-10 w-10 opacity-30" />
          <p className="text-sm">No characters yet. Create one to get rolling.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {characters.map(char => (
            <Card
              key={char.characterId}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => { setActiveCharacter(char.characterId); navigate(`/characters/${char.characterId}/macros`); }}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{char.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {char.class || 'Unknown class'} · Level {char.level}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Lv {char.level}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={e => { e.stopPropagation(); handleDelete(char.characterId, char.name); }}
                    title="Archive character"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
