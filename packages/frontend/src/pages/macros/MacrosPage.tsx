import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Settings, Dices, Trash2, Share2, Pencil, Check, X, GripVertical } from 'lucide-react';
import { roll, validate, type RollResult } from '@dnd-dice-roller/dice-engine';
import { useCharactersStore } from '@/store/characters';
import { macrosApi, charactersApi, sharingApi, type Macro } from '@/lib/api';
import { addRoll, getRollHistory, type RollHistoryEntry } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDate } from '@/lib/utils';

const CATEGORIES = ['Attack', 'Damage', 'Spell', 'Skill', 'Save', 'Utility', 'Other'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  Attack:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  Damage:  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  Spell:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  Skill:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  Save:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  Utility: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  Other:   'bg-gray-100 text-gray-700',
};

interface EditState {
  name: string;
  notation: string;
  category: string;
  description: string;
  notationError: string;
}

function CategorySelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
    </select>
  );
}

// ── Roll result display ───────────────────────────────────────────────────────

function RollResultDisplay({ result }: { result: RollResult }) {
  return (
    <div className={cn(
      'mt-3 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2.5 animate-roll-in',
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
      {result.isNatural20 && (
        <span className="ml-auto self-start rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400">
          NAT 20 ✦
        </span>
      )}
      {result.isNatural1 && (
        <span className="ml-auto self-start rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-destructive dark:bg-red-900/40">
          NAT 1
        </span>
      )}
    </div>
  );
}

export default function MacrosPage() {
  const { id: charId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { characters, setActiveCharacter } = useCharactersStore();
  const { toast } = useToast();

  const char = characters.find(c => c.characterId === charId);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [vars, setVars] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<RollHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ name: '', notation: '', category: 'Utility', description: '', notationError: '' });
  const [isSaving, setIsSaving] = useState(false);

  // New macro form state
  const [newName, setNewName] = useState('');
  const [newNotation, setNewNotation] = useState('');
  const [newCategory, setNewCategory] = useState('Utility');
  const [newDesc, setNewDesc] = useState('');
  const [notationError, setNotationError] = useState('');
  const [lastRollId, setLastRollId] = useState<string | null>(null);
  const [macroResults, setMacroResults] = useState<Record<string, RollResult>>({});

  // Drag-to-reorder state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (!charId) return;
    setActiveCharacter(charId);
    setIsLoading(true);
    Promise.all([
      macrosApi.list(charId),
      charactersApi.getVars(charId),
      getRollHistory(charId, 20),
    ]).then(([m, v, h]) => {
      setMacros(m);
      setVars(v);
      setHistory(h);
    }).catch(() => {
      toast({ title: 'Failed to load macros', variant: 'destructive' });
    }).finally(() => setIsLoading(false));
  }, [charId, setActiveCharacter, toast]);

  // ── Create ──────────────────────────────────────────────────────────────────

  function handleNewNotationChange(v: string) {
    setNewNotation(v);
    setNotationError(validate(v) ?? '');
  }

  async function handleCreateMacro(e: React.FormEvent) {
    e.preventDefault();
    if (!charId || notationError) return;
    try {
      const macro = await macrosApi.create(charId, {
        name: newName, notation: newNotation,
        category: newCategory, description: newDesc,
        sortOrder: macros.length,
      });
      setMacros(prev => [...prev, macro]);
      toast({ title: `"${macro.name}" created` });
      setShowForm(false);
      setNewName(''); setNewNotation(''); setNewCategory('Utility'); setNewDesc('');
    } catch (err) {
      toast({ title: 'Failed to create macro', description: (err as Error).message, variant: 'destructive' });
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────────

  function startEdit(macro: Macro) {
    setEditingId(macro.macroId);
    setEditState({
      name: macro.name,
      notation: macro.notation,
      category: macro.category,
      description: macro.description ?? '',
      notationError: '',
    });
    setShowForm(false);
  }

  function cancelEdit() { setEditingId(null); }

  function handleEditNotationChange(v: string) {
    setEditState(s => ({ ...s, notation: v, notationError: validate(v) ?? '' }));
  }

  async function handleSaveEdit(macroId: string) {
    if (!charId || editState.notationError) return;
    setIsSaving(true);
    try {
      await macrosApi.update(charId, macroId, {
        name: editState.name,
        notation: editState.notation,
        category: editState.category,
        description: editState.description,
      });
      setMacros(prev => prev.map(m =>
        m.macroId === macroId
          ? { ...m, name: editState.name, notation: editState.notation, category: editState.category, description: editState.description }
          : m
      ));
      toast({ title: 'Macro updated' });
      setEditingId(null);
    } catch (err) {
      toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }

  // ── Drag to reorder ───────────────────────────────────────────────────────────

  function handleDragStart(macroId: string) {
    setDraggingId(macroId);
    setDragOverId(macroId);
  }

  function handleDragOver(e: React.DragEvent, macroId: string) {
    e.preventDefault(); // required to allow drop
    if (draggingId && draggingId !== macroId) {
      setDragOverId(macroId);
    }
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const fromIdx = macros.findIndex(m => m.macroId === draggingId);
    const toIdx   = macros.findIndex(m => m.macroId === targetId);
    const reordered = [...macros];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const withOrder = reordered.map((m, i) => ({ ...m, sortOrder: i }));
    setMacros(withOrder);
    setDraggingId(null);
    setDragOverId(null);

    macrosApi.reorder(charId!, withOrder.map(m => ({ macroId: m.macroId, sortOrder: m.sortOrder })))
      .catch(() => toast({ title: 'Reorder failed — reload to sync', variant: 'destructive' }));
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverId(null);
  }

  // ── Roll ─────────────────────────────────────────────────────────────────────

  async function handleRoll(macro: Macro) {
    try {
      const result = roll(macro.notation, { variables: vars });
      if (result.unresolvedVariables.length > 0) {
        toast({
          title: 'Unresolved variables',
          description: `Missing: ${result.unresolvedVariables.join(', ')}. Check your character variables.`,
          variant: 'destructive',
        });
      }
      const id = await addRoll({ characterId: charId!, notation: macro.notation, result, rolledAt: new Date() });
      setLastRollId(String(id));
      setMacroResults(prev => ({ ...prev, [macro.macroId]: result }));
      const h = await getRollHistory(charId!, 20);
      setHistory(h);
    } catch (err) {
      toast({ title: 'Roll failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  // ── Delete / Share ───────────────────────────────────────────────────────────

  async function handleDelete(macro: Macro) {
    if (!confirm(`Delete macro "${macro.name}"?`)) return;
    try {
      await macrosApi.delete(charId!, macro.macroId);
      setMacros(prev => prev.filter(m => m.macroId !== macro.macroId));
      toast({ title: `"${macro.name}" deleted` });
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  async function handleShare(macro: Macro) {
    try {
      const { shareToken } = await sharingApi.share(charId!, macro.macroId);
      const url = `${window.location.origin}/shared/${shareToken}`;
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied!', description: url });
      setMacros(prev => prev.map(m => m.macroId === macro.macroId ? { ...m, isShared: true, shareToken } : m));
    } catch (err) {
      toast({ title: 'Share failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  if (!char) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{char.name}</h1>
          <p className="text-sm text-muted-foreground">
            {char.class || 'Unknown'} · Level {char.level} · {macros.length} macro{macros.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/characters/${charId}`)}>
            <Settings className="mr-1.5 h-4 w-4" />
            Edit character
          </Button>
          <Button size="sm" onClick={() => { setShowForm(v => !v); setEditingId(null); }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add macro
          </Button>
        </div>
      </div>

      {/* New macro form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New macro</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateMacro} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="macro-name">Name *</Label>
                  <Input id="macro-name" required value={newName} onChange={e => setNewName(e.target.value)} placeholder="Longsword Attack" />
                </div>
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="macro-notation">Notation *</Label>
                  <Input
                    id="macro-notation" required
                    value={newNotation} onChange={e => handleNewNotationChange(e.target.value)}
                    placeholder="1d20+{{prof}}+{{str}} [To Hit]; 1d8+{{str}} [Damage]"
                    className={cn(notationError && 'border-destructive focus-visible:ring-destructive')}
                  />
                  {notationError && <p className="text-xs text-destructive">{notationError}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="macro-category">Category</Label>
                  <CategorySelect id="macro-category" value={newCategory} onChange={setNewCategory} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="macro-desc">Description</Label>
                  <Input id="macro-desc" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={!!notationError || !newNotation}>Create</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Macro list */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : macros.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Dices className="h-10 w-10 opacity-30" />
          <p className="text-sm">No macros yet. Add one to start rolling.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {macros.map(macro => (
            <div
              key={macro.macroId}
              draggable={editingId !== macro.macroId}
              onDragStart={() => handleDragStart(macro.macroId)}
              onDragOver={e => handleDragOver(e, macro.macroId)}
              onDrop={e => handleDrop(e, macro.macroId)}
              onDragEnd={handleDragEnd}
              className={cn(
                'rounded-lg transition-all',
                draggingId === macro.macroId && 'opacity-40',
                dragOverId === macro.macroId && draggingId !== macro.macroId && 'ring-2 ring-primary ring-offset-2',
              )}
            >
              <Card className="transition-shadow hover:shadow-md">
                {editingId === macro.macroId ? (
                  /* ── Inline edit form ── */
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2 flex flex-col gap-1.5">
                          <Label>Name</Label>
                          <Input
                            value={editState.name}
                            onChange={e => setEditState(s => ({ ...s, name: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="col-span-2 flex flex-col gap-1.5">
                          <Label>Notation</Label>
                          <Input
                            value={editState.notation}
                            onChange={e => handleEditNotationChange(e.target.value)}
                            className={cn(editState.notationError && 'border-destructive focus-visible:ring-destructive')}
                            required
                          />
                          {editState.notationError && (
                            <p className="text-xs text-destructive">{editState.notationError}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label>Category</Label>
                          <CategorySelect
                            value={editState.category}
                            onChange={v => setEditState(s => ({ ...s, category: v }))}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label>Description</Label>
                          <Input
                            value={editState.description}
                            onChange={e => setEditState(s => ({ ...s, description: e.target.value }))}
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                          <X className="mr-1.5 h-3.5 w-3.5" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={!!editState.notationError || !editState.notation || !editState.name || isSaving}
                          onClick={() => handleSaveEdit(macro.macroId)}
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          {isSaving ? 'Saving…' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                ) : (
                  /* ── Read view ── */
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      {/* Drag handle */}
                      <GripVertical className="mt-0.5 h-5 w-5 shrink-0 cursor-grab select-none text-muted-foreground/30 hover:text-muted-foreground/70 active:cursor-grabbing" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3">
                          {/* Macro info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{macro.name}</span>
                              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', CATEGORY_COLORS[macro.category] ?? CATEGORY_COLORS.Other)}>
                                {macro.category}
                              </span>
                              {macro.isShared && <Badge variant="outline" className="text-xs">Shared</Badge>}
                            </div>
                            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{macro.notation}</p>
                            {macro.description && <p className="mt-0.5 text-xs text-muted-foreground">{macro.description}</p>}
                          </div>
                          {/* Action buttons */}
                          <div className="flex shrink-0 gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Edit" onClick={() => startEdit(macro)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Share" onClick={() => handleShare(macro)}>
                              <Share2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => handleDelete(macro)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button size="sm" onClick={() => handleRoll(macro)}>
                              <Dices className="mr-1.5 h-4 w-4" />
                              Roll
                            </Button>
                          </div>
                        </div>

                        {/* Per-component roll result */}
                        {macroResults[macro.macroId] && (
                          <RollResultDisplay result={macroResults[macro.macroId]} />
                        )}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Roll history */}
      {history.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent rolls</h2>
          <div className="flex flex-col gap-1">
            {history.map(entry => (
              <div
                key={entry.id}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm transition-colors',
                  String(entry.id) === lastRollId && 'animate-roll-in border-primary/30 bg-primary/5',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground truncate">{entry.notation}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatDate(entry.rolledAt)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {entry.result.components.map((comp, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {comp.label && (
                        <span className="text-xs text-muted-foreground">{comp.label}</span>
                      )}
                      <span className={cn(
                        'text-lg font-bold tabular-nums leading-none',
                        entry.result.isNatural20 && comp.dice.some(d => d.sides === 20) && 'text-green-600 dark:text-green-400',
                        entry.result.isNatural1 && comp.dice.some(d => d.sides === 20) && 'text-destructive',
                      )}>
                        {comp.subtotal}
                      </span>
                      {i < entry.result.components.length - 1 && (
                        <span className="text-muted-foreground/50">·</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
