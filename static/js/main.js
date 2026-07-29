// ============================================
// SPACE — Infinite Canvas  (ES Module)
// ============================================

// ── DOM Refs ────────────────────────────────
const viewport      = document.getElementById('viewport');
const world         = document.getElementById('world');
const connLayer     = document.getElementById('connections-layer');
const nodesLayer    = document.getElementById('nodes-layer');
const addNodeBtn    = document.getElementById('add-node');
const zoomSlider    = document.getElementById('zoom-slider');
const zoomIndicator = document.getElementById('zoom-indicator');
const saveStatus    = document.getElementById('save-status');

// ── State ────────────────────────────────────
const S = {
  zoom: 1, panX: 0, panY: 0,
  entities:   new Map(),   // uuid → entity object
  bloodlines: [],
  isPanning:       false,
  panStartX:       0, panStartY: 0,
  isDraggingNode:  false,
  dragUUID:        null,
  dragOffX:        0, dragOffY: 0,
  connectingFrom:  null,    // uuid of source during connect mode
  saveTimer:       null,
};

// ── Type Config ──────────────────────────────
const TYPES = {
  NOTE:   { color: '#8b5cf6', icon: '◈', label: 'Note'   },
  CODE:   { color: '#10b981', icon: '⌥', label: 'Code'   },
  TODO:   { color: '#f59e0b', icon: '◎', label: 'Todo'   },
  CANVAS: { color: '#3b82f6', icon: '⬡', label: 'Canvas' },
};

// ── Utilities ────────────────────────────────
const esc = s => String(s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function debounce(fn, ms = 800) {
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(fn, ms);
}

function setStatus(msg, type = 'idle') {
  saveStatus.textContent = msg;
  saveStatus.className = `save-status save-status--${type}`;
}

// ── Coordinate Helpers ───────────────────────
function applyTransform() {
  world.style.transform = `translate(${S.panX}px,${S.panY}px) scale(${S.zoom})`;
  zoomSlider.value       = S.zoom;
  zoomIndicator.textContent = `${Math.round(S.zoom * 100)}%`;
}

function screenToWorld(sx, sy) {
  const r = viewport.getBoundingClientRect();
  return {
    x: (sx - r.left - S.panX) / S.zoom,
    y: (sy - r.top  - S.panY) / S.zoom,
  };
}

function viewCenter() {
  return screenToWorld(viewport.clientWidth / 2, viewport.clientHeight / 2);
}

// ── API ──────────────────────────────────────
const API = {
  async json(url, opts = {}) {
    const r = await fetch(url, { headers:{'Content-Type':'application/json'}, ...opts });
    if (!r.ok && r.status !== 204) throw new Error(r.statusText);
    if (r.status === 204) return null;
    return r.json();
  },
  getEntities()           { return this.json('/entities/'); },
  getBloodlines()         { return this.json('/bloodlines/'); },
  createEntity(d)         { return this.json('/entities/', { method:'POST', body:JSON.stringify(d) }); },
  patchEntity(uuid, d)    { return this.json(`/entities/${uuid}/`, { method:'PATCH', body:JSON.stringify(d) }); },
  deleteEntity(uuid)      { return this.json(`/entities/${uuid}/`, { method:'DELETE' }); },
  createBloodline(s, t)   { return this.json('/bloodlines/', { method:'POST', body:JSON.stringify({ source:s, target:t }) }); },
  deleteBloodline(id)     { return this.json(`/bloodlines/${id}/`, { method:'DELETE' }); },
};

// ── Node Accent Color ────────────────────────
function accent(entity) {
  const def = entity.color === '#18181b' || !entity.color;
  return def ? (TYPES[entity.type]?.color ?? '#8b5cf6') : entity.color;
}

// ── Render Connections ───────────────────────
function renderConnections() {
  const defs = Object.entries(TYPES).map(([type, cfg]) => `
    <marker id="ah-${type}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0,8 3,0 6" fill="${cfg.color}" opacity="0.9"/>
    </marker>`).join('');

  const paths = S.bloodlines.map(b => {
    const se = S.entities.get(String(b.source));
    const te = S.entities.get(String(b.target));
    if (!se || !te) return '';

    const sEl = document.querySelector(`.node[data-uuid="${b.source}"]`);
    const tEl = document.querySelector(`.node[data-uuid="${b.target}"]`);
    const sw = sEl?.offsetWidth  ?? 248;
    const sh = sEl?.offsetHeight ?? 140;
    const th = tEl?.offsetHeight ?? 140;

    const x1 = se.position_x + sw, y1 = se.position_y + sh / 2;
    const x2 = te.position_x,      y2 = te.position_y + th / 2;
    const cx = Math.max(Math.abs(x2 - x1) * 0.5, 60);

    return `<path class="connection-path" data-id="${b.id}"
      d="M${x1} ${y1} C${x1+cx} ${y1},${x2-cx} ${y2},${x2} ${y2}"
      stroke="${accent(se)}" marker-end="url(#ah-${se.type})"/>`;
  }).join('');

  connLayer.innerHTML = `<defs>${defs}</defs>${paths}`;

  connLayer.querySelectorAll('.connection-path').forEach(p => {
    p.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this connection?')) return;
      const id = parseInt(p.dataset.id);
      await API.deleteBloodline(id);
      S.bloodlines = S.bloodlines.filter(b => b.id !== id);
      renderConnections();
      setStatus('All changes saved');
    });
  });
}

