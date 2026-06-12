import { ASTNode, DiceNode, MacroNode } from "./parser.js";
import { DieResult, RollComponent, RollResult, RollOptions } from "./types.js";

const MAX_EXPLODE = 100; // safety cap on exploding dice chains

function defaultRandom(sides: number): number {
  // cryptographically random in browser; Math.random fallback for Node
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
}

export function evaluate(macro: MacroNode, options: RollOptions = {}): RollResult {
  const vars = options.variables ?? {};
  const rand = options.random ?? defaultRandom;
  const unresolved: string[] = [];

  function resolveNumber(node: ASTNode): number {
    switch (node.kind) {
      case "number":   return node.value;
      case "variable": {
        const v = vars[node.name];
        if (v === undefined) {
          if (!unresolved.includes(node.name)) unresolved.push(node.name);
          return 0;
        }
        return v;
      }
      case "binary": {
        const l = resolveNumber(node.left);
        const r = resolveNumber(node.right);
        if (node.op === "+") return l + r;
        if (node.op === "-") return l - r;
        return l * r;
      }
      case "unary": return -resolveNumber(node.operand);
      case "dice":  return rollDice(node).subtotal;
      case "crit":  return rollDice(node.expr as DiceNode, true).subtotal;
      case "component":
      case "macro": throw new Error("Unexpected AST node in expression");
    }
  }

  interface DiceRollResult { dice: DieResult[]; modifier: number; subtotal: number; isCrit: boolean; }

  function rollDice(node: ASTNode, forceCrit = false): DiceRollResult {
    if (node.kind === "number") {
      return { dice: [], modifier: node.value, subtotal: node.value, isCrit: false };
    }
    if (node.kind === "variable") {
      const v = resolveNumber(node);
      return { dice: [], modifier: v, subtotal: v, isCrit: false };
    }
    if (node.kind === "binary") {
      // Propagate forceCrit so dice inside crit(1d8+3) get doubled but flat modifiers don't
      const l = rollDiceExpr(node.left, forceCrit);
      const r = rollDiceExpr(node.right, forceCrit);
      const sign = node.op === "-" ? -1 : 1;
      return {
        dice: [...l.dice, ...r.dice],
        modifier: 0,
        subtotal: l.subtotal + sign * r.subtotal,
        isCrit: forceCrit
      };
    }
    if (node.kind === "unary") {
      const inner = rollDiceExpr(node.operand, forceCrit);
      return { ...inner, subtotal: -inner.subtotal };
    }
    if (node.kind === "crit") {
      return rollDiceExpr(node.expr, true);
    }
    if (node.kind !== "dice") {
      return { dice: [], modifier: resolveNumber(node), subtotal: resolveNumber(node), isCrit: false };
    }

    const dnode = node as DiceNode;
    const mods = dnode.modifiers;
    let count = resolveNumber(dnode.count);
    const sides = resolveNumber(dnode.sides);

    if (sides < 1) throw new Error(`Die must have at least 1 side`);

    // Advantage/disadvantage: roll 2, keep 1
    if (mods.advantage) { count = 2; mods.keepHigh = 1; }
    if (mods.disadvantage) { count = 2; mods.keepLow = 1; }

    // Critical hit doubles the dice count
    const isCrit = forceCrit;
    const rollCount = isCrit ? count * 2 : count;

    // Roll each die
    const results: DieResult[] = [];
    for (let i = 0; i < rollCount; i++) {
      results.push(rollOneDie(sides, mods, rand));
    }

    // Keep/drop
    applyKeepDrop(results, mods);

    // Count successes mode
    const active = results.filter(d => !d.dropped);
    let subtotal: number;
    if (mods.countSuccesses !== undefined) {
      subtotal = active.filter(d => d.value >= mods.countSuccesses!).length;
    } else {
      subtotal = active.reduce((s, d) => s + d.value, 0);
    }

    return { dice: results, modifier: 0, subtotal, isCrit };
  }

  function rollDiceExpr(node: ASTNode, forceCrit: boolean): DiceRollResult {
    return rollDice(node, forceCrit);
  }

  function rollOneDie(sides: number, mods: DiceNode["modifiers"], random: (s: number) => number): DieResult {
    let value = random(sides);
    let rerolled = false;
    // Reroll (indefinitely)
    if (mods.rerollOn !== undefined) {
      while (value === mods.rerollOn) { value = random(sides); rerolled = true; }
    }
    // Reroll once
    if (mods.rerollOnce !== undefined && value === mods.rerollOnce) {
      value = random(sides); rerolled = true;
    }
    // Min/max clamp
    if (mods.minVal !== undefined) value = Math.max(value, mods.minVal);
    if (mods.maxVal !== undefined) value = Math.min(value, mods.maxVal);

    const die: DieResult = { sides, value, dropped: false, rerolled, exploded: false };

    // Exploding
    if (mods.exploding) {
      let chain = die;
      let extra = value;
      let count = 0;
      while (extra === sides && count < MAX_EXPLODE) {
        extra = random(sides);
        chain.exploded = true;
        die.value += extra; // accumulate on same DieResult for simplicity
        count++;
      }
    }

    return die;
  }

  function applyKeepDrop(dice: DieResult[], mods: DiceNode["modifiers"]): void {
    if (mods.keepHigh !== undefined) {
      const keep = mods.keepHigh;
      const sorted = [...dice].sort((a, b) => b.value - a.value);
      const keepers = new Set(sorted.slice(0, keep));
      dice.forEach(d => { if (!keepers.has(d)) d.dropped = true; });
    } else if (mods.keepLow !== undefined) {
      const keep = mods.keepLow;
      const sorted = [...dice].sort((a, b) => a.value - b.value);
      const keepers = new Set(sorted.slice(0, keep));
      dice.forEach(d => { if (!keepers.has(d)) d.dropped = true; });
    } else if (mods.dropHigh !== undefined) {
      const drop = mods.dropHigh;
      const sorted = [...dice].sort((a, b) => b.value - a.value);
      const dropSet = new Set(sorted.slice(0, drop));
      dice.forEach(d => { if (dropSet.has(d)) d.dropped = true; });
    } else if (mods.dropLow !== undefined) {
      const drop = mods.dropLow;
      const sorted = [...dice].sort((a, b) => a.value - b.value);
      const dropSet = new Set(sorted.slice(0, drop));
      dice.forEach(d => { if (dropSet.has(d)) d.dropped = true; });
    }
  }

  // ── Evaluate each component ───────────────────────────────────────────────
  const components: RollComponent[] = macro.components.map(c => {
    const result = rollDice(c.expr, false);
    // Walk the expr tree to accumulate dice vs flat modifier
    const { dice, subtotal, modifier, isCrit } = result;
    return {
      label: c.label,
      notation: "", // filled by caller from source string if needed
      dice,
      modifier,
      subtotal,
      isCrit,
    };
  });

  const total = components.reduce((s, c) => s + c.subtotal, 0);
  const allDice = components.flatMap(c => c.dice);
  const isNatural20 = allDice.some(d => d.sides === 20 && d.value === 20 && !d.dropped);
  const isNatural1  = allDice.some(d => d.sides === 20 && d.value === 1  && !d.dropped);

  return {
    notation: "",
    components,
    total,
    isNatural20,
    isNatural1,
    unresolvedVariables: unresolved,
    rolledAt: new Date(),
  };
}
