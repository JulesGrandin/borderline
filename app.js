const EARTH_KM = 6371;
const BORDER_HIT_KM = 5;

const FRAMES = {
  europe: { center: [15, 54], west: -25, east: 42, south: 34, north: 71 },
  africa: { center: [17, 3], west: -18, east: 52, south: -36, north: 38 },
  americas: { center: [-80, 10], west: -128, east: -34, south: -56, north: 72 },
  asia: { center: [88, 32], west: 26, east: 146, south: -11, north: 72 },
  us: { center: [-97, 39], west: -128, east: -65, south: 15, north: 58 },
  france: { center: [2.2, 46.3], west: -6.5, east: 11.2, south: 40.4, north: 52.2 },
};

const EUROPE = ["ALB", "DEU", "AUT", "BEL", "BLR", "BIH", "BGR", "CYP", "HRV", "DNK", "ESP", "EST", "FIN", "FRA", "GRC", "HUN", "ISL", "IRL", "ITA", "KOS", "LVA", "LTU", "LUX", "MKD", "MDA", "MNE", "NOR", "NLD", "POL", "PRT", "CZE", "ROU", "GBR", "RUS", "SRB", "SVK", "SVN", "SWE", "CHE", "UKR", "TUR"];
const AFRICA = ["DZA", "AGO", "BEN", "BWA", "BFA", "BDI", "CMR", "CAF", "TCD", "COG", "COD", "CIV", "EGY", "ERI", "SWZ", "ETH", "GAB", "GHA", "GIN", "GNB", "GNQ", "KEN", "LSO", "LBR", "LBY", "MDG", "MWI", "MLI", "MRT", "MAR", "MOZ", "NAM", "NER", "NGA", "UGA", "RWA", "SEN", "SLE", "SOM", "ZAF", "SDS", "SDN", "TZA", "TGO", "TUN", "ZMB", "ZWE"];
const AMERICAS = ["CAN", "USA", "MEX", "GTM", "HND", "NIC", "CRI", "PAN", "CUB", "HTI", "DOM", "COL", "VEN", "GUY", "SUR", "BRA", "ECU", "PER", "BOL", "PRY", "ARG", "CHL", "URY"];
const ASIA = ["AFG", "SAU", "ARM", "AZE", "BGD", "MMR", "KHM", "CHN", "PRK", "KOR", "ARE", "GEO", "IND", "IDN", "IRN", "IRQ", "JPN", "JOR", "KAZ", "KGZ", "LAO", "MYS", "MNG", "NPL", "OMN", "UZB", "PAK", "PHL", "RUS", "LKA", "SYR", "TJK", "TWN", "THA", "TUR", "TKM", "VNM", "YEM"];
const US_SKIP = new Set(["AK", "HI", "DC"]);
const FRANCE_NEIGHBORS = ["ESP", "AND", "BEL", "LUX", "DEU", "CHE", "ITA", "MCO"];

const game = {
  modeId: "europe",
  hardMode: false,
  length: 5,
  phase: "intro",
  rounds: [],
  index: 0,
  results: [],
  click: null,
};

const view = {
  width: 0,
  height: 0,
  projection: null,
  path: null,
  svg: null,
  land: null,
  lakes: null,
  borders: null,
  targets: null,
  arc: null,
  marker: null,
};

const data = {
  countries: [],
  countryById: new Map(),
  states: [],
  stateByPostal: new Map(),
  lakes: [],
  worldBorders: null,
  usBorders: null,
};

const sampleCache = new Map();
let finishTimer = null;

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  els.loadText = document.getElementById("load-text");
  els.loadFill = document.getElementById("load-bar-fill");
  els.loadOverlay = document.getElementById("load-overlay");
  els.intro = document.getElementById("intro-modal");
  els.finish = document.getElementById("finish-modal");
  els.chrome = document.getElementById("chrome");
  els.historyWrap = document.getElementById("history-wrap");
  els.history = document.getElementById("history");
  els.kicker = document.getElementById("round-kicker");
  els.prompt = document.getElementById("round-prompt");
  els.target = document.getElementById("target-label");
  els.result = document.getElementById("result");
  els.resultScore = document.getElementById("result-score");
  els.resultDetail = document.getElementById("result-detail");
  els.finalScore = document.getElementById("final-score");
  els.recap = document.getElementById("finish-recap");
  els.reviewTip = document.getElementById("review-tip");
  els.reviewTipName = document.getElementById("review-tip-name");
  els.reviewTipDetail = document.getElementById("review-tip-detail");
  document.querySelectorAll("[data-hard]").forEach((input) => {
    input.addEventListener("change", onHardChange);
  });
  document.getElementById("btn-start").addEventListener("click", startGame);
  document.getElementById("btn-replay").addEventListener("click", showHome);
  document.getElementById("btn-next").addEventListener("click", nextRound);
  document.getElementById("btn-map").addEventListener("click", showMyMap);
  document.getElementById("btn-back").addEventListener("click", showScore);
  document.body.addEventListener("click", onControlClick);

  if (!window.d3) {
    els.loadText.textContent = "La carte n'a pas pu se charger.";
    return;
  }

  try {
    await loadData();
    buildIndex();
    buildMap();
    syncControls();
    resize();
    if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    els.loadOverlay.classList.add("is-done");
    els.loadOverlay.setAttribute("aria-busy", "false");
  } catch (error) {
    els.loadText.textContent = "La carte n'a pas pu se charger.";
    console.error(error);
  }
}

