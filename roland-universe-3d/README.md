# Roland Oosthuizen — universe portfolio

Plain HTML, CSS and JS. No build step. Open `index.html` to view locally.

## Before you publish
1. Replace every `YOUR-USERNAME` placeholder in `index.html` (GitHub + LinkedIn + repo links).
2. Add your photo as `assets/roland.jpg` (portrait, about 4:5, under ~300 KB). The placeholder disappears automatically.
3. Read the About text (section "Home base") and the fun facts in `script.js`. They are drafted from your CV; edit them into your own voice.
4. Add real detail to the Orka cable derating / 3D layout cards.

## Deploy
GitHub repo -> Netlify (Add new site -> Import from Git, no build command, publish directory `.`). The contact form works automatically with Netlify Forms.

## Tips
- Visitors can press **Quick read** (top bar) for a plain one-page version; their choice is remembered. `?plain` in the URL also opens it.
- `design.md` documents the tokens and rules.

## 3D build (v3)
No build step needed to run the site. To change the scene: edit `src/scene.js`, then
`npm i three esbuild && npx esbuild src/scene.js --bundle --minify --format=iife --global-name=UniverseMod --outfile=assets/universe3d.js`.
