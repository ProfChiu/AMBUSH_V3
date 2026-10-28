# 51 — Crew weapons wired (§9/7), and the two gaps that closed with them

Session 63, Tasks A1 and A2. Closes open item #5 of `docs/48_DIFFICULTY_AND_AUTOMATED_TESTING.md`
and settles the two long-deferred items from Phase 9.

---

## 1. A1 — §9/7 crew weapons

`crewweaponrules.js` was built and unit-tested in Phase 9 and **never called**. `mission1.html`
even loaded the script. So an MMG behaved exactly like a rifle: fire it standing, fire it aimed,
fire it alone, fire it all Round.

This mattered more than "someone might pick one up off a casualty" implies: **GE 32/S carries a
Medium Machinegun and is one of Mission 1's own seven Germans.** The crew-weapon path was
reachable in ordinary play, on the German side, every game he activated.

Wired in `mission1demo.js`:

| Rule | Behaviour now |
|---|---|
| "A soldier must be crouching to fire a crew weapon" | Fire buttons disabled otherwise; a German holds fire and says why |
| "A crew weapon fired by a single soldier is always a single snap fire" | Aimed unavailable to a lone crewman |
| "Two soldiers can combine their actions to make a single aimed fire" | Offers the crewmates in the hex; the chosen one **spends his own turn** |
| "A maximum of two soldiers can fire a single crew weapon in one Round" | Two *distinct* soldiers; either may fire again, a third may not join |
| "The German with the higher WS is the firer" | `resolveGermanCrewFirer` picks him, and the pop-up names the WS |

Two implementation notes worth keeping:

- **The weapon has no object to hang state on.** A weapon in this build is a `weaponId` string on a
  soldier, so §9/7's per-Round cap lives on the holder (`s.crewFiredBy`) and travels with the
  weapon if it changes hands. Cleared in `startActionRound`, with the other per-Round flags.
- **The crewmate's action is spent before the fire resolves, not after.** If the shot kills the
  last German and ends the Round, the mate must still be recorded as having acted rather than left
  holding an unspent turn.

**Still unwired, for stated reasons rather than by omission:** §9/8 bazookas (no bazooka is
purchasable, distributable or pickup-able with the current data, so every bazooka branch would be
unreachable) — the same status the file's own header already recorded.

## 2. A2 — §9/9, and two wrong reasons in a row

**Corrected 2026-09-06 after Wan sent two screenshots of the map.** This section originally
concluded that Map A has no buildings. It does. Both the wrong reasoning and the right answer are
kept here, because the mistake is the useful part.

### The reason on file (wrong)

The backlog said §9/9 was "still blocked on the same chart data" as penetration. That was stale:
`penetrationrules.js` (docs/30) arrived later in Phase 9 and provides the entire §13/5 resolution —
levels, wall-hit-by-stance thresholds, most-exposed-first targeting, wall-destroyed collateral,
building collapse. §9/9 has not been blocked on penetration for a long time.

### My replacement reason (also wrong)

I then checked `terrain_map_a.json` and `los_map_a.json`, found no `building` terrain in either, and
concluded that **Map A has no building hexes at all**, citing the rulebook's Map B church steeple as
corroboration. Two screenshots of the actual map disproved it immediately.

The error was inferring a fact about the *map* from a dataset whose own documentation says it cannot
represent that fact. `docs/15_TERRAIN_DB.md` §3 states plainly that the auto-classifier has **no
reference colors for Building, Interior, Second Story** and that those hexes were left for a
correction pass that never happened. I read the output and not the caveat.

Worse than a plain absence: those hexes are recorded as `clear2` with **`confidence: "high"`**, so
they are not in the low-confidence review queue either. docs/15 predicts buildings would "correctly
fall out as low-confidence"; for these hexes that prediction does not hold.

### What is actually true

Map A has **two buildings**, and the printed map legend names both types explicitly:

