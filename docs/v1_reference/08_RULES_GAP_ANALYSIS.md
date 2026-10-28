# 08 — Rules Gap Analysis

> **Re-framed 2026-07-26.** Written as a roadmap of missing *trainer chapters*. The trainer is now
> paused, so read it instead as what it actually is: a section-by-section audit of which Ambush!
> rules are already encoded and which are not. In that reading it is the rules-coverage map for the
> **engine** build, and the priority ranking in §4 still holds. Priorities 1 and 2 (Line of Sight,
> The Action Round) were since built into the trainer as Lessons 5 and 6 — see `PROGRESS.md`
> sessions 9-10 — so their content is already transcribed and verified.

**Date:** 2026-07-24
**Source of truth:** `source/converted/Ambush_Rules_with_Errata_R2.md` (5,271 lines)
**Under review:** `apps/trainer/index.html` (1,352 lines) + `apps/trainer/ambushdata.js` (353 lines)
**Method:** full read of §5–§13 against every lesson body, drill, and data table in the trainer;
`grep` audit of key rule terms across both app files.

---

## 0. Scale — how big is the gap really?

The rulebook is roughly 4× the app by line count, but that comparison overstates the problem.

| Rulebook region | Lines | ~% | In trainer scope? |
|---|---:|---:|---|
| §1–§15 core rules | ~3,300 | 63% | **Yes** |
| §16 Campaign | ~210 | 4% | Optional |
| §17 Vehicles | ~645 | 12% | Optional / advanced |
| Missions 1–8 briefings | ~890 | 17% | No (mission content) |
| Vehicle summary + front matter | ~225 | 4% | No |

So the real target is ~3,300 lines of core rules. The trainer currently covers roughly half of
that, and covers it well — §4 Squad Generation is essentially complete, and the §9/1 fire
procedure is faithful down to the clamp and the 0-always-hits / 9-always-misses rule.

The gaps are not "more detail on what's there." They are **whole mechanics with zero coverage**,
several of which sit on the critical path to playing a single Action Round.

### grep audit (occurrences in `index.html` / `ambushdata.js`)

| Term | HTML | Data |
|---|---:|---:|
| "line of sight" | 0 | 1 |
| "awareness" | 0 | 2 |
| "Action Round Track" | 0 | 1 |
| "AR marker" | 0 | 0 |
| "advantage" | 0 | 0 |
| "activation" | 0 | 0 |
| "panic" | 0 | 8 (data only) |
| "crew" | 0 | 2 |
| "bazooka" | 0 | 3 |
| "minefield" | 0 | 0 |
| "boobytrap" | 0 | 0 |
| "capture" | 0 | 3 |
| "drag" | 0 | 0 |
| "Move/Snap" | 0 | 0 |

Where the count is >0 in `ambushdata.js` and 0 in `index.html`, the value exists in a table but is
never taught, surfaced, or drilled.

---

## 1. Movement (§7) — Lesson 3

**What is correct today:** the Operations-vs-Rounds split (§7/2, §7/3), MPA from the chart, terrain
MP costs plus hexside costs added on top, crouching = crawl one hex for full MPA, standing = multi-hex,
one free stance change per unwounded soldier per turn, extra changes cost 1 MP, wounded = MPA 2 with
no free stance change, unused MPs lost, soldiers have no facing. The `MOVE_COSTS` table and
`L3_BOARD` practice hexes are sourced correctly.

**What is missing:**

### 1.1 Move/Snap Fire and Move/Charge Assault — HIGH
*§7/3, §6/7.* A soldier may combine movement with combat by spending **up to half his MPA
(round fractions down)** and snap firing, or by charge assaulting. He may move-then-fire or
fire-then-move, and may split the movement around the fire if MPs allow. For a Charge Assault,
**movement always comes first**. He must be standing to move; a crouching or prone soldier must
first stand via free stance change or 1 MP.

Zero occurrences in the app. This is one of the most-used actions in real play.

### 1.2 Group movement and stacking — HIGH
*§5/3, §7/1.* There is no limit to the number of soldiers (friendly and/or enemy) in a hex during or
after movement. Any number of soldiers **in the same stance** can move to an adjacent hex together,
and a group move triggers **exactly one Paragraph Check**, not one per soldier. Only two vehicles per
hex regardless of soldier count.

Absent. The app's mental model is implicitly one-soldier-at-a-time.

### 1.3 Paragraph Check precedes the stance change — MEDIUM
*§5/3, §6/7.* "When a soldier enters a hex, a Paragraph Check is made **before** he can make the
stance change (free or otherwise)." A sequencing rule players routinely get backwards, and it matters
because the paragraph may kill, panic, or pin the soldier before he can go prone.

