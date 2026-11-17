#!/bin/bash
# vMix Universal Controller DEMO for Mac (no vMix needed).
# Starts a fake vMix + fake OpenStatsEngine and opens the control page.
# Close this window (or press Ctrl+C) to stop it.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org and run this again."
  read -r -p "Press Return to close." _; exit 1
fi
node scripts/demo.js