| Building | Hexes | Legend type | Wall colour |
|---|---|---|---|
| West | J13 / K13 / L12 / L13 | **Stone Building** | grey-blue |
| East | S9 / T7 / T8 / T9 | **Wooden Building** | terracotta |

The legend carries "Stone Building" and "Wooden Building" as separate entries with different wall
art, alongside Stone/Wooden Bridge — the same distinction the rules rely on ("its main gun at a
stone wall, its coaxial or bow machinegun at a wooden wall", §9/9's note). The rulebook's own LOS
example Nr. 3 cites "the wall hexside (S9/R8)" and apertures at "S9/T9" — Map A hexes, in the
eastern building.

**§9/9 requires a wooden building hex, and Map A has one.** It is reachable in principle.

### So what really blocks it

The terrain the game reads. Both live datasets call those hexes `clear2`; the wall / window / door
hexsides exist only in `assets/data/los/hex_los_data_v2.csv`, which is **not** the file
`los_map_a.json` is built from (that is `hex_los_data.csv`, which carries a single ad-hoc `L13`
row). The v2 coverage also looks partial — it records walls at J13/K13/L12/L13/S9/T7/T8 but nothing
at T9, which the map art shows inside the eastern building.

So the blocker is a **terrain data gap, and one that is much bigger than §9/9**: with no building
hexes in play, buildings currently provide no cover, block no line of sight, and have no interior
to enter. §8/2's building-LOS rules and the aperture field-of-view model are equally unbuilt
(`assets/data/los/README.md` defers them explicitly). §9/9 is a small consequence of that gap, not
a thing to wire on its own.

**Prerequisite: the terrain correction pass for buildings — not Map B.** Filed as a new backlog
item; see `docs/48` item 7.

## 3. A2 — §11/2's guard restriction, unblocked by A1

> "A US soldier guarding a captured enemy soldier can perform all Actions normally during Rounds,
> with the exception of firing a crew weapon."

`docs/46_CAPTURED_GERMAN.md` flagged this as **NOT built**, explicitly *because* crew weapons were
never wired — there was nothing to restrict. A1 wired them, so this cost one condition.

`guardsAPrisoner(s)` is "is there a captured German in my hex", consistent with docs/46's own
decision not to track a `guardId`. A guard can neither fire a crew weapon nor be chosen as a second
crewman for someone else's.

**A dead-code finding while verifying it.** I first filtered the crewmate list by `guardsAPrisoner`
too. That filter can never do anything: a crewmate must be in the holder's hex, and "guarding"
means being in the prisoner's hex, so holder and mate are always guards together or not at all. The
live check confirmed it — the mate filter never changed an outcome the holder check hadn't already
decided. It was removed and the equivalence written down, rather than left in looking load-bearing.

## 4. Verification

Both tasks are enforcement-only, and the batch proves it: **all 30 baseline seeds finish with
byte-for-byte identical outcome, VP and round count.** GE 32/S was already being crouched by his own
paragraphs before firing (the `fireAndDrop` programs crouch, fire, then go prone), so the new gate
is enforced without changing what he does — which is the correct result, not a sign it is inert.

Read off the live game rather than assumed, via two new console hooks
(`giveCrewWeaponForTesting`, `crewFireAvailabilityForTesting`):

```
                     stanceOk  snap   aimed  mates
US, standing            false  true   false  []          <- buttons disabled by the stance gate
US, crouching alone      true  true   false  []          <- snap only
US, mate prone           true  true   false  []          <- a prone mate cannot crew
US, mate crouching       true  true    true  ['us1']     <- combined aimed unlocked
US, cap reached          true  true    true  ['us1']     <- a THIRD soldier is not offered
US, guarding a prisoner  true false   false  ['us1']     <- §11/2
GE 32/S, standing/prone false  true   false  []          <- German holds fire
GE 32/S, crouching       true  true   false  []
```

17 JS suites green, `verify_reference_data.py` 162/162, 30 bot games with 0 crashes and 0 console
errors.
