# Changelog

All notable changes are listed here. Versions follow [Semantic Versioning](https://semver.org).
The release workflow uses the section for the tag's version as the release notes.

## [Unreleased]

### Added
- **Live-show look:**
  - a red frame round the page while a graphic, video or the ads are on Program;
  - Program / Preview / Graphic monitors with pictures from vMix (switch with PGM / PVW);
  - red/green tally dots on section titles and the graphics dropdown;
  - keys light green when done and red when refused;
  - mixer meters with −20/−6/0 dB ticks and a peak line that holds a second;
  - countdown rings (ad countdown, this ad, song left, graphic auto-out);
  - song time and length plus a progress line on the Music bar;
  - the ad break as a timeline;
  - **Focus** mode: hides setup links, help and editing controls; secondary keys on closed sections fade until you point at them;
  - toasts the Graphics Controller way: bottom centre, frosted glass, errors stay until ✕.
- **Real graphic preview:** the picture of the selected title comes from vMix itself (SnapshotInput), so you see exactly what vMix has; the mock-up is only a fallback.
- **FADE IN** for music (control page, iPad, key `I`, Companion `/console/music/fade/in`); on a playing song it just brings the level back up.
- **Ad transitions:** GO TO AD BREAK can dip through black straight to the ads; BACK TO GAME can fade or dip through black to the game camera (Master › Ads › GO / BACK TO GAME, with a dip/fade time).
- **Live scoreboard from ScoreReader** (the scoreboard NUC): strip on the control page, the whole feed in Master › Setup, a "Scoreboard (ScoreReader), live" field source, Companion feedback.
- **vMix Graphics Controller:** game info, its titles with a GC tag and Edit ↗ link, its fields locked, titles not in vMix listed (INTEGRATION.md v6).
- FPGT suite look, with the Graphics Controller's exact keys.

### Fixed
- Graphics OUT: decided from what vMix shows right now; a title still on air after OUT is switched off instantly; a graphic on Program (not an overlay) gets a clear message.
- Music: picking another playlist while stopped makes its first song ready (PLAY used to play the old song until NEXT).
- A malformed OSC packet could freeze the whole program. It is now rejected.
- CANCEL pressed as the ad countdown hit 0 was ignored (the break still went to Preview); BACK TO GAME and loading a show had the same gap.
- Pressing GO twice quickly (or Stream Deck + page) put every ad in the vMix list twice.
- GO TO AD BREAK now says straight away when vMix is offline, the ads player isn't linked or there are no ads, instead of counting down for nothing.
- PLAY during a music fade-out said OK but the music still stopped; a level change during a fade is kept for next time.
- A non-number music level (e.g. a mistyped Companion button) broke the music level.
- A video that can't be found in the vMix list is no longer retried 4 times a second.
- One unexpected error could stop vMix polling for the rest of the show.
- Uploads are written on this PC first and copied onto the Drive only when finished, never over an existing file.
- Show backups on the Drive are one per computer, so a second install never overwrites this PC's copy.
- The Companion allow list now covers `/osc/...` web links too, not just UDP.
- The Logos folder is read in the background, so a slow Google Drive can't hold up a TAKE.
- A Graphics Controller title only matches whole words ("BK SCORE" no longer matches "BK SCOREBUG").
- Horizontal control page on a laptop (1366×768): the right column was squeezed to ~280 px; section keys now wrap as a group.
- vMix connection errors in plain words ("vMix isn't answering: is vMix open, with Web Controller on?").
- Start page: required steps that aren't done are red, optional extras grey (they were the other way round); a new install shows its Default show.
- Show names keep emoji and "/" in the list (the file name is still made safe).
- iPad remote: CUE NEXT is disabled when nothing is queued.
- Graphics Controller address: typing the editor port (`:3000`) or just the IP now uses the read-only port `:3001`; a PIN error (HTTP 401) says to use port 3001.

## [0.2.0-beta] - 2026-11-13

Fixes from the first test on a real vMix.

### Changed
- **Lists stay full.** The vMix MUSIC list holds the whole playlist and the VIDEOS list the whole folder (plus clips queued from other folders). The controller selects what it needs instead of emptying the list and loading one file. Turn **Auto Next off** on MUSIC and VIDEOS in vMix (ADS stays on); the controller warns you if vMix moves on by itself.
- **Video playlists:** queue clips from several folders. With auto-next on, the next clip plays when one ends on air (or is cued to Preview off air). New Clear button, folder names and total time in the playlist.
- **Music Playlist mode** starts the next queued song when one ends.
- **Mixer, expanded:** big vertical faders, and ◀ ▶ to reorder channels.
- **Top of the control page:** the Preview/Program pictures are gone (they cost vMix time every second). Only the graphic mock-up is left; it follows the graphic picked in Graphics.

### Fixed
- **Mixer faders didn't match vMix** ("bottom isn't silent", different heights, faders jumping back after a move). vMix accepts volume as the fader position but some versions report it as amplitude (halfway reads 6.25). The controller now detects the scale, converts it, and shows dB like vMix. Override: Master › Mixer › Fader scale.
- **Lag:**
  - The mixer is no longer rebuilt several times a second: meters and faders update in place.
  - Faders send while you drag; fast moves are merged so vMix only gets the latest value.
  - Mute/listen read vMix once instead of twice.
  - Buttons in sections with a running timer no longer lose a tap when the section redraws mid-press.

### Removed
- vMix snapshot pictures ("Monitor pictures" setting).

## [0.1.0-beta.1] - 2026-11-12

First public beta. **Tested against a simulated vMix only.** Run the quick test in `SETUP.txt` before using it for a game.

### Features
- **Graphics:** pick a GT title, edit its fields, TAKE/OUT. The on-air light comes from vMix itself, with on-air timers, auto-out and an "it will replace…" warning. Field linker (typed, pick-from list, fixed text, OpenStatsEngine value, team logo) and stat pops.
- **Videos:** Drive folders, thumbnails (ffmpeg), queue, CUE to Preview, play/pause/restart, time left, drag-and-drop upload. Never swaps a clip that's on air.
- **Ads:** bucket / loose / sponsor folders with real lengths, break playlists with random fill and sponsor rules, GO TO AD BREAK countdown, timers, SKIP, BACK TO GAME, and a played-ads CSV for sponsors.
- **Music:** playlists from Drive folders and saved playlists, queue, back-to-back mode, fades, KILL, levels, turns down under videos.
- **Mixer:** named channels with meters and faders, MUTE / LISTEN, NDI Audio Bridge cough.
- **Stream health:** vMix link, stream, recording, record-drive space, CPU, silence alarm, YouTube live check with viewers.
- **Pages:** start page with shows, control pages (vertical 1080×1920, horizontal 1920×1080), Master settings, iPad/phone remotes, monitor pictures from vMix snapshots, beginner mode.
- **Companion / Stream Deck:** OSC on UDP 9600 and HTTP `/osc/...`, feedback values, Stream Deck+ dial commands.

### Security
- Optional **PIN** for other devices (iPads, phones, other PCs). The vMix PC never needs it. Five wrong tries lock that device for 30 seconds.
- Optional list of IP addresses allowed to send OSC over UDP.
- Commands sent from other websites are refused, and pages only answer to this PC's IP, `localhost` or its computer name (blocks DNS rebinding).
- Uploads can only go into existing `Videos` folders and must be video files.
- Optional vMix Web Controller user name / password.

### Reliability
- Unexpected errors are logged and the controller keeps running.
- Saves when the console window is closed.
- Daily log file in `data\logs`, downloadable from Master › Setup › Log.
- A slow or stalled Google Drive no longer freezes the controller: folder lists are cached and refreshed in the background, and Drive writes happen in the background.
- Live state goes to pages as small patches instead of the whole state several times a second.

### Fixed (since the private test builds)
- Renaming a show to the same name, or only changing capitals, deleted the show file. Renaming or creating a show can no longer overwrite another one.
- "Pick in vMix" could not pick the input that was already in Preview.
- Cancelled uploads left `.uploading` files in the Drive folder.
- Holding a keyboard shortcut repeated TAKE.

[0.2.0-beta]: https://github.com/DueHack12/vmix-universal-controller/releases/tag/v0.2.0-beta
[0.1.0-beta.1]: https://github.com/DueHack12/vmix-universal-controller/releases/tag/v0.1.0-beta.1
