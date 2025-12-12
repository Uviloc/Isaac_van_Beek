// ---------- CONFIG / TOGGLES ----------
const ENABLE_PAGE_FADE = true;
const PROJECT_PAGE_FADE_DURATION_MS = 480;
const PROJECT_PAGE_FADE_EASE = 'cubic-bezier(.4,.5,.8,1)';





// ---------- META / HEADER HELPERS ----------
const getMeta = name => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
// replaced applyAccentColor to support gradient inner-args or full gradient strings
function applyAccentColor(color) {
    if (!color) return;
    // normalize and remove trailing semicolon if present
    let v = String(color).trim().replace(/\s*;$/,'');
    // if the value already looks like a gradient, use it as-is; otherwise wrap inner-args in radial-gradient
    const isGradient = /^\s*(radial-gradient|linear-gradient)\s*\(/i.test(v);
    const bg = isGradient ? v : `radial-gradient(${v})`;
    // set a full CSS background variable and also expose a primary color (first listed color) for other uses
    try {
        document.documentElement.style.setProperty('--accent-bg', bg);
        // primary color is first component before a top-level comma (useful for text/icon contrast)
        const primary = v.split(',')[0].trim();
        document.documentElement.style.setProperty('--accent-color', primary);
    } catch (e) {
        // fail silently
        console.error(e);
    }
}

// ---------- IMAGE / ICON LOADER (project page copy) ----------
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
            raw.replace(/\s+/g,'_')           // spaces -> underscore
        ].filter(Boolean);

        // generate candidate urls that cover both GH-Pages hosting (repo prefix) and local/live-server roots.
        const candidates = [];
        for (const b of bases) {
            const variants = [`${b}_Logo.png`, `${b}.png`];

            for (const v of variants) {
                // absolute on GH Pages (repo in path) and absolute at site root
                candidates.push(`${REPO_PREFIX}/media/${v}`);
                candidates.push(`/media/${v}`);

                // relative variants (useful from /projects/ pages and local servers)
                candidates.push(`../media/${v}`);
                candidates.push(`./media/${v}`);
                candidates.push(`media/${v}`);

                // encoded variant for safety
                candidates.push(`${REPO_PREFIX}/media/${encodeURIComponent(v)}`);
                candidates.push(`/media/${encodeURIComponent(v)}`);
            }
        }

        // dedupe while preserving order
        const seen = new Set();
        const uniq = candidates.filter(u => (seen.has(u) ? false : (seen.add(u), true)));

        for (const url of uniq) {
            try {
                // use HEAD when supported; if HEAD fails (CORS/file), try GET with small timeout
                const res = await fetch(url, { method: 'HEAD' });
                if (res && res.ok) {
                    img.onerror = () => { img.style.display = "none"; };
                    img.src = url;
                    return;
                }
            } catch (e) {
                // HEAD may fail due to CORS or file://; attempt a lightweight GET as fallback
                try {
                    const res2 = await fetch(url, { method: 'GET' });
                    if (res2 && res2.ok) {
                        img.onerror = () => { img.style.display = "none"; };
                        img.src = url;
                        return;
                    }
                } catch (e2) {
                    // ignore and try next candidate
                }
            }
        }

        // nothing found -> hide without causing broken-src errors
        img.onerror = null;
        img.style.display = "none";
        img.src = 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
    } catch (e) {
        try { img.style.display = "none"; } catch {}
    }
}

function populateHeaderFromMeta() {
    const title = getMeta('title');
    const color = getMeta('color');
    const description = getMeta('description');
    const tags = getMeta('tags');
    const date = getMeta('date'); // <-- read date meta
    if (title) document.title = title;
    applyAccentColor(color);
    const titleEl = document.querySelector('.project-title'); if (titleEl && title) titleEl.textContent = title;

    // ensure a project-date element exists under the title and set its text
    try {
        const header = document.querySelector('.project-header');
        if (header && titleEl) {
            let dateEl = header.querySelector('.project-date');
            if (!dateEl) {
                dateEl = document.createElement('div');
                dateEl.className = 'project-date';
                // insert right after the title so you can style it as needed
                titleEl.insertAdjacentElement('afterend', dateEl);
            }
            if (date) { dateEl.textContent = date; dateEl.style.display = ''; }
            else { dateEl.textContent = ''; dateEl.style.display = 'none'; }
        }
    } catch (e) { /* ignore insertion errors */ }

    const descEl = document.querySelector('.project-description');
    if (descEl) { if (description) { descEl.textContent = description; descEl.style.display = ''; } else descEl.style.display = 'none'; }
    const tagsContainer = document.querySelector('.project-tags');
    if (tagsContainer) {
        tagsContainer.innerHTML = '';
        if (tags) {
            tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => {
                // create icon + text tag element (icon loaded async)
                const span = document.createElement('span');
                span.className = 'project-tag';

                const img = document.createElement('img');
                img.className = 'tag-icon';
                img.alt = `${t} icon`;
                img.dataset.tagname = t;

                const txt = document.createElement('span');
                txt.className = 'tag-text';
                txt.textContent = t;

                span.appendChild(img);
                span.appendChild(txt);
                tagsContainer.appendChild(span);

                // start loading icon (no await)
                setIconImgSources(img, t);
            });
        }
        tagsContainer.style.display = tags ? '' : 'none';
    }
}