async function loadData() {
  const files = [
    ["countries", "data/countries-all-50m.json"],
    ["lakes", "data/lakes-50m.json"],
    ["borders", "data/borders-50m.json"],
    ["disputes", "data/disputes-50m.json"],
    ["states", "data/us-states-10m.geojson"],
    ["stateBorders", "data/us-states-borders-10m.geojson"],
    ["departments", "data/fr-departement-10m.geojson"],
    ["deptBorders", "data/fr-departement-borders-10m.geojson"],
  ];
  let done = 0;
  const loaded = {};
  await Promise.all(files.map(async ([key, url]) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(url);
    loaded[key] = await response.json();
    done += 1;
    const pct = Math.round((done / files.length) * 100);
    els.loadFill.style.width = pct + "%";
    els.loadFill.parentElement.setAttribute("aria-valuenow", String(pct));
  }));
  data.raw = loaded;
}

function buildIndex() {
  const raw = data.raw;
  data.countries = raw.countries.features.filter((feature) => feature.properties.ADM0_A3 !== "ATA");
  data.countryById = new Map(data.countries.map((feature) => [feature.properties.ADM0_A3, feature]));
  mergeInto("CYP", "CYN");
  mergeInto("SOM", "SOL");
  data.states = raw.states.features;
  data.stateByPostal = new Map(data.states.map((feature) => [feature.properties.postal, feature]));
  data.lakes = raw.lakes.features.filter((feature) => Number(feature.properties.scalerank) <= 2);
  const contested = new Set([
    "Disputed (please verify)",
    "Line of control (please verify)",
    "Indefinite (please verify)",
    "Indeterminant frontier",
  ]);
  data.worldBorders = {
    type: "FeatureCollection",
    features: raw.borders.features.filter((feature) => !contested.has(feature.properties.FEATURECLA)),
  };
  data.disputedBorders = {
    type: "FeatureCollection",
    features: raw.borders.features
      .filter((feature) => contested.has(feature.properties.FEATURECLA))
      .concat(raw.disputes.features),
  };
  data.usBorders = raw.stateBorders;
  data.departments = raw.departments.features;
  data.deptBorders = raw.deptBorders;
  data.usFrontier = {
    type: "MultiLineString",
    coordinates: sharedEdges("USA", "CAN").concat(sharedEdges("USA", "MEX")).filter((line) => {
      const longitude = (line[0][0] + line[1][0]) / 2;
      return longitude > -129;
    }),
  };
  data.franceFrontier = {
    type: "MultiLineString",
    coordinates: FRANCE_NEIGHBORS.flatMap((id) => sharedEdges("FRA", id)),
  };
  data.coastline = buildCoastline();
  data.landlocked = landlockedIds();
  buildLocalCoasts();
  delete data.raw;
}

function buildCoastline() {
  const counts = new Map();
  const lines = new Map();
  data.countries.forEach((feature) => {
    polygonParts(feature).forEach((polygon) => {
      polygon.forEach((ring) => {
        for (let i = 0; i < ring.length - 1; i += 1) {
          const start = ring[i];
          const end = ring[i + 1];
          const key = edgeKey(start, end);
          if (!key) continue;
          counts.set(key, (counts.get(key) || 0) + 1);
          if (!lines.has(key)) lines.set(key, [start, end]);
        }
      });
    });
  });
  const coordinates = [];
  lines.forEach((line, key) => {
    if (counts.get(key) === 1) coordinates.push(line);
  });
  return { type: "MultiLineString", coordinates };
}

function landlockedIds() {
  const counts = new Map();
  const owner = new Map();
  const midpoint = new Map();
  data.countries.forEach((feature) => {
    const id = feature.properties.ADM0_A3;
    polygonParts(feature).forEach((polygon) => {
      polygon.forEach((ring) => {
        for (let i = 0; i < ring.length - 1; i += 1) {
          const start = ring[i];
          const end = ring[i + 1];
          const key = edgeKey(start, end);
          if (!key) continue;
          counts.set(key, (counts.get(key) || 0) + 1);
          if (!owner.has(key)) {
            owner.set(key, id);
            midpoint.set(key, [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]);
          }
        }
      });
    });
  });
  const ocean = new Set();
  counts.forEach((count, key) => {
    if (count !== 1) return;
    const point = midpoint.get(key);
    if (isCaspian(point) || isAral(point)) return;
    ocean.add(owner.get(key));
  });
  return new Set(data.countries
    .map((feature) => feature.properties.ADM0_A3)
    .filter((id) => !ocean.has(id)));
}

function isCaspian(point) {
  return point[0] >= 46.5 && point[0] <= 55.2 && point[1] >= 36.4 && point[1] <= 47.3;
}

function isAral(point) {
  return point[0] >= 57.8 && point[0] <= 62.2 && point[1] >= 43.2 && point[1] <= 47.2;
}

function kmBetween(a, b) {
  const lon1 = (a[0] * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lon2 = (b[0] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dlon = lon2 - lon1;
  const dlat = lat2 - lat1;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function densifyLine(start, end, stepKm) {
  const distance = Math.max(kmBetween(start, end), 0.001);
  const steps = Math.max(1, Math.round(distance / stepKm));
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    points.push([
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
    ]);
  }
  return points;
}

function pointGrid(points, cell) {
  const grid = new Map();
  points.forEach((point) => {
    const key = Math.floor(point[0] / cell) + "," + Math.floor(point[1] / cell);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(point);
  });
  return grid;
}

function nearestKm(grid, cell, point, limitKm) {
  const ix = Math.floor(point[0] / cell);
  const iy = Math.floor(point[1] / cell);
  const radius = Math.max(1, Math.ceil(limitKm / (cell * 60)) + 1);
  let best = Infinity;
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      const bucket = grid.get((ix + dx) + "," + (iy + dy));
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i += 1) {
        const distance = kmBetween(point, bucket[i]);
        if (distance < best) best = distance;
      }
    }
  }
  return best;
}

