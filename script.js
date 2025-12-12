// ---------- CONFIG / TOGGLES (tweak here) ----------
const ENABLE_FIRST_TAG_CLICK = true;
const RESELECT_ALL_WHEN_EMPTY = true;
const ENABLE_PAGE_TRANSITION = false; // expanding-item animation
const ENABLE_PAGE_FADE = true;       // simple full-page fade

const PAGE_ANIM_DURATION_MS = 480;
const PAGE_ANIM_EASE = "cubic-bezier(.4,.5,.8,1)";
const PAGE_FADE_DURATION_MS = 480;
const PAGE_FADE_EASE = PAGE_ANIM_EASE;

// track first-tag-click behaviour (used by buildTagFilterBar)
let firstTagClick = true;






// ---------- TILT CONFIG (editable) ----------
/*
  ENABLE_TILT: toggle the pointer-based tilt behavior on/off
  TILT_DEG: maximum rotation (degrees) applied on X/Y axes
  ENABLE_Z_PUSH: whether to apply translateZ depth (will visually enlarge element)
  Z_PUSH: translateZ depth (px). Set to 0 to avoid the "growing" effect.
  TILT_SELECTOR: selector for media elements
*/
const ENABLE_TILT = false;
const TILT_DEG = -7;
const ENABLE_Z_PUSH = false; // set false to avoid visual growth / overflow
const Z_PUSH = 0; // set to >0 only if ENABLE_Z_PUSH is true and you accept visual growth
const TILT_SELECTOR = '.media';






// ---------- SMALL HELPERS ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// --- URL tag encoding (small obfuscation: XOR + base64) ---
function _xorBase64Encode(str, key = 'ivb-2025') {
    const chars = [];
    for (let i = 0; i < str.length; i++) chars.push(String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length)));
    return btoa(chars.join(''));
}
function _xorBase64Decode(enc, key = 'ivb-2025') {
    try {
        const bin = atob(enc);
        let out = '';
        for (let i = 0; i < bin.length; i++) out += String.fromCharCode(bin.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        return out;
    } catch (e) { return null; }
}
function encodeTagsToParam(tagArray) {
    try { return _xorBase64Encode(JSON.stringify(Array.from(tagArray || []))); }
    catch (e) { return ''; }
}
function decodeTagsFromParam(param) {
    try {
        const txt = _xorBase64Decode(param);
        if (!txt) return [];
        const arr = JSON.parse(txt);
        return Array.isArray(arr) ? arr.map(String) : [];
    } catch (e) { return []; }
}
function updateUrlWithTags(tagsSet) {
    try {
        const url = new URL(window.location.href);
        const arr = Array.from(tagsSet || []);
        // if ALL_TAGS is defined and selection equals all tags -> remove param (default)
        if (Array.isArray(ALL_TAGS) && ALL_TAGS.length > 0) {
            const allSelected = (arr.length === ALL_TAGS.length) && ALL_TAGS.every(t => tagsSet.has(t));
            if (allSelected) { url.searchParams.delete('t'); history.replaceState(null, '', url.toString()); return; }
        } else {
            if (!arr.length) { url.searchParams.delete('t'); history.replaceState(null, '', url.toString()); return; }
        }
        const enc = encodeTagsToParam(arr);
        if (!enc) url.searchParams.delete('t'); else url.searchParams.set('t', enc);
        history.replaceState(null, '', url.toString());
    } catch (e) { /* ignore */ }
}
function readTagsFromUrl() {
    try {
        const url = new URL(window.location.href);
        const p = url.searchParams.get('t');
        if (!p) return [];
        return decodeTagsFromParam(p);
    } catch (e) { return []; }
}

// convert plain text to safe HTML preserving line breaks from meta descriptions
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function nl2brFromMeta(raw) {
    // Normalize line endings, trim indentation on each line but preserve blank lines,
    // then escape and join with <br>
    const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.trim());
    return lines.map(escapeHtml).join('<br>');
}

