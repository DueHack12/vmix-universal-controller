# Changelog

All notable changes are listed here. Versions follow [Semantic Versioning](https://semver.org).
The release workflow uses the section for the tag's version as the release notes.

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