function isGreatLake(point) {
  const lon = point[0];
  const lat = point[1];
  return (lon >= -92.4 && lon <= -84.2 && lat >= 46.4 && lat <= 49)
    || (lon >= -88.1 && lon <= -84.7 && lat >= 41.6 && lat <= 46.1)
    || (lon >= -84.8 && lon <= -79.8 && lat >= 43 && lat <= 46.3)
    || (lon >= -83.5 && lon <= -78.8 && lat >= 41.35 && lat <= 42.95)
    || (lon >= -79.9 && lon <= -76.1 && lat >= 43.15 && lat <= 44.35);
}

function unitsWithSea(features, idOf, outlinePoints, frontierPoints, options) {
  const outline = pointGrid(outlinePoints, options.cell);
  const frontier = pointGrid(frontierPoints, options.cell);
  const counts = new Map();
  const mids = new Map();
  features.forEach((feature) => {
    const id = idOf(feature);
    polygonParts(feature).forEach((polygon) => {
      const ring = polygon[0];
      if (!ring) return;
      for (let i = 0; i < ring.length - 1; i += 1) {
        const key = edgeKey(ring[i], ring[i + 1]);
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!mids.has(id)) mids.set(id, []);
        mids.get(id).push({
          key,
          point: [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2],
        });
      }
    });
  });
  const neighborCell = options.neighborCell;
  const neighbors = new Map();
  mids.forEach((items, id) => {
    items.forEach((item) => {
      const key = Math.floor(item.point[0] / neighborCell) + "," + Math.floor(item.point[1] / neighborCell);
      if (!neighbors.has(key)) neighbors.set(key, []);
      neighbors.get(key).push({ id, point: item.point });
    });
  });
  const coastal = new Set();
  mids.forEach((items, id) => {
    const hit = items.some((item) => {
      if (counts.get(item.key) !== 1) return false;
      if (options.isLake && options.isLake(item.point)) return false;
      if (nearestKm(frontier, options.cell, item.point, options.frontierKm) < options.frontierKm) return false;
      if (nearestKm(outline, options.cell, item.point, options.outlineKm) >= options.outlineKm) return false;
      const ix = Math.floor(item.point[0] / neighborCell);
      const iy = Math.floor(item.point[1] / neighborCell);
      for (let dx = -options.neighborSpread; dx <= options.neighborSpread; dx += 1) {
        for (let dy = -options.neighborSpread; dy <= options.neighborSpread; dy += 1) {
          const bucket = neighbors.get((ix + dx) + "," + (iy + dy));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i += 1) {
            if (bucket[i].id !== id && kmBetween(item.point, bucket[i].point) < options.neighborKm) return false;
          }
        }
      }
      return true;
    });
    if (hit) coastal.add(id);
  });
  return coastal;
}

function ringSamples(ring, stepKm) {
  const points = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    densifyLine(ring[i], ring[i + 1], stepKm).forEach((point) => points.push(point));
  }
  return points;
}

function buildLocalCoasts() {
  const states = data.states.filter((feature) => !US_SKIP.has(feature.properties.postal));
  const usa = data.countryById.get("USA");
  let outline = [];
  polygonParts(usa).forEach((polygon) => {
    const ring = polygon[0];
    if (ring && ring.length > outline.length) outline = ring;
  });
  const frontier = data.usFrontier.coordinates.flatMap((line) => densifyLine(line[0], line[1], 10));
  data.coastalStates = unitsWithSea(
    states,
    (feature) => feature.properties.postal,
    ringSamples(outline, 12),
    frontier,
    {
      cell: 0.6,
      outlineKm: 18,
      frontierKm: 35,
      neighborCell: 0.4,
      neighborSpread: 1,
      neighborKm: 4,
      isLake: isGreatLake,
    },
  );
  const departments = data.departments.filter((feature) => feature.properties.type === "Metropolitan département");
  const france = data.countryById.get("FRA");
  const franceOutline = [];
  polygonParts(france).forEach((polygon) => {
    const ring = polygon[0];
    if (!ring) return;
    const lons = ring.map((point) => point[0]);
    const lats = ring.map((point) => point[1]);
    if (Math.min(...lons) < -10 || Math.max(...lats) < 40) return;
    ringSamples(ring, 6).forEach((point) => franceOutline.push(point));
  });
  const franceFrontier = data.franceFrontier.coordinates.flatMap((line) => densifyLine(line[0], line[1], 6));
  data.coastalDepts = unitsWithSea(
    departments,
    (feature) => feature.properties.iso_3166_2,
    franceOutline,
    franceFrontier,
    {
      cell: 0.25,
      outlineKm: 15,
      frontierKm: 12,
      neighborCell: 0.15,
      neighborSpread: 2,
      neighborKm: 3,
    },
  );
}

function sharedEdges(idA, idB) {
  const left = edgeMap(data.countryById.get(idA));
  const right = edgeMap(data.countryById.get(idB));
  const lines = [];
  left.forEach((line, key) => {
    if (right.has(key)) lines.push(line);
  });
  return lines;
}

function edgeMap(feature) {
  const edges = new Map();
  if (!feature) return edges;
  for (const polygon of polygonParts(feature)) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const start = ring[i];
        const end = ring[i + 1];
        const key = edgeKey(start, end);
        if (key) edges.set(key, [start, end]);
      }
    }
  }
  return edges;
}

