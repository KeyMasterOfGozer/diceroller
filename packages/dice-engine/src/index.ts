export * from "./types.js";
export * from "./parser.js";
export * from "./evaluator.js";

import { parse, type MacroNode } from "./parser.js";
import { evaluate } from "./evaluator.js";
import { RollOptions, RollResult, AttackRollResult } from "./types.js";

/**
 * Main entry point: parse and evaluate a dice notation string in one call.
 *
 * @example
 * const result = roll("2d20kh1 + {{prof}} [To Hit]; 1d8+3 [Damage]", { variables: { prof: 4 } });
 */
export function roll(notation: string, options: RollOptions = {}): RollResult {
  const macro = parse(notation);
  const result = evaluate(macro, options);
  // Attach the original notation string
  result.notation = notation;
  return result;
}

/**
 * Roll an Attack macro: the first component is the to-hit roll; remaining
 * components are the damage rolls.  If the to-hit roll is a natural 20, all
 * damage dice are automatically doubled (critical hit).
 *
 * Returns an AttackRollResult with separate `toHit` and `damage` results plus
 * `isCrit` / `isFumble` flags so the UI can display them distinctly.
 *
 * @example
 * const atk = rollAttack("1d20+{{str}} [To Hit]; 2d6+{{str}} [Damage]", { variables: { str: 3 } });
 * if (atk.isCrit) showBanner("CRITICAL HIT!");
 */
export function rollAttack(notation: string, options: RollOptions = {}): AttackRollResult {
  const macro = parse(notation);
  if (macro.components.length === 0) throw new Error("Empty notation");

  const [first, ...rest] = macro.components;

  // Roll the to-hit component alone
  const toHitMacro: MacroNode = { kind: "macro", components: [first] };
  const toHit = evaluate(toHitMacro, options);
  toHit.notation = notation;

  const isCrit   = toHit.isNatural20;
  const isFumble = toHit.isNatural1;

  // Roll damage components (possibly with crit doubling)
  let damage: RollResult | null = null;
  if (rest.length > 0) {
    const damageMacro: MacroNode = { kind: "macro", components: rest };
    const forceCritComponents = rest.map(() => isCrit);
    damage = evaluate(damageMacro, { ...options, forceCritComponents });
    damage.notation = notation;
  }

  return { toHit, damage, isCrit, isFumble };
}

/**
 * Validate a notation string without rolling.
 * Returns null on success, or an error message string on failure.
 */
export function validate(notation: string): string | null {
  try {
    parse(notation);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
