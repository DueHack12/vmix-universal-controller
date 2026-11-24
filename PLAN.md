# FPGT broadcast tools: plan and status

A handoff for continuing in another tool. Last updated 2026-11-24.

The project: **vMix Universal Controller (vMix UC / UC)**, a one-operator console for Fairfield Prep (FPGT) sports streams. It works alongside the **vMix Graphics Controller (GC)**, which has its own repo and its own chat.

The code is in this folder. It is also on GitHub at `DueHack12/vmix-universal-controller`, but the GitHub copy is **out of date**: this session couldn't push (see "Left to do").

---

## Key decisions

### What runs where
- [x] **vMix UC** runs on the **vMix PC** (Windows), next to vMix (`127.0.0.1:8088`).
  - Node ≥22, zero npm dependencies.
  - Start with `Start vMix Universal Controller.bat`.
  - Web pages on **8790**, Companion/Stream Deck over **OSC UDP 9600** (and HTTP `/osc/...`).
- [x] **Graphics Controller** goes on the **Synology NAS in Docker** (always on).
  - **3000:** editor.
  - **3001:** read-only graphics pages plus `/api/game`.
  - Until then it runs on the Mac.
- [x] **ScoreReader** (github.com/DueHack12/scorereader) stays on the **NUC** wired to the scoreboard, HTTP port **8765**.
- [x] **Media** (videos, music, ads, logos) stays on **Google Drive**: `G:\Shared drives\Prep Sports Broadcasting\`.
  - vMix plays it from G:\ on the vMix PC.
  - vMix UC's own folder is `…\vMix Universal Controller\`.
- [x] Don't run the apps from inside Google Drive: sync conflicts, and half-synced updates mid-game.
- [x] **No GitHub needed** (teacher account):
  - vMix UC updates arrive as a zip, unzipped on the vMix PC.
  - GC on the NAS builds from a NAS folder: put the new files in, then Container Manager › Project › Build.

### House rules (apply to every chat)
- [x] **Never move, rename or delete anything on the shared Google Drive.** Only copy in. A replaced file goes to `_Archive`.
- [x] **Never get around bot protection** (MaxPreps, CIAC rankings). That data comes through GC, pasted or sent by bookmark.
- [x] **One writer per vMix field.**
  - GC writes title **content**.
  - UC writes overlay on/off, lists, audio, and fields set to "Typed by operator" / "Game info" / "Scoreboard".
- [x] **Look:** the FPGT suite style in `DESIGN.md`:
  - charcoal, macOS-blue accent;
  - ATEM-style keys with status lights, using GC's exact key values;
  - red/green/amber only for lights and badges.
- [x] Companion OSC paths stay `/console/...`, so existing Stream Deck buttons keep working.
- [x] Updates happen **between games**, never during one.

### How the two apps share information
- [x] The shared agreement is **`INTEGRATION.md`**. **The Drive copy wins**: `Prep Sports Broadcasting/vMix Universal Controller/FPGT Shared/INTEGRATION.md` (with `DESIGN.md`).
  - Each repo keeps a copy.
  - Each chat reads it at the start of every task.
  - A change raises the version and adds a changelog line.
  - A chat that can't write to the Drive saves `INTEGRATION (proposed by <app>).md` next to it.
- [x] `CLAUDE.md` in this repo carries that rule.

---

## Next big job: Stream Deck / Companion rework (vMix UC owns it)

**First: get the Companion configuration.** Companion web page (`http://127.0.0.1:8000`) › Import / Export › **Export** (everything), giving a `.companionconfig` file. Or run a Claude Code session **on the vMix PC** that can read it directly.

**Facts from the Graphics Controller chat (11/24):**
- vMix preset `FOOTBALL 2026.vmix`. Inputs 45 (Graphics Mix), 49 (Mix4) and 50 (INTROVIDEO) were deleted, so everything after 45 moved down 1 (TIMEOUT PREP is now 46, TIMEOUT AWAY 47).
  - **Every Companion vMix action using an input NUMBER is fragile.** Switch them all to input **names**.
- **Don't renumber inputs 29–32:** SCOREBUG, HOME DOWN BG, AWAY DOWN BG and DOWN BOX COVER. The possession script uses them by number.
- **Coming:**
  - a GT title **NETWORK ID** replaces input 22 (a plain image) at the same position;
  - TIMEOUT PREP/AWAY and HOME DOWN BG get re-pointed to the GC files in `GT Titles\Football`, keeping their positions.
  - vMix UC now re-links by name when an input is replaced. Check the Network ID job after the swap.
- **Title ↔ vMix input map:** `GET http://<vMix PC>:3001/api/titles` lists each title, its input, the fields GC fills (`owns`) and the live fields (`live`).
- **GC sets content only** (logos, colours, crests FNF/SCC/CIAC, the Network ID picture). On/off is vMix UC's job.