// ── Render a Single Node ─────────────────────
function renderNode(entity) {
  const uuid = String(entity.uuid);
  const conf  = TYPES[entity.type] ?? TYPES.NOTE;
  const ac    = accent(entity);

  const el = document.createElement('div');
  el.className      = 'node';
  el.dataset.uuid   = uuid;
  el.dataset.type   = entity.type;
  el.style.left     = `${entity.position_x}px`;
  el.style.top      = `${entity.position_y}px`;
  el.style.setProperty('--accent', ac);

  el.innerHTML = `
    <div class="node-header">
      <div class="node-header-left">
        <span class="node-icon">${conf.icon}</span>
        <span class="node-type-badge" style="color:${ac}">${conf.label}</span>
      </div>
      <div class="node-actions">
        <button class="node-btn btn-connect" data-uuid="${uuid}" title="Connect">⟶</button>
        <button class="node-btn btn-delete"  data-uuid="${uuid}" title="Delete">✕</button>
      </div>
    </div>
    <div class="node-title-wrap">
      <div class="node-title" contenteditable="true" spellcheck="false">${esc(entity.title)}</div>
    </div>
    <div class="node-content-wrap">
      <textarea class="node-content" placeholder="Add content...">${esc(entity.content ?? '')}</textarea>
    </div>`;

  // ── Drag ──────────────────────────────────
  el.querySelector('.node-header').addEventListener('mousedown', e => {
    if (e.target.classList.contains('node-btn')) return;
    e.preventDefault(); e.stopPropagation();
    const wp = screenToWorld(e.clientX, e.clientY);
    Object.assign(S, {
      isDraggingNode: true, dragUUID: uuid,
      dragOffX: wp.x - entity.position_x,
      dragOffY: wp.y - entity.position_y,
    });
    el.classList.add('is-dragging');
    viewport.classList.add('is-grabbing');
  });

  // ── Title Edit ────────────────────────────
  const titleEl = el.querySelector('.node-title');
  titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
  titleEl.addEventListener('input', () => {
    entity.title = titleEl.textContent.trim() || 'Untitled';
    setStatus('Saving…', 'saving');
    debounce(() => API.patchEntity(uuid, { title: entity.title }).then(() => setStatus('All changes saved')));
  });

  // ── Content Edit ──────────────────────────
  const contentEl = el.querySelector('.node-content');
  contentEl.addEventListener('mousedown', e => e.stopPropagation());
  contentEl.addEventListener('input', () => {
    entity.content = contentEl.value;
    setStatus('Saving…', 'saving');
    debounce(() => {
      API.patchEntity(uuid, { content: entity.content }).then(() => setStatus('All changes saved'));
      renderConnections();
    });
  });

  // ── Connect Button ────────────────────────
  el.querySelector('.btn-connect').addEventListener('click', e => {
    e.stopPropagation();
    if (S.connectingFrom === uuid) {
      cancelConnect();
    } else if (S.connectingFrom) {
      doConnect(S.connectingFrom, uuid);
    } else {
      startConnect(uuid);
    }
  });

  // ── Delete Button ─────────────────────────
  el.querySelector('.btn-delete').addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${entity.title}"?`)) return;
    await API.deleteEntity(uuid);
    S.entities.delete(uuid);
    S.bloodlines = S.bloodlines.filter(b => String(b.source) !== uuid && String(b.target) !== uuid);
    el.remove();
    renderConnections();
    setStatus('All changes saved');
  });

  // ── Click in connecting mode ──────────────
  el.addEventListener('click', e => {
    if (!S.connectingFrom || S.connectingFrom === uuid) return;
    e.stopPropagation();
    doConnect(S.connectingFrom, uuid);
  });

  nodesLayer.appendChild(el);
}

