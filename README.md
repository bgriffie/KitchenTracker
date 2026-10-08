# Kitchen Log

High-protein recipes for the crockpot, air fryer, grill and stovetop, with today's plate, a protein target and a shopping list that builds itself. An offline home-screen web app in the PHOSPHOR theme.

Live: https://bgriffie.github.io/KitchenTracker/

Install on iPhone: open the link in Safari, tap Share, then Add to Home Screen.

`index.html` is built from `src/` with `python3 build.py`, which inlines `phosphor.css` and `phosphor.js` from the brand folder, the icon sprite (`src/icons.svg`), the recipes (`src/data.js`) and the app code (`src/app.js`). Add or edit recipes in `src/data.js`.
When anything changes, bump `CACHE` in `sw.js` and the version in the app header.