function edgeKey(start, end) {
  const a = pointKey(start);
  const b = pointKey(end);
  if (a === b) return null;
  return a < b ? a + "|" + b : b + "|" + a;
}

function pointKey(point) {
  return Math.round(point[0] * 1000) + "," + Math.round(point[1] * 1000);
}

function mergeInto(id, extraId) {
  const primary = data.countryById.get(id);
  const extra = data.countryById.get(extraId);
  if (!primary || !extra) return;
  data.countryById.set(id, {
    type: "Feature",
    properties: primary.properties,
    geometry: {
      type: "MultiPolygon",
      coordinates: polygonParts(primary).concat(polygonParts(extra)),
    },
  });
}

function polygonParts(feature) {
  const geometry = feature.geometry;
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function poolFromIds(ids) {
  return ids.map((id) => {
    const feature = data.countryById.get(id);
    if (!feature) console.warn("Pays manquant :", id);
    return feature;
  }).filter(Boolean);
}

function currentPool() {
  if (game.modeId === "us") {
    const pool = data.states.filter((feature) => !US_SKIP.has(feature.properties.postal));
    if (!game.hardMode) return pool;
    return pool.filter((feature) => !data.coastalStates.has(feature.properties.postal));
  }
  if (game.modeId === "france") {
    const pool = data.departments.filter((feature) => feature.properties.type === "Metropolitan département");
    if (!game.hardMode) return pool;
    return pool.filter((feature) => !data.coastalDepts.has(feature.properties.iso_3166_2));
  }
  const ids = { europe: EUROPE, africa: AFRICA, americas: AMERICAS, asia: ASIA }[game.modeId];
  const pool = poolFromIds(ids);
  if (!game.hardMode || game.modeId === "americas") return pool;
  return pool.filter((feature) => data.landlocked.has(feature.properties.ADM0_A3));
}

function buildMap() {
  const svg = d3.select("#map").append("svg");
  view.svg = svg;
  view.projection = d3.geoOrthographic().clipAngle(90);
  view.path = d3.geoPath(view.projection);
  const defs = svg.append("defs");
  view.seaPattern = defs.append("pattern")
    .attr("id", "sea-texture")
    .attr("patternUnits", "userSpaceOnUse");
  view.seaImage = view.seaPattern.append("image")
    .attr("href", "texture-fond.png");
  const shadow = defs.append("filter")
    .attr("id", "globe-shadow")
    .attr("x", "-25%")
    .attr("y", "-25%")
    .attr("width", "150%")
    .attr("height", "150%");
  shadow.append("feGaussianBlur").attr("stdDeviation", 16);
  view.globeShadow = svg.append("path")
    .attr("class", "globe-shadow")
    .attr("filter", "url(#globe-shadow)");
  view.sphere = svg.append("path").attr("class", "sphere").attr("fill", "url(#sea-texture)");
  view.graticule = svg.append("path").attr("class", "graticule");
  view.land = svg.append("g").attr("class", "land-layer");
  view.highlights = svg.append("g").attr("class", "highlights");
  view.frontier = svg.append("path").attr("class", "frontier");
  view.borders = svg.append("g").attr("class", "borders");
  view.countryBorders = view.borders.append("path");
  view.stateBorders = view.borders.append("path");
  view.disputedBorders = view.borders.append("path").attr("class", "disputed");
  view.lakes = svg.append("g").attr("class", "lake-layer");
  view.targets = svg.append("g");
  view.coastline = svg.append("path").attr("class", "coastline");
  view.clicks = svg.append("g");
  view.graticuleDatum = d3.geoGraticule().step([15, 15]);
  svg.on("click", onMapClick);
}

function resize() {
  stopGlobeSpin();
  const node = document.getElementById("map");
  view.width = node.clientWidth;
  view.height = node.clientHeight;
  view.svg.attr("width", view.width).attr("height", view.height);
  fitSeaTexture();
  fitProjection();
  redraw();
}

const TEXTURE_WIDTH = 1920;
const TEXTURE_HEIGHT = 1080;

function fitSeaTexture() {
  const width = view.width;
  const height = view.height;
  const scale = Math.max(width / TEXTURE_WIDTH, height / TEXTURE_HEIGHT);
  const imageWidth = TEXTURE_WIDTH * scale;
  const imageHeight = TEXTURE_HEIGHT * scale;
  view.seaPattern.attr("width", width).attr("height", height);
  view.seaImage
    .attr("x", (width - imageWidth) / 2)
    .attr("y", (height - imageHeight) / 2)
    .attr("width", imageWidth)
    .attr("height", imageHeight);
}

function activeFrame() {
  const box = FRAMES[game.modeId];
  if (!isCompact()) return box;
  const centers = {
    europe: [18, 52],
    africa: [17, 0],
    americas: [-74, -14],
  };
  const center = centers[game.modeId];
  return center ? { ...box, center } : box;
}

function fitProjection() {
  const box = activeFrame();
  const insets = viewInsets();
  view.projection.rotate([-box.center[0], -box.center[1]]);
  view.projection.scale(frameScale(box, insets)).translate([view.width / 2, insetCenterY(insets)]);
}

function isCompact() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function safeInset(edge) {
  const key = "safe" + edge;
  if (view[key] != null) return view[key];
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-" + edge + ")";
  document.body.append(probe);
  view[key] = probe.offsetHeight || 0;
  probe.remove();
  return view[key];
}

function viewInsets() {
  if (!isCompact()) return { top: 28, right: 28, bottom: 28, left: 28 };
  const pad = 14;
  if (game.phase === "intro" || game.phase === "finish") {
    return { top: pad, right: pad, bottom: pad, left: pad };
  }
  return {
    top: 168 + safeInset("top"),
    right: 12,
    bottom: 112 + safeInset("bottom"),
    left: 12,
  };
}

