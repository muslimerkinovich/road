// =====================
// MODULE-LEVEL STATE
// shared between initMap and DOMContentLoaded
// =====================
let gMapInstance = null;
const districtPolygons = []; // { name, polygon, bounds, center, color }
const uchastkaMarkers = [];  // Google Maps Marker instances for uchastkalar
const radarMarkers = [];     // Google Maps Marker instances for radars
let onDistrictClick = null;  // set by DOMContentLoaded once app is ready
let onUchastkaClick = null;  // set by DOMContentLoaded once app is ready
let isProgrammaticZoom = false;
let svPanoramaInstance = null;

// =====================
// MAP HELPERS
// =====================
function setAllPolygonsNormal() {
  districtPolygons.forEach((dp) => {
    dp.polygon.setOptions({ fillColor: dp.color, fillOpacity: 0.2, strokeColor: dp.color, strokeWeight: 2, strokeOpacity: 0.85 });
  });
}

function highlightDistrictOnMap(tumanName) {
  districtPolygons.forEach((dp) => {
    if (dp.name === tumanName) {
      dp.polygon.setOptions({ fillOpacity: 0.38, strokeWeight: 2.5, strokeOpacity: 1 });
    } else {
      dp.polygon.setOptions({ fillOpacity: 0.15, strokeWeight: 1.5, strokeOpacity: 0.7 });
    }
  });
}

// Create SVG circle icon with order number for uchastka markers
function createUchastkaIcon(num) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">
    <circle cx="17" cy="17" r="15" fill="#f97316" stroke="white" stroke-width="2.5"/>
    <text x="17" y="22" text-anchor="middle" fill="white" font-size="${num >= 10 ? 11 : 13}px" font-weight="bold" font-family="Arial,sans-serif">${num}</text>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(34, 34),
    anchor: new google.maps.Point(17, 17),
  };
}

// Radar marker icon using radar.png
function createRadarIcon() {
  return {
    url: "icon/radar.png",
    scaledSize: new google.maps.Size(22, 32),
    anchor: new google.maps.Point(16, 16),
  };
}

function showRadarMarkers() {
  radarMarkers.forEach((m) => m.setMap(gMapInstance));
}

function hideRadarMarkers() {
  radarMarkers.forEach((m) => m.setMap(null));
}

function showUchastkaMarkers() {
  uchastkaMarkers.forEach((m) => m.setMap(gMapInstance));
}

function hideUchastkaMarkers() {
  uchastkaMarkers.forEach((m) => m.setMap(null));
}

function selectDistrictOnMap(tumanName) {
  const d = districtPolygons.find((dp) => dp.name === tumanName);
  if (!d || !gMapInstance) return;
  isProgrammaticZoom = true;
  gMapInstance.fitBounds(d.bounds, { padding: 40 });
  highlightDistrictOnMap(tumanName);
}

function resetMapToUmumiy() {
  if (!gMapInstance) return;
  isProgrammaticZoom = true;
  gMapInstance.setCenter({ lat: 40.55, lng: 68.6 });
  gMapInstance.setZoom(6);
  setAllPolygonsNormal();
}

function zoomToUchastka(lat, lng) {
  if (!gMapInstance) return;
  isProgrammaticZoom = true;
  // Animate: pan to location first, then zoom in once settled
  gMapInstance.panTo({ lat, lng });
  google.maps.event.addListenerOnce(gMapInstance, "idle", () => {
    isProgrammaticZoom = true;
    gMapInstance.setZoom(12);
  });
}