// ---------- PROJECT / METADATA LOADING ----------
async function loadProjectList() {
    await import("./projects/list.js");
    return window.PROJECT_FILES || [];
}

async function loadPortfolio() {
    const pages = await loadProjectList();
    const items = [];
    for (const page of pages) {
        const res = await fetch("projects/" + page);
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, "text/html");
        const meta = name => doc.querySelector(`meta[name="${name}"]`)?.content || "";
        const rawDesc = meta("description") || "";
        items.push({
            url: "projects/" + page,
            title: meta("title") || "Untitled",
            description: nl2brFromMeta(rawDesc), // HTML-safe with <br> for display
            thumbnail: meta("thumbnail") || "",
            color: meta("color") || "",
            date: meta("date") || "",
            tags: (meta("tags") || "").split(",").map(t => t.trim()).filter(Boolean)
        });
    }
    return items;
}

// ---------- CAROUSEL STATE ----------
let currentIndex = 0;
let carouselItems = []; // { element, container, data, idx }
let portfolioItems = [];
let selectedTags = new Set();
let ALL_TAGS = [];
let moveQueue = [];
let queueRunning = false;
const BASE_TOTAL_MS = 300;
const MIN_ANIM_MS = 20;

function signedDistance(i, current, n) {
    let d = ((i - current + n) % n);
    if (d > n/2) d -= n;
    return d;
}

// ---------- QUEUE / ROTATION ----------
function enqueueSteps(steps) {
    const dir = steps >= 0 ? 1 : -1;
    for (let i = 0; i < Math.abs(steps); i++) moveQueue.push(dir);
    if (!queueRunning) processMoveQueue();
}

async function processMoveQueue() {
    if (queueRunning) return;
    queueRunning = true;
    const n = carouselItems.length || 1;
    while (moveQueue.length) {
        const remaining = moveQueue.length;
        let perStepMs = Math.floor(BASE_TOTAL_MS / remaining);
        if (perStepMs < MIN_ANIM_MS) perStepMs = MIN_ANIM_MS;
        const dir = moveQueue.shift();
        currentIndex = (currentIndex + dir + n) % n;
        updateCarouselClasses(false, perStepMs);
        await sleep(perStepMs + 28);
    }
    queueRunning = false;
}

