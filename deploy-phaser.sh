#!/bin/bash
echo "📦 Preparing Phaser game for GitHub Pages..."

cd ~/.openclaw/workspace/project-x || exit 1

# Copy phaser folder to docs/ for GitHub Pages (most common simple setup)
mkdir -p docs
cp -r phaser/* docs/ 2>/dev/null || true

# Switch to gh-pages branch and push
git checkout -B gh-pages
git add -f docs/
git commit -m "Deploy Phaser game from OpenClaw $(date +%Y-%m-%d)" || echo "No changes"
git push -f origin gh-pages

echo "✅ Deploy complete!"
echo "Live link: https://pmagazzu.github.io/project-x"
