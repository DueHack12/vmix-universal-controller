# vMix Universal Controller (vMix UC): notes for Claude

One-operator console for Fairfield Prep (FPGT) sports broadcasts. Node ≥22 with zero dependencies, and it runs on the vMix PC. User docs are in `README.md`; Windows setup steps are in `SETUP.txt`.

## Before every task: check the shared integration file
vMix UC works alongside the **vMix Graphics Controller**, which has its own repo and its own chat. The agreement between the two apps lives on the Drive, and the Drive copy wins:

- Drive: `Prep Sports Broadcasting/vMix Universal Controller/FPGT Shared/INTEGRATION.md` (and `DESIGN.md`, the shared look)
  - Mac: `~/Library/CloudStorage/GoogleDrive-<account>/Shared drives/Prep Sports Broadcasting/vMix Universal Controller/FPGT Shared/`
  - vMix PC: `G:\Shared drives\Prep Sports Broadcasting\vMix Universal Controller\FPGT Shared\`
  - Cloud chat: Google Drive connector, folder id `1BPgUUdfwgxy5mAW6lvX1xsUBh1Y5AbXo` (INTEGRATION.md `1RTxYwtD-NDbuanRIADS8I4cdI4T5SB9P`, DESIGN.md `1gT-mZlhwKeWAao6qubrgz75FKlL_ZdFI`). If a newer "INTEGRATION (proposed by …).md" sits next to it, merge it.

Follow the rules at the top of that file:
1. At the start of a task, read it. If it's newer than `./INTEGRATION.md`, copy it in and make vMix UC match.
2. If you change anything shared, update the Drive copy (bump the version, add a changelog line) and the repo copy, then tell the user.
3. If you can't write the Drive copy, save `INTEGRATION (proposed by vMix UC).md` next to it, or give the file to the user.

## Hard rules from the user
- **Never move, rename or delete anything on the shared Google Drive.** Only copy in. A replaced file goes to `_Archive`.
- **Never get around bot protection** (MaxPreps, CIAC rankings). That data comes from the Graphics Controller.
- The look follows `DESIGN.md` (FPGT suite): charcoal, macOS-blue accent, and status lights only for red/green/amber.
- Keep the layout and features when restyling. Companion OSC paths (`/console/...`) stay as they are, because existing Stream Deck buttons use them.

## Layout of the code
- `server.js` serves HTTP, SSE and `/api/cmd`. OSC is on UDP 9600.
- `src/engine.js` loads the features in `src/features/*.js`. `gc.js` is the Graphics Controller link and `ose.js` is OpenStatsEngine.
- `public/` holds the pages: start, control (vertical/horizontal), master, remote and login.
- Tests: `npm test`, using the fakes in `test/mock-vmix.js`, `mock-ose.js` and `mock-gc.js`.
- Demo without vMix: `npm run demo`, `Try Demo (Mac).command`, or `Start FPGT (Mac).command` (both apps).
