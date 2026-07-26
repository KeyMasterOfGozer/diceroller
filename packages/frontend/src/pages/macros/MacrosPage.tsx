import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Settings, Dices, Layers } from 'lucide-react';
import { useCharactersStore } from '@/store/characters';
import { macrosApi, charactersApi, type Macro } from '@/lib/api';
import { getRollHistory, type RollHistoryEntry } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { groupHistory } from './history';
import { CreateMacroForm } from './CreateMacroForm';
import { CreateComboForm } from './CreateComboForm';
import { MacroCard } from './MacroCard';
import { RollHistory } from './RollHistory';

type AdvantageMode = 'advantage' | 'normal' | 'disadvantage';

export default function MacrosPage() {
  const { id: charId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { characters, setActiveCharacter } = useCharactersStore();
  const { toast } = useToast();

  const char = characters.find(c => c.characterId === charId);
  const [macros, setMacros]       = useState<Macro[]>([]);
  const [vars, setVars]           = useState<Record<string, number>>({});
  const [history, setHistory]     = useState<RollHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showForm, setShowForm]           = useState(false);
  const [showComboForm, setShowComboForm] = useState(false);

  const [advantageMode, setAdvantageMode] = useState<AdvantageMode>('normal');
  const [lastRollKey, setLastRollKey]     = useState<string | null>(null);

  // Drag-to-reorder (spans cards, must live here)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const historyGroups = useMemo(() => groupHistory(history), [history]);
  const standardMacros = useMemo(() => macros.filter(m => m.type !== 'combo'), [macros]);

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

  async function reloadHistory() {
    if (!charId) return;
    setHistory(await getRollHistory(charId, 30));
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────

  function handleDragStart(macroId: string) {
    setDraggingId(macroId);
    setDragOverId(macroId);
  }

  function handleDragOver(e: React.DragEvent, macroId: string) {
    e.preventDefault();
    if (draggingId && draggingId !== macroId) setDragOverId(macroId);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null); setDragOverId(null); return;
    }
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

  // ─────────────────────────────────────────────────────────────────────────

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
            onClick={() => { setShowComboForm(v => !v); setShowForm(false); }}
          >
            <Layers className="mr-1.5 h-4 w-4" />
            Add combo
          </Button>
          <Button size="sm" onClick={() => { setShowForm(v => !v); setShowComboForm(false); }}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add macro
          </Button>
        </div>
      </div>

      {/* Advantage / Normal / Disadvantage toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Roll mode</span>
        <div className="flex rounded-md border border-input overflow-hidden text-sm">
          {(['advantage', 'normal', 'disadvantage'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setAdvantageMode(mode)}
              className={cn(
                'px-3 py-1 font-medium transition-colors',
                advantageMode === mode
                  ? mode === 'advantage'
                    ? 'bg-green-600 text-white'
                    : mode === 'disadvantage'
                      ? 'bg-red-600 text-white'
                      : 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {mode === 'advantage' ? 'ADV' : mode === 'normal' ? 'Normal' : 'DIS'}
            </button>
          ))}
        </div>
        {advantageMode !== 'normal' && (
          <span className="text-xs text-muted-foreground">
            Affects dice marked with <code className="rounded bg-muted px-1 py-0.5 font-mono">~</code> in macro notation
          </span>
        )}
      </div>

      {/* Create forms */}
      {showForm && (
        <CreateMacroForm
          charId={charId!}
          sortOrder={macros.length}
          onCreated={macro => { setMacros(prev => [...prev, macro]); setShowForm(false); toast({ title: `"${macro.name}" created` }); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {showComboForm && (
        <CreateComboForm
          charId={charId!}
          sortOrder={macros.length}
          standardMacros={standardMacros}
          onCreated={combo => { setMacros(prev => [...prev, combo]); setShowComboForm(false); toast({ title: `Combo "${combo.name}" created` }); }}
          onCancel={() => setShowComboForm(false)}
        />
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
            <MacroCard
              key={macro.macroId}
              macro={macro}
              allMacros={macros}
              charId={charId!}
              vars={vars}
              advantageMode={advantageMode}
              isDragging={draggingId === macro.macroId}
              isDragOver={dragOverId === macro.macroId && draggingId !== macro.macroId}
              onDragStart={() => handleDragStart(macro.macroId)}
              onDragOver={e => handleDragOver(e, macro.macroId)}
              onDrop={e => handleDrop(e, macro.macroId)}
              onDragEnd={handleDragEnd}
              onUpdate={updated => setMacros(prev => prev.map(m => m.macroId === updated.macroId ? updated : m))}
              onDelete={macroId => setMacros(prev => prev.filter(m => m.macroId !== macroId))}
              onRoll={rollKey => setLastRollKey(rollKey)}
              onHistoryChange={reloadHistory}
            />
          ))}
        </div>
      )}

      <RollHistory groups={historyGroups} lastRollKey={lastRollKey} />
    </div>
  );
}