function insetCenterY(insets) {
  return insets.top + (view.height - insets.top - insets.bottom) / 2;
}

function rectangleSamples(box) {
  const samples = [];
  for (let i = 0; i <= 6; i += 1) {
    for (let j = 0; j <= 4; j += 1) {
      samples.push([
        box.west + ((box.east - box.west) * i) / 6,
        box.south + ((box.north - box.south) * j) / 4,
      ]);
    }
  }
  return samples;
}

function mobileSamples(modeId) {
  if (!data.fitSamples) data.fitSamples = {};
  if (Object.prototype.hasOwnProperty.call(data.fitSamples, modeId)) return data.fitSamples[modeId];
  const points = [];
  const push = (feature, step, accept) => {
    polygonParts(feature).forEach((polygon) => {
      const ring = polygon[0];
      if (!ring) return;
      for (let i = 0; i < ring.length; i += step) {
        if (accept(ring[i])) points.push(ring[i]);
      }
    });
  };
  if (modeId === "europe") {
    EUROPE.forEach((id) => {
      const feature = data.countryById.get(id);
      if (!feature) return;
      push(feature, 5, (point) => point[0] >= -25 && point[0] <= 44 && point[1] >= 34 && point[1] <= 72);
    });
  } else if (modeId === "africa") {
    AFRICA.forEach((id) => {
      const feature = data.countryById.get(id);
      if (!feature) return;
      push(feature, 5, (point) => point[0] >= -19 && point[0] <= 53 && point[1] >= -35.2);
    });
  } else if (modeId === "americas") {
    AMERICAS.forEach((id) => {
      const feature = data.countryById.get(id);
      if (!feature) return;
      push(feature, 6, (point) => {
        if (id === "USA") return point[0] <= -66 && point[0] >= -130 && point[1] >= 24 && point[1] <= 50;
        if (id === "CAN") return point[0] >= -132 && point[1] <= 70;
        if (id === "CHL") return point[0] >= -80;
        if (id === "ECU") return point[0] >= -82;
        return point[0] >= -132 && point[0] <= -30;
      });
    });
  } else if (modeId === "us") {
    data.states.forEach((feature) => {
      if (US_SKIP.has(feature.properties.postal)) return;
      push(feature, 8, () => true);
    });
  } else if (modeId === "france") {
    data.departments.forEach((feature) => {
      if (feature.properties.type !== "Metropolitan département") return;
      push(feature, 4, () => true);
    });
  }
  data.fitSamples[modeId] = points.length ? points : null;
  return data.fitSamples[modeId];
}

function frameScale(box, insets) {
  const compact = isCompact();
  const samples = (compact && mobileSamples(game.modeId)) || rectangleSamples(box);
  const projection = view.projection;
  const cx = view.width / 2;
  const cy = insetCenterY(insets);
  const fits = (scale) => {
    projection.scale(scale).translate([cx, cy]);
    return samples.every((sample) => {
      const point = projection(sample);
      if (!point) return true;
      return point[0] >= insets.left && point[0] <= view.width - insets.right
        && point[1] >= insets.top && point[1] <= view.height - insets.bottom;
    });
  };
  let lo = 40;
  let hi = 8000;
  if (!fits(lo)) return Math.min(view.width, view.height) * 0.46;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function stopGlobeSpin() {
  if (!view.spin) return;
  view.spin.stop();
  view.spin = null;
}

function angleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function flyToFrame() {
  if (!view.projection || !view.width) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stopGlobeSpin();
    fitProjection();
    redraw();
    return;
  }
  const box = activeFrame();
  const projection = view.projection;
  stopGlobeSpin();
  const fromRotate = projection.rotate();
  const fromScale = projection.scale();
  const targetRotate = [-box.center[0], -box.center[1], 0];
  projection.rotate(targetRotate);
  const insets = viewInsets();
  const targetScale = frameScale(box, insets);
  projection.rotate(fromRotate).scale(fromScale);
  const toLambda = fromRotate[0] + angleDelta(fromRotate[0], targetRotate[0]);
  const toPhi = fromRotate[1] + angleDelta(fromRotate[1], targetRotate[1]);
  const sweep = Math.max(Math.abs(toLambda - fromRotate[0]), Math.abs(toPhi - fromRotate[1]));
  if (sweep < 0.4 && Math.abs(targetScale - fromScale) < 2) {
    fitProjection();
    redraw();
    return;
  }
  const duration = Math.round(Math.min(1800, 720 + sweep * 5.5));
  const started = performance.now();
  view.spin = d3.timer(() => {
    const t = Math.min(1, (performance.now() - started) / duration);
    const eased = d3.easeCubicInOut(t);
    projection.rotate([
      fromRotate[0] + (toLambda - fromRotate[0]) * eased,
      fromRotate[1] + (toPhi - fromRotate[1]) * eased,
      0,
    ]);
    projection.scale(fromScale + (targetScale - fromScale) * eased);
    redraw();
    if (t === 1) stopGlobeSpin();
  });
}

function landFeatures() {
  return data.countries;
}