// ---------- CREATION / UPDATES ----------
// helper: produce a CSS radial-gradient string from project meta "color"
// - accepts full gradients (radial/linear) and returns them as-is
// - accepts comma-separated color lists -> wraps as radial-gradient(..., colors)
// - accepts a single color -> creates a subtle radial using that color
function formatColorForRadial(color) {
    if (!color) return "";
    const v = String(color).trim().replace(/\s*;$/,'');
    // if it's already a gradient (radial or linear) return as-is
    if (/^\s*(radial-gradient|linear-gradient)\s*\(/i.test(v)) return v;
    // multiple comma separated values -> use them as stops inside a radial gradient
    if (v.includes(',')) return `radial-gradient(circle at 50% 10%, ${v})`;
    // single color -> create a gentle radial using the color and a faint outer fade
    return `radial-gradient(${v}, rgb(0,0,0))`;
}

function createCarouselElement(item, idx) {
    const wrapper = document.createElement("div");
    wrapper.className = "carousel-item-container";
    const el = document.createElement("div");
    el.className = "carousel-item hidden";
    el.dataset.idx = idx;
    el.style.transition = "";
    el.style.opacity = "";
    // use radial-gradient background based on meta color
    el.style.backgroundImage = formatColorForRadial(item.color) || "linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.35))";

    // helper to set icon src trying multiple filename variants (handles characters like '#' and '/')
    function setIconImgSources(img, name) {
        const raw = String(name || "");
        const bases = [
            raw,
            raw.replace(/\//g,'_'),
            raw.replace(/\//g,''),            // remove slashes
            raw.replace(/\s+/g,'_')          // spaces -> underscore
        ].filter(Boolean);
        const candidates = [];
        bases.forEach(b => {
            candidates.push(`${b}_Logo.png`);
            candidates.push(`${b}.png`);
            candidates.push(encodeURIComponent(`${b}_Logo.png`));
            candidates.push(encodeURIComponent(`${b}.png`));
        });
        // dedupe while preserving order
        const seen = new Set();
        const uniq = candidates.filter(c => (seen.has(c) ? false : (seen.add(c), true)));
        let i = 0;
        img.onerror = () => {
            i++;
            if (i < uniq.length) img.src = "media/" + uniq[i];
            else img.style.display = "none";
        };
        if (uniq.length) img.src = "media/" + uniq[0];
        else img.style.display = "none";
    }

    // build item tags with icon + text (icon tries multiple filenames)
    const tagsHtml = (item.tags || []).map(t => {
        const display = String(t).replace(/"/g, '&quot;'); // keep '/' for display
        return `<span class="item-tag tag" data-tag="${display}">
                    <img class="tag-icon" src="" alt="${display} icon" data-tagname="${String(t)}">
                    <span class="tag-text">${display}</span>
                </span>`;
    }).join("");

    el.innerHTML = `
        <div class:"item-section">
            <h2>${item.title}</h2>
            <div class="item-tags">${tagsHtml}</div>
        </div>
        <div class:"item-section">
            <img class="media" src="${item.thumbnail}" alt="${item.title} thumbnail">
            <p class="item-description">${item.description}</p>
        </div>
        <p class="item-date">${escapeHtml(item.date || "")}</p>
    `;

    // after insertion, set up icons properly (so onerror fallback works)
    requestAnimationFrame(() => {
        el.querySelectorAll('img.tag-icon').forEach(img => {
            const name = img.dataset.tagname || "";
            // call async loader but don't block rendering
            setIconImgSources(img, name);
        });
    });

    el.onclick = () => {
        const idx = Number(el.dataset.idx);
        const n = carouselItems.length || 1;
        const dist = signedDistance(idx, currentIndex, n);
        if (dist === 0) navigateToProject(item.url);
        else enqueueSteps(dist);
    };
    wrapper.appendChild(el);
    return { container: wrapper, element: el };
}

function buildCarousel(items, skipTransition = false) {
    const container = document.getElementById("carousel");
    container.innerHTML = "";
    carouselItems = items.map((item, i) => {
        const created = createCarouselElement(item, i);
        container.appendChild(created.container);
        return { ...created, data: item, idx: i };
    });
    currentIndex = carouselItems.length ? ((currentIndex % carouselItems.length) + carouselItems.length) % carouselItems.length : 0;
    updateCarouselClasses(skipTransition);
}

function updateCarouselClasses(initial = false, animMs = null) {
    const n = carouselItems.length;
    if (!n) return;
    carouselItems.forEach(obj => {
        const el = obj.element;
        const cont = obj.container;
        const idx = obj.idx;
        let dist = signedDistance(idx, currentIndex, n);
        dist = clamp(dist, -3, 3);
        el.classList.remove("pos--3","pos--2","pos--1","pos0","pos1","pos2","pos3","hidden");
        const cls = dist === -3 ? "pos--3" : dist === -2 ? "pos--2" : dist === -1 ? "pos--1" : dist === 0 ? "pos0" : dist === 1 ? "pos1" : dist === 2 ? "pos2" : "pos3";
        el.classList.add(cls);
        const logicalDist = Math.abs(signedDistance(idx, currentIndex, n));
        if (logicalDist > 3) { el.classList.add("hidden"); if (cont) cont.style.display = "none"; }
        else { if (cont) cont.style.display = ""; }
        const clickable = (dist >= -2 && dist <= 2) && (logicalDist <= 2);
        el.setAttribute("aria-clickable", clickable ? "true" : "false");
        el.style.pointerEvents = clickable ? "auto" : "none";
        if (obj.data && obj.data.color) {
            el.style.backgroundImage = formatColorForRadial(obj.data.color);
        } else {
            el.style.backgroundImage = "";
        }
        if (cont) cont.style.zIndex = String(dist === 0 ? 50 : Math.abs(dist) === 1 ? 30 : Math.abs(dist) === 2 ? 15 : 2);
        if (initial) requestAnimationFrame(() => { el.getBoundingClientRect(); el.style.transition = ""; });
        else if (animMs !== null) el.style.transitionDuration = animMs + "ms";
        else el.style.transitionDuration = "";
    });
}

// ---------- FILTERS / REBUILD ----------
function rebuildCarousel() {
    let filtered = portfolioItems;
    if (selectedTags.size) filtered = portfolioItems.filter(p => p.tags.some(t => selectedTags.has(t)));
    if (!filtered.length) return;
    const container = document.getElementById("carousel");
    const displayed = carouselItems.map(c => c.data.url);
    const filteredUrls = filtered.map(f => f.url);
    const urlsToRemove = displayed.filter(u => !filteredUrls.includes(u));
    const urlsToAdd = filteredUrls.filter(u => !displayed.includes(u));

    if (urlsToRemove.length && carouselItems.length) {
        const centerUrl = carouselItems[currentIndex]?.data?.url;
        urlsToRemove.forEach(u => {
            const obj = carouselItems.find(x => x.data.url === u);
            if (!obj || !obj.element) return;
            obj.element.style.pointerEvents = "none";
            obj.element.style.opacity = "0";
        });
        setTimeout(() => {
            const remaining = new Map();
            carouselItems.forEach(obj => {
                if (!urlsToRemove.includes(obj.data.url)) remaining.set(obj.data.url, obj);
                else {
                    const cont = obj.container || obj.element.parentNode;
                    if (cont && cont.parentNode) cont.parentNode.removeChild(cont);
                }
            });
            let newCenterIdx = filtered.findIndex(it => it.url === centerUrl);
            if (newCenterIdx === -1) {
                const displayedBefore = displayed.slice();
                const centerPos = Math.max(0, displayedBefore.indexOf(centerUrl));
                let chosenUrl = null;
                for (let offset = 1; offset <= displayedBefore.length; offset++) {
                    const right = displayedBefore[(centerPos + offset) % displayedBefore.length];
                    const left = displayedBefore[(centerPos - offset + displayedBefore.length) % displayedBefore.length];
                    if (filteredUrls.includes(right)) { chosenUrl = right; break; }
                    if (filteredUrls.includes(left)) { chosenUrl = left; break; }
                }
                newCenterIdx = chosenUrl ? filtered.findIndex(it => it.url === chosenUrl) : 0;
            }
            currentIndex = Math.max(0, newCenterIdx);
            const newCarousel = [];
            filtered.forEach((item, i) => {
                const existing = remaining.get(item.url);
                if (existing) { existing.idx = i; existing.data = item; if (existing.element) existing.element.dataset.idx = i; existing.element.style.transition = ""; existing.element.style.opacity = ""; newCarousel.push(existing); }
                else {
                    const created = createCarouselElement(item, i);
                    created.element.style.opacity = "0";
                    container.appendChild(created.container);
                    requestAnimationFrame(() => created.element.style.opacity = "1");
                    newCarousel.push({ element: created.element, container: created.container, data: item, idx: i });
                }
            });
            carouselItems = newCarousel;
            updateCarouselClasses(false);
        }, 320);
        return;
    }

    if (urlsToAdd.length) {
        const oldCenterUrl = carouselItems[currentIndex]?.data?.url;
        currentIndex = Math.max(0, filtered.findIndex(it => it.url === oldCenterUrl));
        const map = new Map(carouselItems.map(o => [o.data.url, o]));
        const newCarousel = [];
        filtered.forEach((item, i) => {
            const existing = map.get(item.url);
            if (existing) { existing.idx = i; existing.data = item; if (existing.element) existing.element.dataset.idx = i; existing.element.style.transition = ""; existing.element.style.opacity = ""; newCarousel.push(existing); }
            else {
                const created = createCarouselElement(item, i);
                created.element.style.opacity = "0";
                container.appendChild(created.container);
                newCarousel.push({ element: created.element, container: created.container, data: item, idx: i });
            }
        });
        carouselItems = newCarousel;
        updateCarouselClasses(false);
        requestAnimationFrame(() => urlsToAdd.forEach(u => {
            const obj = carouselItems.find(x => x.data.url === u);
            if (obj && obj.element) obj.element.style.opacity = "1";
        }));
        return;
    }

    // simple reindex/animate
    const oldCenterUrl = carouselItems[currentIndex]?.data?.url;
    currentIndex = Math.max(0, filtered.findIndex(it => it.url === oldCenterUrl));
    const existingMap = new Map(carouselItems.map(o => [o.data.url, o]));
    const reordered = filtered.map((item, i) => {
        const ex = existingMap.get(item.url);
        if (ex) { ex.idx = i; if (ex.element) ex.element.dataset.idx = i; ex.data = item; return ex; }
        const created = createCarouselElement(item, i);
        container.appendChild(created.container);
        return { element: created.element, container: created.container, data: item, idx: i };
    });
    carouselItems = reordered;
    updateCarouselClasses(false);
}

// ---------- TAG FILTER UI ----------
function buildTagFilterBar(allTags) {
    const filter = document.getElementById("tag-filter");
    filter.innerHTML = "";

    // Order tags according to window.TAG_ORDER (from projects/list.js) while keeping any
    // tags not listed in TAG_ORDER appended afterwards in their original order.
    const preferred = Array.isArray(window.TAG_ORDER) ? window.TAG_ORDER : [];
    const seen = new Set();
    const ordered = [];

    // add preferred tags in order if they exist in allTags
    for (const t of preferred) {
        if (allTags.includes(t) && !seen.has(t)) {
            ordered.push(t);
            seen.add(t);
        }
    }
    // append remaining tags in the provided order
    for (const t of allTags) {
        if (!seen.has(t)) {
            ordered.push(t);
            seen.add(t);
        }
    }

    ALL_TAGS = Array.from(ordered);

    ALL_TAGS.forEach(tag => {
        const btn = document.createElement("div");
        btn.className = "tag-button tag";
        btn.dataset.tag = tag;
        btn.setAttribute("role", "button");
        btn.tabIndex = 0;

        // icon element (will be populated by setIconImgSources)
        const img = document.createElement("img");
        img.className = "tag-icon";
        img.alt = `${tag} icon`;
        img.dataset.tagname = tag;

        // helper (mirrors carousel helper) to try multiple filename variants and encodings
        function setIconImgSources(imgEl, name) {
            const raw = String(name || "");
            const bases = [
                raw,
                raw.replace(/\//g,'_'),
                raw.replace(/\//g,''),            // remove slashes
                raw.replace(/\s+/g,'_')          // spaces -> underscore
            ].filter(Boolean);
            const candidates = [];
            bases.forEach(b => {
                candidates.push(`media/${b}_Logo.png`);
                candidates.push(`media/${b}.png`);
                candidates.push(`media/${encodeURIComponent(b + '_Logo.png')}`);
                candidates.push(`media/${encodeURIComponent(b + '.png')}`);
            });
            // dedupe while preserving order
            const seen = new Set();
            const uniq = candidates.filter(c => (seen.has(c) ? false : (seen.add(c), true)));
            let i = 0;
            imgEl.onerror = () => {
                i++;
                if (i < uniq.length) imgEl.src = uniq[i];
                else imgEl.style.display = "none";
            };
            if (uniq.length) imgEl.src = uniq[0];
            else imgEl.style.display = "none";
        }

        const txt = document.createElement("span");
        txt.className = "tag-text";
        txt.innerText = tag;

        if (selectedTags.has(tag)) btn.classList.add("selected");

        btn.appendChild(img);
        btn.appendChild(txt);

        // start loading icon immediately (do not defer) so it appears on first paint
        // use the global async loader (no await)
        setIconImgSources(img, tag);

        const onActivate = (evt) => {
            if (firstTagClick && ENABLE_FIRST_TAG_CLICK) {
                selectedTags = new Set([tag]);
                Array.from(filter.children).forEach(ch => ch.dataset && ch.dataset.tag === tag ? ch.classList.add("selected") : ch.classList.remove("selected"));
                firstTagClick = false;
                rebuildCarousel();
                updateUrlWithTags(selectedTags); // <-- update URL here
                return;
            }
            const tentative = new Set(selectedTags);
            tentative.has(tag) ? tentative.delete(tag) : tentative.add(tag);
            if (tentative.size === 0) {
                if (RESELECT_ALL_WHEN_EMPTY) {
                    selectedTags = new Set(ALL_TAGS);
                    Array.from(filter.children).forEach(ch => ch.classList.add("selected"));
                    firstTagClick = !!ENABLE_FIRST_TAG_CLICK;
                    rebuildCarousel();
                    updateUrlWithTags(selectedTags);
                    return;
                }
                btn.classList.add("cannot-unselect");
                setTimeout(() => btn.classList.remove("cannot-unselect"), 700);
                return;
            }
            const remaining = portfolioItems.filter(p => p.tags.some(t => tentative.has(t)));
            if (!remaining.length) { btn.classList.add("cannot-unselect"); setTimeout(() => btn.classList.remove("cannot-unselect"), 700); return; }
            if (selectedTags.has(tag)) { selectedTags.delete(tag); btn.classList.remove("selected"); } else { selectedTags.add(tag); btn.classList.add("selected"); }
            rebuildCarousel();
            updateUrlWithTags(selectedTags); // <-- and here
        };

        // ensure mouse clicks blur the button so :focus CSS doesn't keep text visible;
        // keep keyboard activation (Enter/Space) focusable for accessibility
        btn.addEventListener('click', (e) => { onActivate(e); btn.blur(); });
        btn.addEventListener('keydown', (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate(e); } });
        
        filter.appendChild(btn);
    });
}

// ---------- NAVIGATION / PAGE TRANSITIONS ----------
let isNavigatingToProject = false;

function createFadeOverlay(bg) {
    const o = document.createElement("div");
    o.className = "page-fade-overlay";
    o.style.position = "fixed";
    o.style.left = "0";
    o.style.top = "0";
    o.style.width = "100vw";
    o.style.height = "100vh";
    o.style.zIndex = "9998";
    o.style.pointerEvents = "none";
    o.style.opacity = "0";
    o.style.background = bg || getComputedStyle(document.body).backgroundColor || "#000";
    o.style.transition = `opacity ${PAGE_FADE_DURATION_MS}ms ${PAGE_FADE_EASE}`;
    return o;
}

function navigateToProject(url) {
    if (isNavigatingToProject) return;
    if (!ENABLE_PAGE_TRANSITION && !ENABLE_PAGE_FADE) { isNavigatingToProject = true; window.location.href = url; return; }
    isNavigatingToProject = true;
    const topBar = document.querySelector(".top-bar");
    const bottomBar = document.querySelector(".bottom-bar");
    const DURATION = PAGE_ANIM_DURATION_MS;
    const EASE = PAGE_ANIM_EASE;
    if (topBar) { topBar.style.transition = `transform ${DURATION}ms ${EASE}, opacity ${Math.min(350, DURATION)}ms ease`; topBar.style.transform = "translateY(-110%)"; topBar.style.opacity = "0"; }
    if (bottomBar) { bottomBar.style.transition = `transform ${DURATION}ms ${EASE}, opacity ${Math.min(350, DURATION)}ms ease`; bottomBar.style.transform = "translateY(110%)"; bottomBar.style.opacity = "0"; }
    const carousel = document.getElementById("carousel"); if (carousel) carousel.style.pointerEvents = "none";

    if (ENABLE_PAGE_FADE) {
        try {
            const overlay = createFadeOverlay(getComputedStyle(document.body).backgroundColor);
            document.body.appendChild(overlay);
            // fade items out a bit
            carouselItems.forEach(o => { if (o.element) { o.element.style.transition = `opacity ${Math.min(350, DURATION)}ms ease`; o.element.style.opacity = "0"; } });
            requestAnimationFrame(() => overlay.style.opacity = "1");
        } catch (e) { console.error(e); }
        setTimeout(() => window.location.href = url, PAGE_FADE_DURATION_MS + 30);
        return;
    }

    // expanding-item behavior
    try {
        const n = carouselItems.length || 0;
        const centerObj = carouselItems.find(o => signedDistance(o.idx, currentIndex, n) === 0);
        if (centerObj && centerObj.element) {
            carouselItems.forEach(obj => { if (obj !== centerObj && obj.element) { obj.element.style.transition = `opacity ${Math.min(350, DURATION)}ms ease`; obj.element.style.opacity = "0"; obj.element.style.pointerEvents = "none"; } });
            const el = centerObj.element;
            const rect = el.getBoundingClientRect();
            const clone = el.cloneNode(true);
            clone.classList.add("expanding-item");
            Object.assign(clone.style, {
                position: "fixed",
                left: rect.left + "px",
                top: rect.top + "px",
                width: rect.width + "px",
                height: rect.height + "px",
                margin: "0",
                zIndex: "9999",
                pointerEvents: "none",
                transform: "none",
                clipPath: "none",
                borderRadius: "6px",
                overflow: "hidden",
                transition: `left ${DURATION}ms ${EASE}, top ${DURATION}ms ${EASE}, width ${DURATION}ms ${EASE}, height ${DURATION}ms ${EASE}, opacity ${Math.min(350, DURATION)}ms ease, transform ${DURATION}ms ${EASE}`
            });
            document.body.appendChild(clone);
            el.style.visibility = "hidden";
            requestAnimationFrame(() => { clone.style.left = "20vw"; clone.style.top = "0px"; clone.style.width = "60vw"; clone.style.height = "100vh"; });
        } else {
            carouselItems.forEach(obj => { if (obj.element) { obj.element.style.transition = `opacity ${Math.min(350, DURATION)}ms ease`; obj.element.style.opacity = "0"; obj.element.style.pointerEvents = "none"; } });
        }
    } catch (e) { console.error(e); }
    setTimeout(() => window.location.href = url, PAGE_ANIM_DURATION_MS + 30);
}

// ---------- PAGE FADE IN ON LOAD ----------
if (ENABLE_PAGE_FADE) {
    document.addEventListener("DOMContentLoaded", () => {
        try {
            const overlay = createFadeOverlay(getComputedStyle(document.body).backgroundColor);
            overlay.style.opacity = "1";
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.style.opacity = "0");
            setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, PAGE_FADE_DURATION_MS + 50);
        } catch (e) { console.error(e); }
    }, { once: true });
}

// ---------- INIT ----------
if (document.getElementById("carousel")) {
    loadPortfolio().then(items => {
        portfolioItems = items;
        const allTags = new Set();
        items.forEach(it => it.tags.forEach(t => allTags.add(t)));

        // read tags from url (obfuscated) and use them if valid
        const urlTags = readTagsFromUrl().filter(t => allTags.has(t));

        if (urlTags.length) selectedTags = new Set(urlTags);
        else selectedTags = new Set([...allTags]);

        // Adjust firstTagClick behavior now that selection can come from the URL:
        // - enable special first-click narrowing if multiple tags selected
        if (!ENABLE_FIRST_TAG_CLICK) firstTagClick = false;
        else firstTagClick = (selectedTags.size !== 1);

        buildTagFilterBar([...allTags]);
        buildCarousel(items);

        // ensure the url reflects the initial selection (remove param if all selected)
        updateUrlWithTags(selectedTags);
    });
}

// small accessibility: mouse wheel rotates carousel
document.addEventListener("wheel", e => {
    if (Math.abs(e.deltaY) < 10) return;
    const steps = Math.min(2, Math.max(1, Math.round(Math.abs(e.deltaY) / 180)));
    enqueueSteps((e.deltaY > 0 ? 1 : -1) * steps);
});



















// pointer-based 3D tilt for elements with class "media"
(function () {
  if (!ENABLE_TILT) return; // allow global disable

  const EL_SELECTOR = TILT_SELECTOR;
  const MAX_DEG = TILT_DEG;
  const Z_PUSH_PX = Number(Z_PUSH) || 0;
  const USE_Z = Boolean(ENABLE_Z_PUSH) && Z_PUSH_PX > 0;

  function bindTilt(el) {
    let raf = null;

    el.addEventListener('pointerenter', () => {
      el.classList.add('tilting');
      // only set --tz if Z-push is explicitly enabled to avoid growth/overflow
      if (USE_Z) el.style.setProperty('--tz', `${Z_PUSH_PX}px`);
      else el.style.setProperty('--tz', '0px');
    });

    el.addEventListener('pointermove', (ev) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const px = (ev.clientX - rect.left) / rect.width;
        const py = (ev.clientY - rect.top) / rect.height;
        const nx = (px - 0.5) * 2;
        const ny = (py - 0.5) * 2;
        const rotateY = (-nx * MAX_DEG).toFixed(3) + 'deg';
        const rotateX = (ny * MAX_DEG).toFixed(3) + 'deg';
        el.style.setProperty('--rx', rotateX);
        el.style.setProperty('--ry', rotateY);
      });
    });

    el.addEventListener('pointerleave', () => {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      el.classList.remove('tilting');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--tz', '0px');
    });

    el.addEventListener('focus', () => el.classList.add('tilting'));
    el.addEventListener('blur', () => el.classList.remove('tilting'));
  }

  function init() {
    const els = document.querySelectorAll(EL_SELECTOR);
    els.forEach(bindTilt);

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches && node.matches(EL_SELECTOR)) bindTilt(node);
          node.querySelectorAll && node.querySelectorAll(EL_SELECTOR).forEach(bindTilt);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ---------- IMAGE / ICON LOADER (new, global) ----------
/*
  Finds the first existing image URL from multiple filename variants and sets it on the <img>.
  Uses fetch HEAD checks so missing files don't create 404 noise in the console.
  If nothing is found the img is hidden and a tiny data URL is set to avoid broken-src behavior.
*/
async function setIconImgSources(img, name) {
    try {
        const raw = String(name || "");
        const bases = [
            raw,
            raw.replace(/\//g,'_'),
            raw.replace(/\//g,''),            // remove slashes
            raw.replace(/\s+/g,'_')          // spaces -> underscore
        ].filter(Boolean);

        // construct candidates, include encoded variants
        const candidates = [];
        for (const b of bases) {
            const variants = [`${b}_Logo.png`, `${b}.png`];
            for (const v of variants) {
                candidates.push(`media/${v}`);
                candidates.push(`media/${encodeURIComponent(v)}`);
            }
        }

        // dedupe while preserving order
        const seen = new Set();
        const uniq = candidates.filter(u => (seen.has(u) ? false : (seen.add(u), true)));

        // try HEAD on each candidate; HEAD won't log 404 to console like setting img.src directly
        for (const url of uniq) {
            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res && res.ok) {
                    img.onerror = () => { img.style.display = "none"; };
                    img.src = url;
                    return;
                }
            } catch (e) {
                // ignore network errors and continue trying other variants
            }
        }

        // no candidate found -> hide the image (use tiny data URI so there's no broken-src attempt)
        img.onerror = null;
        img.style.display = "none";
        img.src = 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
    } catch (e) {
        // last-resort: hide on unexpected errors
        try { img.style.display = "none"; } catch {}
    }
}