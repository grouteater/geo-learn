# Geo Learn

A geography game suite built to keep showing you things you haven't seen yet. Open it on your phone, play for five minutes a day, and slowly fill in the whole map.

## Games

| Game | What you learn |
|---|---|
| **Daily Expedition** | Ten questions, one of each kind, on a new route every day. Shareable score. |
| **Flags** | Flag to country and country to flag, for all 250 countries and territories. |
| **Capitals** | Capital to country and back, from Ouagadougou to Ngerulmud. |
| **Globe Hunt** | Name the highlighted country, tap a country on the globe, and learn who borders whom. |
| **Silhouettes** | Recognize countries by outline alone. |
| **Wonders** | 228 rivers, peaks, volcanoes, deserts, straits, lakes, islands and oddities, with photos and pin drops. |
| **Deep Cuts** | 259 hand-written trivia-night facts plus currencies, languages, demonyms, web domains, dialing codes and regions. |
| **Bigger or Smaller** | Endless streak game on land area. |
| **Shuffle Everything** | All of the above, mixed. |
| **Atlas** | Every country's flag, facts, map and Wikipedia photo, plus **Wander**, which drops you on a random real place on Earth. |
| **Your map** | A world map colored by how well you know each country. |

## How "no repeats" works

Every question has a stable ID (for example `flag:BTN` or `fp:angel`). The picker always serves an ID you have never seen before. Only after you have seen every question of a type does it bring back your weakest ones. Over 3,400 fixed questions ship with the app, plus the endless Wander and Bigger or Smaller modes. Progress is stored in your browser's local storage.

After every answer you get a learn card: flag, location on a globe, key facts, and a photo and summary pulled live from Wikipedia.

## Run it

It's a static site with no build step.

- **GitHub Pages:** Settings → Pages → Source: *Deploy from a branch* → `main` / `root`. It will be live at `https://grouteater.github.io/geo-learn/`.
- **Locally:** `python3 -m http.server` in this folder, then open http://localhost:8000.

## Data

- Countries, flags: [mledoze/countries](https://github.com/mledoze/countries) (ODbL)
- Borders and shapes: [world-atlas](https://github.com/topojson/world-atlas) (Natural Earth, public domain)
- Photos and summaries: Wikipedia REST API, fetched at runtime
- `data/features.json` and `data/trivia.json`: hand-written for this project. Add entries to extend the game; new IDs show up as unseen questions automatically.
