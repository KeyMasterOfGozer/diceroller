import { describe, it, expect } from "vitest";
import { roll, validate } from "../index.js";
import { RollOptions } from "../types.js";

/** Deterministic random: always returns the given fixed value for any die. */
function fixed(value: number): RollOptions["random"] {
  return (_sides: number) => value;
}

/** Cycles through provided values repeatedly */
function cycle(...values: number[]): RollOptions["random"] {
  let i = 0;
  return (_sides: number) => values[i++ % values.length];
}

// ── Basic rolls ──────────────────────────────────────────────────────────────

describe("basic notation", () => {
  it("rolls a single die", () => {
    const r = roll("d6", { random: fixed(4) });
    expect(r.total).toBe(4);
    expect(r.components).toHaveLength(1);
    expect(r.components[0].dice).toHaveLength(1);
    expect(r.components[0].dice[0].value).toBe(4);
  });

  it("rolls XdY", () => {
    const r = roll("3d6", { random: fixed(3) });
    expect(r.total).toBe(9);
    expect(r.components[0].dice).toHaveLength(3);
  });

  it("adds flat modifier", () => {
    const r = roll("1d8+5", { random: fixed(3) });
    expect(r.total).toBe(8);
  });

  it("subtracts flat modifier", () => {
    const r = roll("2d4-1", { random: fixed(4) });
    expect(r.total).toBe(7); // 4+4-1
  });

  it("handles bare number", () => {
    const r = roll("5");
    expect(r.total).toBe(5);
  });

  it("groups expressions with parens", () => {
    const r = roll("(1d4+2)+(1d4+2)", { random: fixed(2) });
    expect(r.total).toBe(8); // (2+2)+(2+2)
  });
});

// ── Natural 20 / 1 detection ─────────────────────────────────────────────────

describe("natural 20 / 1 detection", () => {
  it("detects natural 20", () => {
    const r = roll("1d20", { random: fixed(20) });
    expect(r.isNatural20).toBe(true);
    expect(r.isNatural1).toBe(false);
  });

  it("detects natural 1", () => {
    const r = roll("1d20", { random: fixed(1) });
    expect(r.isNatural1).toBe(true);
    expect(r.isNatural20).toBe(false);
  });

  it("does not flag non-d20 dice", () => {
    const r = roll("1d6", { random: fixed(6) });
    expect(r.isNatural20).toBe(false);
  });
});

// ── Keep / drop ───────────────────────────────────────────────────────────────

describe("keep/drop modifiers", () => {
  it("keeps highest (advantage)", () => {
    // cycle: first roll 8, second roll 15
    const r = roll("2d20kh1", { random: cycle(8, 15) });
    expect(r.total).toBe(15);
    const dropped = r.components[0].dice.filter(d => d.dropped);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].value).toBe(8);
  });

  it("keeps lowest (disadvantage)", () => {
    const r = roll("2d20kl1", { random: cycle(15, 8) });
    expect(r.total).toBe(8);
  });

  it("adv shorthand", () => {
    const r = roll("d20adv", { random: cycle(5, 18) });
    expect(r.total).toBe(18);
  });

  it("dis shorthand", () => {
    const r = roll("d20dis", { random: cycle(5, 18) });
    expect(r.total).toBe(5);
  });

  it("drops lowest (4d6dl1 — stat gen)", () => {
    // rolls: 1, 4, 5, 6 → drop 1 → sum 15
    const r = roll("4d6dl1", { random: cycle(1, 4, 5, 6) });
    expect(r.total).toBe(15);
    const dropped = r.components[0].dice.filter(d => d.dropped);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].value).toBe(1);
  });

  it("drops highest", () => {
    // rolls: 3, 6 → drop 6 → sum 3
    const r = roll("2d6dh1", { random: cycle(3, 6) });
    expect(r.total).toBe(3);
  });
});

// ── Special effects ───────────────────────────────────────────────────────────

describe("reroll", () => {
  it("rerolls 1s indefinitely", () => {
    // First roll lands on 1 twice, third lands on 4
    const r = roll("1d6r1", { random: cycle(1, 1, 4) });
    expect(r.total).toBe(4);
    expect(r.components[0].dice[0].rerolled).toBe(true);
  });

  it("rerolls once (ro)", () => {
    // First roll lands on 1 (rerolled once), second roll also 1 — not rerolled again
    const r = roll("1d6ro1", { random: cycle(1, 1) });
    expect(r.total).toBe(1); // only rerolled once
    expect(r.components[0].dice[0].rerolled).toBe(true);
  });
});

describe("min/max clamp", () => {
  it("applies minimum", () => {
    const r = roll("1d6min3", { random: fixed(1) });
    expect(r.total).toBe(3);
  });

  it("applies maximum", () => {
    const r = roll("1d6max4", { random: fixed(6) });
    expect(r.total).toBe(4);
  });
});

describe("count successes", () => {
  it("counts dice >= threshold", () => {
    // 4d6, rolls: 3, 5, 6, 2 → successes >= 4: two (5 and 6)
    const r = roll("4d6cs4", { random: cycle(3, 5, 6, 2) });
    expect(r.total).toBe(2);
  });
});

