# Geo Learn

A mobile-friendly geography practice app: flags, capitals, maps, physical geography and trivia. Tap any country name to open its profile.

## Games

| Game | What you learn |
|---|---|
| **Daily Challenge** | 10 mixed questions, reset daily. Shareable score. |
| **Flags** | Flag to country and country to flag, for all 250 countries and territories. |
| **Capitals** | Capital to country and back, from Ouagadougou to Ngerulmud. |
| **Maps** | Name the highlighted country, tap a country on the globe, and learn who borders whom. |
| **Outlines** | Recognize countries by outline alone. |
| **Physical Geography** | 228 rivers, peaks, volcanoes, deserts, straits, lakes, islands and oddities, with photos and pin drops. |
| **Trivia** | 259 hand-written trivia-night facts plus currencies, languages, demonyms, web domains, dialing codes and regions. |
| **Area Comparison** | Endless streak game on land area. |
| **Mixed** | All of the above, mixed. |
| **Atlas** | Every country's flag, facts, map and Wikipedia photo, plus **Wander**, which drops you on a random real place on Earth. |
| **Progress** | A world map colored by how well you know each country. |
| **Badges** | 82 unlockable badges worth points, from first answers to full regional sweeps, plus 11 secret ones. |

## Question selection

Every question has a stable ID (for example `flag:BTN` or `fp:angel`). The picker serves unseen questions first; once a category is exhausted it brings back the ones you missed most. About 3,400 fixed questions ship with the app. Progress is stored in your browser's local storage.

After each answer you get a card with the flag, location, key facts and a Wikipedia summary. Country names throughout the app open a profile panel with the full Wikipedia introduction.

## Run it

It's a static site with no build step.

- **GitHub Pages:** Settings → Pages → Source: *Deploy from a branch* → `main` / `root`. It will be live at `https://grouteater.github.io/geo-learn/`.
- **Locally:** `python3 -m http.server` in this folder, then open http://localhost:8000.

## Data

- Countries, flags: [mledoze/countries](https://github.com/mledoze/countries) (ODbL)
- Borders and shapes: [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, public domain)
- Photos and summaries: Wikipedia REST API, fetched at runtime
- `data/features.json` and `data/trivia.json`: hand-written for this project. Add entries to extend the game; new IDs show up as unseen questions automatically.
