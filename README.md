# D&D Dice Roller

A serverless web app for building and rolling D&D dice macros, hosted at [diceroller.oldforest.net](https://diceroller.oldforest.net).

Characters store custom variables (ability modifiers, proficiency bonus, etc.) that are referenced live in macros. Roll history is saved locally per character.

---

## Character Variables

Variables are numeric values attached to a character. They're referenced in macros using double-curly-brace syntax:

```
{{variable_name}}
```

Variable names are case-sensitive and can include spaces. When a macro is rolled, each `{{...}}` is replaced with the character's current value for that variable.

### Standard D&D Variables

These are auto-imported when you connect a D&D Beyond character, and are the suggested names for manual entry:

| Variable | Description | Example value |
|---|---|---|
| `str_mod` | Strength modifier | `+2` |
| `dex_mod` | Dexterity modifier | `+4` |
| `con_mod` | Constitution modifier | `+1` |
| `int_mod` | Intelligence modifier | `+3` |
| `wis_mod` | Wisdom modifier | `-1` |
| `cha_mod` | Charisma modifier | `+2` |
| `prof` | Proficiency bonus | `+3` |
| `level` | Character level | `7` |

You can add any custom variables you want — `spell_dc`, `sneak_attack_dice`, `rage_bonus`, etc.

### Usage in macros

```
1d20 + {{prof}} + {{str_mod}}
1d8 + {{str_mod}}
{{sneak_attack_dice}}d6
```

If a variable is referenced but not defined on the character, it resolves to `0` and the macro shows a warning.

---

## Macro Notation

A macro is a dice expression (or several, separated by `;`) that the engine parses and rolls. The full notation reference is below.

### Basic Dice

```
XdY          — roll X dice with Y sides
d6           — roll a single d6 (shorthand for 1d6)
3d8          — roll three d8s and sum them
```

### Flat Modifiers

```
1d8+5        — add 5 to the roll
2d6-1        — subtract 1 from the roll
1d20 + {{prof}} + {{dex_mod}}   — add variables as modifiers
```

Modifiers can be chained and mixed with variables freely.

### Keep / Drop

Roll extra dice and keep or discard specific ones.

| Notation | Meaning |
|---|---|
| `kh1` | Keep the highest 1 die |
| `kl1` | Keep the lowest 1 die |
| `dh1` | Drop the highest 1 die |
| `dl1` | Drop the lowest 1 die |
| `adv` | Advantage — roll 2, keep highest (shorthand for `2d20kh1`) |
| `dis` | Disadvantage — roll 2, keep lowest (shorthand for `2d20kl1`) |

```
d20adv                   — roll with advantage
d20dis + {{wis_mod}}     — Wisdom save at disadvantage
4d6dl1                   — stat generation: roll 4d6, drop lowest
2d20kh1 + {{prof}}       — keep-highest longhand
```

### Reroll

```
1d6r1        — reroll any 1s indefinitely until a non-1 is rolled
1d6ro1       — reroll a 1 once (keep result even if it's 1 again)
```

Useful for Halfling Lucky, Great Weapon Fighting, etc.

### Min / Max Clamp

```
1d8min3      — result is never lower than 3
2d6max8      — result is never higher than 8
```

### Count Successes

```
4d6cs4       — count how many dice rolled 4 or higher (returns a count, not a sum)
```

Useful for contested rolls or pool-based systems.

### Exploding Dice

```
1d6!         — if the die shows its maximum, roll again and add the result (keeps exploding)
```

### Critical Hits — `crit()`

Wrap a dice expression in `crit()` to double the dice count (not the modifiers), per D&D 5e rules.

```
crit(1d8+3)       — rolls 2d8+3 (dice doubled, +3 stays flat)
crit(2d6+5)       — rolls 4d6+5
crit(3d6) [Sneak] — critical sneak attack
```

### Labels — `[Label Text]`

Add a label in square brackets after any component. Labels appear in the roll result display.

```
1d20+5 [To Hit]
1d8+3  [Slashing]
1d6    [Fire]
```

### Multi-Component Macros — `;`

Separate multiple roll components with semicolons. Each component is rolled independently and shown separately, with all results displayed at once.

```
1d20+5 [To Hit]; 1d8+3 [Slashing]
```

This is the primary way to combine an attack roll and damage roll into one macro click.

---

## Macro Categories

Each macro has a **category** that controls how it's rolled.

### Attack Macros

Set a macro's category to **Attack** to enable the automatic crit mechanic:

- The **first component** is the to-hit roll (`d20 + modifiers`).
- If that d20 is a **natural 20**, every remaining component automatically rolls as a critical hit — dice are doubled, flat modifiers are not.
- If the d20 is a **natural 1** (fumble), the result box gets a red border.
- A natural 20 gets a green border.
- To-hit and damage results are shown side by side on one line.

```
1d20 + {{prof}} + {{str_mod}} [To Hit]; 1d8 + {{str_mod}} [Slashing]; 1d6 [Fire]
```

On a nat-20, the engine automatically doubles the damage dice — you never need to manually call `crit()` inside an Attack macro's damage components.

### Combo Macros

Combo macros trigger multiple macros with one click — useful for two-weapon fighting, spells with rider effects, etc.

Each constituent macro in a combo is handled **exactly** like a standalone macro:

- Attack macros check their own d20 result and crit applies only to that macro's own damage components.
- Non-Attack macros are rolled normally.
- There is no cross-macro crit propagation.

---

## D&D Beyond Import

Import a character directly from D&D Beyond using a **Cobalt session token**:

1. Log in to D&D Beyond in your browser.
2. Open DevTools → Application → Cookies → find the cookie named `CobaltSession`.
3. Copy the value and paste it into the import dialog.

The importer reads your character's **current modified stat values**, including base scores, racial bonuses, Ability Score Improvements, feat bonuses (e.g., Resilient, Athlete), and any other active modifiers. It derives the ability modifiers (`str_mod`, `dex_mod`, etc.) and sets `prof` based on your character level.

---

## Roll History

Every roll is saved locally in IndexedDB and shown in the history panel on the Macros page.

- **Single rolls** — appear as individual entries.
- **Attack macro rolls** — to-hit and damage are grouped in one history card, shown side by side, with CRIT or FUMBLE badges on the header.
- **Combo rolls** — all macros from one combo trigger are grouped under the combo name.

History is stored per character up to a configurable limit (default 500 entries). Older entries are trimmed automatically when the limit is exceeded.

---

## Profile & Settings

Accessible from the user menu (top-right avatar → **Profile & settings**):

- **Change password** — enter your current password and a new one (min 8 characters).
- **History limit** — set how many roll entries are kept per character (10 – 10,000).
- **Clear all history** — permanently removes all roll history from local storage on this device.

---

## Practical Examples

### Basic Attack

```
1d20 + {{prof}} + {{str_mod}} [To Hit]; 1d8 + {{str_mod}} [Damage]
```
Set category to **Attack**. Crits auto-double the damage dice.

### Ranged Attack (Advantage)

```
d20adv + {{prof}} + {{dex_mod}} [To Hit]; 1d8 + {{dex_mod}} [Piercing]
```

### Flaming Sword (multi-damage-type)

```
1d20 + {{prof}} + {{str_mod}} [To Hit]; 1d8 + {{str_mod}} [Slashing]; 1d6 [Fire]
```
Set category to **Attack**. Both damage components double on a crit.

### Ability Check

```
1d20 + {{wis_mod}} + {{prof}} [Perception]
```

### Saving Throw (Disadvantage)

```
d20dis + {{con_mod}} [CON Save]
```

### Stat Generation

```
4d6dl1 [STR]; 4d6dl1 [DEX]; 4d6dl1 [CON]; 4d6dl1 [INT]; 4d6dl1 [WIS]; 4d6dl1 [CHA]
```

### Halfling Lucky (reroll 1s)

```
1d20r1 + {{prof}} + {{dex_mod}} [Dex Save]
```

### Bardic Inspiration Bonus

```
1d20 + {{prof}} + {{cha_mod}} [Performance]; 1d{{inspiration_die}} [Bardic Inspiration]
```

---

## Tech Stack

- **Frontend** — React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand, AWS Amplify Auth v6
- **Backend** — AWS Lambda (Node 20, ARM64), API Gateway HTTP API, DynamoDB (single-table)
- **Auth** — Amazon Cognito (email/password, SRP)
- **Hosting** — S3 + CloudFront + Route53 custom domain
- **Infrastructure** — AWS CDK v2 (TypeScript), two-stack pattern (stateful + app)
- **Roll history** — Dexie.js (IndexedDB), configurable limit per character (default 500)

## Development

```bash
# Install all workspace dependencies
npm install

# Run frontend dev server
cd packages/frontend && npm run dev

# Run dice engine tests
cd packages/dice-engine && npm test

# Deploy frontend (builds + syncs to S3 + invalidates CloudFront)
cd packages/frontend && npm run deploy

# Deploy infrastructure
cd infra && npx cdk deploy --all
```

Copy `.env.example` to `.env.local` in `packages/frontend/` and fill in your Cognito and API values before building.