function drawLand(layer, cssClass, path) {
  layer.selectAll("path")
    .data(landFeatures(), featureKey)
    .join(
      (enter) => enter.append("path").attr("class", cssClass),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("d", path);
}

function redraw() {
  const path = view.path;
  const sphere = path({ type: "Sphere" });
  view.globeShadow.attr("d", sphere);
  view.sphere.attr("d", sphere);
  view.graticule.attr("d", path(view.graticuleDatum()));
  drawLand(view.land, "land", path);
  view.lakes.selectAll("path")
    .data(data.lakes, (feature, index) => feature.properties.ne_id || index)
    .join("path")
    .attr("class", "lake")
    .attr("fill", "url(#sea-texture)")
    .attr("d", path);
  const frontier = frontierForMode();
  const innerBorders = innerBordersForMode();
  const worldBorders = game.modeId === "france" ? null : data.worldBorders;
  view.frontier.attr("d", frontier ? path(frontier) : null);
  view.countryBorders.attr("d", worldBorders ? path(worldBorders) : null);
  view.stateBorders.attr("d", innerBorders ? path(innerBorders) : null);
  view.disputedBorders.attr("d", worldBorders ? path(data.disputedBorders) : null);
  view.highlights.selectAll("path")
    .data(reviewFills(), (mark) => featureKey(mark.feature))
    .join("path")
    .attr("class", (mark) => (mark.hit ? "highlight highlight-hit" : "highlight highlight-miss"))
    .attr("d", (mark) => path(mark.feature))
    .on("pointerenter pointermove", showReviewTip)
    .on("pointerleave", hideReviewTip);
  if (game.phase !== "review") hideReviewTip();
  view.targets.selectAll("path")
    .data(outlineFeatures(), featureKey)
    .join("path")
    .attr("class", "target target-current")
    .attr("d", path);
  drawClicks();
  view.coastline.attr("d", path(data.coastline));
}

function frontierForMode() {
  if (game.modeId === "us") return data.usFrontier;
  if (game.modeId === "france") return data.franceFrontier;
  return null;
}

function innerBordersForMode() {
  if (game.modeId === "us") return data.usBorders;
  if (game.modeId === "france") return data.deptBorders;
  return null;
}

function outlineFeatures() {
  if (game.phase === "result") return [game.rounds[game.index].feature];
  return [];
}

function reviewFills() {
  if (game.phase !== "review") return [];
  return game.results.map((result) => ({
    feature: result.feature,
    hit: result.hit,
    name: result.name,
    km: result.km,
  }));
}

function showReviewTip(event, mark) {
  els.reviewTipName.textContent = mark.name;
  els.reviewTipDetail.textContent = mark.hit ? "Bien placé" : "Mal placé, à " + formatKm(mark.km);
  els.reviewTip.classList.toggle("is-hit", mark.hit);
  els.reviewTip.classList.toggle("is-miss", !mark.hit);
  els.reviewTip.hidden = false;
  const pad = 12;
  const width = els.reviewTip.offsetWidth;
  const height = els.reviewTip.offsetHeight;
  let x = event.clientX + 16;
  let y = event.clientY + 18;
  if (x + width > window.innerWidth - pad) x = event.clientX - width - 14;
  if (y + height > window.innerHeight - pad) y = event.clientY - height - 14;
  els.reviewTip.style.left = x + "px";
  els.reviewTip.style.top = y + "px";
}

function hideReviewTip() {
  if (els.reviewTip) els.reviewTip.hidden = true;
}

function featureKey(feature) {
  const props = feature.properties;
  return props.ADM0_A3 || props.iso_3166_2 || props.postal;
}

function visibleClicks() {
  if (game.phase === "result" && game.click) return [game.click];
  if (game.phase === "review") {
    return game.results.map((result) => ({
      lonlat: result.lonlat,
      nearest: result.nearest,
      hit: result.hit,
    }));
  }
  return [];
}

function drawClicks() {
  const clicks = visibleClicks();
  view.clicks.selectAll("path")
    .data(clicks.filter((click) => !click.hit && click.nearest))
    .join("path")
    .attr("class", "miss-arc")
    .attr("d", (click) => view.path(arcLine(click.lonlat, click.nearest)));
  view.clicks.selectAll("circle")
    .data(clicks)
    .join("circle")
    .attr("class", (click) => (click.hit ? "click-dot is-hit" : "click-dot"))
    .attr("r", 5)
    .attr("cx", (click) => {
      const point = view.projection(click.lonlat);
      return point ? point[0] : 0;
    })
    .attr("cy", (click) => {
      const point = view.projection(click.lonlat);
      return point ? point[1] : 0;
    })
    .style("display", (click) => (view.projection(click.lonlat) ? null : "none"));
}

function onMapClick(event) {
  if (game.phase !== "play") return;
  const lonlat = view.projection.invert(d3.pointer(event));
  if (!lonlat || !Number.isFinite(lonlat[0]) || !Number.isFinite(lonlat[1])) return;
  resolveClick(lonlat);
}

function resolveClick(lonlat) {
  const round = game.rounds[game.index];
  const nearest = nearestOnFeature(lonlat, round.feature);
  const inside = d3.geoContains(round.feature, lonlat);
  const hit = inside || nearest.km <= BORDER_HIT_KM;
  const score = hit ? 100 : missScore(nearest.km);
  const where = hit ? null : placeAt(lonlat);
  game.click = { lonlat, nearest: nearest.point, hit };
  game.results.push({
    name: round.name,
    score,
    hit,
    km: nearest.km,
    where,
    feature: round.feature,
    lonlat,
    nearest: nearest.point,
  });
  const last = game.index === game.rounds.length - 1;
  game.phase = "result";
  document.body.classList.remove("is-playing");
  document.body.classList.add("is-result");
  showResult();
  renderHistory();
  if (isCompact()) resize();
  else redraw();
  if (!last) return;
  clearFinishTimer();
  finishTimer = setTimeout(finishGame, 1800);
}

function placeAt(lonlat) {
  const localFeatures = game.modeId === "us" ? data.states : game.modeId === "france" ? data.departments : null;
  if (localFeatures) {
    const local = localFeatures.find((feature) => d3.geoContains(feature, lonlat));
    if (local) return displayName(local);
  }
  const country = data.countries.find((feature) => d3.geoContains(feature, lonlat));
  if (!country) return null;
  return displayName(country);
}

function nearestOnFeature(lonlat, feature) {
  const points = samplesOf(feature);
  let best = Infinity;
  let point = null;
  for (let i = 0; i < points.length; i += 1) {
    const km = d3.geoDistance(lonlat, points[i]) * EARTH_KM;
    if (km < best) {
      best = km;
      point = points[i];
    }
  }
  return { km: best, point };
}

function samplesOf(feature) {
  const key = featureKey(feature);
  const cached = sampleCache.get(key);
  if (cached) return cached;
  const points = densify(feature, 25);
  sampleCache.set(key, points);
  return points;
}

function densify(feature, stepKm) {
  const points = [];
  for (const polygon of polygonParts(feature)) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const start = ring[i];
        const end = ring[i + 1];
        const km = d3.geoDistance(start, end) * EARTH_KM;
        const steps = Math.max(1, Math.ceil(km / stepKm));
        const interpolate = d3.geoInterpolate(start, end);
        for (let step = 0; step < steps; step += 1) points.push(interpolate(step / steps));
      }
    }
  }
  return points;
}

