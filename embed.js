/*!
 * Read the Rocks embed — Theodore Roosevelt Presidential Library
 * https://geology.labs.trlibrary.com
 *
 * Usage (one script tag per page, any number of widgets):
 *
 *   <div data-read-the-rocks="map"></div>
 *   <script src="https://geology.labs.trlibrary.com/embed.js" async></script>
 *
 * Views: map | layers | stops | story | all
 * Optional attributes:
 *   data-stop="n-oxbow"      open one stop on the map
 *   data-unit="Tsbc"         highlight one rock layer on the map
 *   data-at="46.93,-103.48"  open the map at a point
 *   data-min-height="700"    starting height in px before the widget reports its size
 *
 * The iframe is granted geolocation so "Use my location" works inside the page.
 */
(function () {
  "use strict";
  var ORIGIN = "https://geology.labs.trlibrary.com";
  try {
    var me = document.currentScript && document.currentScript.src;
    if (me) ORIGIN = new URL(me).origin;
  } catch (e) {}

  var frames = {};
  var n = 0;

  function mount(el) {
    if (el.getAttribute("data-rtr-mounted")) return;
    el.setAttribute("data-rtr-mounted", "1");
    var view = el.getAttribute("data-read-the-rocks") || "map";
    var id = "rtr" + ++n;
    var q = "?embed=1&id=" + id + (view !== "all" ? "&view=" + encodeURIComponent(view) : "");
    ["stop", "unit", "at"].forEach(function (k) {
      var v = el.getAttribute("data-" + k);
      if (v) q += "&" + k + "=" + encodeURIComponent(v);
    });
    var f = document.createElement("iframe");
    f.src = ORIGIN + "/" + q;
    f.title = "Read the Rocks — geology of Theodore Roosevelt National Park";
    f.loading = "lazy";
    f.setAttribute("allow", "geolocation; fullscreen; clipboard-write; web-share");
    f.style.cssText = "width:100%;border:0;display:block;overflow:hidden;height:" + (parseInt(el.getAttribute("data-min-height"), 10) || 900) + "px";
    el.appendChild(f);
    frames[id] = f;
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGIN || !e.data || !e.data.type) return;
    var f = frames[e.data.id];
    if (!f) return;
    if (e.data.type === "read-the-rocks:height" && e.data.height) f.style.height = Math.ceil(e.data.height) + "px";
    if (e.data.type === "read-the-rocks:scrolltop") f.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function scan() {
    var els = document.querySelectorAll("[data-read-the-rocks]");
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