function hideUchastkaMapOverlay() {
  ["uchastkaPreview", "streetViewBtn", "panoramaLinkBtn"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

function showUchastkaMapOverlay(item) {
  // --- Image preview (bottom-left of map) ---
  const previewEl = document.getElementById("uchastkaPreview");
  const previewImg = document.getElementById("uchastkaPreviewImg");
  if (previewEl && previewImg) {
    if (item?.image) {
      previewImg.src = item.image;
      previewEl.style.display = "block";
    } else {
      previewEl.style.display = "none";
    }
  }

  // --- Custom panorama link button (any URL: Yandex, Google, etc.) ---
  const linkBtn = document.getElementById("panoramaLinkBtn");
  if (linkBtn) {
    if (item?.streetView) {
      linkBtn.style.display = "block";
      linkBtn.onclick = () => window.open(item.streetView, "_blank", "noopener");
    } else {
      linkBtn.style.display = "none";
    }
  }

  // --- Auto-check Google Street View coverage ---
  const svBtn = document.getElementById("streetViewBtn");
  if (svBtn) {
    svBtn.style.display = "none";
    if (item?.coordinates && typeof google !== "undefined") {
      const [lat, lng] = item.coordinates;
      const svService = new google.maps.StreetViewService();
      svService.getPanorama({ location: { lat, lng }, radius: 200 }, (data, status) => {
        if (status === google.maps.StreetViewStatus.OK) {
          svBtn.style.display = "block";
          svBtn._svPos = { lat: data.location.latLng.lat(), lng: data.location.latLng.lng() };
        }
      });
    }
  }
}

// =====================
// GOOGLE MAPS INIT
// Called by the Maps API once loaded
// =====================
window.initMap = async function () {
  const mapDiv = document.getElementById("googleMap");
  if (!mapDiv) return;

  // ---- Init map FIRST so tiles load immediately ----
  const gMap = new google.maps.Map(mapDiv, {
    center: { lat: 40.55, lng: 68.6 },
    zoom: 10,
    mapTypeId: "roadmap",
    disableDefaultUI: true,
    zoomControl: true,
    zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
  });
  gMapInstance = gMap;

  // Reset programmatic zoom flag after map settles
  gMap.addListener("idle", () => { isProgrammaticZoom = false; });

  // ---- District files + colors + tuman names ----
  const DISTRICTS = [
    { file: "boyovut",         color: "#8E89DD", name: "Boyovut tumani"    },
    { file: "sardoba",         color: "#8E89DD", name: "Sardoba tumani"    },
    { file: "sirdaryo",        color: "#D2D25A", name: "Sirdaryo tumani"   },
    { file: "guliston_shaxar", color: "#ACACAC", name: "Guliston shahar"   },
    { file: "guliston",        color: "#FFB5E9", name: "Guliston tumani"   },
    { file: "mirzaobod",       color: "#88F2C0", name: "Mirzaobod tumani"  },
    { file: "oqoltin",         color: "#FFBB97", name: "Oqoltin tumani"    },
    { file: "sayxunobod",      color: "#BDDCFF", name: "Sayxunobod tumani" },
    { file: "xovos",           color: "#BA6C6D", name: "Xovos tumani"      },
    { file: "yangiyer",        color: "#8D8181", name: "Yangiyer shahar"   },
  ];

  // Load region, uchastkalar + all districts in parallel (after map is live)
  const load = (path) => fetch(path).then((r) => r.json()).catch((e) => { console.warn("load failed:", path, e); return null; });

  let regionGeoJson, uchastkalarData, radarsData, districtGeoJsons;
  try {
    [regionGeoJson, uchastkalarData, radarsData, ...districtGeoJsons] = await Promise.all([
      load("geojson/region.geojson"),
      load("data/uchastkalar.json"),
      load("data/radars.json"),
      ...DISTRICTS.map((d) => load(`geojson/${d.file}.geojson`)),
    ]);
  } catch (e) {
    console.error("initMap data load error:", e);
    return;
  }

  // Helper: extract outer ring from Polygon / Feature / FeatureCollection
  function extractRing(gj) {
    if (!gj) return null;
    if (gj.type === "Polygon")           return gj.coordinates[0];
    if (gj.type === "Feature")           return gj.geometry?.coordinates?.[0];
    if (gj.type === "FeatureCollection") return gj.features?.[0]?.geometry?.coordinates?.[0];
    return null;
  }

  // GeoJSON [lng, lat] → Google Maps {lat, lng}
  const toPath = (ring) => ring.map(([lng, lat]) => ({ lat, lng }));

  // ---- Draw district polygons ----
  DISTRICTS.forEach((d, i) => {
    const gj = districtGeoJsons[i];
    const raw = extractRing(gj);
    if (!raw) return;
    const path = toPath(raw);
    const poly = new google.maps.Polygon({
      paths: path,
      fillColor: d.color,
      fillOpacity: 0.2,
      strokeColor: d.color,
      strokeWeight: 2,
      strokeOpacity: 0.85,
      clickable: true,
      map: gMap,
    });

    // Use bounds from GeoJSON if provided, otherwise compute from polygon path
    let dBounds;
    if (gj?.bounds?.length === 2) {
      const [[swLng, swLat], [neLng, neLat]] = gj.bounds;
      dBounds = new google.maps.LatLngBounds(
        { lat: swLat, lng: swLng },
        { lat: neLat, lng: neLng }
      );
    } else {
      dBounds = new google.maps.LatLngBounds();
      path.forEach((pt) => dBounds.extend(pt));
    }

    // Use center from GeoJSON if provided
    let dCenter = null;
    if (gj?.center?.length === 2) {
      dCenter = { lat: gj.center[1], lng: gj.center[0] };
    }

    districtPolygons.push({ name: d.name, polygon: poly, bounds: dBounds, center: dCenter, color: d.color });

    // Clicking a polygon on the map triggers the app handler
    poly.addListener("click", () => {
      if (onDistrictClick) onDistrictClick(d.name);
    });
  });

  // ---- Uchastka markers (numbered circles, hidden initially) ----
  if (Array.isArray(uchastkalarData)) {
    uchastkalarData.forEach((u) => {
      if (!u.coordinates) return;
      const [lat, lng] = u.coordinates;
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: null, // hidden until "Umumiy" tab is active
        icon: createUchastkaIcon(u.id),
        title: u.title,
        zIndex: 10,
      });
      marker.addListener("click", () => {
        zoomToUchastka(lat, lng);
        if (onUchastkaClick) onUchastkaClick(u.id);
      });
      uchastkaMarkers.push(marker);
    });
    // Default tab is "Umumiy" — show uchastka markers immediately
    showUchastkaMarkers();
  }

  // ---- Radar markers (hidden by default, shown on "Radar" tab) ----
  if (Array.isArray(radarsData)) {
    radarsData.forEach((r) => {
      if (!r.coordinates || r.coordinates.length < 2) return;
      const [lat, lng] = r.coordinates;
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: null, // hidden initially
        icon: createRadarIcon(),
        title: `${r.type}: ${r.name}`,
        zIndex: 9,
      });
      radarMarkers.push(marker);
    });
  }

  // ---- Region boundary — border only, no fill ----
  const regionRaw = extractRing(regionGeoJson);
  if (!regionRaw) return;
  const regionRing = toPath(regionRaw);

  new google.maps.Polygon({
    paths: regionRing,
    fillOpacity: 0,
    strokeColor: "#4a90d9",
    strokeWeight: 2.5,
    strokeOpacity: 0.9,
    clickable: false,
    map: gMap,
  });

  // ---- Pan restriction ----
  // Expand bounds slightly for breathing room at edges
  const bounds = new google.maps.LatLngBounds();
  regionRing.forEach((pt) => bounds.extend(pt));

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const paddedBounds = new google.maps.LatLngBounds(
    { lat: sw.lat() - 0.2, lng: sw.lng() - 0.2 },
    { lat: ne.lat() + 0.2, lng: ne.lng() + 0.2 }
  );

  gMap.setOptions({
    restriction: { latLngBounds: paddedBounds, strictBounds: false },
    minZoom: 9,
  });

  // Snap back only after drag ends — smooth, not jerky
  const regionPoly = new google.maps.Polygon({ paths: regionRing });
  let lastValidCenter = gMap.getCenter();

  gMap.addListener("dragend", () => {
    const center = gMap.getCenter();
    if (!google.maps.geometry.poly.containsLocation(center, regionPoly)) {
      gMap.panTo(lastValidCenter);
    } else {
      lastValidCenter = center;
    }
  });
};