function missScore(km) {
  if (game.modeId === "france") return departmentMissScore(km);
  return countryMissScore(km);
}

function countryMissScore(km) {
  if (km <= 50) return 25;
  if (km <= 100) return 10;
  if (km <= 150) return 5;
  return 0;
}

// À 10 km ≈ 45, à 15 ≈ 35, à 20 ≈ 25, à 30 ≈ 10. Au-delà, 0.
const DEPARTMENT_SCORE = [[0, 50], [10, 45], [15, 35], [20, 25], [30, 10]];

function departmentMissScore(km) {
  if (km > 30) return 0;
  for (let i = 1; i < DEPARTMENT_SCORE.length; i += 1) {
    const [distance, score] = DEPARTMENT_SCORE[i];
    if (km > distance) continue;
    const [previousDistance, previousScore] = DEPARTMENT_SCORE[i - 1];
    const share = (km - previousDistance) / (distance - previousDistance);
    return Math.round(previousScore + (score - previousScore) * share);
  }
  return 0;
}

function displayName(feature) {
  const props = feature.properties;
  const code = props.iso_3166_2 || "";
  if (code.startsWith("US-") || props.postal === "DC") {
    if (props.postal === "DC") return "Washington D.C.";
    return (props.name_fr || props.name || "").replace(/^État de /, "");
  }
  if (code.startsWith("FR-")) return props.name_fr || props.name;
  return props.NAME_FR || props.NAME;
}

function clearFinishTimer() {
  clearTimeout(finishTimer);
  finishTimer = null;
}

function showHome() {
  clearFinishTimer();
  game.phase = "intro";
  game.click = null;
  document.body.classList.remove("is-playing", "is-result", "is-finish", "is-review");
  document.body.classList.add("is-intro");
  els.finish.hidden = true;
  els.chrome.hidden = true;
  els.historyWrap.hidden = true;
  els.intro.hidden = false;
  document.getElementById("screen-game").hidden = false;
  document.getElementById("review-bar").hidden = true;
  hideReviewTip();
  view.borders.classed("is-instant", true).classed("is-on", false);
  requestAnimationFrame(() => view.borders.classed("is-instant", false));
  syncControls();
  resize();
}

function startGame() {
  clearFinishTimer();
  const pool = shuffle(currentPool());
  const count = Math.min(game.length, pool.length);
  game.rounds = pool.slice(0, count).map((feature) => ({
    feature,
    name: displayName(feature),
  }));
  game.index = 0;
  game.results = [];
  game.click = null;
  game.phase = "play";
  document.body.classList.remove("is-intro", "is-result", "is-finish", "is-review");
  document.body.classList.add("is-playing");
  els.intro.hidden = true;
  els.finish.hidden = true;
  els.chrome.hidden = false;
  document.getElementById("screen-game").hidden = false;
  document.getElementById("review-bar").hidden = true;
  view.borders.classed("is-instant", true).classed("is-on", false);
  requestAnimationFrame(() => view.borders.classed("is-instant", false));
  hideReviewTip();
  renderHistory();
  showRound();
  resize();
}

function showRound() {
  const total = game.rounds.length;
  const round = game.rounds[game.index];
  els.kicker.textContent = "Manche " + (game.index + 1) + " / " + total;
  els.prompt.textContent = "Cliquez sur";
  els.target.textContent = round.name;
  els.result.hidden = true;
  game.click = null;
}

function showResult() {
  const result = game.results[game.results.length - 1];
  els.result.hidden = false;
  els.resultScore.textContent = String(result.score);
  els.resultDetail.textContent = resultSentence(result);
  const next = document.getElementById("btn-next");
  const last = game.index === game.rounds.length - 1;
  next.hidden = false;
  next.textContent = last ? "Voir mon score" : "Manche suivante";
}

function resultSentence(result) {
  if (result.hit) {
    if (game.modeId === "us") return "Dans l'État.";
    if (game.modeId === "france") return "Dans le département.";
    return "Dans le pays.";
  }
  const distance = "À " + formatKm(result.km);
  if (!result.where) return distance + " — dans l'océan.";
  return distance + " — " + result.where + ".";
}