// ---------- PAGE FADE HELPERS ----------
function makeOverlay(initialOpacity = 1, bg = '') {
    const overlay = document.createElement('div');
    overlay.className = 'page-fade-overlay';
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.zIndex = '9998';
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = String(initialOpacity);
    overlay.style.transition = `opacity ${PROJECT_PAGE_FADE_DURATION_MS}ms ${PROJECT_PAGE_FADE_EASE}`;
    overlay.style.background = bg || getComputedStyle(document.body).backgroundColor || "#000";
    return overlay;
}

function fadeInOnLoad() {
    try {
        const overlay = makeOverlay(1);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.style.opacity = '0');
        setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, PROJECT_PAGE_FADE_DURATION_MS + 50);
    } catch (e) { console.error(e); }
}

function attachBackFade() {
    const backLink = document.querySelector('.back-button a[href]');
    if (!backLink) return;
    backLink.addEventListener('click', ev => {
        ev.preventDefault();
        const href = backLink.getAttribute('href') || '/index.html';

        // prefer going back in history (keeps original URL state intact).
        // if no meaningful history exists -> fallback to href after animation.
        try {
            const overlay = makeOverlay(0);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.style.opacity = '1');

            if (window.history && window.history.length > 1) {
                // navigate back after overlay animation
                setTimeout(() => history.back(), PROJECT_PAGE_FADE_DURATION_MS + 20);
                // safety fallback: if location doesn't change after some time, go to href
                const start = location.href;
                setTimeout(() => { if (location.href === start) window.location.href = href; }, PROJECT_PAGE_FADE_DURATION_MS + 1200);
            } else {
                // no history -> go to href
                setTimeout(() => window.location.href = href, PROJECT_PAGE_FADE_DURATION_MS + 20);
            }
        } catch (e) {
            // fallback straight navigation
            window.location.href = href;
        }
    }, { passive: false });
}

// ---------- IMAGE OVERLAY / ZOOM ----------

function createImageOverlay(src, alt) {
    // avoid creating multiple overlays
    if (document.querySelector('.image-overlay')) return null;

    const overlay = document.createElement('div');
    overlay.className = 'image-overlay';

    const inner = document.createElement('div');
    inner.className = 'overlay-inner';

    const img = document.createElement('img');
    img.alt = alt || '';
    img.src = src;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.type = 'button';
    closeBtn.innerHTML = '&#x2715;'; // simple X

    inner.appendChild(img);
    inner.appendChild(closeBtn);
    overlay.appendChild(inner);

    // click outside image closes overlay
    overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) removeOverlay(overlay);
    });

    // close button
    closeBtn.addEventListener('click', () => removeOverlay(overlay));

    // close on Esc
    function onKey(e) {
        if (e.key === 'Escape') removeOverlay(overlay);
    }

    function removeOverlay(node) {
        try {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
            node.classList.remove('visible');
            // allow transition then remove
            setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 200);
        } catch (e) { if (node.parentNode) node.parentNode.removeChild(node); }
    }

    document.addEventListener('keydown', onKey);

    // prevent body scroll while open
    document.body.style.overflow = 'hidden';

    document.body.appendChild(overlay);
    // small delay so transition can apply
    requestAnimationFrame(() => overlay.classList.add('visible'));

    return overlay;
}

function attachImageOverlayHandlers() {
    const container = document.querySelector('.project-sections') || document.body;
    container.addEventListener('click', (ev) => {
        const target = ev.target;
        // only respond to images with class "media"
        if (target && target.tagName === 'IMG' && target.classList.contains('media') && !target.classList.contains('no-expand')) {
            // use the image's src (full file) — if you have a data-original attribute, prefer that
            const src = target.dataset.original || target.src;
            const alt = target.alt || '';
            createImageOverlay(src, alt);
        }
    });
}

// ---------- INIT ----------
function initProjectScript() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', populateHeaderFromMeta, { once: true });
    else populateHeaderFromMeta();
    if (!ENABLE_PAGE_FADE) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { fadeInOnLoad(); attachBackFade(); attachImageOverlayHandlers(); }, { once: true });
    else { fadeInOnLoad(); attachBackFade(); attachImageOverlayHandlers(); }
}

initProjectScript();