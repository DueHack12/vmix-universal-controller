# vMix Universal Controller (vMixUC)

[![Tests](https://github.com/DueHack12/vmix-universal-controller/actions/workflows/ci.yml/badge.svg)](https://github.com/DueHack12/vmix-universal-controller/actions/workflows/ci.yml)

One screen for the graphics / music / ads operator on a vMix sports broadcast, while the director switches cameras on the hardware panel. Runs on the **vMix PC**. Control it from the portrait or landscape monitor, from Stream Decks through Companion, and from iPads and phones.

> **Beta.** So far this has been tested against a simulated vMix only. Run the quick test in [`SETUP.txt`](SETUP.txt) before you rely on it for a game, and please [report anything that doesn't work](https://github.com/DueHack12/vmix-universal-controller/issues) with the log file attached (Master › Setup › Log).

**Download:** the latest zip is on the [Releases page](https://github.com/DueHack12/vmix-universal-controller/releases). Step-by-step setup for the vMix PC is in [`SETUP.txt`](SETUP.txt).

**Game-day core**
- **Graphics:** pick a GT title, edit its text, TAKE/OUT. A red tally read back from vMix itself, with on-air timers and an "it will replace…" warning.
- **Videos:** folders on the Drive, thumbnails, CUE to Preview for the director, play/pause/restart, time left, drag-and-drop upload.
  - The vMix VIDEOS list holds every clip of the chosen folder; the controller selects the clip it needs.
  - A playlist (queue) can mix clips from several folders. With auto-next on, when a clip ends the next one plays on air (or is cued to Preview when the video isn't on air).
  - A manual CUE never swaps a clip that's on air: it waits until the director cuts away.
  - In vMix, turn **Auto Next off** on the VIDEOS list (right-click › Edit Items). The controller warns you if it's on.
- **Ads:** your Ad Manager built in.
  - Bucket, Unsorted and sponsor folders, with real lengths.
  - Break playlists (Pregame, Q1, Halftime, Q3, Postgame…) with random fill and sponsor rules.
  - GO TO AD BREAK: 5-second countdown, music fades, ads to Preview, playing once the director takes them.
  - THIS AD and BREAK LEFT timers, SKIP, and BACK TO GAME (music back, game camera to Preview).
  - A played-ads log on the Drive.
- **Music:** playlists = Drive folders, a green bar while playing, FADE OUT, KILL, 25/50/75/100%, fade time.
  - The vMix MUSIC list holds every song of the chosen playlist; the controller selects the song to play. In vMix, turn **Auto Next off** on the MUSIC list.
  - When a song stops: reset to start, or cue the next track.
  - A queue, back-to-back playlist mode (replay rolls), saved playlists, auto-duck under videos.
- **Mixer:** named channels with meters and faders. MUTE (the channel dims), LISTEN (headphones). Both together = listen, not live. Add, remove and reorder sliders (◀ ▶ when expanded).
  - Faders match vMix's own faders, with the same dB. vMix reports volume on different scales in different versions; the controller detects which (or set it in Master › Mixer › Fader scale).
  - Expanded, the mixer shows big vertical faders.
- **Stream health:** vMix link, stream, recording time, record-drive hours left, CPU, program audio with a silence alarm, linked inputs.
- **Companion / Stream Deck:** OSC on UDP 9600 or HTTP. Feedback (on-air, time left, song…) is sent back to Companion.

**Setup & tools**
- **Master page** (`/master`): the settings hub, with a left menu.
  - **Setup:** vMix, job links, Drive, OpenStatsEngine, NDI Audio Bridge.
  - **Graphics:** names, groups, overlays, auto-out, field linker, pick-from lists, stat pop events.
  - **Ads:** break playlists, the ad library and folders, sponsor rules, GO / BACK TO GAME, played log.
  - **Music:** defaults and saved playlists.
  - **Mixer:** channels, sources, Bridge mics, live buses.
  - **Stream:** which health blocks show.
  - **Layout:** which sections each control page shows, their order, and which start open.
  - **Companion:** ids and commands.
  - **Shows:** new, copy, load, delete, rename, sport.
- **Graphic field linker:** each GT field gets a friendly label, is Editable, Locked or Hidden, and is filled from one of:
  - **typed** by the operator
  - **a pick-from list** (e.g. Announcers), shown as a dropdown on the control page
  - **fixed text**
  - **an OpenStatsEngine value** (score, clock, team names…), pushed on TAKE and kept live while on air
  - **a team logo** from `Graphics\Logos` (file named like the team's abbreviation, e.g. `FP.png`)
- **Stat pop builder:** pick Home or Away, a player from the OpenStatsEngine roster, and an event (per sport). TAKE builds "GOAL – #30 John Doe", sets the team logo and color, and goes on air. Auto-out is optional. Companion: `/console/statpop/home/30/goal`.
- **NDI Audio Bridge:** give a mixer channel its Bridge mic (e.g. `1/1`) and it gets a COUGH button. Also from Companion: `/console/mix/{channel}/cough`.
- **Start screen:** shows with RUN, plus a setup checklist that links to the right Master page.

**Extras**
- **vMix UC Remotes** (`/remote`) for iPad: big touch tabs for Mixer, Ads, Music, Graphics and Videos.
  - Phone, one job each: `/remote?view=mixer`, `ads`, `music`, `graphics` or `videos`.
  - Open it on the school Wi-Fi at `http://<vMix PC>:8790/remote`, then use **Add to Home Screen**.
- **YouTube check:** confirms from YouTube itself that you're live and shows how many are watching (plus the peak). The Stream health section turns red if vMix is streaming but YouTube isn't live.
  - Setup: a free API key and your channel ID go in Master › Setup.
- **Graphic mock-up:** the top of the control page shows a mock-up of the selected graphic with its current text, and whether it's on air.
- **Stream Deck + dials:** send relative values from Companion's rotary actions:
  - `/console/music/level "+5"`
  - `/console/mix/select "+1"` and `/console/mix/selected/level "-2"`
  - `/console/video/jog "+1"`
  - `/console/ads/prev`
  - `/console/ads/fade/in|out`
- **Beginner mode:** an option in Master › Setup. Hover any control-page button to see what it does. Off by default.

## Install on the vMix PC (one time)
1. Install **Node.js LTS** (22 or newer) from https://nodejs.org (accept the defaults).
2. Download the zip from [Releases](https://github.com/DueHack12/vmix-universal-controller/releases) and unzip it somewhere permanent, e.g. `C:\vMix Universal Controller` (not inside Downloads, and not run from inside the zip).
3. In vMix: **Settings › Web Controller › tick "Enable"** (port 8088). That's the API the controller uses. If you set a user name and password there, enter them in Master › Setup too.
4. Optional but recommended: install **ffmpeg** (`winget install ffmpeg`) for video thumbnails and exact lengths of unusual files.
5. Make sure **Google Drive for desktop** is running and the shared drive shows up as `G:\Shared drives\Prep Sports Broadcasting\` (or set your own folder in Master › Setup › Drive folders).
6. The first time it starts, **Windows Firewall** asks about Node.js: tick **both Private and Public** and press **Allow**. Without that, iPads, phones and Companion on other computers can't reach it.

## Every game
1. Open vMix and your show preset.
2. Double-click **`Start vMix Universal Controller.bat`**. A browser opens at the start page.
3. Pick the show and press **RUN**, or open:
   - `http://localhost:8790/control?layout=vertical` on the portrait monitor (press F11 for full screen)
   - `http://localhost:8790/control?layout=horizontal` on a 1920×1080 screen

Leave the black window open while you're on air. Closing it stops the controller (it saves first). vMix keeps running either way.

## First-time setup (Master page: ⚙ on the control page, or `/master`)
1. **Find vMix:** normally `127.0.0.1 : 8088`. It should say Connected.
2. **Assign jobs:** the controller needs four vMix inputs:
   - a **List** input for music (call it `MUSIC`)
   - a **List** input for ads (`ADS`)
   - a **List** input for video clips (`VIDEOS`)
   - the **game camera** that BACK TO GAME puts in Preview

   Make the three List inputs in vMix if you don't have them (Add Input › Video List). They're auto-matched by name. To change one, press **◎ Pick in vMix** and click the input in vMix so it goes to Preview. If it's already in Preview, press **Use “…” (already in Preview)** instead.
3. **Drive folders:** press **Create missing folders** to make the tree below. Nothing that already exists is touched.
4. **Graphics:** rename titles, set their group and overlay channel, or hide the ones you don't use.
5. **Companion:** add a *Generic: OSC* connection to this PC on port **9600**. To get button feedback, enter Companion's IP and port.
6. **Security (recommended):** on **Master › Setup › Security**, set a **PIN**. See [Security](#security).
7. Optional: on **Master › Setup**, enter OpenStatsEngine's address (e.g. `http://192.168.50.21:8080`), then on **Master › Graphics** tick "Use this graphic for stat pops" on your stat pop title.

## The Drive folder
```
G:\Shared drives\Prep Sports Broadcasting\vMix Universal Controller\
├── Videos\   Highlights, Pregame, Packages …    (one folder = one choice in the Videos dropdown)
├── Music\    Bumps, Highlights, Pregame, Timeouts, Walk-out …   (one folder = one playlist)
├── Ads\      15Second, 30Second, 1Minute, 2Minutes+, Unsorted, Sponsors\NFHS, Sponsors\DAF
├── Graphics\ Logos, Backgrounds
├── Shows\    backup copy of every saved show
├── Exports\  ads-played-YYYY-MM-DD.csv (what aired, for sponsors)
└── _Archive\
```
House rule: the controller **never moves, renames or deletes** anything on the Drive. Uploads get a new name (`clip (2).mp4`) instead of overwriting.
Your existing `ADS 25-26` folder can be used as-is: Master › Ads › **Ad library**.

## Security
Anyone on the same network can open the controller's pages, so on a school or venue Wi-Fi:
- **Set a PIN** (Master › Setup › Security, 4–8 digits). iPads, phones and other computers then enter it once and stay signed in. The vMix PC itself never needs it. Changing the PIN signs every device out.
- **Companion over HTTP:** add `?pin=1234` to the URL, e.g. `http://<vMix PC>:8790/osc/console/music/toggle?pin=1234`.
- **Companion over OSC (UDP):** OSC has no PIN. To lock it down, list Companion's IP under *OSC (UDP) only from*.
- The PIN and the OSC list can only be changed on the vMix PC.
- Always protected, PIN or not: commands from other websites are refused, uploads can only go into the `Videos` folders, and the pages only answer to this PC's IP address, `localhost` or its computer name.

## When something goes wrong
- Every day gets a log file in `data\logs\YYYY-MM-DD.log` (path shown in the black window). **Master › Setup › Log › download today's log** gets it from any device. Send it along with what you pressed.
- Unexpected errors are written to the log and the controller keeps running.
- `Port 8790 is busy`: the controller is already running in another window.

## Companion / Stream Deck commands
OSC to UDP **9600**, or HTTP `GET http://<vMix PC>:8790/osc/console/...` (Generic HTTP module; add `?pin=` if you set a PIN).

| Command | What it does |
|---|---|
| `/console/gfx/{id}/take` · `/out` · `/toggle` | graphic on/off (ids are listed on Master › Companion, e.g. `genl3`) |
| `/console/gfx/{id}/field/Top.Text "text"` | set a text field |
| `/console/gfx/allout` | every graphic out |
| `/console/video/next` · `/playpause` · `/restart` | videos |
| `/console/ads/go` · `/cancel` · `/back` · `/skip` · `/reshuffle` · `/newgame` | ads |
| `/console/ads/break/{id}` · `/console/ads/break/{id}/go` | select / go a break playlist (`pre`, `q1`, `half`, `q3`, `post`) |
| `/console/music/toggle` · `/play` · `/pause` · `/next` · `/prev` · `/kill` | music |
| `/console/music/fade/out [ms]` · `/console/music/fade/in` · `/console/music/level 50 [ms]` | music levels |
| `/console/mix/{channel}/mute [1/0]` · `/listen [1/0]` · `/level 0-100` or `"+5"` | mixer |
| `/console/mix/{channel}/cough [1/0]` | NDI Audio Bridge cough for that channel's mic |
| `/console/statpop/{home|away}/{number}/{event}` | build + take a stat pop (e.g. `/console/statpop/home/30/goal`) |
| `/console/rec [1/0]` · `/console/stream` | record / stream |

Feedback sent to Companion (and readable at `/api/fb`): `/fb/gfx/{id}/onair`, `/fb/music/playing`, `/fb/music/song`, `/fb/music/remaining`, `/fb/ads/phase`, `/fb/ads/countdown`, `/fb/ads/adleft`, `/fb/ads/remaining`, `/fb/video/remaining`, `/fb/mix/{name}/mode`, `/fb/rec`, `/fb/rec/time`, `/fb/stream`, `/fb/health/ok`.

### YouTube API key (for the live check)
1. Go to https://console.cloud.google.com and create a project (e.g. "vMix Universal Controller").
2. Under **APIs & Services › Library**, enable **YouTube Data API v3**.
3. Under **APIs & Services › Credentials**, choose **Create credentials › API key**.
4. Paste the key and your channel ID (YouTube Studio › Settings › Channel › Advanced settings, starts with `UC`) into Master › Setup.

It only reads public data. A whole game uses a small part of the free daily quota.

## Keyboard (control page)
`Space` music play/pause · `F` fade out · `N` next song · `T` take selected graphic · `O` out · `C` cue next video · `P` video play/pause.

## Try it without vMix
Double-click **`Try Demo (no vMix).bat`** (or run `npm run demo`). It starts a fake vMix plus demo media and opens the controller on port 8791. Nothing touches the real vMix or the Drive.

## For whoever maintains it
- **Stack:** Node 22+ with **no dependencies** (no `npm install`).
- **Code layout:**
  - `server.js`: HTTP + SSE + OSC
  - `src/engine.js`: polls vMix ~4×/s and routes commands
  - `src/auth.js`: PIN, cross-site and host checks
  - `src/statediff.js`: live state is sent as small patches after the first full message
  - `src/features/*`: one file per section
  - `public/*`: the pages
- **Tests:** `npm test` runs unit tests, end-to-end flows against `test/mock-vmix.js` (which speaks the vMix API) and HTTP server tests. ffmpeg is needed for the media tests (they are skipped without it).
- **Settings and shows:** stored in `data\`. Back that folder up if you move PCs.
- **Verbose console:** set `VUC_VERBOSE=1` to print every log line in the black window.
- **Changes:** see [`CHANGELOG.md`](CHANGELOG.md).

## Releases
Releases are built by GitHub Actions. To publish one:
1. Update `version` in `package.json` and add a section for it at the top of `CHANGELOG.md`. (If you forget `package.json`, the release still works: the zip takes the version from the tag, and the run shows a warning.)
2. Commit, then tag and push the tag:
   ```bash
   git tag v0.1.0-beta.1
   git push origin v0.1.0-beta.1
   ```
3. The **Release** workflow runs the tests, builds `vmix-universal-controller-<version>.zip` (one `vMix Universal Controller` folder, Windows line endings for the `.bat` files) and publishes a GitHub release with that zip and the changelog section. Tags with a `-` (like `-beta.1`) are marked as pre-releases.

You can also create the release on the GitHub website (Releases › Draft a new release, with a new tag): the workflow then attaches the zip to it and keeps your title and notes. To build the zip again for an existing tag, use **Actions › Release › Run workflow** and enter the tag.

## License
[MIT](LICENSE). vMix is a trademark of StudioCoast Pty Ltd; this project is not affiliated with StudioCoast.
