import { useMemo, useState } from 'react';
import {
  GripVertical, Pencil, Share2, Trash2, Dices, Check, X,
  Copy, Link2Off, Layers,
} from 'lucide-react';
import { roll, rollAttack, validate, type RollResult, type AttackRollResult } from '@dnd-dice-roller/dice-engine';
import { macrosApi, sharingApi, type Macro } from '@/lib/api';
import { addRoll } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RollResultDisplay } from '@/components/RollResultDisplay';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CategorySelect, CATEGORY_COLORS } from './CategorySelect';
import { MacroPicker } from './MacroPicker';

// ── Types ─────────────────────────────────────────────────────────────────────

type AdvantageMode = 'advantage' | 'normal' | 'disadvantage';

type ComboEntry =
  | { kind: 'roll';   label: string; result: RollResult }
  | { kind: 'attack'; label: string; atkResult: AttackRollResult };

export interface MacroCardProps {
  macro: Macro;
  allMacros: Macro[];
  charId: string;
  vars: Record<string, number>;
  advantageMode: AdvantageMode;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onUpdate: (updated: Macro) => void;
  onDelete: (macroId: string) => void;
  onRoll: (rollKey: string) => void;
  onHistoryChange: () => void;
}

export function MacroCard({
  macro, allMacros, charId, vars, advantageMode,
  isDragging, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onUpdate, onDelete, onRoll, onHistoryChange,
}: MacroCardProps) {
  const { toast } = useToast();
  const isCombo = macro.type === 'combo';

  // ── Edit state ────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing]         = useState(false);
  const [editName, setEditName]           = useState('');
  const [editNotation, setEditNotation]   = useState('');
  const [editCategory, setEditCategory]   = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCritThreshold, setEditCritThreshold] = useState(20);
  const [editMacroIds, setEditMacroIds]   = useState<string[]>([]);
  const [editComboPick, setEditComboPick] = useState('');
  const [isSaving, setIsSaving]           = useState(false);

  // Derived — never stored in state
  const editNotationError = useMemo(() => validate(editNotation) ?? '', [editNotation]);

  // ── Roll result state ─────────────────────────────────────────────────────
  const [macroResult, setMacroResult]     = useState<RollResult | null>(null);
  const [attackResult, setAttackResult]   = useState<AttackRollResult | null>(null);
  const [comboResult, setComboResult]     = useState<ComboEntry[] | null>(null);

  // ── Delete confirm ────────────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Standard macros for combo picker (exclude self and other combos) ───────
  const standardMacros = useMemo(
    () => allMacros.filter(m => m.type !== 'combo' && m.macroId !== macro.macroId),
    [allMacros, macro.macroId],
  );

  // ── Edit ──────────────────────────────────────────────────────────────────

  function startEdit() {
    setEditName(macro.name);
    setEditNotation(macro.notation);
    setEditCategory(macro.category);
    setEditDescription(macro.description ?? '');
    setEditCritThreshold(macro.critThreshold ?? 20);
    setEditMacroIds(macro.macroIds ?? []);
    setEditComboPick('');
    setIsEditing(true);
  }

  function cancelEdit() { setIsEditing(false); }

  async function saveEdit() {
    if (!isCombo && editNotationError) return;
    if (isCombo && editMacroIds.length === 0) {
      toast({ title: 'Select at least one macro', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      const update: Partial<Macro> = {
        name: editName, category: editCategory, description: editDescription,
        critThreshold: editCategory === 'Attack' ? editCritThreshold : undefined,
      };
      if (!isCombo) update.notation  = editNotation;
      if (isCombo)  update.macroIds  = editMacroIds;

      await macrosApi.update(charId, macro.macroId, update);
      onUpdate({ ...macro, ...update });
      setIsEditing(false);
    } catch (err) {
      toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }

  // ── Roll ──────────────────────────────────────────────────────────────────

  async function handleRoll() {
    try {
      if (macro.category === 'Attack') {
        const atkResult = rollAttack(macro.notation, { variables: vars, critThreshold: macro.critThreshold ?? 20, advantageMode });
        const unresolved = [
          ...atkResult.toHit.unresolvedVariables,
          ...(atkResult.damage?.unresolvedVariables ?? []),
        ].filter((v, i, a) => a.indexOf(v) === i);
        if (unresolved.length > 0) {
          toast({ title: 'Unresolved variables', description: `Missing: ${unresolved.join(', ')}`, variant: 'destructive' });
        }
        const attackId = crypto.randomUUID();
        const rolledAt = new Date();
        await Promise.all([
          addRoll({ characterId: charId, notation: macro.notation, result: atkResult.toHit, rolledAt, attackId, attackPart: 'to-hit', label: macro.name }),
          atkResult.damage
            ? addRoll({ characterId: charId, notation: macro.notation, result: atkResult.damage, rolledAt, attackId, attackPart: 'damage', label: macro.name })
            : Promise.resolve(),
        ]);
        setAttackResult(atkResult);
        onRoll('attack-' + attackId);
      } else {
        const result = roll(macro.notation, { variables: vars, advantageMode });
        if (result.unresolvedVariables.length > 0) {
          toast({ title: 'Unresolved variables', description: `Missing: ${result.unresolvedVariables.join(', ')}`, variant: 'destructive' });
        }
        const id = await addRoll({ characterId: charId, notation: macro.notation, result, rolledAt: new Date() });
        setMacroResult(result);
        onRoll(String(id));
      }
      onHistoryChange();
    } catch (err) {
      toast({ title: 'Roll failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  async function handleRollCombo() {
    const validMacros = (macro.macroIds ?? [])
      .map(id => allMacros.find(m => m.macroId === id))
      .filter((m): m is Macro => !!m && m.type !== 'combo');

    if (validMacros.length === 0) return;

    const comboId  = crypto.randomUUID();
    const rolledAt = new Date();
    const results: ComboEntry[] = [];
    const failures: string[]   = [];

    // Roll all macros; writes are parallelised per macro but macros run sequentially
    // (order matters for display)
    for (const m of validMacros) {
      try {
        if (m.category === 'Attack') {
          const atkResult = rollAttack(m.notation, { variables: vars, critThreshold: m.critThreshold ?? 20, advantageMode });
          results.push({ kind: 'attack', label: m.name, atkResult });
          const attackId = crypto.randomUUID();
          await Promise.all([
            addRoll({ characterId: charId, notation: m.notation, result: atkResult.toHit,   rolledAt, label: m.name, comboId, comboName: macro.name, attackId, attackPart: 'to-hit' }),
            atkResult.damage
              ? addRoll({ characterId: charId, notation: m.notation, result: atkResult.damage, rolledAt, label: m.name, comboId, comboName: macro.name, attackId, attackPart: 'damage' })
              : Promise.resolve(),
          ]);
        } else {
          const result = roll(m.notation, { variables: vars, advantageMode });
          results.push({ kind: 'roll', label: m.name, result });
          await addRoll({ characterId: charId, notation: m.notation, result, rolledAt, label: m.name, comboId, comboName: macro.name });
        }
      } catch {
        failures.push(m.name);
      }
    }

    if (failures.length > 0) {
      toast({ title: `Skipped: ${failures.join(', ')}`, description: 'One or more macros failed to roll.', variant: 'destructive' });
    }

    setComboResult(results);
    onRoll('combo-' + comboId);
    onHistoryChange();
  }

  // ── Share ─────────────────────────────────────────────────────────────────

  async function handleShare() {
    try {
      const { shareToken } = await sharingApi.share(charId, macro.macroId);
      const url = `${window.location.origin}/shared/${shareToken}`;
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied!', description: url });
      onUpdate({ ...macro, isShared: true, shareToken });
    } catch (err) {
      toast({ title: 'Share failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  function handleCopyLink() {
    if (!macro.shareToken) return;
    const url = `${window.location.origin}/shared/${macro.shareToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Link copied!', description: url });
  }

  async function handleUnshare() {
    try {
      await sharingApi.unshare(charId, macro.macroId);
      onUpdate({ ...macro, isShared: false, shareToken: null });
      toast({ title: `"${macro.name}" is no longer shared` });
    } catch (err) {
      toast({ title: 'Unshare failed', description: (err as Error).message, variant: 'destructive' });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      draggable={!isEditing}
      onDragStart={() => { if (!isEditing) onDragStart(); }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        'rounded-lg transition-all',
        isDragging && 'opacity-40',
        isDragOver && !isDragging && 'ring-2 ring-primary ring-offset-2',
      )}
    >
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="p-4">
          {isEditing ? <EditView /> : <ReadView />}
        </CardContent>
      </Card>

      {showDeleteConfirm && (
        <ConfirmDialog
          title={`Delete "${macro.name}"?`}
          description="This macro will be permanently deleted."
          destructive
          onConfirm={async () => {
            await macrosApi.delete(charId, macro.macroId);
            onDelete(macro.macroId);
          }}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );

  // ── Sub-views (closures so they share state without prop drilling) ─────────

  function EditView() {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input value={editName} onChange={e => setEditName(e.target.value)} required />
          </div>
          {!isCombo && (
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Notation</Label>
              <Input
                value={editNotation}
                onChange={e => setEditNotation(e.target.value)}
                className={cn(editNotationError && 'border-destructive focus-visible:ring-destructive')}
                required
              />
              {editNotationError && <p className="text-xs text-destructive">{editNotationError}</p>}
            </div>
          )}
          {isCombo && (
            <div className="col-span-2">
              <MacroPicker
                label="Macros"
                standardMacros={standardMacros}
                selectedIds={editMacroIds}
                pickValue={editComboPick}
                onPickChange={setEditComboPick}
                onAdd={id => setEditMacroIds(prev => [...prev, id])}
                onRemove={i => setEditMacroIds(prev => prev.filter((_, idx) => idx !== i))}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <CategorySelect
              value={editCategory}
              onChange={v => { setEditCategory(v); if (v !== 'Attack') setEditCritThreshold(20); }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Input value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Optional" />
          </div>
          {editCategory === 'Attack' && (
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>Crit on roll of <strong>{editCritThreshold}–20</strong></Label>
              <Input
                type="number" min={1} max={20}
                value={editCritThreshold}
                onChange={e => setEditCritThreshold(Math.min(20, Math.max(1, Number(e.target.value))))}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">Default 20. Set to 19 for Improved Critical.</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
            <X className="mr-1.5 h-3.5 w-3.5" />Cancel
          </Button>
          <Button
            size="sm"
            disabled={
              (!isCombo && (!!editNotationError || !editNotation || !editName)) ||
              (isCombo  && (editMacroIds.length === 0 || !editName)) ||
              isSaving
            }
            onClick={saveEdit}
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    );
  }

  function ReadView() {
    return (
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-5 w-5 shrink-0 cursor-grab select-none text-muted-foreground/30 hover:text-muted-foreground/70 active:cursor-grabbing" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3">
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {isCombo && <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="font-medium">{macro.name}</span>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', CATEGORY_COLORS[macro.category] ?? CATEGORY_COLORS['Other'])}>
                  {macro.category}
                </span>
                {isCombo && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Combo</span>
                )}
                {macro.isShared && <Badge variant="outline" className="text-xs">Shared</Badge>}
              </div>

              {isCombo ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {(macro.macroIds ?? []).map(id => {
                    const m = allMacros.find(x => x.macroId === id);
                    return m ? (
                      <span key={id} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{m.name}</span>
                    ) : null;
                  })}
                </div>
              ) : (
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{macro.notation}</p>
              )}

              {macro.description && <p className="mt-0.5 text-xs text-muted-foreground">{macro.description}</p>}
            </div>

            {/* Actions */}
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Edit" onClick={startEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
              {!isCombo && (
                macro.isShared ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" title="Shared — click for options">
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleCopyLink}>
                        <Copy className="mr-2 h-3.5 w-3.5" />Copy link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleUnshare}>
                        <Link2Off className="mr-2 h-3.5 w-3.5" />Stop sharing
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Share" onClick={handleShare}>
                    <Share2 className="h-4 w-4" />
                  </Button>
                )
              )}
              <Button
                variant="ghost" size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                title="Delete"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={isCombo ? handleRollCombo : handleRoll}>
                <Dices className="mr-1.5 h-4 w-4" />
                {isCombo ? 'Roll combo' : 'Roll'}
              </Button>
            </div>
          </div>

          {/* Roll results */}
          <RollResults />
        </div>
      </div>
    );
  }

  function RollResults() {
    if (isCombo && comboResult) {
      return (
        <div className="mt-3 space-y-2">
          {comboResult.map((entry, i) => (
            <div key={i}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {entry.label}
              </p>
              {entry.kind === 'attack' ? (
                <div className="space-y-1">
                  {entry.atkResult.isCrit && <CritBanner />}
                  {entry.atkResult.isFumble && <FumbleBanner />}
                  <div className="flex gap-4 flex-wrap">
                    <RollResultDisplay result={entry.atkResult.toHit} />
                    {entry.atkResult.damage && <RollResultDisplay result={entry.atkResult.damage} />}
                  </div>
                </div>
              ) : (
                <RollResultDisplay result={entry.result} />
              )}
            </div>
          ))}
        </div>
      );
    }

    if (!isCombo && macro.category === 'Attack' && attackResult) {
      return (
        <div className="mt-3 space-y-2">
          {attackResult.isCrit && <CritBanner />}
          {attackResult.isFumble && <FumbleBanner />}
          <div className="flex gap-4 flex-wrap">
            <RollResultDisplay result={attackResult.toHit} />
            {attackResult.damage && <RollResultDisplay result={attackResult.damage} />}
          </div>
        </div>
      );
    }

    if (!isCombo && macro.category !== 'Attack' && macroResult) {
      return <RollResultDisplay result={macroResult} />;
    }

    return null;
  }
}

function CritBanner() {
  return (
    <div className="rounded-md bg-green-100 px-3 py-1 text-center text-sm font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
      ⚔ CRITICAL HIT!
    </div>
  );
}

function FumbleBanner() {
  return (
    <div className="rounded-md bg-red-100 px-3 py-1 text-center text-sm font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
      💀 FUMBLE!
    </div>
  );
}
