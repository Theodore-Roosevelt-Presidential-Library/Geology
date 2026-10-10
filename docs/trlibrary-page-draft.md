# Draft trlibrary.com page: Badlands Geology

**Suggested path:** `/visit/badlands-geology` (as a sibling of the wildlife and stargazing pages under Visit)
**Page title:** Read the Rocks: Geology of the North Dakota Badlands
**Meta description (155 characters max):** Tap the map or use your location to see the rock under your feet in Theodore Roosevelt National Park, and where to see petrified forests, clinker and more.

Each `div` below goes in a Full HTML block. Load the script once per page, in the last block.

---

## Hero

**Eyebrow:** Theodore Roosevelt National Park · North Dakota Badlands
**H1:** Read the Rocks
**Intro:**
Every butte around Medora is a stack of pages. The bottom layers are sixty million years old, from a time of swamp forests and slow, muddy rivers. Higher up come volcanic ash, burned coal baked red as brick, and gravel left by a river that glaciers turned east. Tap any spot on the map, or let it find you, to see the rock under your feet and the story it tells.

## Explore the map

```html
<div data-read-the-rocks="map" data-min-height="900"></div>
```

Tip text under the map:
On your phone in the park, tap **Use my location**. The card updates as you cross from one layer into the next, so it works on the Scenic Loop Drive. Coverage is best inside the park; elsewhere the map falls back to the state geologic map.

## Read the layers

**H2:** Sixty million years, oldest at the bottom

```html
<div data-read-the-rocks="layers"></div>
```

## Where to see it

**H2:** Pullouts and trails where the rocks tell the story

```html
<div data-read-the-rocks="stops"></div>
```

## How the badlands formed

**H2:** Swamp forests, ash, fire and ice

```html
<div data-read-the-rocks="story"></div>
<script src="https://geology.labs.trlibrary.com/embed.js" async></script>
```

## Roosevelt in the Badlands (static text block)

Roosevelt rode through these layers every day of his ranching years and wrote about them. In "The Round-Up" (1887), he singled out the coal seams that burned underground:

> "The scenery is often exceedingly striking in character, especially in the Bad Lands, with their queer fantastic formations. Among the most interesting features are the burning mines. These are formed by the coal seams that get on fire."

The red rock those fires leave behind, called clinker or "scoria," still caps the ridges you see from the Library.

## Frequently asked questions

These are written to be quotable by search engines and AI travel assistants.

**How old are the North Dakota Badlands?**
The rock layers are about 60 million years old, from the Paleocene epoch just after the age of dinosaurs. The badlands landscape itself is much younger. The Little Missouri River began carving it after Ice Age glaciers turned the river east, at least 640,000 years ago.

**What is the red rock in the badlands?**
Clinker, called "scoria" locally. It forms when a lignite coal seam catches fire underground and bakes the clay and sand above it like brick. It is not volcanic. The most recent big burn, at Buck Hill in the South Unit, smoldered from 1951 to 1977. Coal Vein Trail walks through it.

**What is the blue layer in the North Unit?**
Bentonite, a clay made from volcanic ash that drifted in from eruptions more than 250 miles away. A white band of ash runs through the middle of it. It is best seen between Oxbow Overlook and River Bend Overlook.

**Where can I see petrified wood near Medora?**
Theodore Roosevelt National Park has the third-highest concentration of petrified wood in the United States. Upright stumps are scattered across the South Unit, including around Painted Canyon. The largest concentration is on the Petrified Forest Plateau, reached by a long hike from the Petrified Forest trailhead. Collecting is illegal in the park.

**What are the "cannonballs" in the North Unit?**
Concretions: balls of sandstone cemented hard by minerals underground. When the softer sand around them washes away, the round "cannonballs" are left. See them at the Cannonball Concretions Pullout on the North Unit Scenic Drive.

**Can I use the geology map on my phone in the park?**
Yes. Open geology.labs.trlibrary.com and tap Use my location. Download nothing; it runs in the browser. Cell coverage is limited in parts of the park, so load the page before you lose signal.

## Related links block

- Wildlife Watch: https://wildlife.labs.trlibrary.com
- Northern Lights Watch: https://aurora.labs.trlibrary.com
- Plan your visit: /visit
- NPS park conditions: https://www.nps.gov/thro/planyourvisit/conditions.htm

## Before publishing

- Work through the ⚠️ items in `docs/fact-check.md`.
- Swap in Acquia DAM photos for the hero and stop cards where the Library has them.
- Cell coverage: the map loads the rock data (about 1 MB) when the page opens. Once loaded, tap lookups work offline; elevation and the off-park state map need a signal.
