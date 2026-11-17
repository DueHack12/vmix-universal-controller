#!/bin/bash
# Starts BOTH FPGT apps on a Mac for testing (no vMix needed):
#   - vMix Graphics Control (asks once where its folder is)    -> http://localhost:3000 (editor), :3001 (/api/game)
#   - vMix Universal Controller DEMO with a fake vMix            -> http://localhost:8791
# Put both app folders side by side, e.g.
#   ~/FPGT/vMix Universal Controller/
#   ~/FPGT/vMix Graphics Control/
# Close this window (or press Ctrl+C) to stop both.
cd "$(dirname "$0")"
UC="$(pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org and run this again."
  read -r -p "Press Return to close." _; exit 1
fi

# find the Graphics Control folder: remembered choice, else a folder next to this one, else ask once
GC=""
SAVED="$UC/.graphics-control-folder"
if [ -f "$SAVED" ]; then GC="$(cat "$SAVED")"; [ -f "$GC/package.json" ] || GC=""; fi
if [ -z "$GC" ]; then
  for d in "$UC"/../*; do
    [ -d "$d" ] && [ -f "$d/package.json" ] && [ "$(cd "$d" && pwd)" != "$UC" ] || continue
    case "$(basename "$d" | tr '[:upper:]' '[:lower:]')" in *graphics*) GC="$(cd "$d" && pwd)"; break;; esac
  done
fi
if [ -z "$GC" ]; then
  echo "Where is the vMix Graphics Control app folder (the one with server.js and package.json)?"
  echo "Drag that folder into this window and press Return (or just press Return to skip it):"
  read -r GC
  GC="${GC%"${GC##*[![:space:]]}"}"; GC="${GC#"${GC%%[![:space:]]*}"}"   # trim spaces
  GC="${GC#\'}"; GC="${GC%\'}"; GC="${GC#\"}"; GC="${GC%\"}"; GC="${GC//\\ / }"; GC="${GC%/}"
  if [ -n "$GC" ] && [ -f "$GC/package.json" ]; then echo "$GC" > "$SAVED"; echo "   Remembered. (Delete .graphics-control-folder to choose again.)"
  else [ -n "$GC" ] && echo "   No package.json there, skipping the Graphics Controller."; GC=""; fi
fi

GC_PID=""
if [ -n "$GC" ]; then
  echo "== vMix Graphics Control: $GC"
  if [ ! -d "$GC/node_modules" ]; then echo "   First run: installing its packages (one time)..."; (cd "$GC" && npm install) || exit 1; fi
  (cd "$GC" && npm start) &
  GC_PID=$!
  trap 'kill $GC_PID 2>/dev/null; pkill -P $GC_PID 2>/dev/null' EXIT INT TERM
  sleep 2; open "http://localhost:3000" 2>/dev/null
else
  echo "== vMix Graphics Control folder not found next to this one, so only vMix UC will start."
fi

echo "== vMix Universal Controller (demo, fake vMix)"
if [ -n "$GC" ]; then node scripts/demo.js --gc-dir "$GC"; else node scripts/demo.js; fi