**What the user wants:**
- [ ] **On-air lights on every graphic button.** vMix UC feedback: `/fb/gfx/{id}/onair`, `/fb/netid`.
- [ ] **Football page grouped by row:**
  - show graphics;
  - game situations;
  - lower thirds;
  - scorebug, plus POSS and a manual **Ball Prep / Ball Away** override.
- [ ] **Stream Deck+ knobs** labelled **PBP / Colour / Crowd / Music**, showing their levels. vMix UC has `/console/mix/{channel}/level "+2"` and `/console/mix/select` / `selected/level` for dials.
- [ ] **Fix the "TIME LEFT: $NA" variables.** Likely cause: the button uses a variable that doesn't exist, e.g. a vMix module variable by input number that moved, or a custom variable Companion never receives.
  - vMix UC's feedback goes out as OSC (`/fb/...`, Master › Companion › feedback host/port) and as JSON at `/api/fb`.
  - **Consider:** have vMix UC set Companion **custom variables** directly (Companion's OSC/HTTP API, `/custom-variable/<name>/value`). Then buttons can use `$(custom:uc_music_remaining)` and similar. This needs the variables created in Companion, or included in an import.
- [ ] Decks: Stream Deck **XL**, **+** and **standard**.

---

## Completed in vMix UC (46 tests pass: `npm test`)

### Core (from earlier sessions)
- [x] Control pages, vertical (1080×1920) and horizontal, with accordion sections that show a mini preview when closed.
- [x] **Graphics:** TAKE/OUT/CHECK, tally read back from vMix, auto-out, stat pops, field linker (typed / list / fixed / OSE / logo).
- [x] **Videos:** folders, thumbnails, queue, CUE NEXT, multi-folder playlists.
- [x] **Ads:** a port of the Ad Manager.
  - Break playlists; 5-second countdown with CANCEL; BACK TO GAME with camera assign.
  - "This ad" and "break left" timers; played log.
- [x] **Music:** fade/kill, levels, queue, playlists, ducking under videos.
- [x] **Mixer:** MUTE/LISTEN, meters, NDI Audio Bridge cough.
- [x] **Stream health:** stream, recording, disk, CPU, audio. **YouTube** live check and viewer count.
- [x] **Master settings pages,** the start screen with saved shows, iPad/phone **vMix UC Remotes**, optional PIN, Beginner mode.
- [x] **Companion:** OSC commands plus feedback values; Stream Deck XL / + / standard layouts.
- [x] **Tests and demo:** fake vMix, OSE, GC and ScoreReader for the tests and the demo.

### This session
- [x] **Restyle** to the FPGT look (layout unchanged), then matched GC's exact key values.
- [x] **Naming:** "vMix Universal Controller / vMix UC" everywhere.
- [x] **Shared files:** `INTEGRATION.md` (now **v6** in the repo and proposed on the Drive), `DESIGN.md` and `CLAUDE.md` added.
- [x] **GC link (INTEGRATION level 2):**
  - polls `GET <GC>:3001/api/game`, follows its sport;
  - field sources "Game info (Graphics Controller)" and "Filled by Graphics Controller" (locked);
  - GC logos first;
  - **Graphics** button with a status light.
- [x] **GC titles (level 2b, UC side):**
  - GC tag and **Edit ↗** link per title;
  - GC-filled fields locked by default, and refused even from Companion;
  - GC groups mapped (scorebug add-ons → overlay 4);
  - "In the Graphics Controller, not in vMix" list;
  - an "All fields: Filled by Graphics Controller" button;
  - fallback that reads GC's manifest on port 3000 until GC serves `/api/titles`.
- [x] **ScoreReader live scoreboard:**
  - strip under the top bar (score, period, clock, down & distance, play/shot clock, timeouts, status light);
  - full live feed in Master › Setup › 4;
  - field source "Scoreboard (ScoreReader), live";
  - Companion `/fb/scoreboard/...`.
- [x] **Mac testing without admin rights:**
  - `Try Demo (Mac).command`;
  - `Start FPGT (Mac).command`: runs GC and the vMix UC demo together, asks once for the GC folder, loads GC's real titles into the fake vMix;
  - run it with `bash "Start FPGT (Mac).command"`;
  - `Start FPGT.bat` for the vMix PC.
- [x] **Bug sweep** (details in `CHANGELOG.md` › Unreleased):
  - a malformed OSC packet froze the program;
  - CANCEL at the end of the ad countdown was ignored;
  - a double GO loaded every ad twice;
  - GO counted down for nothing when vMix was offline, unlinked or had no ads;
  - PLAY during a fade-out still stopped the music;
  - a non-number music level broke it;
  - a missing video was retried 4×/second;
  - the poll loop could stop for good;
  - uploads now go to the PC first and are copied in without overwriting;
  - show backups are one per computer;
  - the OSC allow list covers HTTP too;
  - logos are read in the background;
  - title matching is whole-word;
  - laptop layout;
  - plain-English vMix errors;
  - start-page checklist colours;
  - show names keep emoji and "/";
  - remote CUE NEXT.
- [x] **Synology package for GC** (`/home/user/gc-synology/`: Dockerfile, .dockerignore, docker-compose.yml, SYNOLOGY.md). Built and run in Docker here with host networking: ports answer, data persists, Eastern time, vMix UC connects and sees 24 titles.

---

## Left to do

### Graphics Controller chat (paste-ready messages are in this conversation)
- [ ] Merge `INTEGRATION (proposed by vMix UC) v6.md` into `INTEGRATION.md` on the Drive and in its repo.
- [ ] Build **level 2b**: `GET :3001/api/titles` (id, name, sport, group, file, input, owns, editUrl) and make the editor open `/#title=<id>`.
- [ ] Get ready for the **NAS**:
  - Dockerfile, .dockerignore, docker-compose (`build: .`, `network_mode: host`, `restart: unless-stopped`, TZ America/New_York, `./data` and `./config.json` mounted);
  - `server.host` set to `0.0.0.0`.
- [ ] Add a **PIN for the editor (port 3000)**. On the NAS it's reachable by the whole school network.
- [ ] Fix Mac/localhost assumptions:
  - MaxPreps bookmark (`receive.html`);
  - YouTube sign-in redirect (Google rejects private IPs: sign in on a Mac and copy `data/youtube.json`);
  - a setting to always send GT pictures over the network (port 3001), not through Drive.
- [ ] Note in INTEGRATION.md that GC can run on the NAS. Raise the version (→ 7).
- [ ] Ask it first whether it runs on the Mac and can see `/Volumes/docker/vmix-graphics-control`. If not (it's a cloud chat), it should hand over a zip.

### You
- [ ] **Test on the Mac:** unzip the latest `vmix-universal-controller.zip` into `~/Documents/Claude/vmix-universal-controller`, then run:
  ```bash
  cd "/Users/jpellegrino/Documents/Claude/vmix-universal-controller" && bash "Start FPGT (Mac).command"
  ```
  - Node ≥22 is required. Without admin, install it with nvm.
  - In GC's `config.json`, set `"mode": "sandbox"` so games can be made while testing.
- [ ] **Set up the NAS** (DSM 7.2+ with Container Manager):
  - [ ] File Station: create shared folder `docker` › `vmix-graphics-control`.
  - [ ] Connect from the Mac: Finder › Go › Connect to Server › `smb://<NAS IP>`.
  - [ ] Put the GC app plus the Docker files there.
  - [ ] Container Manager › Project › Create › that folder › Done.
  - [ ] Give the NAS a fixed IP.
  - [ ] Firewall: allow port **3000** only from the booth computers and the Mac; keep 3001 open.
- [ ] **Point vMix UC at the NAS:** Master › Setup › 4 › Graphics Controller `http://<NAS IP>:3001`.
- [ ] **Point vMix UC at ScoreReader:** Master › Setup › 4 › Scoreboard › the NUC's IP (port 8765 is added).
- [ ] **In GC:** Settings › vMix PC = the vMix PC's IP.
- [ ] **First real test on the vMix PC:** follow `SETUP.txt`.
  - vMix Web Controller on.
  - List inputs **MUSIC / ADS / VIDEOS**: Auto Next **off** on MUSIC and VIDEOS, **on** on ADS.
  - Master › Setup › Assign jobs; "Create missing folders".
  - Run the quick test: TAKE, music fade/kill, GO TO AD BREAK, mixer.
  - Write down anything that fails, with a photo of the screen and the black window.
- [ ] **Optional cleanup:** after the GC merge, delete the old `INTEGRATION (proposed by …).md` files in FPGT Shared yourself (Claude won't delete on the Drive).

### vMix UC (next session)
- [ ] Once GC serves `/api/titles` (INTEGRATION v7):
  - read the Drive copy;
  - remove UC's port-3000 manifest fallback in `src/features/gc.js`;
  - check that the `owns` names match.
- [ ] Update INTEGRATION.md section 2: GC on the NAS, so Edit ↗ works from any allowed computer.
- [ ] Get GitHub working, or keep using zips. This session couldn't push:
  - `add_repo` needs GitHub linked in claude.ai connectors;
  - the teacher account may not allow it.
  - The local commits are the true copy (latest `ea61fea`, plus PLAN.md).
- [ ] Leftover low-risk item: ad and video lengths are still read from the Drive with blocking reads (`src/media.js`, `src/features/ads.js` existsSync). Make them async if a slow Drive ever stalls the app.
- [ ] Ideas the user hasn't approved yet:
  - a "Game day check" button;
  - a few seconds of undo for ALL OUT and KILL;
  - a plain-words "What just happened" log;
  - a practice mode that blocks REC and streaming;
  - the scoreboard strip on the remotes.
