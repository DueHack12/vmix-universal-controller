# vMix Universal Controller ↔ vMix Graphics Controller

**Version 9 · 2026-11-24** (see the changelog at the end)

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

Both apps talk to the same vMix. vMix UC runs on the vMix PC. The Graphics Controller can run on the vMix PC (today), on a Mac, or on the Synology NAS in Docker: vMix UC always reads it at `http://<GC computer>:3001`. They stay separate programs: if one crashes on game night, the other keeps running.

## 1. Who does what

| | vMix Graphics Controller | vMix Universal Controller (vMix UC) |
|---|---|---|
| Job | **What's in** the graphics | **When** things go on air |
| Owns | Game setup (sport, home/visitor), teams, logos, colours, records, rankings, standings, brackets, the Google Sheet, browser graphics pages, GT title content (incl. the NETWORK ID picture and crests), **YouTube stream setup** (title, description, schedule, thumbnail; never starts or stops the stream) | TAKE/OUT and tally, music, ads, videos, audio mixer, stream health, Companion/Stream Deck, iPad/phone remotes |
| Writes to vMix | Title **content**: the Google Sheet "Live" tab (vMix Data Source), its browser graphics pages, and, when its **vMix sync** switch is on, the GT titles' text, images and colours through the vMix API (SetText / SetImage / SetColor). Never the scoreboard's live fields (scores, clock, period, play/shot clock, timeouts, down & distance), which the scoreboard software fills | Overlay **on/off**, list inputs (MUSIC/ADS/VIDEOS), audio, and fields set to "Typed by operator" or "Game info" |
| Ports | 3000 editor (on a Mac: that computer only; on the NAS: open, behind an editor PIN), 3001 graphics pages, GT pictures, `/api/game`, `/api/titles` (read-only, open, no PIN) | 8790 web, 9600 OSC (UDP) |
| Drive folder (its own; read-only for the other app) | `Prep Sports Broadcasting\vMix Graphics Control\` | `Prep Sports Broadcasting\vMix Universal Controller\` |

### Rules
1. **One writer per vMix field.** If the Graphics Controller fills a title field (through the sheet, Data Source or its vMix sync), vMix UC never writes it. That includes every non-live text field of the GT titles it syncs (scorebug names/records, intro, breakboard, announcers, lower thirds). In vMix UC's field linker, set those fields to **"Filled by Graphics Controller"** (shown, locked). Master › Graphics has an **"All fields: Filled by Graphics Controller"** button per title for this.
2. **Switching and overlays belong to vMix UC.** The Graphics Controller has no switching, overlay or IN/OUT control (its "vMix control tab" idea was dropped).
3. **Drive:** each app writes only in its own folder and may read the other's (plus `FPGT Shared`, by the rules at the top). Never move, rename or delete anything on the shared Drive. Only copy in.
4. **YouTube:** the Graphics Controller only sets up the broadcast. vMix starts the stream; stream health stays with vMix UC.
5. **Input numbers:** neither app controls vMix by input number or adds, removes, moves or renames inputs (vMix UC uses each input's permanent key and re-links by name if an input is replaced). The possession script uses inputs 29–32 by number; Companion buttons must use input names.
6. **Never get around bot protection** (MaxPreps / CIAC rankings). vMix UC never fetches those sites; it gets that data from the Graphics Controller.
7. **Same look:** both apps follow the FPGT `DESIGN.md`.

## 2. How they connect

### Level 1: nothing extra (works now)
Both apps talk to the same vMix. vMix UC reads vMix's state, so its tally shows a graphic as on air no matter which app (or the hardware panel) put it there. The Graphics Controller's 3001 pages can be vMix browser inputs, and vMix UC can TAKE/OUT them like any other overlay.

### Level 2: shared game info (built on both sides)
The **Graphics Controller provides** (built, GC v4.8+):

```
GET http://<GC computer>:3001/api/game   → JSON, read-only, no auth, CORS open
    (also http://127.0.0.1:3000/api/game, but only from the computer GC runs on)
{
  "sport": "Football",            // GC's sport names: Football, Basketball, Hockey, Soccer, …
  "gender": "Boys",               // "Boys" | "Girls"
  "home": {
    "name": "Fairfield Prep",                              // short school name (Teams › Short Name)
    "fullName": "Fairfield College Preparatory School",    // the key GC uses everywhere
    "short": "PREP", "abbr": "PREP",                       // both = Teams › Abbr (the sheet has one abbreviation)
    "mascot": "JESUITS",
    "logo": "G:\\Shared drives\\Prep Sports Broadcasting\\vMix Graphics Control\\Logos\\….png",
    "logoUrl": "/api/teams/logo?team=Fairfield%20College%20Preparatory%20School",  // on GC's port 3000 (this computer only)
    "color": "#C8102E", "color2": null,                    // "#RRGGBB" or null
    "record": "13-1-2", "sccRecord": "9-0", "classRank": "LL #4"   // classRank: "LL #4", "LL" (no rank) or null
  },
  "visitor": { …same fields… },
  "updatedAt": "2026-11-17T18:00:00.000Z"   // moves only when something above changes
}
```

It describes the game **loaded in vMix** (GC's Control sheet), not whatever game is open in GC's editor. Use `logo` (the Drive path vMix can read) rather than `logoUrl`; `logoUrl` only works on GC's own computer.

Any field may be missing or `null`. vMix UC must cope with that.

**vMix UC does** (built in vMix UC; see `src/features/gc.js`, tested against `test/mock-gc.js`):
- Master › Setup › 4 has the **Graphics Controller address**, default `http://127.0.0.1:3001` (works when both apps are on one computer). When GC runs on another computer, set it to `http://<GC computer>:3001`. Blank = off. A saved old default (`127.0.0.1:3000`) is changed to `:3001` automatically. There's also a "Follow its sport" switch, and the start-page checklist shows whether it's connected.
- Poll `/api/game` every 5 s (and only when the address is set).
- Use the data:
  - Set the show's sport, which picks the stat-pop event buttons.
  - Field source **"Game info (Graphics Controller)"** (home name, visitor mascot, record, etc.; `fullName` and `mascot` included): vMix UC writes it on TAKE and keeps it updated while on air. Only for fields GC does **not** sync.
  - Field source **"Filled by Graphics Controller"**: shown locked, and vMix UC never writes it.
  - **Team logo** fields use the Graphics Controller's `logo` path first, then fall back to Drive › Graphics › Logos.
  - Team colours on stat pops when OpenStatsEngine has none.
  - Accepts small differences: `away` for `visitor`, `abbrev` for `abbr`, `primary` for `color`; `null` = empty.
- If the Graphics Controller isn't running, show "not connected" and keep working with the last values.

### Level 2b: the title list (built on both sides, GC v4.14+)
So vMix UC can show which of its graphics are Graphics Controller titles, link each one to GC's editor, and lock the fields GC fills, GC serves its title list on the read-only port:

```
GET http://<GC computer>:3001/api/titles   → JSON, read-only, no auth, CORS open
{
  "titles": [
    {
      "id": "bk-scorebug",                 // manifest id
      "name": "BK SCOREBUG",               // manifest name
      "sport": "Basketball",
      "group": "Scorebug",                 // manifest group (Scorebug, Intro, Breakboard, Lineup, Announcers, Lower third…)
      "file": "gt-titles/Basketball/…/BK SCOREBUG.gtzip",
      "input": "8f3c…",                    // the vMix input key GC linked it to (Broadcast → vMix inputs), or null
      "owns": ["HOME NAME", "AWAY NAME", "HOME RECORD", "HOME BLOCK", …],   // every text/image/colour GC writes with vMix sync
                                           //   (not the live fields: scores, clock, period, shot/play clock, timeouts, down & distance)
      "editUrl": "/#title=bk-scorebug",    // a path on GC's editor (port 3000) that opens this title
      "label": "Scorebug",                 // GC's short display name
      "live": ["HOME SCORE", "CLOCK", …]   // fields the scoreboard software fills (never in owns)
    }
  ]
}
```

- `owns` entries are vMix field names without the suffix (`HOME NAME` means `HOME NAME.Text`, `HOME BLOCK` means `HOME BLOCK.Source`); the full name (`HOME NAME.Text`) also works.
- **GC's editor opens `/#title=<id>`**: Broadcast page, with that title's detail panel open (and on `hashchange`). That's what vMix UC's "Edit ↗" key links to.

**vMix UC does** (built):
- Matches each vMix GT input to a GC title: by `input` (GC's own link) first, then by name, with GC's rule (`BK INTRO (Thermal - Normal logo).gtzip` → `BK INTRO`).
- Shows a **GC** tag and an **Edit ↗** key (control page next to CHECK/TAKE/OUT; Master › Graphics) that opens `http://<GC computer>:3000<editUrl>`. That only works on the computer GC runs on (its editor port is 127.0.0.1 only).
- Fields in `owns` default to **"Filled by Graphics Controller"** (locked; vMix UC refuses to write them, Companion included) unless set otherwise in vMix UC.
- Groups from GC: Scorebug → Scorebug (the main scorebug only; flag, timeouts, down box, popup, status → Other, overlay 4, so they don't replace the scorebug), Intro / Breakboard / Lineup → Full screen, the rest → Lower thirds.
- Lists GC titles for the current sport that aren't in vMix ("In the Graphics Controller, not in vMix").
- Fields in `live` default to **"Filled by the scoreboard (vMix data source)"** (locked; vMix UC never writes them).
- The Network ID input (vMix UC's netId job) is left out of the graphics list: it has its own light and switch.
- If a title is deleted and added again in vMix (new key), its vMix UC settings follow it by name.
- (The old fallback that read GC's manifest on port 3000 is removed.)

### Level 3: buttons both ways (built)
- vMix UC's top bar has a **Graphics** button (green light when connected). It opens GC's editor on port 3000 of the same host, which only works on the computer GC runs on.
- The Graphics Controller's top bar has a **Control ↗** button that opens vMix UC at `http://<vMix PC>:8790` (the vMix PC address from GC's Settings). Built.
- Companion: vMix UC's OSC/HTTP commands stay the way to run things from a Stream Deck. If Graphics Controller actions are needed on a deck (e.g. "UPDATE GOOGLE SHEET"), it should expose them as simple HTTP `POST`s, and they get listed on vMix UC's Companion page.

## 3. Other apps on the same PC

| App | Address | Used by |
|---|---|---|
| vMix | HTTP 8088 | both |
| OpenStatsEngine | its own port (`/vmix/live/players.xml`, `roster.xml`) | both (read-only) |
| NDI Audio Bridge | OSC UDP 9500 | vMix UC (cough/mic) |
| **ScoreReader** (github.com/DueHack12/scorereader) on the scoreboard NUC | HTTP 8765: `/data.obj.json` (flat live fields: `clock`, `home_score`, `guest_score`, `period_ordinal`, `down_distance`, `play_clock`, `shot_clock`, `home_timeouts`…), `/data.json` (vMix Data Source), `/api/state` (is the ScoreBot sending?) | vMix UC (live strip, Master › Setup feed, field source "Scoreboard (ScoreReader), live"); vMix Data Source; OSE over MQTT 1883 |

## 4. Changelog
- **9 · 2026-11-24 · vMix UC:** merged GC's v8 (NAS, editor PIN, YouTube setup, `label`/`live`). vMix UC: honours `live` (locked as "Filled by the scoreboard"), removed the manifest fallback, re-links inputs by name when vMix replaces them, keeps the Network ID out of the graphics list (own light + Companion `/console/netid`). Rule 5 (input numbers). **Graphics Controller:** nothing to do; copy this over `INTEGRATION.md`.
- **8 · 2026-11-18 · Graphics Controller:** GC can run on the Synology NAS in Docker; the editor on 3000 asks for a PIN from other computers; 3001 stays open. Includes v7.
- **7 · 2026-11-18 · Graphics Controller:** level 2b built in GC v4.14 (`/api/titles` with extra `label` and `live`; `/#title=<id>`); GC sets up each game's YouTube broadcast and reads ScoreReader; `logoUrl` is `/api/asset?path=…` on 3001.
- **6 · 2026-11-17 · vMix UC:** level 2b, the title list. **Graphics Controller must:** serve `GET :3001/api/titles` as above, and open `/#title=<id>` in its editor. vMix UC is built against it and falls back to GC's manifest on the same computer meanwhile. Also: ScoreReader (scoreboard NUC, port 8765) added to section 3; vMix UC reads it.
- **5 · 2026-11-17 · vMix UC:** matched version 4. Default address is now `http://127.0.0.1:3001`, and an old saved `:3000` is migrated. `fullName` and `mascot` are usable as Game info. `null` is treated as empty. Master › Graphics has an "All fields: Filled by Graphics Controller" button. The Graphics button opens port 3000. Testing on a Mac: `Start FPGT (Mac).command` runs both. **Graphics Controller:** nothing to do. Please copy this text over `INTEGRATION.md`, since vMix UC's cloud chat can't overwrite files on the Drive.
- **4 · 2026-11-17 · Graphics Controller:** merged GC's side. Section 2 now matches the `/api/game` that was built: it is served on **port 3001** (port 3000 only answers on GC's own computer, and GC runs on a Mac), the extra fields `fullName` and `mascot`, `short` = `abbr` for now, `color2` may be `null`, `logoUrl` only works on GC's computer. Section 1: GC also writes GT title text/images/colours through the vMix API when its vMix sync is on. The Control button is built. **vMix UC must:** change the default Graphics Controller address to `http://<GC computer>:3001`, and treat every GT title field GC syncs as "Filled by Graphics Controller".
- **3 · 2026-11-17 · vMix UC:** the shared copy now lives on the Drive (FPGT Shared). vMix UC's side of level 2 is built, plus its Graphics button. **Graphics Controller:** check `/api/game` matches section 2 and add the Control button (level 3).
- **2 · 2026-11-17 · Graphics Controller:** added `/api/game`.
- **1 · 2026-11-17 · vMix UC:** first version.