// ── Render All ───────────────────────────────
function renderAll() {
  nodesLayer.innerHTML = '';
  S.entities.forEach(e => renderNode(e));
  renderConnections();
}

// ── Connection Mode ──────────────────────────
function startConnect(uuid) {
  S.connectingFrom = uuid;
  document.querySelectorAll('.btn-connect').forEach(b =>
    b.classList.toggle('btn-connect--active', b.dataset.uuid === uuid));
  document.body.classList.add('is-connecting');
  setStatus('Click another node to connect', 'connecting');
}

function cancelConnect() {
  S.connectingFrom = null;
  document.querySelectorAll('.btn-connect').forEach(b => b.classList.remove('btn-connect--active'));
  document.body.classList.remove('is-connecting');
  setStatus('All changes saved');
}

async function doConnect(srcUUID, tgtUUID) {
  if (srcUUID === tgtUUID) { cancelConnect(); return; }
  const dupe = S.bloodlines.some(b => String(b.source) === srcUUID && String(b.target) === tgtUUID);
  if (dupe) { cancelConnect(); return; }
  try {
    setStatus('Saving…', 'saving');
    const bl = await API.createBloodline(srcUUID, tgtUUID);
    S.bloodlines.push(bl);
    renderConnections();
    setStatus('All changes saved');
  } catch { setStatus('Error', 'error'); }
  cancelConnect();
}

// ── Pan ──────────────────────────────────────
viewport.addEventListener('mousedown', e => {
  const onCanvas = [viewport, world, nodesLayer, connLayer].includes(e.target)
    || e.target.classList.contains('connection-path');
  if (!onCanvas) return;
  if (S.connectingFrom) { cancelConnect(); return; }
  S.isPanning   = true;
  S.panStartX   = e.clientX - S.panX;
  S.panStartY   = e.clientY - S.panY;
  viewport.classList.add('is-grabbing');
});

// ── Mousemove (pan + drag) ───────────────────
window.addEventListener('mousemove', e => {
  if (S.isDraggingNode && S.dragUUID) {
    const wp = screenToWorld(e.clientX, e.clientY);
    const entity = S.entities.get(S.dragUUID);
    if (!entity) return;
    entity.position_x = wp.x - S.dragOffX;
    entity.position_y = wp.y - S.dragOffY;
    const el = document.querySelector(`.node[data-uuid="${S.dragUUID}"]`);
    if (el) { el.style.left = `${entity.position_x}px`; el.style.top = `${entity.position_y}px`; }
    renderConnections();
    return;
  }
  if (S.isPanning) {
    S.panX = e.clientX - S.panStartX;
    S.panY = e.clientY - S.panStartY;
    applyTransform();
  }
});