// =====================
// MAIN APP
// =====================
document.addEventListener("DOMContentLoaded", async () => {
  // =====================
  // ELEMENTLAR
  // =====================
  const bottomMapButtons = document.querySelectorAll(".button-container .btn");
  const leftButtonsBlock = document.querySelector(".chap-tomon .left-buttons");
  const leftPanelHeader = document.querySelector(".chap-tomon .left-panel-header");
  const rightContent = document.querySelector(".ung-tomon .right-content");

  const defaultRightHTML = rightContent ? rightContent.innerHTML : "";

  // =====================
  // MA'LUMOTLAR YUKLASH
  // =====================
  const [uchastkalar, tumanlar, categories, radars] = await Promise.all([
    fetch("data/uchastkalar.json").then((r) => r.json()),
    fetch("data/tumanlar.json").then((r) => r.json()),
    fetch("data/categories.json").then((r) => r.json()),
    fetch("data/radars.json").then((r) => r.json()),
  ]);

  const categoryText  = categories;
  const radarList     = radars;
  const tumanList     = tumanlar.list;
  const tumanWordData = tumanlar.wordData;
  const tumanTotals   = tumanlar.totals;


  // =====================
  // QO'SHIMCHA MA'LUMOT
  // =====================
  const extraInfoHTML = `
    <h2>Sirdaryo viloyati avtomobil yo'llari<br>(umumiy ma'lumot)</h2>

    <p>
      Sirdaryo viloyati hududidan o'tuvchi avtomobil yo'llarining umumiy uzunligi
      <strong>5 ming 129 km</strong> ni tashkil etadi.
    </p>

    <ul class="extra-info-list">
      <li>
        <strong>Xalqaro ahamiyatdagi yo'llar</strong> – 241 km (4 ta):
        M-34 87 km, M-39 44 km, A-373 62 km, A-376 48 km
      </li>
      <li><strong>Davlat ahamiyatdagi yo'llar</strong> – 476 km (14 ta yo'llardan iborat)</li>
      <li><strong>Mahalliy ahamiyatdagi yo'llar</strong> – 647 km (52 ta yo'llardan iborat)</li>
      <li><strong>Ichki yo'llar</strong> – 3 ming 765 km</li>
    </ul>

    <div class="extra-divider"></div>

    <p>
      <strong>M-34</strong> yo'lini Sirdaryo tumani hududidan o'tgan
      <strong>56–70 km</strong> oralig'i xalqaro va viloyatlararo tranzit yo'nalishda
      harakatlanuvchi transportlar uchun asosiy yo'nalish hisoblanadi.
    </p>

    <p>
      Mazkur yo'l qismidagi kunlik harakat jadalligi
      <strong>48 800–50 400</strong> ta transport birligini tashkil etmoqda.
    </p>

    <ul class="extra-info-list">
      <li>Yuk avtomashinalari: <strong>15 840</strong> ta</li>
      <li>Yo'lovchi tashuvchi avtobuslar: <strong>3 212</strong> ta</li>
      <li>Yengil avtomashinalar: <strong>31 300</strong> ta</li>
    </ul>

    <p>
      Ommaviy bayramlar va dam olish kunlari mazkur jadallik
      <strong>14–16%</strong> ga (<strong>55 150 – 57 900</strong> taga) ortadi.
      Natijada, ushbu yo'l qismida hosil bo'layotgan tirbandliklar sutkaning
      <strong>16–17 soat</strong> qismiga (<strong>07:00 dan 23:00 ga qadar</strong>) to'g'ri kelmoqda.
    </p>

    <p>
      Avtomobil yo'li har ikkala yo'nalishda <strong>2 tasmadan</strong>, umumiy <strong>4 tasmadan</strong>
      iborat bo'lib, umumiy kengligi <strong>16.8 metr</strong> (bir yo'nalishda <strong>8.4 metr</strong>) ni
      tashkil etadi.
    </p>
  `;

  // =====================
  // HELPERS
  // =====================
  function escapeHTML(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


  function showRight(html, className = "") {
    if (!rightContent) return;
    rightContent.style.display = "block";
    rightContent.className = `right-content ${className}`.trim();
    rightContent.innerHTML = html;
  }

  function highlightLeftPanelBtn(tumanName) {
    document.querySelectorAll(".chap-tomon .left-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tuman === tumanName);
    });
  }

  // =====================
  // RENDER FUNCTIONS
  // =====================
  function renderCategoryRight(key) {
    const data = categoryText[key];
    if (!data) return defaultRightHTML;

    const items = Object.entries(data.byTuman || {})
      .map(([name, val]) => {
        const n = escapeHTML(name);
        const v = escapeHTML(val);
        return `<li><span>${n}</span><span><strong>${v} ta</strong></span></li>`;
      })
      .join("");

    return `
      <div class="cat-wrap">
        <div class="cat-header">
          <div class="cat-title">${escapeHTML(data.title)}</div>
        </div>

        <div class="cat-card">
          <div class="cat-desc">${data.totalLine}</div>
          <div class="cat-total">
            <span class="cat-badge">${escapeHTML(data.totalValue)}</span>
          </div>
        </div>

        <div class="cat-section">
          <div class="cat-section-title">Tumanlar kesimida:</div>
          <ul class="category-list">${items}</ul>
        </div>
      </div>
    `;
  }

  function renderRadarRight() {
    const items = radarList
      .map((item, index) => {
        const type = escapeHTML(item.type || "");
        const name = escapeHTML(item.name || "");
        return `<li><strong>${index + 1}.</strong> <em>${type}</em> — ${name}</li>`;
      })
      .join("");

    return `
      <div class="cat-wrap">
        <div class="cat-header">
          <div class="cat-title">RADAR JOYLASHUVLARI</div>
        </div>

        <div class="cat-card">
          <div class="cat-desc">
            Viloyat hududidagi radar va nazorat nuqtalari ro'yxati
          </div>
          <div class="cat-total">
            <span class="cat-badge">Jami: ${radarList.length} ta</span>
          </div>
        </div>

        <div class="cat-section">
          <div class="cat-section-title">Radarlar ro'yxati:</div>
          <ul class="radar-list">${items}</ul>
        </div>
      </div>
    `;
  }

  function renderUchastka(i) {
    const item = uchastkalar[i - 1];
    if (!item) return;

    const ythHTML =
      item.yth.length > 0
        ? `<ul class="uchastka-yth">
            ${item.yth.map((x) => `<li>${escapeHTML(x)}</li>`).join("")}
           </ul>`
        : "";

    const actionsHTML = item.actions.map((x) => `<li>${escapeHTML(x)}</li>`).join("");

    showRight(`
      <div class="tuman-wrap">
        <div class="cat-header">
          <div class="cat-title">${escapeHTML(item.title)}</div>
        </div>

        <div class="cat-card">
          <p class="cat-desc"><strong>Manzil:</strong> ${escapeHTML(item.location)}</p>
        </div>

        ${ythHTML}

        <div class="cat-section">
          <div class="cat-section-title">Bartaraf etish uchun ishlar va takliflar:</div>
          <ul class="uchastka-actions">${actionsHTML}</ul>
        </div>
      </div>
    `);
  }

  function renderTuman(tumanName) {

    const d = tumanWordData[tumanName] || {};
    const lines = [];

    if (d.xalqaro  != null) lines.push(`Xalqaro ahamiyatga ega yo'llarda: <strong>${d.xalqaro} ta</strong>`);
    if (d.davlat   != null) lines.push(`Davlat ahamiyatidagi yo'llarda: <strong>${d.davlat} ta</strong>`);
    if (d.maxalliy != null) lines.push(`Mahalliy ahamiyatga ega yo'llarda: <strong>${d.maxalliy} ta</strong>`);
    if (d.ichki    != null) lines.push(`Ichki xo'jalik yo'llarida: <strong>${d.ichki} ta</strong>`);

    const listHTML =
      lines.length > 0
        ? `<ul class="tuman-info">${lines.map((x) => `<li>${x}</li>`).join("")}</ul>`
        : `<div class="cat-card"><p>Ma'lumot kiritilmagan.</p></div>`;

    const total = tumanTotals[tumanName];
    const totalHTML = Number.isFinite(total)
      ? `<div class="tuman-total"><span class="badge">Jami: ${escapeHTML(total)} ta</span></div>`
      : "";

    showRight(`
      <div class="tuman-wrap">
        <div class="cat-header">
          <div class="cat-title">${escapeHTML(tumanName)}</div>
        </div>

        <div class="tuman-subtitle">
          2025 yil davomida tuman/shaharlarda qayd qilingan yo'l-transport hodisalari haqida ma'lumot
        </div>

        ${totalHTML}

        <div class="cat-section">
          <div class="cat-section-title">Yo'llar kesimida:</div>
          ${listHTML}
        </div>
      </div>
    `);
  }

  // =====================
  // LEFT BUTTONS
  // =====================
  function createLeftButtons(list, mode) {
    if (!leftButtonsBlock) return;
    leftButtonsBlock.innerHTML = "";

    // Update header label
    if (leftPanelHeader) {
      leftPanelHeader.textContent = mode === "uchastka" ? "UCHASTKALAR" : "TUMANLAR";
    }

    list.forEach((text, idx) => {
      const btn = document.createElement("button");
      btn.className = "left-btn";
      btn.type = "button";
      btn.dataset.mode = mode;

      if (mode === "uchastka") {
        const num = idx + 1;
        btn.dataset.uchastka = String(num);
        const count = (uchastkalar[num - 1]?.yth || []).length;
        btn.innerHTML = `
          <span class="left-btn-dot"></span>
          <span class="left-btn-name">${num}-UCHASTKA</span>
          <span class="left-btn-count">(${count}ta)</span>
        `;
      } else {
        btn.dataset.tuman = text;
        const total = tumanTotals[text];
        btn.innerHTML = `
          <span class="left-btn-dot tuman"></span>
          <span class="left-btn-name">${escapeHTML(text)}</span>
          ${total != null ? `<span class="left-btn-count">(${total}ta)</span>` : ""}
        `;
      }

      leftButtonsBlock.appendChild(btn);
    });

    if (mode === "tuman") {
      const extraBtn = document.createElement("button");
      extraBtn.className = "extra-btn";
      extraBtn.type = "button";
      extraBtn.textContent = "Qo'shimcha ma'lumot";
      leftButtonsBlock.appendChild(extraBtn);
    }
  }

  // =====================
  // SET ACTIVE MAP
  // =====================
  function setActiveMap(key) {
    const validKeys = ["umumiy", "xalqaro", "davlat", "maxalliy", "ichki", "radar"];
    if (!validKeys.includes(key)) return;

    hideUchastkaMapOverlay();
    hideRadarMarkers();
    hideUchastkaMarkers();
    resetMapToUmumiy(); // zoom out to full region on every top-tab tap
    bottomMapButtons.forEach((b) => b.classList.remove("active"));
    const activeBtn = document.querySelector(`.button-container .btn[data-map="${key}"]`);
    if (activeBtn) activeBtn.classList.add("active");

    if (key === "umumiy") {
      createLeftButtons(Array.from({ length: 14 }, (_, i) => `Uchastka ${i + 1}`), "uchastka");
      showRight(defaultRightHTML, "default-view");
      showUchastkaMarkers();
      return;
    }

    if (key === "radar") {
      createLeftButtons(Array.from({ length: 14 }, (_, i) => `Uchastka ${i + 1}`), "uchastka");
      showRight(renderRadarRight());
      showRadarMarkers();
      return;
    }

    createLeftButtons(tumanList, "tuman");
    showRight(renderCategoryRight(key));
  }

  // =====================
  // DISTRICT CLICK CALLBACK (triggered by map polygon clicks or left-panel buttons)
  // =====================
  onDistrictClick = (tumanName) => {
    createLeftButtons(tumanList, "tuman");
    renderTuman(tumanName);
    selectDistrictOnMap(tumanName);
    highlightLeftPanelBtn(tumanName);
  };

  onUchastkaClick = (n) => {
    renderUchastka(n);
    const item = uchastkalar[n - 1];
    showUchastkaMapOverlay(item);
  };

  // =====================
  // PASTKI BTN
  // =====================
  bottomMapButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActiveMap(btn.dataset.map));
  });

  setActiveMap("umumiy");

  // =====================
  // CHAP PANEL / EXTRA
  // =====================
  document.addEventListener("click", (e) => {
    const leftBtn = e.target.closest(".chap-tomon .left-buttons .left-btn");
    if (leftBtn) {
      const mode = leftBtn.dataset.mode;

      if (mode === "uchastka") {
        const n = Number(leftBtn.dataset.uchastka);
        if (Number.isFinite(n) && n >= 1 && n <= 14) {
          const item = uchastkalar[n - 1];
          renderUchastka(n);
          showUchastkaMapOverlay(item);
          if (item?.coordinates) {
            const [lat, lng] = item.coordinates;
            zoomToUchastka(lat, lng);
          }
        }
        return;
      }

      if (mode === "tuman") {
        const tumanName = leftBtn.dataset.tuman;
        if (tumanName) {
          renderTuman(tumanName);
          selectDistrictOnMap(tumanName);
          highlightLeftPanelBtn(tumanName);
        }
        return;
      }
    }

    const extra = e.target.closest(".chap-tomon .left-buttons .extra-btn");
    if (extra) {
      showRight(extraInfoHTML);
    }
  });

  // =====================
  // PLANSHET OVERLAY
  // =====================
  const planshetOverlayEl  = document.getElementById("planshetOverlay");
  const planshetImgEl      = document.getElementById("planshetImg");
  const planshetCloseEl    = document.getElementById("planshetClose");
  const planshetPrevEl     = document.getElementById("planshetPrev");
  const planshetNextEl     = document.getElementById("planshetNext");
  const planshetCounterEl  = document.getElementById("planshetCounter");

  let currentGallery = [];
  let currentIndex = 0;

  function updatePlanshetView() {
    if (!planshetImgEl || !planshetCounterEl || !currentGallery.length) return;
    planshetImgEl.src = currentGallery[currentIndex];
    planshetCounterEl.textContent = `${currentIndex + 1} / ${currentGallery.length}`;

    const multiple = currentGallery.length > 1;
    if (planshetPrevEl) planshetPrevEl.style.display = multiple ? "flex" : "none";
    if (planshetNextEl) planshetNextEl.style.display = multiple ? "flex" : "none";
  }

  function openPlanshet(images, startIndex = 0) {
    if (!planshetOverlayEl || !planshetImgEl) return;
    currentGallery = Array.isArray(images) ? images.filter(Boolean) : [];
    if (!currentGallery.length) return;
    currentIndex = Math.max(0, Math.min(startIndex, currentGallery.length - 1));
    updatePlanshetView();
    planshetOverlayEl.classList.add("open");
    planshetOverlayEl.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closePlanshet() {
    if (!planshetOverlayEl || !planshetImgEl) return;
    planshetOverlayEl.classList.remove("open");
    planshetOverlayEl.setAttribute("aria-hidden", "true");
    planshetImgEl.src = "";
    document.body.style.overflow = "";
    currentGallery = [];
    currentIndex = 0;
  }

  function showPrevPlanshet() {
    if (currentGallery.length <= 1) return;
    currentIndex = (currentIndex - 1 + currentGallery.length) % currentGallery.length;
    updatePlanshetView();
  }

  function showNextPlanshet() {
    if (currentGallery.length <= 1) return;
    currentIndex = (currentIndex + 1) % currentGallery.length;
    updatePlanshetView();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".side-btn");
    if (!btn) return;
    const images = (btn.getAttribute("data-srcs") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (images.length) openPlanshet(images, 0);
  });

  if (planshetCloseEl) planshetCloseEl.addEventListener("click", closePlanshet);
  if (planshetPrevEl)  planshetPrevEl.addEventListener("click", showPrevPlanshet);
  if (planshetNextEl)  planshetNextEl.addEventListener("click", showNextPlanshet);

  if (planshetOverlayEl) {
    planshetOverlayEl.addEventListener("click", (e) => {
      if (e.target === planshetOverlayEl) closePlanshet();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closePlanshet(); closeSvModal(); return; }
    if (!planshetOverlayEl?.classList.contains("open")) return;
    if (e.key === "ArrowLeft")  showPrevPlanshet();
    if (e.key === "ArrowRight") showNextPlanshet();
  });

  // =====================
  // STREET VIEW MODAL
  // =====================
  const svModalEl = document.getElementById("svModal");
  const svCloseEl = document.getElementById("svClose");
  const svPanoEl  = document.getElementById("svPanorama");
  const svBtn2    = document.getElementById("streetViewBtn");

  function closeSvModal() {
    if (svModalEl) svModalEl.style.display = "none";
  }

  function openSvModal(position) {
    if (!svModalEl || !svPanoEl) return;
    svModalEl.style.display = "flex";
    if (svPanoramaInstance) {
      svPanoramaInstance.setPosition(position);
    } else {
      svPanoramaInstance = new google.maps.StreetViewPanorama(svPanoEl, {
        position,
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: false,
        showRoadLabels: false,
      });
    }
  }

  if (svBtn2) svBtn2.addEventListener("click", () => {
    if (svBtn2._svPos) openSvModal(svBtn2._svPos);
  });
  if (svCloseEl) svCloseEl.addEventListener("click", closeSvModal);
  if (svModalEl) svModalEl.addEventListener("click", (e) => {
    if (e.target === svModalEl) closeSvModal();
  });

  // Tap uchastka preview image → open in planshet full-screen
  const uchastkaPreviewEl = document.getElementById("uchastkaPreview");
  if (uchastkaPreviewEl) {
    uchastkaPreviewEl.addEventListener("click", () => {
      const src = document.getElementById("uchastkaPreviewImg")?.src;
      if (src) openPlanshet([src], 0);
    });
  }
});