### 1.4 Prone soldiers cannot move at all — MEDIUM
*§5/3.* "Prone soldiers cannot move at all." Lesson 3 states the standing and crouching cases but is
silent on prone, which reads as an omission rather than a prohibition.

### 1.5 Mandatory stop in an enemy-occupied hex — MEDIUM
*§7/3.* "A soldier must stop movement immediately upon entering a hex occupied by an enemy active
soldier." If he *begins* his turn in such a hex he may leave it, but must then stop in the first
enemy-occupied hex he enters.

### 1.6 Drag Inactive Soldier — MEDIUM
*§5/3, §6/7, §7/3.* Costs the soldier's **entire MPA** for **one hex**. Dragger must be standing,
must remain standing, and must have one empty Port Box. Only *inactive* soldiers may be dragged —
never unaware or wounded ones. If the dragged soldier is incapacitated, roll a die per hex; **0 kills
him**. (Moving him by vehicle does not trigger this roll.)

### 1.7 Crew weapon movement — LOW
*§6/7.* Crew weapons need three Port Boxes; two soldiers in the same hex divide the cost between
them, may then move separately, but must reunite in one hex to prepare the weapon.

### 1.8 Map entry and exit — LOW
*§7/1, §6/10.* Both sides can exit the map per the briefing or a Movement Reference. Exited US forces
**never** return; Germans may. Off-map US soldiers spend MPs entering their first on-map hex, are
never targetable, and are treated as sharing one hex for command and panic purposes.