describe("exploding dice", () => {
  it("adds value on max roll and re-rolls", () => {
    // d6!: first roll max (6), rerolls → gets 3; total = 9
    const r = roll("1d6!", { random: cycle(6, 3) });
    expect(r.total).toBe(9);
  });

  it("does not explode on non-max", () => {
    const r = roll("1d6!", { random: fixed(4) });
    expect(r.total).toBe(4);
  });
});

// ── Critical hits ─────────────────────────────────────────────────────────────

describe("crit()", () => {
  it("doubles dice count", () => {
    // crit(1d8+3): rolls 2d8 instead of 1d8; fixed(4) → 4+4+3 = 11
    const r = roll("crit(1d8+3)", { random: fixed(4) });
    expect(r.total).toBe(11);
    expect(r.components[0].dice).toHaveLength(2);
  });

  it("does not double flat modifiers", () => {
    const r = roll("crit(2d6+5)", { random: fixed(3) });
    // 4 dice × 3 + 5 = 17
    expect(r.total).toBe(17);
    expect(r.components[0].dice).toHaveLength(4);
  });
});

// ── Labels and compound macros ────────────────────────────────────────────────

describe("labels and compound macros", () => {
  it("parses a label", () => {
    const r = roll("1d8 [Damage]", { random: fixed(5) });
    expect(r.components[0].label).toBe("Damage");
    expect(r.total).toBe(5);
  });

  it("handles compound macro with semicolons", () => {
    const r = roll("1d20+5 [To Hit]; 1d8+3 [Piercing]", { random: cycle(10, 6) });
    expect(r.components).toHaveLength(2);
    expect(r.components[0].label).toBe("To Hit");
    expect(r.components[0].subtotal).toBe(15); // 10 + 5
    expect(r.components[1].label).toBe("Piercing");
    expect(r.components[1].subtotal).toBe(9); // 6 + 3
    expect(r.total).toBe(24);
  });

  it("handles trailing semicolon", () => {
    const r = roll("1d6 [A];", { random: fixed(3) });
    expect(r.components).toHaveLength(1);
  });
});

// ── Variables ─────────────────────────────────────────────────────────────────

describe("variable substitution", () => {
  it("substitutes variable values", () => {
    const r = roll("1d20 + {{prof}}", {
      random: fixed(10),
      variables: { prof: 4 },
    });
    expect(r.total).toBe(14);
  });

  it("supports freeform variable names", () => {
    const r = roll("1d6 + {{Fire Damage Bonus}}", {
      random: fixed(3),
      variables: { "Fire Damage Bonus": 2 },
    });
    expect(r.total).toBe(5);
  });

  it("records unresolved variables and returns 0 for them", () => {
    const r = roll("1d20 + {{missing}}", { random: fixed(5) });
    expect(r.unresolvedVariables).toContain("missing");
    expect(r.total).toBe(5); // 0 for missing variable
  });

  it("handles multiple variables", () => {
    const r = roll("1d20 + {{prof}} + {{str_mod}} [STR Check]", {
      random: fixed(8),
      variables: { prof: 4, str_mod: 3 },
    });
    expect(r.total).toBe(15); // 8 + 4 + 3
  });
});

// ── Real macro examples ───────────────────────────────────────────────────────

describe("real-world macro examples", () => {
  it("flaming sword attack macro", () => {
    // 1d20+5 [To Hit]; 1d8+3 [Piercing]; 1d6 [Fire]
    const r = roll("1d20+5 [To Hit]; 1d8+3 [Piercing]; 1d6 [Fire]", {
      random: cycle(12, 7, 4),
    });
    expect(r.components[0].subtotal).toBe(17); // 12+5
    expect(r.components[1].subtotal).toBe(10); // 7+3
    expect(r.components[2].subtotal).toBe(4);
    expect(r.total).toBe(31);
  });

  it("stat generation (4d6dl1 × 3)", () => {
    const r = roll("4d6dl1 [STR]; 4d6dl1 [DEX]; 4d6dl1 [CON]", {
      random: cycle(1, 4, 5, 6, 2, 3, 5, 6, 3, 3, 4, 5),
    });
    expect(r.components).toHaveLength(3);
    // STR: 1,4,5,6 drop 1 → 15
    expect(r.components[0].subtotal).toBe(15);
  });

  it("sneak attack critical", () => {
    const r = roll("crit(3d6) [Sneak]; 1d8+4 [Damage]", {
      random: cycle(3, 3, 3, 3, 3, 3, 5), // 6 sneak dice (crit), then 1d8
    });
    // crit(3d6): 6 × 3 = 18; 1d8+4: 5+4 = 9; total = 27
    expect(r.components[0].subtotal).toBe(18);
    expect(r.components[1].subtotal).toBe(9);
    expect(r.total).toBe(27);
  });
});

// ── validate() ───────────────────────────────────────────────────────────────

describe("validate()", () => {
  it("returns null for valid notation", () => {
    expect(validate("2d6+3")).toBeNull();
    expect(validate("1d20adv")).toBeNull();
    expect(validate("crit(1d8+4)")).toBeNull();
    expect(validate("4d6dl1 [STR]; 4d6dl1 [DEX]")).toBeNull();
  });

  it("returns error message for invalid notation", () => {
    expect(validate("2d")).not.toBeNull();
    expect(validate("d")).not.toBeNull();
    expect(validate("{{unclosed")).not.toBeNull();
  });
});
