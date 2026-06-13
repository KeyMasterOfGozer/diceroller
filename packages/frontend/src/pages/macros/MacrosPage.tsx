import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Settings, Dices, Trash2, Share2, Pencil, Check, X,
  GripVertical, Copy, Link2Off, Layers,
} from 'lucide-react';
import { roll, rollAttack, validate, type RollResult, type AttackRollResult } from '@dnd-dice-roller/dice-engine';
import { useCharactersStore } from '@/store/characters';
import { macrosApi, charactersApi, sharingApi, type Macro } from '@/lib/api';
import { addRoll, getRollHistory, type RollHistoryEntry } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDate } from '@/lib/utils';
import { RollResultDisplay } from '@/components/RollResultDisplay';

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
  // combo-only
  macroIds: string[];
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

// ── Combo result entry — mirrors standalone macro variants ────────────────────

type ComboEntry =
  | { kind: 'roll';   macroName: string; result: RollResult }
  | { kind: 'attack'; macroName: string; atkResult: AttackRollResult };

// ── History grouping ──────────────────────────────────────────────────────────

type HistoryGroup =
  | { kind: 'single'; entry: RollHistoryEntry }
  | { kind: 'combo'; comboId: string; comboName: string; entries: RollHistoryEntry[]; rolledAt: Date }
  | { kind: 'attack'; attackId: string; attackName: string; toHit: RollHistoryEntry; damage: RollHistoryEntry | null; isCrit: boolean; rolledAt: Date };

function groupHistory(entries: RollHistoryEntry[]): HistoryGroup[] {
  const groups: HistoryGroup[] = [];
  const seenCombos  = new Set<string>();
  const seenAttacks = new Set<string>();
  for (const entry of entries) {
    if (entry.comboId) {
      if (!seenCombos.has(entry.comboId)) {
        seenCombos.add(entry.comboId);
        groups.push({
          kind: 'combo',
          comboId: entry.comboId,
          comboName: entry.comboName ?? 'Combo',
          entries: entries.filter(e => e.comboId === entry.comboId),
          rolledAt: entry.rolledAt,
        });
      }
    } else if (entry.attackId) {
      if (!seenAttacks.has(entry.attackId)) {
        seenAttacks.add(entry.attackId);
        const attackEntries = entries.filter(e => e.attackId === entry.attackId);
        const toHit  = attackEntries.find(e => e.attackPart === 'to-hit') ?? entry;
        const damage = attackEntries.find(e => e.attackPart === 'damage') ?? null;
        groups.push({
          kind: 'attack',
          attackId: entry.attackId,
          attackName: entry.attackName ?? 'Attack',
          toHit,
          damage,
          isCrit: toHit.result.isNatural20,
          rolledAt: entry.rolledAt,
        });
      }
    } else {
      groups.push({ kind: 'single', entry });
    }
  }
  return groups;
}

// ── Macro picker (ordered list, allows duplicates) ────────────────────────────

interface MacroPickerProps {
  label: string;
  standardMacros: Macro[];
  selectedIds: string[];
  pickValue: string;
  onPickChange: (v: string) => void;
  onAdd: (id: string) => void;
  onRemove: (index: number) => void;
}

