# personal-site

Words in a night sky. Under them a bear walks through mist with her cubs, beneath evergreens too tall for the screen. A name, then words; no explanation. Each word is a link.

The picture is generated in the browser and made entirely of characters: the bears are simulated, drawn as light into a tiny buffer, and that light is turned into shaded text. Each visit gets a different stretch of land, a different moon, a litter of two or three, and a different pair of colours.

## Run

No build step and no dependencies. Serve the folder with any static file server:

```bash
npm start
```

Then open http://localhost:4178. (Opening `index.html` straight from disk will not work: browsers refuse to load JavaScript modules from `file://`.)

Add `?ground=0` … `?ground=6` to the address to hold one colour pair while you look at it.

## Change the words

The name is the first thing in `<main>` in `index.html`, as plain text. After it the words are plain links, one line per word:

```html
<a href="https://example.com/thing">thing</a>
```

They lay out as one loose centred line in the sky and wrap on narrow screens. The picture clears itself around every word automatically.

There are no words yet besides the name. (A link to tangent was removed for now; add it back as a line like the one above once tangent is online.)

The tab title is the name too.

## Change the colours

`js/ground.js` holds a short list of ground/ink pairs and picks one per visit. Edit, add or remove pairs there; leave a single pair to pin one look. Keep the contrast between the two colours at 4.5:1 or better so the words stay readable.

## Test

```bash
npm test
```

Uses Node's built-in test runner (Node 20+). Covers the walk (same seed gives the same walk; ten simulated minutes without anything going non-finite or a cub being lost; planted feet do not slide; the mother waits for a cub left behind and then walks on; a cub stops to look at the pointer; tiny and extreme screen sizes) and the choice of character for a cell (empty, cleared by a word, top-heavy, bottom-heavy, full brightness).

## Deploy

Live at https://chrcha1.github.io/personal-site/ (GitHub Pages).

Deploys come from the pipeline, not from a laptop: every push to `main` runs the tests and, if they pass, publishes `index.html`, `style.css`, `js/` (see `.github/workflows/deploy.yml`). A failing test stops the deploy. To publish by hand, run the "Test and deploy" workflow from the repository's Actions tab.

The site is static, with nothing to configure and no secrets, so it can move to any other static host by publishing the same files.

## How it is put together

```
index.html      the words
style.css       two colours, one typeface, the grid
js/
  ground.js     picks the colour pair before first paint
  main.js       sizes the character grid, runs the loop, clears the sky around words
  horizon.js    the bears, their gaits and moods, and the land they cross; draws light
  ascii.js      light -> characters, with a pre-rendered sprite per character and shade
  rng.js        seeded random numbers and a per-cell hash
tests/
```

What happens on the horizon:

- The mother walks at a steady amble and the camera walks with her, so the forest scrolls past: grass, stones, boulders, mist, and two depths of evergreens so tall that only their trunks and lower boughs are ever in view.
- Cubs follow at their own distance. Every so often one stops to sniff at something or look up, falls behind, then bounds to catch up.
- If a cub falls far behind, the mother stops, lifts her head and turns to look until it is back.
- A cub that finds the pointer near it stops and turns to look at you. The mother raises her head.
- Which way they are heading, the moon's phase and the litter size change per visit.

Things worth knowing before changing the art:

- A bear is a drawn profile (trunk, neck and head as one outline in `ADULT` / `CUB`) on four two-jointed legs. The gait advances with distance covered, which is what keeps a planted foot from sliding.
- The bears are made of characters and nothing else: no lines inside them and no edges round the legs. Shape comes from tone alone: moonlight in the fur along the back, a coat that darkens towards the belly and legs, and far-side legs a shade dimmer than the near ones.
- The edge of every bear is fur: hundreds of small tufts, each with a fixed length so the coat does not shimmer.
- The trees are deliberately faint. Their boughs are strands of hanging needles, not filled shapes, so the sky shows through.
- Every cell is sampled 2 x 3 times. The mean picks the character and its shade; the balance between top and bottom picks the faintest marks, so a thin line through the top of a cell is `'` and through the bottom is `.`.
- The order of the density ramp is measured from the typeface on the device, not assumed.
- The brightest cells flip to a solid tile with a dark character, which is where the extra tonal range comes from.
- The characters are small (6 x 9 px, 5 x 7.5 px on phones) on purpose: a bear needs about fifty of them nose to tail to read as a bear.

## Behaviour

- **Reduced motion.** With the system setting on, the page shows one still frame and does not animate or react to the pointer.
- **Hidden tab.** The loop stops while the tab is in the background.
- **No JavaScript.** The words still show, on a plain ground.

## Not set up yet

- **Crash reporting.** The page has no backend and makes no requests, so nothing is reported anywhere. If that matters once it is live, add a reporter and loosen `connect-src` in the Content-Security-Policy to its host.
