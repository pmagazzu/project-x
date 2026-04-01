#!/bin/bash
# Stream Deck: build + commit + push project-x to GitHub Pages
set -e
cd /Users/pmagazzu/openclaw/workspace/project-x/phaser
npm run build
cd /Users/pmagazzu/openclaw/workspace/project-x
git add -A
git commit -m "build: $(date '+%Y-%m-%d %H:%M')" 2>/dev/null || echo "Nothing new to commit"
git push
echo "Done!"