function MacroPicker({ label, standardMacros, selectedIds, pickValue, onPickChange, onAdd, onRemove }: MacroPickerProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {standardMacros.length === 0 ? (
        <p className="text-xs text-muted-foreground">No standard macros yet — create some first.</p>
      ) : (
        <>
          {/* Picker row */}
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
              onClick={() => { onAdd(pickValue); }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>

          {/* Ordered list */}
          {selectedIds.length > 0 && (
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
          )}

          {selectedIds.length === 0 && (
            <p className="text-xs text-muted-foreground">Add at least one macro.</p>
          )}
        </>
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

  // Which form is open (mutually exclusive)
  const [showForm, setShowForm] = useState(false);
  const [showComboForm, setShowComboForm] = useState(false);

  // Standard macro create form
  const [newName, setNewName] = useState('');
  const [newNotation, setNewNotation] = useState('');
  const [newCategory, setNewCategory] = useState('Utility');
  const [newDesc, setNewDesc] = useState('');
  const [notationError, setNotationError] = useState('');

  // Combo macro create form
  const [comboName, setComboName] = useState('');
  const [comboCategory, setComboCategory] = useState('Utility');
  const [comboDesc, setComboDesc] = useState('');
  const [comboSelectedIds, setComboSelectedIds] = useState<string[]>([]); // ordered, allows duplicates
  const [comboPick, setComboPick] = useState('');                          // current dropdown selection

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({
    name: '', notation: '', category: 'Utility', description: '', notationError: '', macroIds: [],
  });
  const [editComboPick, setEditComboPick] = useState(''); // dropdown for adding to an in-edit combo
  const [isSaving, setIsSaving] = useState(false);

  // Roll results
  const [macroResults, setMacroResults]   = useState<Record<string, RollResult>>({});
  const [attackResults, setAttackResults] = useState<Record<string, AttackRollResult>>({});
  const [comboResults, setComboResults] = useState<Record<string, ComboEntry[]>>({});
  const [lastRollKey, setLastRollKey]     = useState<string | null>(null);

  // Drag-to-reorder
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Grouped history (memoized)
  const historyGroups = useMemo(() => groupHistory(history), [history]);

  // Standard macros only (for combo picker)
  const standardMacros = useMemo(
    () => macros.filter(m => (m.type ?? 'standard') === 'standard'),
    [macros],
  );

  useEffect(() => {
    if (!charId) return;
    setActiveCharacter(charId);
    setIsLoading(true);
    Promise.all([
      macrosApi.list(charId),
      charactersApi.getVars(charId),
      getRollHistory(charId, 30),
    ]).then(([m, v, h]) => {
      setMacros(m);
      setVars(v);
      setHistory(h);
    }).catch(() => {
      toast({ title: 'Failed to load macros', variant: 'destructive' });
    }).finally(() => setIsLoading(false));
  }, [charId, setActiveCharacter, toast]);

  // ── Create standard ─────────────────────────────────────────────────────────

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
        type: 'standard', macroIds: [],
      });
      setMacros(prev => [...prev, macro]);
      toast({ title: `"${macro.name}" created` });
      setShowForm(false);
      setNewName(''); setNewNotation(''); setNewCategory('Utility'); setNewDesc('');
    } catch (err) {
      toast({ title: 'Failed to create macro', description: (err as Error).message, variant: 'destructive' });
    }
  }

  // ── Create combo ────────────────────────────────────────────────────────────

  async function handleCreateCombo(e: React.FormEvent) {
    e.preventDefault();
    if (!charId || comboSelectedIds.length === 0) return;
    try {
      const combo = await macrosApi.create(charId, {
        name: comboName, notation: '', category: comboCategory,
        description: comboDesc, sortOrder: macros.length,
        type: 'combo', macroIds: comboSelectedIds,
      });
      setMacros(prev => [...prev, combo]);
      toast({ title: `Combo "${combo.name}" created` });
      setShowComboForm(false);
      setComboName(''); setComboCategory('Utility'); setComboDesc('');
      setComboSelectedIds([]); setComboPick('');
    } catch (err) {
      toast({ title: 'Failed to create combo', description: (err as Error).message, variant: 'destructive' });
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
      macroIds: macro.macroIds ?? [],
    });
    setShowForm(false);
    setShowComboForm(false);
  }

  function cancelEdit() { setEditingId(null); }

  function handleEditNotationChange(v: string) {
    setEditState(s => ({ ...s, notation: v, notationError: validate(v) ?? '' }));
  }

  async function handleSaveEdit(macro: Macro) {
    if (!charId) return;
    if (macro.type !== 'combo' && editState.notationError) return;
    if (macro.type === 'combo' && editState.macroIds.length === 0) {
      toast({ title: 'Select at least one macro', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const update: Partial<Macro> = {
        name: editState.name,
        category: editState.category,
        description: editState.description,
      };
      if (macro.type !== 'combo') update.notation = editState.notation;
      if (macro.type === 'combo') update.macroIds = editState.macroIds;

      await macrosApi.update(charId, macro.macroId, update);
      setMacros(prev => prev.map(m => m.macroId === macro.macroId ? { ...m, ...update } : m));
      toast({ title: 'Macro updated' });
      setEditingId(null);
    } catch (err) {
      toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }

  // ── Roll ─────────────────────────────────────────────────────────────────────

  async function handleRoll(macro: Macro) {
    try {
      // Attack category macros get the crit-aware two-phase roll
      if (macro.category === 'Attack') {
        const atkResult = rollAttack(macro.notation, { variables: vars });
        const unresolved = [
          ...atkResult.toHit.unresolvedVariables,
          ...(atkResult.damage?.unresolvedVariables ?? []),
        ].filter((v, i, a) => a.indexOf(v) === i);
        if (unresolved.length > 0) {
          toast({ title: 'Unresolved variables', description: `Missing: ${unresolved.join(', ')}`, variant: 'destructive' });
        }
        const attackId = crypto.randomUUID();
        const rolledAt = new Date();
        // Store to-hit entry
        await addRoll({
          characterId: charId!, notation: macro.notation,
          result: atkResult.toHit, rolledAt,
          attackId, attackPart: 'to-hit', attackName: macro.name,
        });
        // Store damage entry (if there are damage components)
        if (atkResult.damage) {
          await addRoll({
            characterId: charId!, notation: macro.notation,
            result: atkResult.damage, rolledAt,
            attackId, attackPart: 'damage', attackName: macro.name,
          });
        }
        setLastRollKey('attack-' + attackId);
        setAttackResults(prev => ({ ...prev, [macro.macroId]: atkResult }));
        setHistory(await getRollHistory(charId!, 30));
        return;
      }

      // Standard roll
      const result = roll(macro.notation, { variables: vars });
      if (result.unresolvedVariables.length > 0) {
        toast({
          title: 'Unresolved variables',
          description: `Missing: ${result.unresolvedVariables.join(', ')}`,
          variant: 'destructive',
        });
      }
      const id = await addRoll({ characterId: charId!, notation: macro.notation, result, rolledAt: new Date() });
      setLastRollKey(String(id));
      setMacroResults(prev => ({ ...prev, [macro.macroId]: result }));
      setHistory(await getRollHistory(charId!, 30));
    } catch (err) {
      toast({ title: 'Roll failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  async function handleRollCombo(combo: Macro) {
    const ids = combo.macroIds ?? [];
    if (ids.length === 0) return;
    const comboId = crypto.randomUUID();
    const rolledAt = new Date();
    const results: ComboEntry[] = [];

    // Resolve valid macros in order (skip missing / nested combos)
    const validMacros = ids
      .map(id => macros.find(x => x.macroId === id))
      .filter((m): m is Macro => !!m && (m.type ?? 'standard') !== 'combo');

    // Each macro in the combo is rolled exactly like a standalone macro:
    // Attack macros use rollAttack() (crit within their own components), others use roll().
    for (const m of validMacros) {
      try {
        if (m.category === 'Attack') {
          const atkResult = rollAttack(m.notation, { variables: vars });
          results.push({ kind: 'attack', macroName: m.name, atkResult });
          // Store to-hit and (if present) damage as separate history rows in this combo
          await addRoll({
            characterId: charId!, notation: m.notation, result: atkResult.toHit,
            rolledAt, macroName: `${m.name} — Hit`, comboId, comboName: combo.name,
          });
          if (atkResult.damage) {
            await addRoll({
              characterId: charId!, notation: m.notation, result: atkResult.damage,
              rolledAt,
              macroName: `${m.name} — ${atkResult.isCrit ? 'Dmg ✕2' : 'Dmg'}`,
              comboId, comboName: combo.name,
            });
          }
          setAttackResults(prev => ({ ...prev, [m.macroId]: atkResult }));
        } else {
          const result = roll(m.notation, { variables: vars });
          results.push({ kind: 'roll', macroName: m.name, result });
          await addRoll({
            characterId: charId!, notation: m.notation, result,
            rolledAt, macroName: m.name, comboId, comboName: combo.name,
          });
          setMacroResults(prev => ({ ...prev, [m.macroId]: result }));
        }
      } catch {
        // silently skip a broken constituent
      }
    }

    setComboResults(prev => ({ ...prev, [combo.macroId]: results }));
    setLastRollKey('combo-' + comboId);
    setHistory(await getRollHistory(charId!, 30));
  }

  // ── Share ─────────────────────────────────────────────────────────────────────

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

  function handleCopyLink(macro: Macro) {
    if (!macro.shareToken) return;
    const url = `${window.location.origin}/shared/${macro.shareToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied!', description: url });
  }

  async function handleUnshare(macro: Macro) {
    try {
      await sharingApi.unshare(charId!, macro.macroId);
      setMacros(prev => prev.map(m =>
        m.macroId === macro.macroId ? { ...m, isShared: false, shareToken: null } : m
      ));
      toast({ title: `"${macro.name}" is no longer shared` });
    } catch (err) {
      toast({ title: 'Unshare failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete(macro: Macro) {
    if (!confirm(`Delete "${macro.name}"?`)) return;
    try {
      await macrosApi.delete(charId!, macro.macroId);
      setMacros(prev => prev.filter(m => m.macroId !== macro.macroId));
      toast({ title: `"${macro.name}" deleted` });
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  // ── Drag to reorder ───────────────────────────────────────────────────────────

  function handleDragStart(macroId: string) {
    setDraggingId(macroId); setDragOverId(macroId);
  }
  function handleDragOver(e: React.DragEvent, macroId: string) {
    e.preventDefault();
    if (draggingId && draggingId !== macroId) setDragOverId(macroId);
  }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return; }
    const from = macros.findIndex(m => m.macroId === draggingId);
    const to   = macros.findIndex(m => m.macroId === targetId);
    const reordered = [...macros];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withOrder = reordered.map((m, i) => ({ ...m, sortOrder: i }));
    setMacros(withOrder);
    setDraggingId(null); setDragOverId(null);
    macrosApi.reorder(charId!, withOrder.map(m => ({ macroId: m.macroId, sortOrder: m.sortOrder })))
      .catch(() => toast({ title: 'Reorder failed — reload to sync', variant: 'destructive' }));
  }
  function handleDragEnd() { setDraggingId(null); setDragOverId(null); }

  // ─────────────────────────────────────────────────────────────────────────────

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowComboForm(v => !v); setShowForm(false); setEditingId(null); }}
          >
            <Layers className="mr-1.5 h-4 w-4" />
            Add combo
          </Button>
          <Button size="sm" onClick={() => { setShowForm(v => !v); setShowComboForm(false); setEditingId(null); }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add macro
          </Button>
        </div>
      </div>

      {/* Create standard macro form */}
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
                    placeholder={newCategory === 'Attack' ? '1d20+{{prof}}+{{str}} [To Hit]; 1d8+{{str}} [Damage]' : '2d6+{{str}}'}
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

      {/* Create combo form */}
      {showComboForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              New combo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateCombo} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <Label htmlFor="combo-name">Name *</Label>
                  <Input id="combo-name" required value={comboName} onChange={e => setComboName(e.target.value)} placeholder="Full Attack" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="combo-category">Category</Label>
                  <CategorySelect id="combo-category" value={comboCategory} onChange={setComboCategory} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="combo-desc">Description</Label>
                  <Input id="combo-desc" value={comboDesc} onChange={e => setComboDesc(e.target.value)} placeholder="Optional" />
                </div>
              </div>

              <MacroPicker
                label="Macros to include *"
                standardMacros={standardMacros}
                selectedIds={comboSelectedIds}
                onAdd={id => setComboSelectedIds(prev => [...prev, id])}
                onRemove={i => setComboSelectedIds(prev => prev.filter((_, idx) => idx !== i))}
                pickValue={comboPick}
                onPickChange={setComboPick}
              />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowComboForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={comboSelectedIds.length === 0 || !comboName.trim()}>
                  Create combo
                </Button>
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
          {macros.map(macro => {
            const isCombo = (macro.type ?? 'standard') === 'combo';
            return (
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
                            <Input value={editState.name} onChange={e => setEditState(s => ({ ...s, name: e.target.value }))} required />
                          </div>
                          {!isCombo && (
                            <div className="col-span-2 flex flex-col gap-1.5">
                              <Label>Notation</Label>
                              <Input
                                value={editState.notation}
                                onChange={e => handleEditNotationChange(e.target.value)}
                                className={cn(editState.notationError && 'border-destructive focus-visible:ring-destructive')}
                                required
                              />
                              {editState.notationError && <p className="text-xs text-destructive">{editState.notationError}</p>}
                            </div>
                          )}
                          {isCombo && (
                            <div className="col-span-2">
                              <MacroPicker
                                label="Macros"
                                standardMacros={standardMacros}
                                selectedIds={editState.macroIds}
                                onAdd={id => setEditState(s => ({ ...s, macroIds: [...s.macroIds, id] }))}
                                onRemove={i => setEditState(s => ({ ...s, macroIds: s.macroIds.filter((_, idx) => idx !== i) }))}
                                pickValue={editComboPick}
                                onPickChange={setEditComboPick}
                              />
                            </div>
                          )}
                          <div className="flex flex-col gap-1.5">
                            <Label>Category</Label>
                            <CategorySelect value={editState.category} onChange={v => setEditState(s => ({ ...s, category: v }))} />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <Label>Description</Label>
                            <Input value={editState.description} onChange={e => setEditState(s => ({ ...s, description: e.target.value }))} placeholder="Optional" />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                            <X className="mr-1.5 h-3.5 w-3.5" />Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={
                              (!isCombo && (!!editState.notationError || !editState.notation || !editState.name)) ||
                              (isCombo && (editState.macroIds.length === 0 || !editState.name)) ||
                              isSaving
                            }
                            onClick={() => handleSaveEdit(macro)}
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
                        <GripVertical className="mt-0.5 h-5 w-5 shrink-0 cursor-grab select-none text-muted-foreground/30 hover:text-muted-foreground/70 active:cursor-grabbing" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-3">
                            {/* Macro info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {isCombo && (
                                  <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="font-medium">{macro.name}</span>
                                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', CATEGORY_COLORS[macro.category] ?? CATEGORY_COLORS.Other)}>
                                  {macro.category}
                                </span>
                                {isCombo && (
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Combo</span>
                                )}
                                {macro.isShared && <Badge variant="outline" className="text-xs">Shared</Badge>}
                              </div>

                              {/* Notation or constituent list */}
                              {isCombo ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {(macro.macroIds ?? []).map(id => {
                                    const m = macros.find(x => x.macroId === id);
                                    return m ? (
                                      <span key={id} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                        {m.name}
                                      </span>
                                    ) : null;
                                  })}
                                </div>
                              ) : (
                                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{macro.notation}</p>
                              )}

                              {macro.description && <p className="mt-0.5 text-xs text-muted-foreground">{macro.description}</p>}
                            </div>

                            {/* Action buttons */}
                            <div className="flex shrink-0 gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Edit" onClick={() => startEdit(macro)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {/* Only allow sharing standard macros */}
                              {!isCombo && (
                                macro.isShared ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" title="Shared — click for options">
                                        <Share2 className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleCopyLink(macro)}>
                                        <Copy className="mr-2 h-3.5 w-3.5" />Copy link
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleUnshare(macro)}>
                                        <Link2Off className="mr-2 h-3.5 w-3.5" />Stop sharing
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : (
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Share" onClick={() => handleShare(macro)}>
                                    <Share2 className="h-4 w-4" />
                                  </Button>
                                )
                              )}
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => handleDelete(macro)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Button size="sm" onClick={() => isCombo ? handleRollCombo(macro) : handleRoll(macro)}>
                                <Dices className="mr-1.5 h-4 w-4" />
                                {isCombo ? 'Roll combo' : 'Roll'}
                              </Button>
                            </div>
                          </div>

                          {/* Attack macro result — to-hit and damage on one line */}
                          {!isCombo && macro.category === 'Attack' && attackResults[macro.macroId] && (() => {
                            const atk = attackResults[macro.macroId];
                            return (
                              <div className="mt-3 space-y-2">
                                {/* Crit / fumble banner */}
                                {atk.isCrit && (
                                  <div className="rounded-md bg-green-100 px-3 py-1 text-center text-sm font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                                    ⚔ CRITICAL HIT!
                                  </div>
                                )}
                                {atk.isFumble && (
                                  <div className="rounded-md bg-red-100 px-3 py-1 text-center text-sm font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                    💀 FUMBLE!
                                  </div>
                                )}
                                {/* To-hit and damage side by side */}
                                <div className="flex gap-4 flex-wrap">
                                  <div className="min-w-0">
                                    <RollResultDisplay result={atk.toHit} />
                                  </div>
                                  {atk.damage && (
                                    <div className="min-w-0">
                                      <RollResultDisplay result={atk.damage} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Standard macro roll result */}
                          {!isCombo && macro.category !== 'Attack' && macroResults[macro.macroId] && (
                            <RollResultDisplay result={macroResults[macro.macroId]} />
                          )}

                          {/* Combo roll results — each macro handled same as standalone */}
                          {isCombo && comboResults[macro.macroId] && (
                            <div className="mt-3 space-y-2">
                              {comboResults[macro.macroId].map((entry, i) => (
                                <div key={i}>
                                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {entry.macroName}
                                  </p>
                                  {entry.kind === 'attack' ? (
                                    <div className="space-y-1">
                                      {entry.atkResult.isCrit && (
                                        <div className="rounded-md bg-green-100 px-2 py-0.5 text-center text-xs font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                                          ⚔ CRITICAL HIT!
                                        </div>
                                      )}
                                      {entry.atkResult.isFumble && (
                                        <div className="rounded-md bg-red-100 px-2 py-0.5 text-center text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                          💀 FUMBLE!
                                        </div>
                                      )}
                                      <div className="flex gap-4 flex-wrap">
                                        <div>
                                          <RollResultDisplay result={entry.atkResult.toHit} />
                                        </div>
                                        {entry.atkResult.damage && (
                                          <div>
                                            <RollResultDisplay result={entry.atkResult.damage} />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <RollResultDisplay result={entry.result} />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}

      {/* Roll history */}
      {historyGroups.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent rolls</h2>
          <div className="flex flex-col gap-1.5">
            {historyGroups.map((group, gi) => {
              if (group.kind === 'combo') {
                const isNew = lastRollKey === 'combo-' + group.comboId;
                return (
                  <div
                    key={group.comboId}
                    className={cn(
                      'rounded-md border overflow-hidden transition-colors',
                      isNew && 'animate-roll-in border-primary/30 bg-primary/5',
                    )}
                  >
                    {/* Combo header */}
                    <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-semibold">{group.comboName}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDate(group.rolledAt)}</span>
                    </div>
                    {/* Constituent results */}
                    {group.entries.map((entry, ei) => (
                      <div key={entry.id ?? ei} className="flex items-center gap-3 border-b px-3 py-2 last:border-0">
                        <span className="w-28 shrink-0 text-xs text-muted-foreground truncate">{entry.macroName}</span>
                        <div className="flex flex-wrap gap-2">
                          {entry.result.components.map((comp, ci) => (
                            <div key={ci} className="flex items-center gap-1">
                              {comp.label && <span className="text-xs text-muted-foreground">{comp.label}</span>}
                              <span className={cn(
                                'text-lg font-bold tabular-nums leading-none',
                                entry.result.isNatural20 && comp.dice.some(d => d.sides === 20) && 'text-green-600 dark:text-green-400',
                                entry.result.isNatural1  && comp.dice.some(d => d.sides === 20) && 'text-destructive',
                              )}>
                                {comp.subtotal}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }

              // Attack roll group
              if (group.kind === 'attack') {
                const isNew = lastRollKey === 'attack-' + group.attackId;
                const { toHit, damage, isCrit } = group;
                return (
                  <div
                    key={group.attackId}
                    className={cn(
                      'rounded-md border overflow-hidden transition-colors',
                      isNew && 'animate-roll-in border-primary/30 bg-primary/5',
                    )}
                  >
                    {/* Attack header */}
                    <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">⚔</span>
                        <span className="text-xs font-semibold">{group.attackName}</span>
                        {isCrit && (
                          <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                            CRIT
                          </span>
                        )}
                        {toHit.result.isNatural1 && (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            FUMBLE
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDate(group.rolledAt)}</span>
                    </div>
                    {/* To-hit and damage on one row */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2">
                      {/* To Hit section */}
                      <div className="flex items-center gap-2">
                        <div className="flex flex-wrap gap-2">
                          {toHit.result.components.map((comp, ci) => (
                            <div key={ci} className="flex items-center gap-1">
                              {comp.label && <span className="text-xs text-muted-foreground">{comp.label}</span>}
                              <span className={cn(
                                'text-lg font-bold tabular-nums leading-none',
                                isCrit && 'text-green-600 dark:text-green-400',
                                toHit.result.isNatural1 && 'text-destructive',
                              )}>
                                {comp.subtotal}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Damage section */}
                      {damage && (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-wrap gap-2">
                            {damage.result.components.map((comp, ci) => (
                              <div key={ci} className="flex items-center gap-1">
                                {comp.label && <span className="text-xs text-muted-foreground">{comp.label}</span>}
                                <span className={cn(
                                  'text-lg font-bold tabular-nums leading-none',
                                  isCrit && 'text-green-600 dark:text-green-400',
                                )}>
                                  {comp.subtotal}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Single roll
              const entry = group.entry;
              const isNew = lastRollKey === String(entry.id);
              return (
                <div
                  key={entry.id ?? gi}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm transition-colors',
                    isNew && 'animate-roll-in border-primary/30 bg-primary/5',
                  )}
                >
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
                        )}>
                          {comp.subtotal}
                        </span>
                        {ci < entry.result.components.length - 1 && (
                          <span className="text-muted-foreground/50">·</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