### 1.9 Prohibited terrain — LOW
*§7/1.* A soldier cannot enter terrain prohibited by the briefing or by the Movement Point Cost Chart
(the chart's `P` entries — River is already `P` in `MOVE_COSTS` but is never explained).

---

## 2. Events (§5/6) — Lesson 4

**What is correct today:** the Operations Event Check (2 dice → RE column), "None" results, Event
markers suppressing further checks in that hex, markers swept when the Condition changes, Conditions
only rising and sometimes skipping numbers, PC Checks with 0-always-succeeds / 9-always-fails, and
sightings silencing their references once they occur. The invented sample paragraphs are correctly
flagged as invented.

**What is missing:**

### 2.1 Events during Rounds work differently — CRITICAL
*§6 preamble, §6/1, §5/6.* During Action Rounds, Paragraph Checks **ignore** any Event result — you
still place an Event Marker in the hex, but you do **not** roll. Instead, the Action Sequence contains
a dedicated **Event Phase**, run once per Round (not on Round 1), where 2 dice are rolled against the
RE column regardless of anyone's movement.

The trainer teaches only the Operations version. `ACTION_SEQUENCE[1]` in `ambushdata.js` states the
Rounds rule in a single line that no lesson surfaces. A player finishing Lesson 4 will run Rounds
events incorrectly.

### 2.2 Activation Checks — CRITICAL
*§5/8.* Zero occurrences in the app. This is the hinge on which the entire game turns: how Germans
enter play and Operations become Rounds.

- Roll one die, compare to the **Activation Level for the current Condition** (recorded on the
  Condition section of the Squad Record).
- Result ≤ Activation Level → German activated, Rounds commence. Greater → not activated.
- Paragraphs may attach a modifier to the Activation Level; positive makes activation *easier*.
- **0 always activates, 9 always fails**, regardless of modifiers.
- If triggered by a group of US soldiers, only **one** check is made.

### 2.3 Condition changes during Rounds — HIGH
*§6/11.* When the Condition changes mid-Round: swap the Mission Card, **interrupt the Round**, then
conduct Paragraph Checks for **all US-occupied hexes beginning with the lowest-numbered hex**. Ignore
Event Checks but still place Event Markers. Resolve any German activations via §6/6. Then resume the
Round in progress.

### 2.4 Paragraph literacy — HIGH
*§5/1.* How to actually read a paragraph, which the sleeve lesson never covers:

- Options separated by **bullets (•)** → choose the one statement that applies.
- Options that are **numbered (1, 2, …)** → take the **first** one that applies.
- **Black** paragraph numbers are read during Operations; **red** entries are Rounds-only and are
  ignored during Operations.
- A black number preceded by a sighting reference (`s2 412`) is read **only if that sighting has not
  yet occurred**.
- Some paragraphs are pure narration to be noted and moved past; most are conditional chains.

### 2.5 PC Check details — MEDIUM
*§5/7, §5/1.* When multiple soldiers occupy a hex, only **one** check is made, by the soldier with the
**highest PC** (this is also true of the Paragraph Check itself). Paragraph-supplied PC modifiers
(±N) apply to that check only. Some paragraphs let *any* soldier who can see a given hex check.
Some PC Checks are once-only and require an Event Marker on failure. Other PC-check triggers:
boobytraps (§12/1), minefields (§12/2), grenade toss (§10/2), Awareness Checks (§6/5).

### 2.6 Event marker scope — LOW
*§5/3, §5/6.* An Event Marker suppresses **both** further Paragraph Checks *and* Event Checks in that
hex — the lesson currently implies only the latter.

---

## 3. Combat (§9–§13) — Lesson 5

**What is correct today:** the seven-step fire procedure verbatim, jam/dud percentile check, range
counting (exclude firer's hex, include target's), Base Hit Chance by range, modifiers combined with
Weapon Skill and clamped to 0–8, 0-always-hits / 9-always-misses, damage die on the Weapon Chart,
ammo percentile check, snap fire −2 and twice per turn, grenade scatter, assault base 7 with the
attacker's WS against the defender's. The `WEAPON_CHART`, `FIRE_MODS_*`, `GRENADE_MODS`,
`ASSAULT_MODS`, and `DAMAGE_EFFECTS` tables are sound, and the base-7 assault decision documented in
`ambushdata.js` is the right call.

**What is missing:**

### 3.1 Line of Sight (§8) — CRITICAL, the single largest hole
No lesson, no drill, no mention. Fire combat is unresolvable without it. Required content:

- **§8/1 Tracing.** Straight line from center dot to center dot. If it crosses *any part* of a
  blocking hex or hexside, it is blocked. If it exactly bisects two hexes and only one is blocking,
  it is **not** blocked. Terrain fills its entire hex for game purposes regardless of the artwork;
  mixed hexes take the majority terrain (woods-with-brush = woods). Building hexsides matter, not the
  drawn walls.
- **§8/2 Elevations.** Three color-coded levels (1 lowest → 3 highest). LOS is blocked if it enters a
  hex **higher than both endpoint hexes**. Same-elevation endpoints are blocked by intervening
  blocking terrain at the same or higher elevation. Elevation *changes* themselves do not block —
  they are smooth slopes.
- **§8/2 Embankment hexsides.** Treated as being at the **higher** of the two elevations they border.
  No effect if both endpoints are at the same elevation. If endpoints differ: blocked if the
  embankment is higher than the lower hex **and not adjacent to** the higher hex; not blocked if it is
  adjacent to the higher hex; not blocked if level with the lower hex.
- **§8/3 Problems.** Buildings require mutual field of view — one soldier may see another's hex but
  not the soldier. Unresolvable cases: apply common sense or a die roll.

**Asset note:** the extracted diagrams already exist —
`source/converted/Ambush_Rules_with_Errata_R2_images/…-p18-0.png`, `-p19-0/1/2.png`, `-p20-0/1.png`
are the numbered LOS examples. This lesson can be illustrated entirely from existing assets.

### 3.2 The Action Round itself (§6/1–§6/5) — CRITICAL
There is a structural hole between Lesson 4 and Lesson 5. The app has no coverage of:

- **Action Sequence** (§6/1) — the once-per-Round phase order: US Awareness (Rounds 1–2 only) →
  Event Phase (not Round 1) → Action Phase.
- **AR Track & initiative** — one initiative die per side, German advantage/disadvantage, AR markers
  placed in the 2-Turn / 1-Turn / Complete / Panic / Unaware / Inactive spaces by IN column, German
  action number re-rolled each turn, wounded soldiers capped at one turn.
- **§6/2 Activating Germans** — identity number → soldier card → identity letter → map marker →
  matching AR marker at the card's IN.
- **§6/3 Command** — sum the IN of all active US soldiers in the hex; **≥5 = in command**. A
  commander projects his IN into every hex within **two hexes**; effects are reciprocal. A panicked
  or inactive commander projects nothing. Command affects **only** AR-placement panic, never
  combat-induced panic.
- **§6/3 Giving turns** — a commander may spend his turn to give a turn to a friendly soldier in his
  Command Radius, but only to one sitting in the 1-Turn or Complete space; never to a wounded soldier.
  He may also spend a turn to make an unaware soldier within radius aware.
- **§6/4 Panic** — panics on an initiative result printed in the Panic space (IN columns 0 and 1
  only), or on a **red** result if out of command. A panicked soldier is immobile until Round end,
  then falls prone and moves to Complete. He remains a legal target. Germans panic only on the
  literal Panic space, never on red.
- **§6/5 Awareness** — Round 1: each active US soldier who **can see** the activated German makes a
  PC Check. Round 2: every not-yet-aware soldier checks. Round 3+: automatic. Returning to Operations
  resets everyone to unaware. Unaware soldiers can take no actions. Any attack — even an attempted or
  scattered one — makes soldiers in the target hex (and a grenade's scatter hex) aware.
- **§6/6 Mid-Round activation** — ignore the paragraph's advantage and awareness clauses; place the
  German with two turns if specified, otherwise roll a fresh action number. A US soldier may finish
  his current action first.

Without this, a player who completes all six lessons still cannot sequence one Action Round.

### 3.3 German behavior (§6/8, §6/9, §9/6) — HIGH
The trainer's own Lesson 6 text concedes the German "doesn't act." The *procedural* half of German
behavior is public rules, not paragraph-book content, and is teachable:

- **Best Fire** — aimed if possible, otherwise snap.
- **Closest Target** — count from the German's hex (exclusive) to the US hex (inclusive); ties go to
  the easiest; still tied → random.
- **Easiest Target** — highest chance to hit; ties go to the closest; still tied → random.
- **Multiple-target selection** (§9/2) — a German firing into a stack must target the US soldier in
  the **most exposed** stance (standing > crouching > prone); ties random.
- **Jammed / out of ammo** (§9/4, §9/5) — a German switches to his second weapon, else attempts to
  unjam instead of firing; out of ammo he tries, in order: secondary weapon, exchange ammo with a
  German in his hex, first listed action not requiring fire, lie prone. He never leaves his movement
  path to find ammo.

### 3.4 Clearing a jammed weapon (§9/4) — HIGH
The app rolls for jams and then abandons the soldier. Missing: the **Clear Jammed Weapon** action
(Operations §5/3 or Rounds §6/7, standing or crouching), roll one die cross-referenced with the
soldier's **Weapon Skill** on the Clear Jammed Weapon Chart, result **B = broken permanently** for the
rest of the game. Explosive and penetration rounds cannot be cleared. WS is reduced by 1 when clearing
a **captured** weapon (§14).

### 3.5 Ammo economy (§9/5) — HIGH
The app rolls the ammo check but never teaches what the check *spends*:

- Six Ammo Boxes per soldier; each clip, grenade, bazooka round, or pistol takes one.
- Ammo types are **not interchangeable** — clips must match the weapon fired.
- Reloading a personal or crew weapon is automatic if a clip is held; a **bazooka must be reloaded
  via the Prepare Bazooka action**.
- Acquired ammo can be written into any empty box, including a spent one; deduct it from the giver.
- Purchase economy (§4): 1 Weapon Point = 5 clips of any mix (not bazooka) or 3 grenades; bazooka
  rounds cost 1 WP each.
- Germans track no ammo and run dry only by paragraph.

### 3.6 Crew weapons (§9/7) — HIGH
Light/medium/heavy machineguns have their own prepared/unprepared markers and must be **prepared**
before firing (one soldier, one action; stays prepared until moved). **Aimed** fire requires **two
crouching active soldiers** in the hex, both spending a turn. With one soldier the weapon **always**
snap fires. Two soldiers can instead snap fire it twice, one action each. Snap fire greatly increases
jam chance. Three Port Boxes to carry.

### 3.7 Aimed automatic weapon damage (§13/6) — MEDIUM-HIGH
A genuinely distinctive rule with zero coverage. On an aimed automatic hit against a multiple-target
hex: apply damage to the primary target; if that damage die was >0, roll again — if the new roll is
**lower** than the previous, apply that damage to a second soldier, and keep going as long as each
roll is lower than the one before. Stop the instant a roll is ≥ the previous. Non-primary targets are
hit **most exposed first** (standing → crouching → prone), ties random. Pairs with the
already-tabulated **+1 per extra target in hex** aimed-automatic modifier, and with §9/2's rule that
vehicles count toward that modifier even when immune.

### 3.8 Minefields and boobytraps (§12) — MEDIUM-HIGH
Zero occurrences in the app.

- **Boobytrap (§12/1):** first US soldier entering makes a PC Check. Success → unaffected and the
  trap is gone. Failure → it explodes, damage **as an exploding grenade indoors** even in an outdoor
  hex. Either way place a Boobytrap marker; it is one-shot. Group entry: highest PC checks, but if it
  blows, **every** soldier in the hex takes damage (roll separately for each).
- **Minefield (§12/2):** permanent. Every soldier entering, ever, checks. Failure damages **only that
  soldier**. Group entry: **each** soldier checks separately. Never depleted.

### 3.9 Grenade and satchel handling (§10/2–§10/4) — MEDIUM
- **§10/2 Grenade Strike PC Check** and the **Remove Live Grenade from Hex** action — performed out of
  turn, requires standing or crouching plus a PC Check, and carries a special free stance change.
- **§10/4 Satchel charges** — must be **prepared** (crouching or standing), thrown **standing**, range
  one to three hexes, and a soldier can never move and throw a grenade in the same turn.

### 3.10 Assault to Capture (§11/2) — MEDIUM
`WEAPON_CHART` already carries the `asltc` row (`ICCCCZZPP*`) and `DAMAGE_LEGEND` defines C and Z, but
nothing teaches the capture path: choosing to assault to capture rather than kill, guarding prisoners
(no limit on the number guarded), moving a captured German during Operations only by a soldier in his
hex (§5/3), and the rule that automatic fire, grenades, or satchel charges into the hex damage
**both prisoner and guard** normally.

### 3.11 Assault modifier fine print (§11/4) — LOW
Mostly present in `ASSAULT_MODS`, but three clauses are absent: a US soldier who is **unaware** when
assaulted cannot use his WS to defend (and becomes aware afterward); a **wounded defender** cannot use
his WS but is otherwise unaffected; and a **captured weapon** as the attacker's only weapon applies
the −1 captured-weapon modifier to the assault.

### 3.12 Bazookas (§9/8) — LOW-MEDIUM
Must be prepared; **cannot snap fire**; aimed fire only from standing or crouching; reload via the
Prepare Bazooka action; ammo column reads `A` (per-round, not clips); penetration results apply.

### 3.13 Damage results in depth (§13/1–§13/5) — LOW-MEDIUM
`DAMAGE_EFFECTS` summarizes the four soldier results accurately but there is no drill and no coverage
of **§13/5 Penetration** against vehicles and walls (the `+4 target is a wall` modifier sits unused in
`FIRE_MODS_OTHER`), nor of §9/9 German attacks on buildings.

### 3.14 Captured equipment (§14) — LOW
Captured weapons reduce the user's WS by 1 for all purposes and switch to the **US** ammo depletion
procedure. Captured **grenades** carry no penalty. Captured **radios** are unusable. Captured vehicles
(not tanks) can be driven at DS −1; DS 0 cannot drive them at all.

### 3.15 Victory (§15) — LOW, but cheap
Two separate running totals on the Squad Record. Gain VPs from briefing tasks and paragraphs; **lose
2 VPs for every US soldier killed or incapacitated**. Some missions waive the loss for incapacitated
soldiers evacuated off-map or to listed hexes. At mission end subtract losses from gains and compare
to the briefing's victory schedule: ≥ requirement = win. Perhaps fifteen minutes of work for a rule
the player needs before Mission 1.

---

## 4. Priority ranking

| # | Proposed lesson | Rules | Severity | Why |
|---|---|---|---|---|
| 1 | **Line of Sight** | §8 | Critical | No shot is legal without it; diagrams already extracted |
| 2 | **The Action Round** | §6/1–6/5 | Critical | AR track, initiative, awareness, command, panic — the game's spine |
| 3 | **Germans & Activation** | §5/8, §6/2, §6/6, §6/8–6/9, §9/6 | Critical | Closes the events *and* combat gaps at once; makes Rounds runnable |
| 4 | **The Actions Menu** | §5/3, §6/7 | High | Full action list incl. Move/Snap Fire; cheap to build, high payoff |
| 5 | **Reading Paragraphs** | §5/1, §5/4, §5/7 | High | Bullets vs numbered, red vs black, sighting gates, highest-PC rule |
| 6 | **Hazards & Damage** | §12, §13, §10/2 | Medium-High | Minefields, boobytraps, live grenades, penetration |
| 7 | **Weapons & Logistics** | §9/4, §9/5, §9/7, §9/8, §10/4, §14 | Medium-High | Jam clearing, ammo, crew weapons, bazookas, captured gear |
| 8 | **Victory** | §15 | Medium | Small, and required before Mission 1 |
| 9 | *Campaign* | §16 | Optional | Post-mission layer |
| 10 | *Vehicles* | §17 | Optional | Large, cleanly separable, advanced |

Existing Lessons 3, 4, and 5 also need **in-place patches** for the gaps in §1.1–1.6, §2.1–2.5, and
§3.7 respectively — these are additions to existing lessons, not new chapters.

Items 1–3 are the ones without which the trainer does not deliver a player to the table.
