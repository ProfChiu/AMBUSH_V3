"""policy.py — the bot's decisions. Deterministic: no randomness of its own, so a seed fully
determines a run.

Strategy, and why it is shaped this way. Almost every Victory Point in Mission 1 is a §2/1
Activation award, banked the moment a German is revealed and kept "regardless of what happens
later with that German". Germans are revealed by Paragraph Checks. Paragraph Checks happen when
a soldier ENTERS A HEX. So the dominant scoring move is not killing anyone — it is walking
around, and surviving what walking around wakes up. The policy therefore:

  1. spreads the squad along the entry edge nearest the objectives,
  2. advances toward the four Ending-1 hexes while preferring hexes nobody has entered yet
     (unvisited hexes can still fire a Paragraph Check; re-entered ones mostly cannot),
  3. fights when it must, favouring the best available odds and never picking the risky option
     when a safe one scores the same,
  4. withdraws north and exits once the target is banked or the squad is spent — Ending 2 keeps
     everything already earned.

This is a competent-but-not-expert player by construction. Its scores are a FLOOR on what the
mission yields, not a verdict on it: a human reads terrain, sets up crossfires, and manages
stances far better than these heuristics do.
"""

# Ending 1's four required positions (missions.json victory text). The fourth is "any hex of the
# heights in the southeast corner ... from which he can see all the road hexes"; mission1demo.js
# accepts any of five candidates for that slot, so it is a SET, not a single hex — treating it as
# one hex made the bot march past four equally valid positions to reach the arbitrary first one.
HEIGHTS = ['Q19', 'T17', 'V15', 'X14', 'Y13']
OBJECTIVES = ['T8', 'K13', 'L13'] + [HEIGHTS[0]]
# Each Ending-1 requirement as the set of hexes that satisfies it.
REQUIREMENTS = [['T8'], ['K13'], ['L13'], HEIGHTS]
# "All active US soldiers have exited the map from hex A1 through hex J1" — Ending 2.
EXIT_HEXES = ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'I1', 'J1']
# The eastern half of the entry edge: closest to T8/K13/L13 and the heights.
ENTRY_PREFERENCE = ['G1', 'H1', 'I1', 'J1', 'F1', 'E1', 'D1', 'C1', 'B1', 'A1']
# The Action Round verbs (the Current Actor panel), by their __mission1Debug names.
ROUND_VERBS = ('move', 'fireAimed', 'fireSnap', 'assault', 'grenade', 'drag', 'giveTurn',
               'makeAware', 'changeStance', 'prepareWeapon', 'pickup', 'clearJam', 'pass',
               'cancelMove')


