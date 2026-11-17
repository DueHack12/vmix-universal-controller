# FPGT Suite UI design spec

This is the look of the vMix Graphics Control panel. Use it in the other FPGT apps so they feel like one suite.

**Style:** a hybrid of Blackmagic Design (DaVinci Resolve / ATEM Software Control) and a native macOS pro app (Final Cut Pro).

**Mood:** a neutral, dark-room charcoal. Calm and uncluttered. Colour comes mostly from small status lights, not big coloured areas.

## 1. Colour tokens

```css
:root {
  --bg:      #141416;              /* page / room background */
  --panel:   #18181B;              /* main panels */
  --well:    #111113;              /* recessed wells: inputs, previews, canvases */
  --panel2:  #242428;              /* raised cards */
  --line:    rgba(255,255,255,.08);/* 1px hairline borders */
  --text:    #ECECEE;              /* primary text */
  --muted:   #8E8E93;              /* secondary text, labels */
  --accent:  #0A84FF;              /* macOS blue: selection, focus, primary buttons */
  --red:     #FF3B30;              /* errors / destructive (and on-air in a live app) */
  --green:   #30D158;              /* active / in sync / connected */
  --amber:   #FF9F0A;              /* unsaved / unpushed edits, warnings */
  --radius:  10px;
}
```

Other values in use:
- **Top bar:** `#121214`
- **Bar under the top bar:** `#161618`
- **Primary (blue) button gradient:** `#2F7FF0` → `#1C64D6`
- **Neutral key gradient:** `#303035` → `#26262A` → `#222226`
- **Selected key or segment gradient:** `#3A3A40` → `#2E2E33`

## 2. Type

- **UI font:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui`. Base size 13.5–14px (15px on screens 2200px and wider), with antialiasing on.
- **Numbers font:** `"SF Mono", ui-monospace, "JetBrains Mono", Menlo` with `font-variant-numeric: tabular-nums`. Use it for every clock, time, score, input or channel badge, version number and status readout.
- **Section and field labels (micro-labels):** 10px, weight 600, UPPERCASE, `letter-spacing: .12em`, colour `--muted`.
- **Headings:** SF Pro, weight 700, white. Keep them small; the micro-labels do most of the structure.

## 3. Surfaces

| Surface | Background | Border | Extra |
|---|---|---|---|
| Panel | `--panel` | 1px `--line`, radius 10px | no heavy shadow |
| Card (inside a panel) | `--panel2` | 1px `--line`, radius 9px | `inset 0 1px 0 rgba(255,255,255,.05)` top sheen |
| Well (input, select, textarea, preview, canvas) | `--well` | 1px `rgba(255,255,255,.07)`, radius 7–8px | `inset 0 1px 2px rgba(0,0,0,.6)` recessed shadow; previews use a deeper `inset 0 2px 6px rgba(0,0,0,.7)` |
| Focus ring | n/a | border `rgba(10,132,255,.8)` | `0 0 0 3px rgba(10,132,255,.25)` |
| Modal | `--panel`, radius 14px | 1px `--line` | backdrop `rgba(0,0,0,.55)` + `blur(6px)` |
| Toast | `rgba(36,36,40,.92)` + `backdrop-filter: blur(20px)` | 1px `--line`, radius 10px | soft drop shadow |

## 4. Buttons: tactile ATEM-style hardware keys

- **Shape:** a matte charcoal gradient (`#303035 → #26262A → #222226`), 1px dark border `rgba(0,0,0,.55)`, radius 7px (6px when small).
- **Specular highlight:** `inset 0 1px 0 rgba(255,255,255,.14)` along the top edge, plus `0 1px 2px rgba(0,0,0,.6)` underneath.
- **Hover:** `filter: brightness(1.12)`.
- **Press:** `transform: scale(.96) translateY(1px)`, then spring back with `transition: transform 140ms cubic-bezier(.34,1.56,.64,1)`. In React, use `whileTap={{ scale: 0.96, y: 1 }}`.
- **Primary button:** blue gradient `#2F7FF0 → #1C64D6`, white text, a faint blue glow `0 0 14px rgba(10,132,255,.18)`.
- **Ghost / secondary button:** a flatter gradient `#2A2A2E → #222225`, weight 500.

**Status light strip:** a light sits at the bottom of the key cap.
- Size: 2–3px tall, about 60–75% of the key width, 3px above the bottom edge.
- Effect: a glow, e.g. `box-shadow: 0 0 6px <colour>, 0 0 12px <colour at 50%>`.
- Only important keys get a light, so the screen stays calm:
  - **Green `#30D158`:** active, synced, connected, "Load into vMix".
  - **Amber `#FF9F0A`:** unsaved or unpushed edits (e.g. "Save changes •").
  - **Red `#FF3B30`:** on air or program. In a live/switcher app this is the Program/On-Air key, and green can mean Preview.
  - **Off:** a dim `rgba(255,255,255,.1)` strip on toggle keys.

**Segmented controls** (choices like Thermal / Mesh / Gradient):
- The control is a recessed well with 3px padding, radius 9px, and an inner shadow.
- Each option is a small key.
- The selected option uses the selected-key gradient plus `0 0 0 1px rgba(10,132,255,.5)` (a blue outline).

## 5. Layout

- **Top bar:** fixed in the page, not floating over content. App name on the left, then the tabs as a segmented control in a well, then status (a mono pill) and Refresh on the right.
- **Context bar under the top bar:** for the open game it shows ← All games, logos plus "PREP vs MHS", the date and time in mono, and the main action key on the right.
- **Content:** padding 16px (24px on wide screens). The grid gaps are 12–16px.
- **Preview grids:** large cards, `minmax(440–520px, 1fr)`. Secondary or situational items go in a compact row of chips instead of full cards. A card's actions appear only on hover or when it's selected.
- **Editor side panel:** opens to the right, sticky, 520–720px wide on big monitors.
- **Calendar and lists:** cards on `--panel2`. Today is outlined in green, and each sport gets a small coloured dot.

## 6. Tone rules (keep it from looking busy)

- One accent colour (macOS blue). Red, green and amber are only for status lights and badges.
- No background gradients or glows on the page itself. Glow only on lights and the primary key.
- Hide help paragraphs once the UI is self-explanatory. Use micro-labels instead of sentences.
- Badges: 10px mono, radius 4px, 1px coloured border at about 35% opacity, coloured text, and a very faint fill. For example, connected = green, "NO INPUT" = muted grey with no border.
- Light shadows on panels. Depth comes from the recessed wells and the top highlight on keys.