function nextRound() {
  if (game.index + 1 >= game.rounds.length) {
    clearFinishTimer();
    finishGame();
    return;
  }
  game.index += 1;
  game.phase = "play";
  document.body.classList.remove("is-result");
  document.body.classList.add("is-playing");
  showRound();
  if (isCompact()) resize();
  else redraw();
}

function finishGame() {
  clearFinishTimer();
  game.phase = "finish";
  game.click = null;
  document.body.classList.remove("is-playing", "is-result");
  document.body.classList.add("is-finish");
  els.intro.hidden = true;
  els.chrome.hidden = true;
  els.historyWrap.hidden = true;
  view.borders.classed("is-on", true);
  if (isCompact()) resize();
  else redraw();
  renderRecap();
  els.finish.hidden = false;
}

function showMyMap() {
  game.phase = "review";
  document.body.classList.remove("is-finish");
  document.body.classList.add("is-review");
  els.finish.hidden = true;
  els.chrome.hidden = false;
  document.getElementById("screen-game").hidden = true;
  document.getElementById("review-bar").hidden = false;
  renderHistory();
  if (isCompact()) resize();
  else redraw();
}

function showScore() {
  game.phase = "finish";
  document.body.classList.remove("is-review");
  document.body.classList.add("is-finish");
  els.finish.hidden = false;
  els.chrome.hidden = true;
  els.historyWrap.hidden = true;
  document.getElementById("screen-game").hidden = false;
  document.getElementById("review-bar").hidden = true;
  hideReviewTip();
  if (isCompact()) resize();
  else redraw();
}

function renderHistory() {
  const playing = game.phase === "play" || game.phase === "result" || game.phase === "review";
  els.historyWrap.hidden = !playing || game.results.length === 0;
  const max = game.rounds.length * 100;
  const total = game.results.reduce((sum, result) => sum + result.score, 0);
  const items = game.results.map((result) => {
    const scoreClass = result.hit ? "score-num is-hit" : "score-num";
    return "<li><span>" + escapeHtml(result.name) + "</span><span class=\"" + scoreClass + "\">" + result.score + "</span></li>";
  });
  if (game.results.length) {
    items.push("<li class=\"score-history-total\"><span>Total</span><span class=\"score-num\">" + formatNumber(total) + " / " + formatNumber(max) + "</span></li>");
  }
  els.history.innerHTML = items.join("");
}

function renderRecap() {
  const max = game.rounds.length * 100;
  const total = game.results.reduce((sum, result) => sum + result.score, 0);
  els.finalScore.textContent = formatNumber(total) + " / " + formatNumber(max);
  els.recap.innerHTML = game.results.map((result) => (
    "<li><p class=\"finish-recap-name\">" + escapeHtml(result.name) + "</p>"
    + "<p class=\"finish-recap-score\">" + result.score + "</p>"
    + "<p class=\"finish-recap-detail\">" + escapeHtml(resultSentence(result)) + "</p></li>"
  )).join("");
}

function onHardChange(event) {
  if (game.modeId === "americas") {
    game.hardMode = false;
    syncControls();
    return;
  }
  game.hardMode = event.target.checked;
  syncControls();
}

function hardHint() {
  if (game.modeId === "americas") return "Indisponible ici : il ne resterait que deux pays.";
  if (game.modeId === "us") return "États enclavés seulement.";
  if (game.modeId === "france") return "Départements enclavés seulement.";
  return "Pays enclavés seulement.";
}

function onControlClick(event) {
  const modeButton = event.target.closest("[data-mode]");
  if (modeButton) {
    if (modeButton.dataset.mode === game.modeId) return;
    game.modeId = modeButton.dataset.mode;
    if (game.modeId === "americas") game.hardMode = false;
    syncControls();
    if (game.phase === "intro") flyToFrame();
    return;
  }
  const lengthButton = event.target.closest("[data-length]");
  if (lengthButton) {
    game.length = Number(lengthButton.dataset.length);
    syncControls();
  }
}

function syncControls() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.mode === game.modeId ? "true" : "false");
  });
  const ask = document.getElementById("intro-ask");
  if (ask) ask.textContent = introAsk();
  const unit = modeUnit();
  document.querySelectorAll("[data-length]").forEach((button) => {
    const length = Number(button.dataset.length);
    button.textContent = length + " " + unit;
    button.setAttribute("aria-pressed", length === game.length ? "true" : "false");
  });
  const americas = game.modeId === "americas";
  if (americas) game.hardMode = false;
  document.querySelectorAll("[data-hard]").forEach((input) => {
    input.checked = game.hardMode;
    input.disabled = americas;
  });
  const hint = hardHint();
  document.querySelectorAll(".hard-hint").forEach((node) => {
    node.textContent = hint;
  });
}

function introAsk() {
  if (game.modeId === "us") return "Saurez-vous placer les États quand même ?";
  if (game.modeId === "france") return "Saurez-vous placer les départements quand même ?";
  return "Saurez-vous placer les pays quand même ?";
}

function modeUnit() {
  if (game.modeId === "us") return "États";
  if (game.modeId === "france") return "départements";
  return "pays";
}

function shuffle(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function arcLine(start, end) {
  const interpolate = d3.geoInterpolate(start, end);
  const steps = Math.max(2, Math.ceil(d3.geoDistance(start, end) * EARTH_KM / 40));
  const coordinates = [];
  for (let i = 0; i <= steps; i += 1) coordinates.push(interpolate(i / steps));
  return { type: "LineString", coordinates };
}

function formatKm(km) {
  return formatNumber(Math.max(1, Math.round(km))) + " km";
}

function formatNumber(value) {
  return value.toLocaleString("fr-FR");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
