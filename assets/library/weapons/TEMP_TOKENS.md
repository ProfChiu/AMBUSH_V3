# Temporary tokens (2026-10-25)

Placeholders drawn by `tools/make_temp_tokens.py` until the final art is made. Each one already has
its final file name, so replacing the PNG is the whole job: the game picks it up with no code
change. Match the existing tokens: 140x140, transparent, art on the diagonal, bold black label with
a white outline at the bottom right. A weapon also needs a `_jam` twin (white X and "Jam").

| File | Item | Used for |
|---|---|---|
| `weapon_de_scope.png` | Kar98k with scope | The Sniper's rifle (game id `scope`) |
| `weapon_de_scope_jam.png` | the same, jammed | |
| `item_grenade_us.png` | Mk 2 grenade | A US Ammo Box holding a grenade (`gren`) |
| `item_grenade_de.png` | Stielhandgranate | A German's grenades |
| `item_clip.png` | Ammo clip | A US Ammo Box holding a clip |

Re-running the script overwrites these five files, so don't run it after the final art is in.
