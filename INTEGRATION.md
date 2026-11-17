# vMix Universal Controller ↔ vMix Graphics Controller

**Version 3 · 2026-11-17** (see the changelog at the end)

> **The copy that counts is on the Drive:**
> `Prep Sports Broadcasting/vMix Universal Controller/FPGT Shared/INTEGRATION.md`
> - Mac: `~/Library/CloudStorage/GoogleDrive-<account>/Shared drives/Prep Sports Broadcasting/vMix Universal Controller/FPGT Shared/`
> - vMix PC: `G:\Shared drives\Prep Sports Broadcasting\vMix Universal Controller\FPGT Shared\`
> - Cloud chats: Google Drive connector, folder "FPGT Shared".
>
> Each repo keeps a copy, but the Drive copy wins.
>
> **Rules for any Claude chat working on either app:**
> 1. **At the start of every task**, read the Drive copy. If its version is newer than your repo's copy, copy it into your repo, then check whether your app needs changes to match.
> 2. **If you change anything shared** (the `/api/game` shape, ports, who-owns-what, Drive folders):
>    - edit the Drive copy, raise the version number and add a changelog line saying which app changed and what the other app must do;
>    - copy the file into your repo;
>    - tell the user, so they can mention it in the other chat.
> 3. **If you can't write to the Drive** (e.g. a cloud chat), save your new version next to it as `INTEGRATION (proposed by <app>).md`, or give it to the user. The other chat merges it next time and deletes nothing.
> 4. Never move, rename or delete anything else on the Drive. `DESIGN.md` in the same folder is the shared look.

How the two FPGT apps work together.

Both apps run on the vMix PC and talk to the same vMix. They stay separate programs: if one crashes on game night, the other keeps running.

## 1. Who does what

| | vMix Graphics Controller | vMix Universal Controller (vMix UC) |
|---|---|---|
| Job | **What's in** the graphics | **When** things go on air |
| Owns | Game setup (sport, home/visitor), teams, logos, colours, records, rankings, standings, brackets, the Google Sheet, browser graphics pages, GT title content | TAKE/OUT and tally, music, ads, videos, audio mixer, stream health, Companion/Stream Deck, iPad/phone remotes |
| Writes to vMix | Title **content**: the Google Sheet "Live" tab (vMix Data Source) and its browser graphics pages | Overlay **on/off**, list inputs (MUSIC/ADS/VIDEOS), audio, and fields set to "Typed by operator" |
| Ports | 3000 editor, 3001 graphics pages | 8790 web, 9600 OSC (UDP) |
| Drive folder (its own; read-only for the other app) | `Prep Sports Broadcasting\vMix Graphics Control\` | `Prep Sports Broadcasting\vMix Universal Controller\` |

### Rules
1. **One writer per vMix field.** If the Graphics Controller fills a title field (through the sheet or Data Source), vMix UC never writes it. In vMix UC's field linker, set those fields to **"Filled by Graphics Controller"** (shown, locked).
2. **Switching and overlays belong to vMix UC.** The Graphics Controller's idea list includes a "full vMix control tab", and vMix UC now covers that, so the Graphics Controller shouldn't build its own switching or overlay control.
3. **Drive:** each app writes only in its own folder and may read the other's. Never move, rename or delete anything on the shared Drive. Only copy in.
4. **Never get around bot protection** (MaxPreps / CIAC rankings). vMix UC never fetches those sites; it gets that data from the Graphics Controller.
5. **Same look:** both apps follow the FPGT `DESIGN.md`.

## 2. How they connect

### Level 1: nothing extra (works now)
Both apps talk to the same vMix. vMix UC reads vMix's state, so its tally shows a graphic as on air no matter which app (or the hardware panel) put it there. The Graphics Controller's 3001 pages can be vMix browser inputs, and vMix UC can TAKE/OUT them like any other overlay.

### Level 2: shared game info (to build)
The **Graphics Controller provides**:

```
GET http://<pc>:3000/api/game        → JSON, no auth on the local network
{
  "sport": "Basketball",           // matches the Graphics Controller's sport names
  "gender": "Boys",                // "Boys" | "Girls"
  "home":    { "name": "Fairfield Prep", "short": "PREP", "abbr": "FP",
               "logo": "G:\\Shared drives\\...\\prep.png", "logoUrl": "/api/asset?...",
               "color": "#C8102E", "color2": "#FFFFFF",
               "record": "12-3", "sccRecord": "8-1", "classRank": "LL #4" },
  "visitor": { ...same fields... },
  "updatedAt": "2026-11-17T18:00:00Z"   // changes whenever the game setup changes
}
```

Any field may be missing or `null`. vMix UC must cope with that.

**vMix UC does** (built in vMix UC; see `src/features/gc.js`, tested against `test/mock-gc.js`):
- Master › Setup › 4 has the **Graphics Controller address** (default `http://127.0.0.1:3000`, blank = off) and a "Follow its sport" switch. The start-page checklist shows whether it's connected.
- Poll `/api/game` every 5 s (and only when the address is set).
- Use the data:
  - Set the show's sport, which picks the stat-pop event buttons.
  - Field source **"Game info (Graphics Controller)"** (home name, visitor record, etc.): vMix UC writes it on TAKE and keeps it updated while on air.
  - Field source **"Filled by Graphics Controller"**: shown locked, and vMix UC never writes it.
  - **Team logo** fields use the Graphics Controller's `logo` path first, then fall back to Drive › Graphics › Logos.
  - Team colours on stat pops when OpenStatsEngine has none.
  - Accepts small differences: `away` for `visitor`, `abbrev` for `abbr`, `primary` for `color`.
- If the Graphics Controller isn't running, show "not connected" and keep working with the last values.

### Level 3: buttons both ways
- vMix UC's top bar has a **Graphics** button (green light when connected) that opens the Graphics Controller. Built.
- To build in the Graphics Controller: a **Control** button that opens vMix UC (`:8790`).
- Companion: vMix UC's OSC/HTTP commands stay the way to run things from a Stream Deck. If Graphics Controller actions are needed on a deck (e.g. "UPDATE GOOGLE SHEET"), it should expose them as simple HTTP `POST`s, and they get listed on vMix UC's Companion page.

## 3. Other apps on the same PC

| App | Address | Used by |
|---|---|---|
| vMix | HTTP 8088 | both |
| OpenStatsEngine | its own port (`/vmix/live/players.xml`, `roster.xml`) | both (read-only) |
| NDI Audio Bridge | OSC UDP 9500 | vMix UC (cough/mic) |

## 4. Changelog
- **3 · 2026-11-17 · vMix UC:** the shared copy now lives on the Drive (FPGT Shared). vMix UC's side of level 2 is built, plus its Graphics button. **Graphics Controller:** check `/api/game` matches section 2 and add the Control button (level 3).
- **2 · 2026-11-17 · Graphics Controller:** added `/api/game` (the user reports this is done; vMix UC hasn't seen that version of this file yet, so **merge any differences into this copy**).
- **1 · 2026-11-17 · vMix UC:** first version.
