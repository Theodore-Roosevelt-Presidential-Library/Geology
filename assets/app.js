/* Read the Rocks — Theodore Roosevelt Presidential Library Labs
 * Geology explorer for Theodore Roosevelt National Park and the North Dakota Badlands.
 */
(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const EMBED = params.get("embed") === "1";
  const SINGLE = EMBED && params.get("view");
  const FRAME_ID = params.get("id");
  const CANONICAL = "https://geology.labs.trlibrary.com/";
  const VIEWS = ["map", "layers", "stops", "story"];
  const MEDORA = [46.9139, -103.5243];

  let UNITS = {}, QUOTES = {}, REGIONAL = {}, GROUPS = [], STOPS = [];
  let map, geoLayer, bedsLayer, erraticsLayer, stopsLayer, coverageLayer, regionalLayer, slidesLayer, bases = {};
  const SLIDE_SVC = "https://ndgishub.nd.gov/arcgis/rest/services/All_Geology/MapServer";
  const SLIDE_STYLE = JSON.stringify([{ id: 4, source: { type: "mapLayer", mapLayerId: 4 }, drawingInfo: { renderer: { type: "simple",
    symbol: { type: "esriSFS", style: "esriSFSBackwardDiagonal", color: [110, 79, 122, 255], outline: { type: "esriSLS", style: "esriSLSSolid", color: [110, 79, 122, 255], width: 1 } } } } }]);
  const slideCache = new Map();
  // Is this point inside a landslide mapped by the state? Returns {year} or null; undefined if the lookup failed.
  function slideAt(lat, lng) {
    const k = lat.toFixed(5) + "," + lng.toFixed(5);
    if (slideCache.has(k)) return slideCache.get(k);
    const q = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: "esriGeometryPoint", inSR: 4326, spatialRel: "esriSpatialRelIntersects", outFields: "Year", returnGeometry: "false", f: "json" });
    const p = fetch(`${SLIDE_SVC}/4/query?${q}`).then((r) => r.json())
      .then((d) => (d.features && d.features.length ? { year: d.features[0].attributes.Year } : null))
      .catch(() => undefined);
    slideCache.set(k, p);
    return p;
  }
  function slideFact(lat, lng, metaId) {
    if (!slidesLayer || !map.hasLayer(slidesLayer)) return;
    slideAt(lat, lng).then((s) => {
      const box = document.getElementById(metaId)?.closest(".info-meta");
      if (!box || s === undefined) return;
      const d = document.createElement("div"); d.className = "fact";
      d.innerHTML = s
        ? `<b>Landslide</b><span>Inside a landslide mapped by the North Dakota Geological Survey${s.year ? ` (mapped ${s.year})` : ""}. Expect tilted, broken ground; stay off steep, fresh slopes.</span>`
        : `<b>Landslide</b><span>No mapped landslide at this spot.</span>`;
      box.insertBefore(d, box.querySelector(".info-actions"));
      postHeight();
    });
  }
  let features = [];          // unit polygons with bbox for point-in-polygon
  let highlight = null;       // unit symbol currently highlighted
  let tapMarker = null, youMarker = null, youCircle = null, watchId = null, lastYouUnit = undefined, firstFix = true;
  let geoOpacity = 0.7;
  let mapReady = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------- data helpers ---------------- */
  function U(sym) {
    const u = UNITS[sym];
    if (!u) return null;
    if (u.same) return Object.assign({}, UNITS[u.same], u, { sym });
    return Object.assign({ sym }, u);
  }
  function darker(hex, f = 0.72) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  const fmtFt = (m) => Math.round(m * 3.28084).toLocaleString() + " ft";
  const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(5)}° ${lng >= 0 ? "E" : "W"}`;
  function milesBetween(a, b) {
    const R = 3958.8, toR = Math.PI / 180;
    const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* ---------------- point in polygon ---------------- */
  function bboxOf(geom) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    for (const p of polys) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, y0, x1, y1];
  }
  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function inGeom(x, y, geom) {
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    for (const p of polys) {
      if (!inRing(x, y, p[0])) continue;
      let hole = false;
      for (let k = 1; k < p.length; k++) if (inRing(x, y, p[k])) { hole = true; break; }
      if (!hole) return true;
    }
    return false;
  }
  function unitAt(lat, lng) {
    for (const f of features) {
      const b = f.bbox;
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      if (inGeom(lng, lat, f.geometry)) return f.properties.u;
    }
    return null;
  }

  /* ---------------- Macrostrat (outside the park map + elevation) ---------------- */
  const msCache = new Map();
  function macrostrat(lat, lng) {
    const key = lat.toFixed(4) + "," + lng.toFixed(4);
    if (msCache.has(key)) return msCache.get(key);
    const url = `https://macrostrat.org/api/v2/mobile/map_query_v2?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}&z=11`;
    const p = fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => {
      const d = j && j.success && j.success.data;
      if (!d) return null;
      const m = (d.mapData || [])[0] || null;
      return { elevation: typeof d.elevation === "number" ? d.elevation : null, unit: m };
    }).catch(() => null);
    msCache.set(key, p);
    return p;
  }
  function regionalMatch(name) {
    if (!name) return null;
    for (const k of Object.keys(REGIONAL)) {
      if (k.startsWith("_")) continue;
      if (name.toLowerCase().includes(k.toLowerCase())) return REGIONAL[k];
    }
    return null;
  }

  /* ---------------- views ---------------- */
  function show(view, push = true) {
    if (!VIEWS.includes(view)) view = "map";
    $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === view)));
    $$("section.panel").forEach((p) => (p.hidden = p.dataset.panel !== view));
    if (push && !EMBED) history.replaceState(null, "", location.pathname + location.search + "#" + view);
    if (view === "map") initMap().then(() => map.invalidateSize());
    postHeight();
  }

  /* ---------------- map ---------------- */
  function initMap() {
    if (mapReady) return mapReady;
    mapReady = (async () => {
      map = L.map("map", { preferCanvas: true, zoomControl: true, minZoom: 6, maxZoom: 17, scrollWheelZoom: !EMBED, tap: true })
        .setView([47.25, -103.45], 9);
      const usgs = (svc) => L.tileLayer(`https://basemap.nationalmap.gov/arcgis/rest/services/${svc}/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 17, maxNativeZoom: 16,
        attribution: 'Base map: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS The National Map</a>',
      });
      bases = { topo: usgs("USGSTopo"), relief: usgs("USGSShadedReliefOnly"), imagery: usgs("USGSImageryTopo") };
      bases.topo.addTo(map);

      map.createPane("regional"); map.getPane("regional").style.zIndex = 300;
      regionalLayer = L.tileLayer("https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png", {
        pane: "regional", opacity: 0.45, maxZoom: 17, maxNativeZoom: 14,
        attribution: 'Regional bedrock: <a href="https://macrostrat.org/">Macrostrat</a> (CC BY 4.0)',
      });

      // Statewide landslide inventory (NDGS, 2016 to 2023), drawn by the state's map server in our own colors.
      map.createPane("slides"); map.getPane("slides").style.zIndex = 410; map.getPane("slides").style.pointerEvents = "none";
      const SlideTiles = L.TileLayer.extend({
        getTileUrl(c) {
          const R = 6378137 * Math.PI, span = (2 * R) / Math.pow(2, c.z);
          const x0 = -R + c.x * span, y1 = R - c.y * span;
          const q = new URLSearchParams({
            bbox: [x0, y1 - span, x0 + span, y1].join(","), bboxSR: 3857, imageSR: 3857, size: "512,512", dpi: 192,
            dynamicLayers: SLIDE_STYLE, transparent: "true", format: "png32", f: "image",
          });
          return `${SLIDE_SVC}/export?${q}`;
        },
      });
      slidesLayer = new SlideTiles("", {
        pane: "slides", tileSize: 256, minZoom: 9, maxZoom: 17, opacity: 0.9,
        attribution: 'Landslides: <a href="https://www.dmr.nd.gov/ndgs/">North Dakota Geological Survey</a>',
      });

      const [topo, cov] = await Promise.all([
        fetch("data/geology.topo.json").then((r) => r.json()),
        fetch("data/coverage.geojson").then((r) => r.json()),
      ]);
      const units = topojson.feature(topo, topo.objects.units);
      features = units.features.filter((f) => f.geometry).map((f) => Object.assign(f, { bbox: bboxOf(f.geometry) }));
      // Small features first, so a click inside a little polygon finds it before a larger neighbor.
      features.sort((a, b) => (a.bbox[2] - a.bbox[0]) * (a.bbox[3] - a.bbox[1]) - (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]));

      const renderer = L.canvas({ padding: 0.4, tolerance: 0 });
      geoLayer = L.geoJSON(units, { renderer, interactive: false, style: styleUnit }).addTo(map);

      const beds = topojson.feature(topo, topo.objects.beds);
      bedsLayer = L.geoJSON(beds, {
        renderer, interactive: false,
        style: (f) => ({ color: f.properties.u === "Tsbb" ? "#4f6984" : "#c2911a", weight: 2.4, opacity: 0.95 }),
      }).addTo(map);

      const err = topojson.feature(topo, topo.objects.erratics);
      erraticsLayer = L.layerGroup(err.features.map((f) => {
        const c = L.geoJSON(f).getBounds().getCenter();
        return L.marker(c, { icon: L.divIcon({ className: "", html: '<div class="erratic"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }), keyboard: false })
          .on("click", (e) => { L.DomEvent.stop(e); openAt(c.lat, c.lng, { mode: "tap", forceUnit: "Qg" }); });
      })).addTo(map);

      coverageLayer = L.geoJSON(cov, { renderer, interactive: false, style: { color: "#163728", weight: 1.5, dashArray: "6 5", fill: false, opacity: 0.7 } }).addTo(map);
      if (!params.get("at") && !params.get("stop")) map.fitBounds([[46.88, -103.6], [47.06, -103.35]]);

      stopsLayer = L.layerGroup(STOPS.map((s) => L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: "", html: `<div class="stop-pin ${s.id === "library" ? "start" : ""}"></div>`, iconSize: [24, 24], iconAnchor: [12, 24] }),
        title: s.name, riseOnHover: true,
      }).on("click", (e) => { L.DomEvent.stop(e); openStop(s.id, false); }))).addTo(map);

      const LocateCtl = L.Control.extend({
        options: { position: "topleft" },
        onAdd() {
          const b = L.DomUtil.create("button", "map-locate");
          b.type = "button"; b.title = "Use my location"; b.setAttribute("aria-label", "Use my location"); b.setAttribute("data-locate", "");
          b.innerHTML = '<span class="dot"></span>';
          L.DomEvent.disableClickPropagation(b);
          L.DomEvent.on(b, "click", (e) => { L.DomEvent.stop(e); locate(); });
          return b;
        },
      });
      new LocateCtl().addTo(map);
      map.on("click", (e) => openAt(e.latlng.lat, e.latlng.lng, { mode: "tap" }));
      map.on("zoomend", () => geoLayer.setStyle(styleUnit));
      map.once("click", () => $("#map-hint").classList.add("gone"));
      setTimeout(() => $("#map-hint").classList.add("gone"), 6000);
      $("#map-loading").hidden = true;
      bindMapControls();
      return map;
    })();
    return mapReady;
  }

  const FAMILY = { Qf1: "Qf", Qf2: "Qf" };
  const fam = (sym) => FAMILY[sym] || (UNITS[sym] && UNITS[sym].same) || sym;
  function styleUnit(f) {
    const u = U(f.properties.u) || { color: "#cccccc" };
    const dim = highlight && fam(f.properties.u) !== fam(highlight);
    const z = map ? map.getZoom() : 10;
    return {
      fillColor: u.color, fillOpacity: dim ? 0.06 : geoOpacity,
      color: darker(u.color, 0.6), weight: z >= 13 ? 0.6 : 0.25, opacity: dim ? 0.08 : (z >= 12 ? 0.6 : 0.35),
      dashArray: u.pattern === "hatch" && z >= 13 ? "3 3" : null,
    };
  }

  function bindMapControls() {
    const toggle = (id, layer) => $(id).addEventListener("change", (e) => (e.target.checked ? layer.addTo(map) : map.removeLayer(layer)));
    toggle("#lyr-geo", geoLayer);
    toggle("#lyr-beds", bedsLayer);
    toggle("#lyr-erratics", erraticsLayer);
    toggle("#lyr-stops", stopsLayer);
    toggle("#lyr-regional", regionalLayer);
    toggle("#lyr-slides", slidesLayer);
    $("#lyr-slides").addEventListener("change", (e) => {
      if (e.target.checked && map.getZoom() < 9) map.setZoom(10);
    });
    $("#geo-opacity").addEventListener("input", (e) => { geoOpacity = e.target.value / 100; geoLayer.setStyle(styleUnit); });
    $$("#basemaps .chip").forEach((b) => b.addEventListener("click", () => {
      Object.values(bases).forEach((l) => map.removeLayer(l));
      bases[b.dataset.base].addTo(map);
      $$("#basemaps .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));
  }

  const JUMPS = [
    { label: "Whole park", b: [[46.86, -103.75], [47.66, -103.2]] },
    { label: "South Unit", b: [[46.88, -103.6], [47.06, -103.35]] },
    { label: "Medora", c: [46.917, -103.535], z: 14 },
    { label: "North Unit", b: [[47.55, -103.48], [47.64, -103.24]] },
    { label: "Elkhorn Ranch", c: [47.2528, -103.6241], z: 13 },
  ];
  function buildJumps() {
    const el = $("#jump");
    el.innerHTML = JUMPS.map((j, i) => `<button class="chip" data-j="${i}">${esc(j.label)}</button>`).join("");
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const j = JUMPS[+b.dataset.j];
      initMap().then(() => (j.b ? map.flyToBounds(j.b, { duration: 0.8 }) : map.flyTo(j.c, j.z, { duration: 0.8 })));
    });
  }

  /* ---------------- legend ---------------- */
  function buildLegend() {
    const order = ["Qal", "Qoal", "Qf", "Qmp", "Qls", "Qt1", "QTa", "Qg", "Tsby", "Tsbb", "Tsb", "Tsbck", "Tsbc", "Tbc"];
    const html = GROUPS.map((g) => {
      const items = order.filter((s) => U(s) && U(s).group === g.id).map((s) => {
        const u = U(s);
        const label = s === "Qt1" ? "Ice Age river terraces" : u.name;
        return `<button data-sym="${s}" aria-pressed="false"><i class="${u.pattern === "hatch" ? "hatch" : ""}" style="background:${u.color}"></i><span>${esc(label)}<small>${esc(u.short)}</small></span></button>`;
      }).join("");
      return `<h5>${esc(g.name)} · ${esc(g.age)}</h5>${items}`;
    }).join("");
    $("#legend").innerHTML = html;
    $("#legend").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const sym = b.dataset.sym;
      setHighlight(highlight === sym ? null : sym);
      if (highlight) renderUnitOnly(sym);
    });
  }
  function setHighlight(sym) {
    highlight = sym;
    $$("#legend button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sym === sym)));
    if (geoLayer) geoLayer.setStyle(styleUnit);
  }

  /* ---------------- info card ---------------- */
  function quoteHtml(id) {
    const q = QUOTES[id]; if (!q) return "";
    const cite = q.url ? `<a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.cite)}</a>` : esc(q.cite);
    return `<blockquote class="quote"><b>Roosevelt in the Badlands</b>"${esc(q.text)}"<cite>${cite}</cite></blockquote>`;
  }
  function unitBody(u) {
    return `
      <span class="pill">${esc(u.age)}</span>${u.tip ? `<span class="pill warn">${esc(u.tip)}</span>` : ""}
      <p class="lead">${esc(u.short)}</p>
      <p>${esc(u.story)}</p>
      ${u.look ? `<p><b class="ui" style="font-size:14px">Look for:</b> ${esc(u.look)}</p>` : ""}
      ${u.tr ? quoteHtml(u.tr) : ""}`;
  }
  function showCard(html, color, hatch) {
    const el = $("#info");
    el.innerHTML = `<div class="info-band ${hatch ? "hatch" : ""}" style="background-color:${color || "var(--sand)"}"></div>${html}`;
    el.hidden = false;
    $(".info-close", el)?.addEventListener("click", () => { el.hidden = true; if (tapMarker) { map.removeLayer(tapMarker); tapMarker = null; } postHeight(); });
    $$("[data-share]", el).forEach((b) => b.addEventListener("click", () => share(+b.dataset.lat, +b.dataset.lng)));
    $$("[data-zoom]", el).forEach((b) => b.addEventListener("click", () => map.flyTo([+b.dataset.lat, +b.dataset.lng], Math.max(map.getZoom(), 14))));
    $$("[data-highlight]", el).forEach((b) => b.addEventListener("click", () => setHighlight(b.dataset.highlight)));
    el.scrollTop = 0;
    if (window.matchMedia("(max-width: 860px)").matches) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    postHeight();
  }
  function renderUnitOnly(sym) {
    const u = U(sym);
    showCard(`<div class="info-body"><div>
        <button class="info-close" aria-label="Close">×</button>
        <div class="eyebrow">Rock layer</div><h3>${esc(u.name)}</h3><div class="formal">${esc(u.formal)}</div>
        ${unitBody(u)}</div>
      <div class="info-meta"><div class="fact"><b>On the map</b><span>Highlighted in the map above. Tap the legend item again to clear.</span></div></div></div>`, u.color, u.pattern === "hatch");
  }

  function actionsHtml(lat, lng, sym) {
    return `<div class="info-actions">
      <button class="btn small" data-share data-lat="${lat}" data-lng="${lng}">Share this spot</button>
      <a class="btn small line" href="https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lng.toFixed(5)}" target="_blank" rel="noopener">Directions</a>
      <button class="btn small line" data-zoom data-lat="${lat}" data-lng="${lng}">Zoom in</button>
      ${sym ? `<button class="btn small line" data-highlight="${sym}">Show all of this layer</button>` : ""}
    </div>`;
  }

  async function openAt(lat, lng, opts = {}) {
    await initMap();
    const mode = opts.mode || "tap";
    const sym = opts.forceUnit || unitAt(lat, lng);
    if (mode === "tap") {
      if (tapMarker) tapMarker.setLatLng([lat, lng]);
      else tapMarker = L.marker([lat, lng], { icon: L.divIcon({ className: "", html: '<div class="tap"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false }).addTo(map);
    }
    const eyebrow = mode === "you" ? "Under your feet" : "Under this spot";
    const metaId = "m" + Math.random().toString(36).slice(2, 8);
    const meta = `<div class="info-meta">
        <div class="fact"><b>Location</b><span>${fmtLL(lat, lng)}</span></div>
        <div class="fact"><b>Elevation</b><span id="${metaId}">Looking up…</span></div>
        ${actionsHtml(lat, lng, sym)}
      </div>`;
    if (sym) {
      const u = U(sym);
      showCard(`<div class="info-body"><div>
          <button class="info-close" aria-label="Close">×</button>
          <div class="eyebrow">${eyebrow}</div><h3>${esc(u.name)}</h3><div class="formal">${esc(u.formal)} · NPS geologic map</div>
          ${unitBody(u)}</div>${meta}</div>`, u.color, u.pattern === "hatch");
      if (!opts.silent) setUrl(lat, lng);
      macrostrat(lat, lng).then((r) => { const el = document.getElementById(metaId); if (el) el.textContent = r && r.elevation != null ? fmtFt(r.elevation) : "Not available"; });
      slideFact(lat, lng, metaId);
      return sym;
    }
    // Outside the detailed park map
    const miles = milesBetween([lat, lng], MEDORA);
    showCard(`<div class="info-body"><div>
        <button class="info-close" aria-label="Close">×</button>
        <div class="eyebrow">${eyebrow}</div><h3 id="${metaId}-h">Checking the state map…</h3>
        <div class="formal">Outside the detailed park map${miles >= 1.5 ? ` · ${Math.round(miles).toLocaleString()} miles from Medora` : ""}</div>
        <div id="${metaId}-b"><p class="small">Asking the regional bedrock map what lies here.</p></div></div>${meta}</div>`, "var(--sand)");
    if (!opts.silent) setUrl(lat, lng);
    slideFact(lat, lng, metaId);
    const r = await macrostrat(lat, lng);
    const h = document.getElementById(metaId + "-h"), b = document.getElementById(metaId + "-b"), el = document.getElementById(metaId);
    if (el) el.textContent = r && r.elevation != null ? fmtFt(r.elevation) : "Not available";
    if (!h || !b) return null;
    const m = r && r.unit;
    if (!m) { h.textContent = "No geologic data here"; b.innerHTML = `<p>The regional map doesn't cover this spot. Try a point on land in the United States.</p>`; return null; }
    const match = regionalMatch(m.strat_name || m.name);
    const ours = typeof match === "string" ? U(match) : null;
    const extra = match && typeof match === "object" ? match : null;
    h.textContent = ours ? ours.name : (extra ? extra.name : (m.name || "Unnamed unit"));
    b.innerHTML = ours
      ? `<p class="small">From the state geologic map. Inside the park the same layer is mapped in detail.</p>${unitBody(ours)}`
      : `${m.age ? `<span class="pill">${esc(m.age)}</span>` : ""}
         ${extra ? `<p class="lead">${esc(extra.short)}</p><p>${esc(extra.story)}</p>` : ""}
         ${m.descrip ? `<p><b class="ui" style="font-size:14px">Map description:</b> ${esc(m.descrip)}</p>` : ""}
         ${m.lith ? `<p class="small">Rock types: ${esc(String(m.lith).replace(/[{}]/g, ""))}</p>` : ""}
         <p class="small">From the USGS State Geologic Map Compilation via Macrostrat. Regional maps are less detailed than the park map.</p>`;
    if (ours && $("#info .info-band")) $("#info .info-band").style.background = ours.color;
    postHeight();
    return "regional:" + (m.name || "");
  }

  function openStop(id, fly = true) {
    const s = STOPS.find((x) => x.id === id); if (!s) return;
    show("map", false);
    initMap().then(() => {
      if (fly) map.flyTo([s.lat, s.lng], 14, { duration: 0.8 });
      const unitsRow = s.units.map((sym) => { const u = U(sym); return u ? `<span><i style="background:${u.color}"></i>${esc(u.name)}</span>` : ""; }).join("");
      const sym = unitAt(s.lat, s.lng);
      showCard(`<div class="info-body"><div>
          <button class="info-close" aria-label="Close">×</button>
          <div class="eyebrow">${esc(areaName(s.area))}</div><h3>${esc(s.name)}</h3>
          <p class="lead">${esc(s.see)}</p><p>${esc(s.story)}</p>
          <div class="stop"><div class="units-row">${unitsRow}</div></div>
          ${s.note ? `<p class="small">${esc(s.note)}</p>` : ""}
          ${s.tr ? quoteHtml(s.tr) : ""}</div>
        <div class="info-meta">
          ${sym ? `<div class="fact"><b>Under the pin</b><span>${esc(U(sym).name)}</span></div>` : ""}
          <div class="fact"><b>Location</b><span>${fmtLL(s.lat, s.lng)}</span></div>
          ${actionsHtml(s.lat, s.lng, null)}
        </div></div>`, "var(--orange)");
      setUrl(null, null, s.id);
    });
  }
  const areaName = (a) => ({ south: "South Unit", north: "North Unit", elkhorn: "Elkhorn Ranch Unit" }[a] || "");

  /* ---------------- share + url ---------------- */
  function setUrl(lat, lng, stop) {
    if (EMBED) return;
    const p = new URLSearchParams();
    if (stop) p.set("stop", stop);
    else if (lat != null) p.set("at", lat.toFixed(5) + "," + lng.toFixed(5));
    if (map && lat != null) p.set("z", map.getZoom());
    history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : "") + "#map");
  }
  function shareUrl(lat, lng) {
    const z = map ? Math.max(map.getZoom(), 13) : 14;
    return `${CANONICAL}?at=${lat.toFixed(5)},${lng.toFixed(5)}&z=${z}#map`;
  }
  async function share(lat, lng) {
    const url = shareUrl(lat, lng);
    const sym = unitAt(lat, lng);
    const title = sym ? `${U(sym).name} — Read the Rocks` : "Read the Rocks — North Dakota Badlands geology";
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title, url }); return; } catch (e) { if (e && e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); toast("Link copied"); }
    catch (e) { window.prompt("Copy this link:", url); }
  }
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  /* ---------------- my location ---------------- */
  function setLocateUi(on, status) {
    $$("[data-locate]").forEach((b) => b.classList.toggle("on", on));
    $$("[data-locate-label]").forEach((s) => (s.textContent = on ? "Stop following my location" : "Use my location"));
    if (status != null) $("#locate-status").textContent = status;
  }
  function stopLocate() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null; firstFix = true; lastYouUnit = undefined;
    setLocateUi(false, "");
    if (driveOn) stopDrive();
  }
  function locate() {
    if (watchId != null) return stopLocate();
    show("map");
    if (!("geolocation" in navigator)) { setLocateUi(false, "This browser can't share its location."); return; }
    setLocateUi(true, "Finding you…");
    if (!EMBED) $("#map-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    if (EMBED && window.parent !== window) window.parent.postMessage({ type: "read-the-rocks:scrolltop", id: FRAME_ID }, "*");
    initMap().then(() => {
      watchId = navigator.geolocation.watchPosition(onFix, onFixError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    });
  }
  async function onFix(pos) {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    const ll = [lat, lng];
    if (!youMarker) {
      youMarker = L.marker(ll, { icon: L.divIcon({ className: "", html: '<div class="you"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 1000 }).addTo(map);
      youCircle = L.circle(ll, { radius: accuracy, color: "#2b8cff", weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
    } else { youMarker.setLatLng(ll); youCircle.setLatLng(ll).setRadius(accuracy); }
    const acc = !accuracy ? "" : accuracy > 1000 ? ` (within about ${(accuracy / 1609).toFixed(1)} miles)` : ` (within about ${Math.max(10, Math.round(accuracy * 3.28))} ft)`;
    if (firstFix) {
      firstFix = false;
      map.flyTo(ll, Math.max(map.getZoom(), accuracy < 300 ? 15 : 13), { duration: 0.8 });
    }
    driveTick(lat, lng);
    const sym = unitAt(lat, lng);
    const key = sym || "out";
    $("#locate-status").textContent = `Following you${acc}. The card updates when you cross into a new layer.`;
    if (driveOn) { lastYouUnit = key; $("#locate-status").textContent = "Drive-along is on. Keep this page open."; map.setView(ll, Math.max(map.getZoom(), 13), { animate: true }); return; }
    if (key !== lastYouUnit || key === "out" && lastYouUnit === undefined) {
      lastYouUnit = key;
      await openAt(lat, lng, { mode: "you", silent: true });
    }
  }
  function onFixError(err) {
    const inFrame = EMBED && window.parent !== window;
    if (err.code !== 1 && watchId != null) {
      // Timeouts and lost signal are normal in the badlands. Keep the watch running.
      $("#locate-status").textContent = "Waiting for a GPS signal… keep the page open.";
      return;
    }
    const msg = err.code === 1
      ? (inFrame ? "Location is blocked in this window. Open Read the Rocks in its own tab to use your location." : "Location permission was turned off. Allow location for this site in your browser settings, then try again.")
      : "Couldn't get a location fix. Try again in the open, away from tall walls.";
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null; firstFix = true;
    setLocateUi(false, msg);
    if (driveOn) stopDrive();
    if (inFrame && err.code === 1) $("#locate-status").innerHTML = esc(msg) + ` <a href="${CANONICAL}#map" target="_blank" rel="noopener">Open full page</a>`;
  }


  /* ---------------- drive-along ---------------- */
  let DRIVE = { routes: [] }, driveOn = false, wakeLock = null, heard = new Set(), lastLayerSpoken = 0, lastLayer = null, speaking = false;
  const allDriveStops = () => DRIVE.routes.flatMap((r) => r.stops.map((s) => Object.assign({ route: r.name }, s)));
  const metersBetween = (a, b) => milesBetween(a, b) * 1609.34;
  function say(text) {
    if (!$("#drive-voice").checked || !("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; u.rate = 1;
      const v = speechSynthesis.getVoices().find((x) => /en-US/i.test(x.lang) && /natural|samantha|google/i.test(x.name)) || speechSynthesis.getVoices().find((x) => /en-US/i.test(x.lang));
      if (v) u.voice = v;
      u.onstart = () => (speaking = true); u.onend = () => (speaking = false);
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  async function keepAwake() {
    try { if ("wakeLock" in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => (wakeLock = null)); } } catch (e) {}
  }
  document.addEventListener("visibilitychange", () => { if (driveOn && document.visibilityState === "visible") keepAwake(); });
  function setDriveUi() {
    $$("[data-drive]").forEach((b) => { b.classList.toggle("on", driveOn); b.textContent = driveOn ? "Stop drive-along" : "Start drive-along"; });
    $("#drive-banner").hidden = !driveOn;
  }
  function startDrive() {
    if (driveOn) return stopDrive();
    driveOn = true; heard = new Set(); lastLayer = null;
    show("map");
    // A tap is needed before most phones will speak; this primes the voice.
    if ($("#drive-voice").checked && "speechSynthesis" in window) { try { speechSynthesis.speak(new SpeechSynthesisUtterance("Drive-along is on.")); } catch (e) {} }
    keepAwake();
    setDriveUi();
    $("#info").hidden = true;
    initMap().then(() => $("#map").scrollIntoView({ behavior: "smooth", block: "center" }));
    $("#drive-banner").innerHTML = `<div class="k">Drive-along</div><b>Finding you…</b><p>Notes pop up as you reach each stop. Drivers: keep your eyes on the road and let the phone talk.</p>`;
    if (watchId == null) locate();
  }
  function stopDrive() {
    driveOn = false;
    try { speechSynthesis.cancel(); } catch (e) {}
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
    setDriveUi();
  }
  function driveTick(lat, lng) {
    if (!driveOn) return;
    const here = [lat, lng];
    const stops = allDriveStops().map((s) => Object.assign(s, { d: metersBetween(here, [s.lat, s.lng]) })).sort((a, b) => a.d - b.d);
    const near = stops[0];
    const banner = $("#drive-banner");
    if (near && near.d <= near.r && !heard.has(near.id)) {
      heard.add(near.id);
      banner.classList.add("arrived");
      banner.innerHTML = `<div class="k">You're at</div><b>${esc(near.name)}</b><p>${esc(near.note)}</p>
        <div class="row"><button type="button" data-repeat>Repeat</button><button type="button" data-stopinfo="${esc(near.id)}">More about this stop</button></div>`;
      $("[data-repeat]", banner).addEventListener("click", () => say(near.note));
      $("[data-stopinfo]", banner).addEventListener("click", () => (STOPS.some((x) => x.id === near.id) ? openStop(near.id, false) : openAt(near.lat, near.lng, { mode: "tap" })));
      say(near.note);
      return;
    }
    if (near && near.d <= near.r) return; // still at a stop we've announced; keep its note up
    banner.classList.remove("arrived");
    const next = stops.find((s) => !heard.has(s.id));
    const sym = unitAt(lat, lng);
    const layerLine = sym ? `Driving across: ${esc(U(sym).name)}` : "Outside the detailed park map";
    if (next && next.d < 40000) {
      const mi = next.d / 1609.34;
      banner.innerHTML = `<div class="k">${esc(next.route)}</div><b>Next: ${esc(next.name)}</b><p style="font:15px var(--ui)">${mi < 0.2 ? "Just ahead" : mi.toFixed(1) + " miles away"} · ${layerLine}</p>`;
    } else {
      banner.innerHTML = `<div class="k">Drive-along</div><b>${next ? "Head into the park" : "That's every stop"}</b><p style="font:15px var(--ui)">${next ? `The nearest stop, ${esc(next.name)}, is ${Math.round(next.d / 1609.34)} miles away. Notes start when you get close.` : "Thanks for reading the rocks with us."}</p>`;
    }
    if ($("#drive-layers").checked && sym && sym !== lastLayer) {
      const now = Date.now();
      if (lastLayer && now - lastLayerSpoken > 45000 && !speaking) { say(`Now crossing ${U(sym).name}. ${U(sym).short}`); lastLayerSpoken = now; }
      lastLayer = sym;
    }
  }

  /* ---------------- layers column ---------------- */
  const COLUMN = [
    { sym: "QTa", ft: 25, label: "Upland gravel", sub: "Ice Age and earlier" },
    { sym: "Tsb", ft: 360, label: "Upper Sentinel Butte", sub: "Gray-brown sand, clay and lignite", key: "Tsb" },
    { sym: "Tsby", ft: 25, label: "Lower yellow bed", sub: "North Unit marker" },
    { sym: "Tsb", ft: 35, label: "", sub: "", key: "Tsb" },
    { sym: "Tsbb", ft: 25, label: "Blue bentonite and ash", sub: "Volcanic ash" },
    { sym: "Tsb", ft: 280, label: "Lower Sentinel Butte", sub: "Petrified forests, concretions", key: "Tsb", stumps: true },
    { sym: "Tsbc", ft: 35, label: "HT Butte clinker", sub: "Burned coal seam" },
    { sym: "Tbc", ft: 300, label: "Bullion Creek Formation", sub: "Oldest rock in the South Unit" },
  ];
  const CUT_IN = ["Qal", "Qoal", "Qt1", "Qls", "Qg", "Qmp"];
  function buildColumn() {
    const svg = $("#column");
    const W = 520, top = 30, left = 70, colW = 230, minH = 26, scale = 0.62;
    let y = top, parts = [];
    const total = COLUMN.reduce((a, b) => a + b.ft, 0);
    COLUMN.forEach((b, i) => {
      const u = U(b.sym), h = Math.max(minH, b.ft * scale);
      const fill = b.sym === "Tsbb" ? `<rect class="fill" x="${left}" y="${y}" width="${colW}" height="${h}" fill="${u.color}"/><rect x="${left}" y="${y + h * 0.38}" width="${colW}" height="${h * 0.24}" fill="#f2f2ee"/>`
        : `<rect class="fill" x="${left}" y="${y}" width="${colW}" height="${h}" fill="${u.color}"/>`;
      let deco = "";
      if (b.sym === "Tsb") for (let k = 0; k < Math.floor(h / 26); k++) deco += `<line x1="${left}" x2="${left + colW}" y1="${y + 13 + k * 26}" y2="${y + 13 + k * 26}" stroke="#7d7062" stroke-width="${k % 3 === 0 ? 2.2 : 0.8}" opacity="${k % 3 === 0 ? 0.6 : 0.35}"/>`;
      if (b.sym === "Tbc") for (let k = 0; k < Math.floor(h / 18); k++) deco += `<line x1="${left}" x2="${left + colW}" y1="${y + 9 + k * 18}" y2="${y + 9 + k * 18}" stroke="#a0824a" stroke-width=".8" opacity=".45"/>`;
      if (b.sym === "QTa") for (let k = 0; k < 18; k++) deco += `<circle cx="${left + 8 + k * 12.5}" cy="${y + h / 2 + (k % 2 ? 4 : -4)}" r="3.4" fill="#a36d33" opacity=".7"/>`;
      if (b.stumps) for (let k = 0; k < 5; k++) { const sx = left + 24 + k * 44, sy = y + h * 0.42; deco += `<path d="M${sx} ${sy} l3 -16 h6 l3 16 z" fill="#6b5a45" opacity=".85"/>`; }
      if (b.sym === "Tsb" && b.stumps) for (let k = 0; k < 4; k++) deco += `<circle cx="${left + 40 + k * 52}" cy="${y + h * 0.8}" r="7" fill="#8e8274" stroke="#6d6255"/>`;
      if (b.sym === "Tsbc") deco += `<rect x="${left}" y="${y + h - 5}" width="${colW}" height="5" fill="#2b2622"/>`;
      const label = b.label ? `<text x="${left + colW + 12}" y="${y + h / 2 - 2}" font-size="15" font-weight="700" fill="#163728">${esc(b.label)}</text><text x="${left + colW + 12}" y="${y + h / 2 + 15}" font-size="12" fill="#5d625f">${esc(b.sub)}</text>` : "";
      parts.push(`<g class="band" tabindex="0" role="button" data-i="${i}" aria-label="${esc(b.label || u.name)}">${fill}${deco}<rect x="${left}" y="${y}" width="${colW}" height="${h}" fill="none" stroke="rgba(0,0,0,.18)"/>${label}</g>`);
      y += h;
    });
    // left ruler (approximate feet above the base of the Bullion Creek exposures)
    const ruler = `<line x1="${left - 14}" x2="${left - 14}" y1="${top}" y2="${y}" stroke="#5d625f"/><text x="${left - 20}" y="${top + 4}" font-size="11" fill="#5d625f" text-anchor="end">younger</text><text x="${left - 20}" y="${y}" font-size="11" fill="#5d625f" text-anchor="end">older</text><path d="M${left - 14} ${y + 2} l-4 -8 h8 z" fill="#5d625f"/>`;
    const note = `<text x="${left}" y="${y + 22}" font-size="11" fill="#5d625f">About ${total.toLocaleString()} feet in all. Thin layers drawn thicker so you can see them.</text>`;
    svg.setAttribute("viewBox", `0 0 ${W} ${y + 34}`);
    svg.innerHTML = ruler + parts.join("") + note;
    const pick = (i) => {
      $$("#column .band").forEach((g) => g.classList.toggle("sel", +g.dataset.i === i));
      const b = COLUMN[i], u = U(b.sym);
      $("#column-detail").innerHTML = `<div class="eyebrow">${esc(GROUPS.find((g) => g.id === u.group)?.name || "")}</div><h3>${esc(b.label || u.name)}</h3><div class="formal small">${esc(u.formal)}</div>${unitBody(u)}
        <p style="margin-top:14px"><button class="btn small" data-onmap="${b.sym}">Show it on the map</button></p>
        <hr style="border:0;border-top:1px solid var(--line);margin:20px 0 12px"><div class="small"><b>Cut into the stack later</b> — younger deposits the river and the Ice Age laid on top:</div>
        <div class="chips" style="margin-top:8px">${CUT_IN.map((s) => `<button class="chip" data-cut="${s}"><span class="swatch" style="background:${U(s).color}"></span> ${esc(s === "Qt1" ? "River terraces" : U(s).name)}</button>`).join("")}</div>`;
      bindColumnDetail();
      postHeight();
    };
    function bindColumnDetail() {
      $$("[data-onmap]").forEach((b) => b.addEventListener("click", () => { show("map"); initMap().then(() => { setHighlight(b.dataset.onmap); renderUnitOnly(b.dataset.onmap); map.flyToBounds([[46.86, -103.75], [47.66, -103.2]], { duration: 0.6 }); }); }));
      $$("[data-cut]").forEach((b) => b.addEventListener("click", () => {
        const u = U(b.dataset.cut);
        $$("#column .band").forEach((g) => g.classList.remove("sel"));
        $("#column-detail").innerHTML = `<div class="eyebrow">${esc(GROUPS.find((g) => g.id === u.group)?.name || "")}</div><h3>${esc(u.name)}</h3><div class="formal small">${esc(u.formal)}</div>${unitBody(u)}<p style="margin-top:14px"><button class="btn small" data-onmap="${b.dataset.cut}">Show it on the map</button> <button class="btn small line" data-back>Back to the stack</button></p>`;
        $("[data-back]").addEventListener("click", () => pick(5));
        $$("[data-onmap]").forEach((x) => x.addEventListener("click", () => { show("map"); initMap().then(() => { setHighlight(x.dataset.onmap); renderUnitOnly(x.dataset.onmap); }); }));
        postHeight();
      }));
    }
    svg.addEventListener("click", (e) => { const g = e.target.closest(".band"); if (g) pick(+g.dataset.i); });
    svg.addEventListener("keydown", (e) => { const g = e.target.closest(".band"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(+g.dataset.i); } });
    pick(5);
  }

  /* ---------------- stops ---------------- */
  const STOP_PHOTOS = { "n-concretions": "concretions", "n-slump": "slump-cannonballs", petrified: "petrified-wood" };
  function buildStops() {
    const render = (area) => {
      $("#stops").innerHTML = STOPS.filter((s) => area === "all" || s.area === area).map((s) => {
        const ph = STOP_PHOTOS[s.id];
        const unitsRow = s.units.map((sym) => { const u = U(sym); return u ? `<span><i style="background:${u.color}"></i>${esc(u.name)}</span>` : ""; }).join("");
        return `<article class="stop ${ph ? "has-photo" : ""}">
          ${ph ? `<div class="ph" role="img" aria-label="${esc(s.name)}" style="background-image:url('assets/photos/${ph}.jpg')"></div>` : ""}
          <div class="area">${esc(areaName(s.area))}${s.kind === "hike" ? " · Hike" : ""}</div>
          <h3>${esc(s.name)}</h3>
          <p class="see">${esc(s.see)}</p>
          <div class="units-row">${unitsRow}</div>
          ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
          <div class="acts">
            <button class="btn small" data-stop="${s.id}">Show on map</button>
            <a class="btn small line" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}" target="_blank" rel="noopener">Directions</a>
          </div></article>`;
      }).join("");
      postHeight();
    };
    $("#stops").addEventListener("click", (e) => { const b = e.target.closest("[data-stop]"); if (b) openStop(b.dataset.stop); });
    $("#stop-filter").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $$("#stop-filter .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      render(b.dataset.area);
    });
    render("all");
  }

  /* ---------------- story ---------------- */
  const STORY = [
    { when: "About 60 million years ago", title: "Rivers from the Rockies", text: ["The dinosaurs were gone and the Rocky Mountains were rising to the west. Rivers carried their sand and mud east into a low, wet country of channels, lakes and swamps where western North Dakota is today.", "Layer by layer, that sediment built the Bullion Creek and then the Sentinel Butte formations, the yellowish and gray-brown bands you see in every butte."], unit: "Tbc" },
    { when: "Paleocene swamps", title: "Forests with their feet in water", text: ["Conifers, probably relatives of today's bald cypress and redwoods, grew with their roots in standing water. Floods buried the base of each tree in mud. The tops rotted away, but silica in groundwater turned the buried stumps to stone.", "Swamp plants that fell and piled up became peat, then lignite coal. Those dark seams matter later in the story."], photo: "petrified-wood", stop: "petrified" },
    { when: "About 60 million years ago", title: "Fossil Lake Wannagan", text: ["In the Little Missouri breaks of Billings County, a Science Museum of Minnesota team dug into the yellow Bullion Creek layers every summer from 1970 to 1996. They uncovered a shallow lake on an ancient river floodplain and named it Fossil Lake Wannagan.", "Its mud held about 80 crocodiles, snapping and soft-shelled turtles, the long-snouted reptile Champsosaurus, gars and bowfins, early birds and Plesiadapis, an early relative of primates. More than 100 kinds of plants grew around it, including bald cypress, dawn redwood, magnolia, ginkgo and palm. In the end a flood broke through a riverbank and buried the lake under sand.", "The dig was filled in and replanted when the work ended. Fossil bones on public land are protected by federal law, and nothing may be collected in the national park. If you spot a fossil, leave it and take a photo."], unit: "Tbc" },
    { when: "Paleocene", title: "Ash from distant volcanoes", text: ["Eruptions more than 250 miles away dusted the region with volcanic ash. Washed into a lake, it collected into a thick layer that weathered into blue bentonite clay with a white core of ash. Today it is the bright blue band of the North Unit, and the slick layer many of its landslides ride on."], unit: "Tsbb" },
    { when: "Millions of years later", title: "A high, rolling plain", text: ["Long after the swamps, rivers wandered across a broad plain, spreading polished gravel, including quartzite and porphyry from far to the southwest. That gravel still caps the highest plateaus, more than 400 feet above today's river. There were no badlands yet."], unit: "QTa" },
    { when: "At least 640,000 years ago", title: "Glaciers turn the river", text: ["The Little Missouri once flowed north toward Hudson Bay. During the Ice Age, continental glaciers pushed into North Dakota and blocked that route. The river was forced east along the edge of the ice onto a shorter, steeper path to the Missouri.", "A steeper river cuts faster. The Little Missouri began slicing down through the soft layers, and the badlands were born. Granite boulders the ice left behind still sit near Sperati Point."], stop: "n-oxbow", flag: true },
    { when: "The Ice Age to today", title: "Carving the badlands", text: ["As the river dug deeper, it left its old floors stranded as gravel benches 160 to 270 feet above the water. Side creeks gnawed back into the uplands, leaving buttes, coulees and tables. Hard sandstone concretions, freed from the softer rock, rolled out as \"cannonballs.\""], photo: "concretions", unit: "Qt1" },
    { when: "Again and again", title: "Fire in the ground", text: ["Erosion exposed the coal seams, and coal exposed to air can catch fire. Seams have burned again and again, baking the clay above them into red clinker that caps ridges across the park. The most recent big burn, at Buck Hill, smoldered from 1951 to 1977. Roosevelt saw burning seams himself in the 1880s."], quote: "q-burning", stop: "coalvein" },
    { when: "Right now", title: "Still being made", text: ["The badlands are not finished. Hillsides slump after wet springs, floods move the river's sandbars, and the sand on today's valley floors is less than 500 years old. Every storm rewrites a little of the page.", "The North Dakota Geological Survey has mapped more than 59,000 landslides across the state. Turn on the statewide landslide layer on the map to see the ones around Medora."], photo: "slump-cannonballs", quote: "q-poe", unit: "Qls" },
  ];
  function buildStory() {
    $("#timeline").innerHTML = STORY.map((c, i) => `
      <div class="tl ${c.flag ? "flag" : ""}">
        <div class="when">${esc(c.when)}</div>
        <h4>${esc(c.title)}</h4>
        ${c.text.map((t) => `<p>${esc(t)}</p>`).join("")}
        ${c.photo ? `<div class="ph" role="img" aria-label="${esc(c.title)}" style="background-image:url('assets/photos/${c.photo}.jpg')"></div><div class="cap">${esc(credits[c.photo] ? credits[c.photo].caption + ". " + credits[c.photo].artist + ", " + credits[c.photo].license : "")}</div>` : ""}
        ${c.quote ? quoteHtml(c.quote) : ""}
        <p style="margin-top:10px">${c.unit ? `<button class="btn small line" data-story-unit="${c.unit}">See it on the map</button>` : ""}${c.stop ? `<button class="btn small line" data-stop="${c.stop}">Where to see it</button>` : ""}</p>
      </div>`).join("");
    $("#timeline").addEventListener("click", (e) => {
      const s = e.target.closest("[data-stop]"); if (s) return openStop(s.dataset.stop);
      const u = e.target.closest("[data-story-unit]");
      if (u) { show("map"); initMap().then(() => { setHighlight(u.dataset.storyUnit); renderUnitOnly(u.dataset.storyUnit); map.flyToBounds([[46.86, -103.75], [47.66, -103.2]], { duration: 0.6 }); }); }
    });
  }

  /* ---------------- credits ---------------- */
  let credits = {};
  function buildCredits() {
    $("#photo-credits").innerHTML = Object.values(credits).map((c) => `${esc(c.caption)}: ${esc(c.artist)}, ${c.licenseUrl ? `<a href="${esc(c.licenseUrl)}">${esc(c.license)}</a>` : esc(c.license)} (<a href="${esc(c.source)}">source</a>)`).join("<br>");
    $("#photo-credits-link").addEventListener("click", (e) => { e.preventDefault(); $("#photo-credits").hidden = !$("#photo-credits").hidden; });
  }

  /* ---------------- embed sizing ---------------- */
  function postHeight() {
    if (!EMBED || window.parent === window) return;
    requestAnimationFrame(() => window.parent.postMessage({ type: "read-the-rocks:height", height: Math.ceil(document.body.getBoundingClientRect().height), id: FRAME_ID }, "*"));
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    if (EMBED) { document.body.classList.add("embed"); if (SINGLE) document.body.classList.add("single"); if (params.get("heading") === "off") document.body.classList.add("no-heading"); }
    const [u, s, c, dr] = await Promise.all([
      fetch("data/units.json").then((r) => r.json()),
      fetch("data/stops.json").then((r) => r.json()),
      fetch("assets/photos/credits.json").then((r) => r.json()).catch(() => ({})),
      fetch("data/drive.json").then((r) => r.json()).catch(() => ({ routes: [] })),
    ]);
    DRIVE = dr;
    UNITS = u.units; QUOTES = u.quotes; REGIONAL = u.regional; GROUPS = u.groups; STOPS = s; credits = c;
    if (window.matchMedia("(max-width: 860px)").matches) $("#legend-box").open = false;
    buildLegend(); buildJumps(); buildColumn(); buildStops(); buildStory(); buildCredits();
    $$(".tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
    $$("[data-locate]").forEach((b) => b.addEventListener("click", locate));
    $$("[data-drive]").forEach((b) => b.addEventListener("click", startDrive));
    $$('a[href="#map"]').forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); show("map"); $(".tabs").scrollIntoView({ behavior: "smooth" }); }));
    window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (VIEWS.includes(v)) show(v, false); });

    const hashView = (location.hash || "").slice(1);
    const view = SINGLE || params.get("view") || (VIEWS.includes(hashView) ? hashView : "map");
    show(view, false);

    const at = params.get("at"), stop = params.get("stop"), unit = params.get("unit");
    if (at) {
      const [lat, lng] = at.split(",").map(Number);
      if (isFinite(lat) && isFinite(lng)) {
        show("map", false);
        await initMap();
        map.setView([lat, lng], Math.min(17, Math.max(9, parseInt(params.get("z"), 10) || 14)));
        openAt(lat, lng, { mode: "tap", silent: true });
        if (!EMBED) $(".tabs").scrollIntoView();
      }
    } else if (stop) openStop(stop);
    else if (unit && U(unit)) { await initMap(); setHighlight(unit); renderUnitOnly(unit); }

    if (EMBED && "ResizeObserver" in window) new ResizeObserver(postHeight).observe(document.body);
    postHeight();
  }
  boot();
})();