// ── Mouseup ───────────────────────────────────
window.addEventListener('mouseup', () => {
  if (S.isDraggingNode && S.dragUUID) {
    const entity = S.entities.get(S.dragUUID);
    const el = document.querySelector(`.node[data-uuid="${S.dragUUID}"]`);
    if (el) el.classList.remove('is-dragging');
    if (entity) {
      setStatus('Saving…', 'saving');
      API.patchEntity(S.dragUUID, {
        position_x: entity.position_x,
        position_y: entity.position_y,
      }).then(() => setStatus('All changes saved'));
    }
  }
  S.isDraggingNode = false;
  S.dragUUID       = null;
  S.isPanning      = false;
  viewport.classList.remove('is-grabbing');
});

// ── Zoom (wheel) ─────────────────────────────
viewport.addEventListener('wheel', e => {
  e.preventDefault();
  const factor   = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom  = Math.max(0.1, Math.min(5, S.zoom * factor));
  const r        = viewport.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  S.panX = mx - (mx - S.panX) * (newZoom / S.zoom);
  S.panY = my - (my - S.panY) * (newZoom / S.zoom);
  S.zoom = newZoom;
  applyTransform();
}, { passive: false });

// ── Zoom (slider) ────────────────────────────
zoomSlider.addEventListener('input', () => {
  const newZoom = parseFloat(zoomSlider.value);
  const cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2;
  S.panX = cx - (cx - S.panX) * (newZoom / S.zoom);
  S.panY = cy - (cy - S.panY) * (newZoom / S.zoom);
  S.zoom = newZoom;
  applyTransform();
});

// ── Reset zoom on indicator click ────────────
zoomIndicator.addEventListener('click', () => {
  S.zoom = 1; S.panX = 0; S.panY = 0;
  applyTransform();
});

// ── Add Node (type picker) ───────────────────
let typePicker = null;

function buildTypePicker() {
  const div = document.createElement('div');
  div.className = 'type-picker';
  Object.entries(TYPES).forEach(([type, cfg]) => {
    const btn = document.createElement('button');
    btn.className = 'type-picker-btn';
    btn.dataset.type = type;
    btn.style.setProperty('--btn-color', cfg.color);
    btn.title = cfg.label;
    btn.innerHTML = `<span class="t-icon">${cfg.icon}</span><span class="t-label">${cfg.label}</span>`;
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const center = viewCenter();
      const data = await API.createEntity({
        title:      `New ${cfg.label}`,
        content:    '',
        type,
        position_x: center.x - 124,
        position_y: center.y - 70,
        color:      '#18181b',
      });
      // API returns partial; fetch full entity
      const full = await fetch(`/entities/${data.uuid}/`).then(r => r.json());
      S.entities.set(String(full.uuid), full);
      renderNode(full);
      renderConnections();
      setStatus('All changes saved');
      hideTypePicker();
    });
    div.appendChild(btn);
  });
  return div;
}

function showTypePicker() {
  if (typePicker) { hideTypePicker(); return; }
  typePicker = buildTypePicker();
  document.getElementById('ui-overlay').querySelector('.toolbar').appendChild(typePicker);
  requestAnimationFrame(() => typePicker.classList.add('is-visible'));
  window.addEventListener('click', hideTypePicker, { once: true });
}

function hideTypePicker() {
  if (!typePicker) return;
  typePicker.classList.remove('is-visible');
  setTimeout(() => { typePicker?.remove(); typePicker = null; }, 150);
}

addNodeBtn.addEventListener('click', e => { e.stopPropagation(); showTypePicker(); });

// ── Keyboard Shortcuts ────────────────────────
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { cancelConnect(); hideTypePicker(); }
  if ((e.altKey || e.metaKey) && e.key === 'n') { e.preventDefault(); showTypePicker(); }
});

// ── Init ─────────────────────────────────────
async function init() {
  setStatus('Loading…', 'saving');
  try {
    const [entities, bloodlines] = await Promise.all([API.getEntities(), API.getBloodlines()]);
    entities.forEach(e => S.entities.set(String(e.uuid), e));
    S.bloodlines = bloodlines;
    renderAll();
    setStatus('All changes saved');
  } catch (err) {
    console.error(err);
    setStatus('Failed to load', 'error');
  }
  applyTransform();
}

init();
