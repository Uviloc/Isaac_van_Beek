// ---------- CONFIG / TOGGLES ----------
const ENABLE_PAGE_FADE = true;
const PROJECT_PAGE_FADE_DURATION_MS = 480;
const PROJECT_PAGE_FADE_EASE = 'cubic-bezier(.4,.5,.8,1)';





// ---------- META / HEADER HELPERS ----------
const getMeta = name => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
function applyAccentColor(color) { if (color) document.documentElement.style.setProperty('--accent-color', color); }

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
            raw.replace(/\s+/g,'_')          // spaces -> underscore
        ].filter(Boolean);

        const candidates = [];
        for (const b of bases) {
            const variants = [`${b}_Logo.png`, `${b}.png`];
            for (const v of variants) {
                candidates.push(`/Isaac_van_Beek/media/${v}`);               // project pages are one level deeper -> ../media/
                candidates.push(`/Isaac_van_Beek/media/${encodeURIComponent(v)}`);
            }
        }

        // dedupe while preserving order
        const seen = new Set();
        const uniq = candidates.filter(u => (seen.has(u) ? false : (seen.add(u), true)));

        for (const url of uniq) {
            try {
                const res = await fetch(url, { method: 'HEAD' });
                if (res && res.ok) {
                    img.onerror = () => { img.style.display = "none"; };
                    img.src = url;
                    return;
                }
            } catch (e) {
                // ignore and try next candidate
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
    if (title) document.title = title;
    applyAccentColor(color);
    const titleEl = document.querySelector('.project-title'); if (titleEl && title) titleEl.textContent = title;
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
        try {
            const overlay = makeOverlay(0);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.style.opacity = '1');
            setTimeout(() => window.location.href = href, PROJECT_PAGE_FADE_DURATION_MS + 20);
        } catch (e) { console.error(e); window.location.href = href; }
    }, { passive: false });
}

// ---------- INIT ----------
function initProjectScript() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', populateHeaderFromMeta, { once: true });
    else populateHeaderFromMeta();
    if (!ENABLE_PAGE_FADE) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { fadeInOnLoad(); attachBackFade(); }, { once: true });
    else { fadeInOnLoad(); attachBackFade(); }
}

initProjectScript();