class Policy:
    def __init__(self, difficulty='normal', walk=False):
        self.difficulty = difficulty
        # walk=True: use v2 task 6's multi-hex Operations move (click the goal, the soldier walks
        # and stops when something happens) instead of one adjacent step per turn. Off by default,
        # because the recorded baselines are the step-by-step player; on, it answers task 7's
        # question — does play shift now that walking costs one press instead of many?
        self.walk = walk
        self.prev_hex = {}   # soldier id -> the hex he stepped off last, for anti-oscillation
        self.visited = set()
        self.entry_i = 0
        self.withdrawing = False
        self.goal_by_soldier = {}
        self._casualty_hexes = set()

    # ---- dialog answers ----------------------------------------------------
    def choose_button(self, dialog, live):
        ids = [b['id'] for b in live]
        title = dialog['title']

        # Start screen. The level is a constructor option so a batch can measure either mode;
        # 'new' is still honoured for older builds that had a single Start button.
        if title.startswith('Ambush! Digital'):
            if self.difficulty in ids:
                return self.difficulty
            if 'new' in ids:
                return 'new'

        # Capture pays only when the card carries a conditional award for it — GE 34/X's
        # "+2 VP if captured" is the one that matters in Mission 1. The dialog already tells us:
        # it prints the conditional award line only when there is one. Otherwise kill, because
        # the Assault-to-Capture damage row has more results that end without a kill.
        if title.startswith('Capture or Kill'):
            wants_capture = 'if captured' in dialog['text'].lower()
            if wants_capture and 'capture' in ids:
                return 'capture'
            if 'kill' in ids:
                return 'kill'

        for preferred in ('continue', 'new', 'ok'):
            if preferred in ids:
                return preferred
        return ids[0]

    def choose_row(self, dialog, board):
        rows = dialog['rows']
        title = dialog['title']

        # "One more action this turn": take the extra shot, never decline a free action.
        if title.startswith('Combo Action'):
            fire = next((r for r in rows if r['text'].lower().startswith('fire')), None)
            if fire:
                return fire['idx']
            move = next((r for r in rows if r['text'].lower().startswith('move')), None)
            if move:
                return move['idx']
            return next((r['idx'] for r in rows if 'end turn' in r['text'].lower()), 0)

        # Any picker showing odds (fire, grenade, assault): take the best shot on the board.
        scored = [r for r in rows if r['odds'] is not None]
        if scored:
            return max(scored, key=lambda r: r['odds'])['idx']

        # Stance picker ("Go standing" / "Go crouching" / "Go prone"). Crouching is the useful
        # middle: a crouching soldier can still move, and is harder to hit than a standing one.
        if title.startswith('Change Stance'):
            crouch = next((r for r in rows if 'crouch' in r['text'].lower()), None)
            if crouch:
                return crouch['idx']

        # Logistics pickers (carry off map, drag, pick up, give turn) — first is fine.
        return 0

    # ---- turn actions ------------------------------------------------------
    def act(self, s, board):
        phase = board['phase']
        # v3 page only (absent on v2's): when US soldiers share a track space the player picks who
        # goes. The bot picks the first, the soldier v2 always chose, so the baselines still apply.
        # (Done no longer holds the turn since Phase 3b; the next decision closes the card.)
        if board.get('pickable'):
            pick = board['pickable'][0]
            s.pick_actor(pick)
            return f'pick -> {pick}'
        if phase == 'entry':
            return self._place(s, board)
        if phase == 'movement':
            return self._operations(s, board)
        if phase == 'round':
            return self._round(s, board)
        return None

    def _place(self, s, board):
        available = [h for h in ENTRY_PREFERENCE if h in board['entryHexes']] or board['entryHexes']
        # Spread rather than stack: a grenade damages every soldier in a hex, and automatic fire
        # cascades onto extra targets in one. Both are exactly what a stacked squad invites.
        pick = available[self.entry_i % len(available)]
        self.entry_i += 1
        s.click_hex(pick)
        return f'place -> {pick}'

    def _movers(self, board):
        return [u for u in board['us'] if u['isActive'] and not u['exited'] and u['stance'] != 'prone']

    def _on_map(self, board):
        return [u for u in board['us'] if u['isActive'] and not u['exited']]

    def _unmet(self, board):
        """Which Ending-1 requirements are not currently satisfied."""
        occupied = {u['hexId'] for u in self._on_map(board)}
        return [req for req in REQUIREMENTS if not any(h in occupied for h in req)]

    def _assign(self, s, board):
        """Hand out the unmet objectives to the soldiers nearest them, fresh each turn.

        Sticky per-soldier goals went wrong in two ways that cost real VP. They were judged
        against `movers`, which excludes prone soldiers — so a prone soldier who never reached
        his objective was invisible and the bot concluded the squad was in position and withdrew,
        abandoning Ending 1's +4 with the hexes unheld. And a soldier who died or fell behind left
        his objective claimed for ever. Reassigning every turn from actual occupancy fixes both.

        Returns {soldier_id: goal_hex}. A soldier already standing on a satisfying hex is left
        there (goal == his own hex) so he holds it rather than wandering off.
        """
        on_map = self._on_map(board)
        occupied = {u['hexId'] for u in on_map}
        goals = {}
        claimed = set()
        for req in REQUIREMENTS:
            holder = next((u for u in on_map if u['hexId'] in req), None)
            if holder:
                goals[holder['id']] = holder['hexId']  # already there: hold position
                claimed.add(holder['id'])

        for req in self._unmet(board):
            free = [u for u in on_map if u['id'] not in claimed and u['stance'] != 'prone']
            if not free:
                break
            # Nearest free soldier to the nearest acceptable hex of this requirement.
            best = None
            for target in req:
                d = s.distances([u['hexId'] for u in free], target)
                for u in free:
                    dist = d.get(u['hexId'], 999)
                    if best is None or dist < best[0]:
                        best = (dist, u['id'], target)
            if best:
                goals[best[1]] = best[2]
                claimed.add(best[1])

        # Anyone spare follows the nearest unmet objective too — a second body on the way is
        # insurance against the first becoming a casualty en route.
        leftover = [u for u in on_map if u['id'] not in claimed]
        unmet = self._unmet(board)
        for u in leftover:
            target = unmet[0][0] if unmet else OBJECTIVES[0]
            goals[u['id']] = target
        return goals

    def _goal_for(self, board, soldier):
        if self.withdrawing:
            return None  # handled separately: nearest exit hex
        return self.goal_by_soldier.get(soldier['id'], OBJECTIVES[0])

    def _should_withdraw(self, board):
        active = [u for u in board['us'] if u['isActive'] and not u['exited']]
        started = len(board['us'])
        if board['vp']['total'] >= board['vp']['need']:
            return True
        if len(active) <= max(2, started // 3):
            return True
        return False

    @staticmethod
    def _sel(board):
        # v3 clears the selection after every move in Operations (the player picks who moves next);
        # lastSelectedId is the soldier v2 would still have had selected, so the bot's round-robin
        # (and with it the dice) stays the same. On v2's page selectedId is never cleared.
        return board['selectedId'] or board.get('lastSelectedId')

    def _operations(self, s, board):
        # Incapacitated (not killed — §15 exempts only the incapacitated) soldiers still on the
        # map, and not already claimed by a rescuer standing with them.
        self._casualty_hexes = {u['hexId'] for u in board['us']
                                if u['status'] == 'incapacitated' and not u['exited']}
        movers = self._movers(board)
        if not movers:
            # Prone soldiers cannot move at all (§5/3). If everyone still on the map is prone —
            # routine after a firefight, since a panicked soldier falls prone at end of Round —
            # stand one up rather than reporting the run stuck.
            prone = [u for u in board['us'] if u['isActive'] and not u['exited'] and u['stance'] == 'prone']
            if not prone:
                return None
            target = next((p for p in prone if p['id'] == self._sel(board)), None)
            if not target or board['selectedId'] != target['id']:
                pick = (target or prone[0])['id']
                s.select(pick)
                return f'select prone {pick}'
            s.press('stance:crouching')
            return f'{target["id"]} stands up from prone'

        if not self.withdrawing and self._should_withdraw(board):
            self.withdrawing = True

        if not self.withdrawing:
            self.goal_by_soldier = self._assign(s, board)
            unmet = self._unmet(board)
            if not unmet:
                # All four Ending-1 requirements are satisfied. Operations cannot contain an
                # active German (one ends Operations immediately), so the "no active Germans"
                # clause is already true and checkEndingConditions fires on arrival — the mission
                # should have ended. Reaching here means it did not, which is worth surfacing
                # rather than silently withdrawing over.
                self.withdrawing = True
                return 'ALL OBJECTIVES HELD but mission did not end -> withdraw'

            # A soldier standing on a hex that satisfies a requirement holds it; only the rest
            # still have somewhere to be. Judged from real occupancy, so a prone or lagging
            # soldier can no longer make the squad look ready when it is not.
            pending = [m for m in movers if m['hexId'] != self.goal_by_soldier.get(m['id'])]
            if not pending:
                # Everyone who can move is where they were sent, but a requirement is still
                # unmet — the soldier who should cover it is prone or otherwise stuck. Stand the
                # nearest one up rather than declaring the job done.
                stuck = [u for u in self._on_map(board) if u['stance'] == 'prone']
                if stuck:
                    if board['selectedId'] != stuck[0]['id']:  # the real selection: he must be selected to act
                        s.select(stuck[0]['id'])
                        return f'select prone {stuck[0]["id"]} (objective still unmet)'
                    s.press('stance:crouching')
                    return f'{stuck[0]["id"]} stands up to cover an unmet objective'
                self.withdrawing = True
                return 'objectives unreachable -> withdraw'
            movers = pending

        # Round-robin: advance whoever is currently selected, else select the first mover.
        cur = self._sel(board)
        soldier = next((m for m in movers if m['id'] == cur), None) or movers[0]
        if board['selectedId'] != soldier['id']:
            s.select(soldier['id'])
            return f'select {soldier["id"]}'

        if self.withdrawing and soldier['hexId'] in EXIT_HEXES and board['verbs'].get('exitMap'):
            s.press('exitMap')
            return f'exit {soldier["id"]} at {soldier["hexId"]}'

        # Arrived and holding: crouch. Stance changes are free during Operations (no Movement
        # Points are tracked there at all), and the terrain fire table gives a crouching target a
        # better modifier than a standing one in every terrain type — which is what matters the
        # instant a German activates and Rounds begin. Crouching rather than prone so he can
        # still move if the plan changes; prone soldiers cannot move at all.
        if (not self.withdrawing and soldier['hexId'] == self.goal_by_soldier.get(soldier['id'])
                and soldier['stance'] == 'standing'):
            s.press('stance:crouching')
            return f'{soldier["id"]} crouches, holding {soldier["hexId"]}'

        dests = board['dests']
        if not dests:
            # Nowhere legal to go: rotate selection so the next call moves somebody else.
            nxt = movers[(movers.index(soldier) + 1) % len(movers)] if len(movers) > 1 else None
            if nxt and nxt['id'] != soldier['id']:
                s.select(nxt['id'])
                return f'no dests, switch to {nxt["id"]}'
            return None

        goal = self._nearest_exit(s, soldier, dests) if self.withdrawing else self._goal_for(board, soldier)

        # Map A's two buildings are enclosed by wall hexsides, and a wall cannot be crossed. Raw
        # hex distance does not know that, so "step to whichever neighbour is closest to the goal"
        # walks into the wall and oscillates for ever: K12 and L12 are each closer to K13 than to
        # one another, and neither can actually reach it — K13 opens only onto J13, through a
        # window. Ask the page for a real wall-aware route first and follow it; fall back to the
        # distance heuristic only when there is no route at all.
        # Objectives are reassigned from scratch every turn (see _objective_goals' docstring for
        # why sticky goals were removed). With walls in play that can two-cycle: from J13 the
        # nearest unmet objective is the heights, whose route starts at K14; from K14 the nearest
        # is L13, whose route starts back at J13. The soldier then paces for ever. Refusing to
        # step straight back onto the hex just left breaks the cycle without restoring sticky
        # goals or second-guessing the assignment.
        last = self.prev_hex.get(soldier['id'])
        step = s.operations_next_step(soldier['hexId'], goal)
        # A non-null first step means a wall-aware route exists, which is what makes the goal
        # legal to walk to; without one, fall through to the ordinary one-step logic below.
        if self.walk and step and goal != soldier['hexId']:
            self.prev_hex[soldier['id']] = soldier['hexId']
            s.click_hex(goal)   # walks the route, stopping at the first thing that happens
            return f'{soldier["id"]} walks {soldier["hexId"]}->{goal}'
        if step and step in dests and not (step == last and len(dests) > 1):
            self.prev_hex[soldier['id']] = soldier['hexId']
            self.visited.add(step)
            s.click_hex(step)
            return f'{soldier["id"]} {soldier["hexId"]}->{step} (goal {goal}, routed)'

        dist = s.distances(dests, goal)
        # Progress toward the goal, with a thumb on the scale for hexes nobody has entered — an
        # unvisited hex is a Paragraph Check, and Paragraph Checks are where the VP comes from.
        options = [h for h in dests if h != last] or list(dests)
        best = min(options, key=lambda h: dist.get(h, 999) * 2 - (3 if h not in self.visited else 0))
        self.prev_hex[soldier['id']] = soldier['hexId']
        self.visited.add(best)
        s.click_hex(best)
        return f'{soldier["id"]} {soldier["hexId"]}->{best} (goal {goal})'

    def _round_goal(self, s, board, actor):
        """Where a soldier should head during a Round.

        Toward the nearest active German if any are on the map — Rounds cannot end until they are
        gone, so closing the distance is the only way out as well as the only way to score.
        Falls back to the map objective (or the exit, when withdrawing) once the field is clear.
        """
        if not actor:
            return OBJECTIVES[0]
        live = [g['hexId'] for g in board['germans'] if g['isActive']]
        if live:
            d = s.distances(live, actor['hexId'])
            return min(live, key=lambda h: d.get(h, 999))
        if self.withdrawing:
            return self._nearest_exit(s, actor, board['dests'])
        return self._goal_for(board, actor)

    def _nearest_exit(self, s, soldier, dests):
        """Where a withdrawing soldier should head.

        Normally the closest north-edge hex — but if an incapacitated comrade is lying on one of
        those hexes, go to THAT one and leave from there. §15 waives the 2 VP loss for an
        incapacitated soldier carried off the map, and tryExit offers the carry automatically to
        anyone standing in his hex with a free Port Box. At a median of three casualties a game
        that exemption is worth up to 6 VP, and the bot was walking straight past it.

        Only casualties already ON an exit hex are worth diverting for: dragging a body across the
        map is a Rounds-only action costing a full turn per hex, which is a different (and much
        more expensive) plan than this one.
        """
        d = s.distances(EXIT_HEXES, soldier['hexId'])
        rescuable = [h for h in EXIT_HEXES if h in self._casualty_hexes]
        if rescuable:
            return min(rescuable, key=lambda h: d.get(h, 999))
        return min(EXIT_HEXES, key=lambda h: d.get(h, 999))

    def _round(self, s, board):
        if 'newRound' in board['verbs']:
            s.press('newRound')
            return 'start next round'

        # A Move action was started and the game is now showing legal destinations. The action
        # panel is disabled while this is open, so this has to be handled before the buttons.
        if board['dests']:
            actor = next((u for u in board['us'] if u['id'] == board['currentActorId']), None)
            goal = self._round_goal(s, board, actor)
            dist = s.distances(board['dests'], goal)
            best = min(board['dests'], key=lambda h: dist.get(h, 999) * 2 - (3 if h not in self.visited else 0))
            self.visited.add(best)
            s.click_hex(best)
            return f'{board["currentActorId"]} round-move -> {best}'

        # The Current Actor panel's verbs; empty while it is not showing (a German is acting).
        btns = {k: v for k, v in board['verbs'].items() if k in ROUND_VERBS}
        if not btns:
            return None
        actor = next((u for u in board['us'] if u['id'] == board['currentActorId']), None)

        # Shoot first, and prefer aiming: snap fire is a flat -2 to Hit Chance, only worth it as
        # the second half of a combo (which the Combo Action dialog offers separately anyway).
        for btn in ('fireAimed', 'fireSnap'):
            if btns.get(btn):
                s.press(btn)
                return f'{board["currentActorId"]} {btn}'

        # Grenades damage every soldier in the hex including friends, so only when nothing can
        # be shot at and a German is genuinely stacked away from our own people.
        if btns.get('grenade'):
            enemy_hexes = [g['hexId'] for g in board['germans'] if g['isActive']]
            ours = {u['hexId'] for u in board['us'] if u['isActive'] and not u['exited']}
            if any(h not in ours for h in enemy_hexes):
                s.press('grenade')
                return f'{board["currentActorId"]} grenade'

        if btns.get('clearJam') and actor and (actor['jammed'] or actor['broken']):
            s.press('clearJam')
            return f'{board["currentActorId"]} clear jam'

        # Assault trades a to-hit roll for a damage roll at point-blank range; worth it only when
        # shooting is not on the table at all.
        if btns.get('assault'):
            s.press('assault')
            return f'{board["currentActorId"]} assault'

        # Rounds only end when no active German remains — there is no withdrawing from a
        # firefight (§5's exit is an Operations action). So a soldier with nothing to shoot at
        # must CLOSE ON THE ENEMY, not drift toward a map objective. Moving to the objective
        # instead made the bot pace between two hexes while Round after Round elapsed, which is
        # both terrible play and an unbreakable loop.
        if btns.get('move') and actor:
            goal = self._round_goal(s, board, actor)
            if goal and actor['hexId'] != goal:
                s.press('move')
                return f'{board["currentActorId"]} move'

        # Panic puts soldiers prone at the end of every Round, and a prone soldier cannot move
        # until he stands (§6/7). Move handles that itself now — it opens with the stance change —
        # so this is only the fallback for a prone soldier Move could not help: no goal, or no MP
        # left over after standing. Standing anyway is still right, because a prone squad with
        # nothing in range otherwise passes for ever while Rounds, which end only when the last
        # German is gone, cycle indefinitely.
        if (btns.get('changeStance') and actor and actor['stance'] == 'prone'
                and any(g['isActive'] for g in board['germans'])):
            s.press('changeStance')
            return f'{board["currentActorId"]} stand up (prone, needs to close)'

        if btns.get('pass'):
            s.press('pass')
            return f'{board["currentActorId"]} pass'
        return None
