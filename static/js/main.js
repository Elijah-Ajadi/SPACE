// ============================================
// SPACE — Infinite Canvas  (ES Module)
// ============================================

// ── DOM Refs ────────────────────────────────────────────────────────────────
const viewport = document.getElementById('viewport');
const world = document.getElementById('world');
const connLayer = document.getElementById('connections-layer');
const nodesLayer = document.getElementById('nodes-layer');
const addNodeBtn = document.getElementById('add-node');
const zoomSlider = document.getElementById('zoom-slider');
const zoomIndicator = document.getElementById('zoom-indicator');
const saveStatus = document.getElementById('save-status');
const loadingOverlay = document.getElementById('loading-overlay');

// ── State ────────────────────────────────────────────────────────────────────
// ── State ────────────────────────────────────────────────────────────────────
const S = {
  zoom: 1, panX: 0, panY: 0,
  entities: new Map(),   // uuid → entity object
  bloodlines: [],
  isPanning: false,
  panStartX: 0, panStartY: 0,
  isDraggingNode: false,
  dragUUID: null,
  dragOffX: 0, dragOffY: 0,
  dragStartPos: { x: 0, y: 0 },
  isResizingNode: false,
  resizeUUID: null,
  resizeHandle: null,
  resizeStartMouse: { x: 0, y: 0 },
  resizeStartPos: { x: 0, y: 0 },
  resizeStartSize: { w: 0, h: 0 },
  connectingFrom: null,
  saveTimer: null,
};

// ── Grid Snapping ────────────────────────────────────────────────────────────
const GRID_SIZE = 20;
function snap(val) {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

// ── Undo / Redo Engine ────────────────────────────────────────────────────────
const UndoRedo = {
  undoStack: [],
  redoStack: [],

  push(action) {
    this.undoStack.push(action);
    this.redoStack = []; // Clear redo stack on new action
    if (this.undoStack.length > 50) this.undoStack.shift();
  },

  undo() {
    const action = this.undoStack.pop();
    if (!action) {
      setStatus('Nothing to undo', 'error');
      return;
    }
    action.undo();
    this.redoStack.push(action);
    setStatus('Action undone');
  },

  redo() {
    const action = this.redoStack.pop();
    if (!action) {
      setStatus('Nothing to redo', 'error');
      return;
    }
    action.redo();
    this.undoStack.push(action);
    setStatus('Action redone');
  }
};

// ── Mini-map Navigation Logic ────────────────────────────────────────────────
function getCanvasBounds() {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  if (S.entities.size === 0) {
    return { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000, width: 2000, height: 2000 };
  }

  S.entities.forEach(entity => {
    minX = Math.min(minX, entity.position_x);
    maxX = Math.max(maxX, entity.position_x + (entity.width || 248));
    minY = Math.min(minY, entity.position_y);
    maxY = Math.max(maxY, entity.position_y + (entity.height || 140));
  });

  const pad = 600;
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
    width: (maxX - minX) + pad * 2,
    height: (maxY - minY) + pad * 2
  };
}

function updateMinimap() {
  let minimap = document.getElementById('minimap-container');
  if (!minimap) {
    minimap = document.createElement('div');
    minimap.id = 'minimap-container';
    minimap.innerHTML = `<div id="minimap-viewport"></div>`;
    document.getElementById('ui-overlay').appendChild(minimap);

    minimap.addEventListener('click', e => {
      if (e.target.classList.contains('minimap-node')) return;
      const rect = minimap.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) / rect.width;
      const clickY = (e.clientY - rect.top) / rect.height;

      const bounds = getCanvasBounds();
      const targetWorldX = bounds.minX + clickX * bounds.width;
      const targetWorldY = bounds.minY + clickY * bounds.height;
      centerViewportOn(targetWorldX, targetWorldY);
    });
  }

  const bounds = getCanvasBounds();
  const mmW = 160;
  const mmH = 120;

  // Clear previous node markers
  minimap.querySelectorAll('.minimap-node').forEach(n => n.remove());

  // Render mini node dots
  S.entities.forEach(entity => {
    const isCollapsed = document.querySelector(`.node[data-uuid="${entity.uuid}"]`)?.classList.contains('is-collapsed');
    const div = document.createElement('div');
    div.className = 'minimap-node';
    const xPct = (entity.position_x - bounds.minX) / bounds.width;
    const yPct = (entity.position_y - bounds.minY) / bounds.height;
    const wPct = (entity.width || 248) / bounds.width;
    const hPct = (isCollapsed ? 42 : (entity.height || 140)) / bounds.height;

    div.style.left = `${xPct * mmW}px`;
    div.style.top = `${yPct * mmH}px`;
    div.style.width = `${Math.max(4, wPct * mmW)}px`;
    div.style.height = `${Math.max(3, hPct * mmH)}px`;
    div.style.background = accent(entity);
    minimap.appendChild(div);
  });

  // Calculate and align view rectangle
  const vpEl = document.getElementById('minimap-viewport');
  if (vpEl) {
    const screenW = viewport.clientWidth;
    const screenH = viewport.clientHeight;

    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(screenW, screenH);

    const vpX = (topLeft.x - bounds.minX) / bounds.width;
    const vpY = (topLeft.y - bounds.minY) / bounds.height;
    const vpW = (bottomRight.x - topLeft.x) / bounds.width;
    const vpH = (bottomRight.y - topLeft.y) / bounds.height;

    vpEl.style.left = `${Math.max(0, Math.min(mmW, vpX * mmW))}px`;
    vpEl.style.top = `${Math.max(0, Math.min(mmH, vpY * mmH))}px`;
    vpEl.style.width = `${Math.max(8, Math.min(mmW, vpW * mmW))}px`;
    vpEl.style.height = `${Math.max(6, Math.min(mmH, vpH * mmH))}px`;
  }
}

function centerViewportOn(worldX, worldY) {
  const cx = viewport.clientWidth / 2;
  const cy = viewport.clientHeight / 2;
  S.panX = cx - worldX * S.zoom;
  S.panY = cy - worldY * S.zoom;
  applyTransform();
}

// ── Type Config ──────────────────────────────────────────────────────────────
const TYPES = {
  NOTE: { color: '#8b5cf6', icon: '◈', label: 'Note' },
  CODE: { color: '#10b981', icon: '⌥', label: 'Code' },
  TODO: { color: '#f59e0b', icon: '◎', label: 'Todo' },
  CANVAS: { color: '#3b82f6', icon: '⬡', label: 'Canvas' },
  IMAGE: { color: '#ec4899', icon: '⬜', label: 'Image' },
};

// ── Utilities ─────────────────────────────────────────────────────────────────
const esc = s =>
  String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function debounce(fn, ms = 800) {
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(fn, ms);
}

function setStatus(msg, type = 'idle') {
  saveStatus.textContent = msg;
  saveStatus.className = `save-status save-status--${type}`;
}

// ── Loading Overlay ───────────────────────────────────────────────────────────
function hideLoading() {
  loadingOverlay.classList.add('is-hidden');
  // Remove from DOM after transition to avoid layering issues
  loadingOverlay.addEventListener('transitionend', () => loadingOverlay.remove(), { once: true });
}

// ── CSRF ──────────────────────────────────────────────────────────────────────
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? match[1] : '';
}

// ── Coordinate Helpers ────────────────────────────────────────────────────────
function applyTransform() {
  world.style.transform = `translate(${S.panX}px,${S.panY}px) scale(${S.zoom})`;
  zoomSlider.value = S.zoom;
  zoomIndicator.textContent = `${Math.round(S.zoom * 100)}%`;
  updateMinimap();
}

function screenToWorld(sx, sy) {
  const r = viewport.getBoundingClientRect();
  return {
    x: (sx - r.left - S.panX) / S.zoom,
    y: (sy - r.top - S.panY) / S.zoom,
  };
}

function viewCenter() {
  return screenToWorld(viewport.clientWidth / 2, viewport.clientHeight / 2);
}

// ── API ───────────────────────────────────────────────────────────────────────
const API = {
  async json(url, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const headers = { 'Content-Type': 'application/json', ...opts.headers };

    // Attach CSRF token for all mutating requests
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      headers['X-CSRFToken'] = getCsrfToken();
    }

    const res = await fetch(url, { ...opts, headers });
    if (!res.ok && res.status !== 204) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`[${res.status}] ${errText}`);
    }
    if (res.status === 204 || res.headers.get('content-length') === '0') return null;
    return res.json();
  },

  /** Fetch all pages of entities and return a flat array. */
  async getAllEntities() {
    const all = [];
    let url = '/entities/?limit=100&offset=0';
    while (url) {
      const page = await this.json(url);
      all.push(...page.results);
      // next is an absolute URL — convert to relative for same-origin requests
      url = page.next ? new URL(page.next).pathname + new URL(page.next).search : null;
    }
    return all;
  },

  getBloodlines() { return this.json('/bloodlines/'); },
  createEntity(d) { return this.json('/entities/', { method: 'POST', body: JSON.stringify(d) }); },
  patchEntity(uuid, d) { return this.json(`/entities/${uuid}/`, { method: 'PATCH', body: JSON.stringify(d) }); },
  deleteEntity(uuid) { return this.json(`/entities/${uuid}/`, { method: 'DELETE' }); },
  getEntity(uuid) { return this.json(`/entities/${uuid}/`); },
  createBloodline(s, t) { return this.json('/bloodlines/', { method: 'POST', body: JSON.stringify({ source: s, target: t }) }); },
  deleteBloodline(id) { return this.json(`/bloodlines/${id}/`, { method: 'DELETE' }); },

  /** Upload a File object; returns { url } */
  async uploadImage(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/upload/', {
      method: 'POST',
      headers: { 'X-CSRFToken': getCsrfToken() },
      body: fd,
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(`Upload failed [${res.status}]: ${msg}`);
    }
    return res.json();
  },
};

// ── Node Accent Color ─────────────────────────────────────────────────────────
function accent(entity) {
  const def = entity.color === '#18181b' || !entity.color;
  return def ? (TYPES[entity.type]?.color ?? '#8b5cf6') : entity.color;
}

// ── Render Connections ────────────────────────────────────────────────────────
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
    const sw = sEl?.offsetWidth ?? (se.width > 0 ? se.width : 248);
    const sh = sEl?.offsetHeight ?? (se.height > 0 ? se.height : 140);
    const th = tEl?.offsetHeight ?? (te.height > 0 ? te.height : 140);

    const x1 = se.position_x + sw, y1 = se.position_y + sh / 2;
    const x2 = te.position_x, y2 = te.position_y + th / 2;
    const cx = Math.max(Math.abs(x2 - x1) * 0.5, 60);

    return `<path class="connection-path" data-id="${b.id}" data-source="${b.source}" data-target="${b.target}"
      d="M${x1} ${y1} C${x1 + cx} ${y1},${x2 - cx} ${y2},${x2} ${y2}"
      stroke="${accent(se)}" marker-end="url(#ah-${se.type})"/>`;
  }).join('');

  connLayer.innerHTML = `<defs>${defs}</defs>${paths}`;

  connLayer.querySelectorAll('.connection-path').forEach(p => {
    p.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this connection?')) return;
      const id = parseInt(p.dataset.id);
      try {
        await API.deleteBloodline(id);
        S.bloodlines = S.bloodlines.filter(b => b.id !== id);
        renderConnections();
        setStatus('All changes saved');
      } catch (err) {
        setStatus(`Error: ${err.message}`, 'error');
      }
    });
  });
}

// ── Node Type Parser & Render Helper ─────────────────────────────────────────
function parseMarkdown(text) {
  if (!text) return '<p style="color:var(--text-dim);font-style:italic;">Double-click to write note…</p>';
  return esc(text)
    .split(/\n\n+/)
    .map(block => {
      block = block.trim();
      if (block.startsWith('# ')) {
        return `<h1>${block.slice(2)}</h1>`;
      }
      if (block.startsWith('## ')) {
        return `<h2>${block.slice(3)}</h2>`;
      }
      if (block.startsWith('- ') || block.startsWith('* ')) {
        const items = block.split('\n').map(li => {
          const itemText = li.replace(/^[-*]\s+/, '');
          return itemText ? `<li>${itemText}</li>` : '';
        }).filter(Boolean).join('');
        return `<ul>${items}</ul>`;
      }
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}

// ── Render a Single Node ──────────────────────────────────────────────────────
function renderNode(entity) {
  const uuid = String(entity.uuid);
  const conf = TYPES[entity.type] ?? TYPES.NOTE;
  const ac = accent(entity);

  const el = document.createElement('div');
  el.className = 'node';
  el.dataset.uuid = uuid;
  el.dataset.type = entity.type;
  el.style.left = `${entity.position_x}px`;
  el.style.top = `${entity.position_y}px`;
  el.style.setProperty('--accent', ac);

  if (entity.width && entity.width > 0) el.style.width = `${entity.width}px`;
  if (entity.height && entity.height > 0) {
    el.style.height = `${entity.height}px`;
    el.classList.add('has-custom-height');
  }

  // ── 1. Render Specific Node-Type markup ────────────────────────────────────
  let templateBody = '';
  let headerAddon = '';

  if (entity.type === 'IMAGE') {
    templateBody = `<div class="node-img-wrap"><img class="node-img" src="${esc(entity.content)}" alt="${esc(entity.title)}"/></div>`;
  }
  else if (entity.type === 'NOTE') {
    templateBody = `
      <div class="node-note-preview" title="Double-click to edit note">${parseMarkdown(entity.content)}</div>
      <div class="node-content-wrap" style="display:none;">
        <textarea class="node-content" placeholder="Add note content…">${esc(entity.content ?? '')}</textarea>
      </div>`;
  }
  else if (entity.type === 'CODE') {
    // Parse language prefix from content: e.g. ///lang=python\n<code>
    let lang = 'javascript';
    let rawCode = entity.content || '';
    const match = rawCode.match(/^\/\/\/lang=(\w+)\n([\s\S]*)$/);
    if (match) {
      lang = match[1];
      rawCode = match[2];
    }

    headerAddon = `
      <div class="node-code-header-addon">
        <select class="node-code-lang" data-uuid="${uuid}">
          <option value="javascript" ${lang === 'javascript' ? 'selected' : ''}>javascript</option>
          <option value="python" ${lang === 'python' ? 'selected' : ''}>python</option>
          <option value="html" ${lang === 'html' ? 'selected' : ''}>html</option>
          <option value="css" ${lang === 'css' ? 'selected' : ''}>css</option>
          <option value="cpp" ${lang === 'cpp' ? 'selected' : ''}>c++</option>
          <option value="plain" ${lang === 'plain' ? 'selected' : ''}>plaintext</option>
        </select>
        <button class="node-code-copy" title="Copy code snippet">Copy</button>
      </div>`;

    templateBody = `
      <div class="node-code-container">
        <div class="node-code-line-numbers">1</div>
        <textarea class="node-code-editor" spellcheck="false" placeholder="Write code snippet…">${esc(rawCode)}</textarea>
      </div>`;
  }
  else if (entity.type === 'TODO') {
    // Parse checklist items
    const lines = (entity.content || '').split('\n').filter(l => l.trim() !== '');
    const itemsHtml = lines.map((line, idx) => {
      const match = line.match(/^\[([ x])\]\s*(.*)$/);
      const checked = match ? match[1] === 'x' : false;
      const text = match ? match[2] : line;
      return `
        <div class="node-todo-item ${checked ? 'is-completed' : ''}" data-index="${idx}">
          <input type="checkbox" class="node-todo-checkbox" ${checked ? 'checked' : ''}/>
          <span class="node-todo-text">${esc(text)}</span>
          <button class="btn-todo-delete" title="Delete task">✕</button>
        </div>`;
    }).join('');

    templateBody = `
      <div class="node-todo-container">
        <div class="node-todo-list">${itemsHtml || '<span style="color:var(--text-dim);font-style:italic;font-size:11px;">No tasks yet</span>'}</div>
        <div class="node-todo-add-box">
          <input type="text" class="node-todo-input" placeholder="New task…" autocomplete="off"/>
          <button class="node-todo-btn">+</button>
        </div>
      </div>`;
  }
  else if (entity.type === 'CANVAS') {
    templateBody = `
      <div class="node-draw-controls">
        <div class="node-draw-colors">
          <button class="node-draw-color-btn is-active" style="background:#ffffff" data-color="#ffffff"></button>
          <button class="node-draw-color-btn" style="background:#ef4444" data-color="#ef4444"></button>
          <button class="node-draw-color-btn" style="background:#10b981" data-color="#10b981"></button>
          <button class="node-draw-color-btn" style="background:#3b82f6" data-color="#3b82f6"></button>
          <button class="node-draw-color-btn" style="background:#8b5cf6" data-color="#8b5cf6"></button>
        </div>
        <button class="node-draw-clear">Clear</button>
      </div>
      <div class="node-draw-board-wrap">
        <canvas class="node-draw-board"></canvas>
      </div>`;
  }

  el.innerHTML = `
    <div class="node-header">
      <div class="node-header-left">
        <button class="node-btn-collapse" title="Collapse/Expand node">▼</button>
        <span class="node-icon">${conf.icon}</span>
        <span class="node-type-badge" style="color:${ac}">${conf.label}</span>
      </div>
      <div class="node-actions">
        <button class="node-btn btn-connect" data-uuid="${uuid}" title="Connect">⟶</button>
        <button class="node-btn btn-delete"  data-uuid="${uuid}" title="Delete">✕</button>
      </div>
    </div>
    ${headerAddon}
    <div class="node-title-wrap">
      <div class="node-title" contenteditable="true" spellcheck="false">${esc(entity.title)}</div>
    </div>
    ${templateBody}`;

  // ── Drag ──────────────────────────────────────────────────────────────────
  el.querySelector('.node-header').addEventListener('mousedown', e => {
    if (e.target.classList.contains('node-btn') || e.target.closest('.node-code-header-addon') || e.target.classList.contains('node-btn-collapse')) return;
    e.preventDefault(); e.stopPropagation();
    const wp = screenToWorld(e.clientX, e.clientY);
    Object.assign(S, {
      isDraggingNode: true, dragUUID: uuid,
      dragOffX: wp.x - entity.position_x,
      dragOffY: wp.y - entity.position_y,
      dragStartPos: { x: entity.position_x, y: entity.position_y },
    });
    el.classList.add('is-dragging');
    viewport.classList.add('is-grabbing');
  });

  // ── Collapse Button ───────────────────────────────────────────────────────
  el.querySelector('.node-btn-collapse').addEventListener('click', e => {
    e.stopPropagation();
    el.classList.toggle('is-collapsed');
    renderConnections();
    updateMinimap();
  });

  // ── Title Edit ────────────────────────────────────────────────────────────
  const titleEl = el.querySelector('.node-title');
  titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
  titleEl.addEventListener('input', () => {
    entity.title = titleEl.textContent.trim() || 'Untitled';
    setStatus('Saving…', 'saving');
    debounce(() =>
      API.patchEntity(uuid, { title: entity.title })
        .then(() => setStatus('All changes saved'))
        .catch(err => setStatus(`Error: ${err.message}`, 'error'))
    );
  });

  // ── Interactive Logic ──────────────────────────────────────────────────────

  // ⚙️ NOTE NODE Logic
  if (entity.type === 'NOTE') {
    const previewEl = el.querySelector('.node-note-preview');
    const wrapEl = el.querySelector('.node-content-wrap');
    const textarea = el.querySelector('.node-content');

    previewEl.addEventListener('dblclick', e => {
      e.stopPropagation();
      previewEl.style.display = 'none';
      wrapEl.style.display = 'block';
      textarea.focus();
    });

    textarea.addEventListener('mousedown', e => e.stopPropagation());
    textarea.addEventListener('blur', () => {
      entity.content = textarea.value;
      previewEl.innerHTML = parseMarkdown(entity.content);
      wrapEl.style.display = 'none';
      previewEl.style.display = 'block';

      setStatus('Saving…', 'saving');
      API.patchEntity(uuid, { content: entity.content })
        .then(() => setStatus('All changes saved'))
        .catch(err => setStatus(`Error: ${err.message}`, 'error'));
    });
  }

  // ⚙️ CODE NODE Logic
  else if (entity.type === 'CODE') {
    const editor = el.querySelector('.node-code-editor');
    const lines = el.querySelector('.node-code-line-numbers');
    const langSel = el.querySelector('.node-code-lang');
    const copyBtn = el.querySelector('.node-code-copy');

    editor.addEventListener('mousedown', e => e.stopPropagation());

    const updateLines = () => {
      const lineCount = editor.value.split('\n').length;
      lines.innerHTML = Array.from({ length: lineCount }, (_, i) => i + 1).join('<br>');
    };
    editor.addEventListener('input', () => {
      updateLines();
      const codeVal = `///lang=${langSel.value}\n${editor.value}`;
      entity.content = codeVal;
      setStatus('Saving…', 'saving');
      debounce(() => {
        API.patchEntity(uuid, { content: codeVal })
          .then(() => setStatus('All changes saved'))
          .catch(err => setStatus(`Error: ${err.message}`, 'error'));
      });
    });

    langSel.addEventListener('change', () => {
      const codeVal = `///lang=${langSel.value}\n${editor.value}`;
      entity.content = codeVal;
      setStatus('Saving…', 'saving');
      API.patchEntity(uuid, { content: codeVal })
        .then(() => setStatus('All changes saved'))
        .catch(err => setStatus(`Error: ${err.message}`, 'error'));
    });

    copyBtn.addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard.writeText(editor.value).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    });

    updateLines();
  }

  // ⚙️ TODO NODE Logic
  else if (entity.type === 'TODO') {
    const listEl = el.querySelector('.node-todo-list');
    const addInp = el.querySelector('.node-todo-input');
    const addBtn = el.querySelector('.node-todo-btn');

    addInp.addEventListener('mousedown', e => e.stopPropagation());

    const getTodoLines = () => {
      const lines = [];
      listEl.querySelectorAll('.node-todo-item').forEach(item => {
        const cbox = item.querySelector('.node-todo-checkbox');
        const txt = item.querySelector('.node-todo-text').textContent;
        lines.push(`[${cbox.checked ? 'x' : ' '}] ${txt}`);
      });
      return lines.join('\n');
    };

    const saveTodo = () => {
      const rawText = getTodoLines();
      entity.content = rawText;
      setStatus('Saving…', 'saving');
      API.patchEntity(uuid, { content: rawText })
        .then(() => setStatus('All changes saved'))
        .catch(err => setStatus(`Error: ${err.message}`, 'error'));
    };

    listEl.addEventListener('change', e => {
      if (e.target.classList.contains('node-todo-checkbox')) {
        const item = e.target.closest('.node-todo-item');
        item.classList.toggle('is-completed', e.target.checked);
        saveTodo();
      }
    });

    listEl.addEventListener('click', e => {
      if (e.target.classList.contains('btn-todo-delete')) {
        e.stopPropagation();
        e.target.closest('.node-todo-item').remove();
        saveTodo();
      }
    });

    const addItem = () => {
      const val = addInp.value.trim();
      if (!val) return;
      const emptySpan = listEl.querySelector('span');
      if (emptySpan) emptySpan.remove();

      const item = document.createElement('div');
      item.className = 'node-todo-item';
      item.innerHTML = `
        <input type="checkbox" class="node-todo-checkbox"/>
        <span class="node-todo-text">${esc(val)}</span>
        <button class="btn-todo-delete" title="Delete task">✕</button>`;
      listEl.appendChild(item);
      addInp.value = '';
      saveTodo();
    };

    addBtn.addEventListener('click', e => { e.stopPropagation(); addItem(); });
    addInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
  }

  // ⚙️ CANVAS NODE Logic
  else if (entity.type === 'CANVAS') {
    const canvasWrap = el.querySelector('.node-draw-board-wrap');
    const canvas = el.querySelector('.node-draw-board');
    const ctx = canvas.getContext('2d');
    const colors = el.querySelector('.node-draw-colors');
    const clear = el.querySelector('.node-draw-clear');

    let currentPenColor = '#ffffff';
    let isDrawing = false;
    let lastX = 0, lastY = 0;

    // Standardize canvas coordinates matching resolution
    const resizeCanvas = () => {
      const rect = canvasWrap.getBoundingClientRect();
      canvas.width = rect.width || 240;
      canvas.height = rect.height || 120;

      // Draw saved initial state
      if (entity.content && entity.content.startsWith('data:image/')) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = entity.content;
      } else {
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };

    // Wait until appended to DOM to accurately read rect size
    setTimeout(resizeCanvas, 0);

    const getLocalMousePos = e => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
      };
    };

    canvas.addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      isDrawing = true;
      const pos = getLocalMousePos(e);
      lastX = pos.x;
      lastY = pos.y;
    });

    canvas.addEventListener('mousemove', e => {
      if (!isDrawing) return;
      e.stopPropagation(); e.preventDefault();
      const pos = getLocalMousePos(e);

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = currentPenColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      lastX = pos.x;
      lastY = pos.y;
    });

    const stopDrawing = () => {
      if (!isDrawing) return;
      isDrawing = false;
      const dataUri = canvas.toDataURL('image/webp', 0.86);
      entity.content = dataUri;

      setStatus('Saving…', 'saving');
      debounce(() => {
        API.patchEntity(uuid, { content: dataUri })
          .then(() => setStatus('All changes saved'))
          .catch(err => setStatus(`Error: ${err.message}`, 'error'));
      });
    };

    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);

    colors.addEventListener('click', e => {
      if (e.target.classList.contains('node-draw-color-btn')) {
        e.stopPropagation();
        colors.querySelectorAll('.node-draw-color-btn').forEach(b => b.classList.remove('is-active'));
        e.target.classList.add('is-active');
        currentPenColor = e.target.dataset.color;
      }
    });

    clear.addEventListener('click', e => {
      e.stopPropagation();
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      entity.content = '';
      setStatus('Saving…', 'saving');
      API.patchEntity(uuid, { content: '' })
        .then(() => setStatus('All changes saved'))
        .catch(err => setStatus(`Error: ${err.message}`, 'error'));
    });
  }

  // ── Connect Button ────────────────────────────────────────────────────────
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

  // ── Delete Button ─────────────────────────────────────────────────────────
  el.querySelector('.btn-delete').addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${entity.title}"?`)) return;
    try {
      await API.deleteEntity(uuid);
      S.entities.delete(uuid);
      S.bloodlines = S.bloodlines.filter(b => String(b.source) !== uuid && String(b.target) !== uuid);
      el.remove();
      renderConnections();
      setStatus('All changes saved');
    } catch (err) {
      setStatus(`Error: ${err.message}`, 'error');
    }
  });

  // ── Resize Handles ────────────────────────────────────────────────────────
  ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].forEach(dir => {
    const rh = document.createElement('div');
    rh.className = `resize-handle rh-${dir}`;
    rh.dataset.handle = dir;
    rh.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const currentW = (entity.width && entity.width > 0) ? entity.width : rect.width / S.zoom;
      const currentH = (entity.height && entity.height > 0) ? entity.height : rect.height / S.zoom;
      Object.assign(S, {
        isResizingNode: true,
        resizeUUID: uuid,
        resizeHandle: dir,
        resizeStartMouse: { x: e.clientX, y: e.clientY },
        resizeStartPos: { x: entity.position_x, y: entity.position_y },
        resizeStartSize: { w: currentW, h: currentH },
      });
      el.classList.add('is-resizing');
    });
    el.appendChild(rh);
  });

  nodesLayer.appendChild(el);
}

// ── Render All ────────────────────────────────────────────────────────────────
function renderAll() {
  nodesLayer.innerHTML = '';
  S.entities.forEach(e => renderNode(e));
  renderConnections();
  if (typeof refreshTagBar === 'function') refreshTagBar();
  if (typeof window._refreshSidebar === 'function') window._refreshSidebar();
  if (typeof startParticleFlow === 'function') startParticleFlow();
  updateMinimap();
}

// ── Connection Mode ───────────────────────────────────────────────────────────
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
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  }
  cancelConnect();
}

// ── Pan ───────────────────────────────────────────────────────────────────────
viewport.addEventListener('mousedown', e => {
  const onCanvas = [viewport, world, nodesLayer, connLayer].includes(e.target)
    || e.target.classList.contains('connection-path');
  if (!onCanvas) return;
  if (S.connectingFrom) { cancelConnect(); return; }
  S.isPanning = true;
  S.panStartX = e.clientX - S.panX;
  S.panStartY = e.clientY - S.panY;
  viewport.classList.add('is-grabbing');
});

// ── Mousemove (pan + drag + resize) ──────────────────────────────────────────
window.addEventListener('mousemove', e => {
  if (S.isResizingNode && S.resizeUUID) {
    const entity = S.entities.get(S.resizeUUID);
    const el = document.querySelector(`.node[data-uuid="${S.resizeUUID}"]`);
    if (!entity || !el) return;

    const dx = (e.clientX - S.resizeStartMouse.x) / S.zoom;
    const dy = (e.clientY - S.resizeStartMouse.y) / S.zoom;
    const minW = 180, minH = 100;

    let newW = S.resizeStartSize.w;
    let newH = S.resizeStartSize.h;
    let newX = S.resizeStartPos.x;
    let newY = S.resizeStartPos.y;

    const h = S.resizeHandle;
    if (h.includes('e')) newW = Math.max(minW, snap(S.resizeStartSize.w + dx));
    if (h.includes('s')) newH = Math.max(minH, snap(S.resizeStartSize.h + dy));
    if (h.includes('w')) {
      const pW = snap(S.resizeStartSize.w - dx);
      if (pW >= minW) { newW = pW; newX = snap(S.resizeStartPos.x + dx); }
      else { newW = minW; newX = S.resizeStartPos.x + (S.resizeStartSize.w - minW); }
    }
    if (h.includes('n')) {
      const pH = snap(S.resizeStartSize.h - dy);
      if (pH >= minH) { newH = pH; newY = snap(S.resizeStartPos.y + dy); }
      else { newH = minH; newY = S.resizeStartPos.y + (S.resizeStartSize.h - minH); }
    }

    entity.width = Math.round(newW);
    entity.height = Math.round(newH);
    entity.position_x = Math.round(newX);
    entity.position_y = Math.round(newY);

    el.style.width = `${entity.width}px`;
    el.style.height = `${entity.height}px`;
    el.style.left = `${entity.position_x}px`;
    el.style.top = `${entity.position_y}px`;
    el.classList.add('has-custom-height');

    renderConnections();
    updateMinimap();
    return;
  }

  if (S.isDraggingNode && S.dragUUID) {
    const wp = screenToWorld(e.clientX, e.clientY);
    const entity = S.entities.get(S.dragUUID);
    if (!entity) return;
    entity.position_x = snap(wp.x - S.dragOffX);
    entity.position_y = snap(wp.y - S.dragOffY);
    const el = document.querySelector(`.node[data-uuid="${S.dragUUID}"]`);
    if (el) { el.style.left = `${entity.position_x}px`; el.style.top = `${entity.position_y}px`; }
    renderConnections();
    updateMinimap();
    return;
  }

  if (S.isPanning) {
    S.panX = e.clientX - S.panStartX;
    S.panY = e.clientY - S.panStartY;
    applyTransform();
  }
});

// ── Mouseup ───────────────────────────────────────────────────────────────────
window.addEventListener('mouseup', () => {
  if (S.isResizingNode && S.resizeUUID) {
    const entity = S.entities.get(S.resizeUUID);
    const el = document.querySelector(`.node[data-uuid="${S.resizeUUID}"]`);
    if (el) el.classList.remove('is-resizing');
    if (entity) {
      const uuid = S.resizeUUID;
      const oldX = S.resizeStartPos.x, oldY = S.resizeStartPos.y;
      const oldW = S.resizeStartSize.w, oldH = S.resizeStartSize.h;
      const newX = entity.position_x, newY = entity.position_y;
      const newW = entity.width, newH = entity.height;

      if (oldW !== newW || oldH !== newH || oldX !== newX || oldY !== newY) {
        UndoRedo.push({
          undo: () => {
            const ent = S.entities.get(uuid);
            if (ent) {
              ent.position_x = oldX; ent.position_y = oldY;
              ent.width = oldW; ent.height = oldH;
              const nodeEl = document.querySelector(`.node[data-uuid="${uuid}"]`);
              if (nodeEl) {
                nodeEl.style.left = `${oldX}px`; nodeEl.style.top = `${oldY}px`;
                nodeEl.style.width = `${oldW}px`; nodeEl.style.height = `${oldH}px`;
              }
              API.patchEntity(uuid, { position_x: oldX, position_y: oldY, width: oldW, height: oldH });
              renderConnections();
              updateMinimap();
            }
          },
          redo: () => {
            const ent = S.entities.get(uuid);
            if (ent) {
              ent.position_x = newX; ent.position_y = newY;
              ent.width = newW; ent.height = newH;
              const nodeEl = document.querySelector(`.node[data-uuid="${uuid}"]`);
              if (nodeEl) {
                nodeEl.style.left = `${newX}px`; nodeEl.style.top = `${newY}px`;
                nodeEl.style.width = `${newW}px`; nodeEl.style.height = `${newH}px`;
              }
              API.patchEntity(uuid, { position_x: newX, position_y: newY, width: newW, height: newH });
              renderConnections();
              updateMinimap();
            }
          }
        });
      }

      setStatus('Saving…', 'saving');
      API.patchEntity(S.resizeUUID, {
        position_x: entity.position_x, position_y: entity.position_y,
        width: entity.width, height: entity.height,
      })
        .then(() => setStatus('All changes saved'))
        .catch(err => setStatus(`Error: ${err.message}`, 'error'));
    }
  }
  S.isResizingNode = false;
  S.resizeUUID = null;

  if (S.isDraggingNode && S.dragUUID) {
    const entity = S.entities.get(S.dragUUID);
    const el = document.querySelector(`.node[data-uuid="${S.dragUUID}"]`);
    if (el) el.classList.remove('is-dragging');
    if (entity) {
      const uuid = S.dragUUID;
      const oldX = S.dragStartPos.x, oldY = S.dragStartPos.y;
      const newX = entity.position_x, newY = entity.position_y;

      if (oldX !== newX || oldY !== newY) {
        UndoRedo.push({
          undo: () => {
            const ent = S.entities.get(uuid);
            if (ent) {
              ent.position_x = oldX; ent.position_y = oldY;
              const nodeEl = document.querySelector(`.node[data-uuid="${uuid}"]`);
              if (nodeEl) { nodeEl.style.left = `${oldX}px`; nodeEl.style.top = `${oldY}px`; }
              API.patchEntity(uuid, { position_x: oldX, position_y: oldY });
              renderConnections();
              updateMinimap();
            }
          },
          redo: () => {
            const ent = S.entities.get(uuid);
            if (ent) {
              ent.position_x = newX; ent.position_y = newY;
              const nodeEl = document.querySelector(`.node[data-uuid="${uuid}"]`);
              if (nodeEl) { nodeEl.style.left = `${newX}px`; nodeEl.style.top = `${newY}px`; }
              API.patchEntity(uuid, { position_x: newX, position_y: newY });
              renderConnections();
              updateMinimap();
            }
          }
        });
      }

      setStatus('Saving…', 'saving');
      API.patchEntity(S.dragUUID, {
        position_x: entity.position_x,
        position_y: entity.position_y,
      })
        .then(() => setStatus('All changes saved'))
        .catch(err => setStatus(`Error: ${err.message}`, 'error'));
    }
  }
  S.isDraggingNode = false;
  S.dragUUID = null;
  S.isPanning = false;
  viewport.classList.remove('is-grabbing');
});

// ── Zoom (wheel) ──────────────────────────────────────────────────────────────
viewport.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.max(0.1, Math.min(5, S.zoom * factor));
  const r = viewport.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  S.panX = mx - (mx - S.panX) * (newZoom / S.zoom);
  S.panY = my - (my - S.panY) * (newZoom / S.zoom);
  S.zoom = newZoom;
  applyTransform();
}, { passive: false });

// ── Zoom (slider) ─────────────────────────────────────────────────────────────
zoomSlider.addEventListener('input', () => {
  const newZoom = parseFloat(zoomSlider.value);
  const cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2;
  S.panX = cx - (cx - S.panX) * (newZoom / S.zoom);
  S.panY = cy - (cy - S.panY) * (newZoom / S.zoom);
  S.zoom = newZoom;
  applyTransform();
});

// ── Reset zoom on indicator click ─────────────────────────────────────────────
zoomIndicator.addEventListener('click', () => {
  S.zoom = 1; S.panX = 0; S.panY = 0;
  applyTransform();
});

// ── Add Node (type picker) ────────────────────────────────────────────────────
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
      try {
        setStatus('Saving…', 'saving');
        const data = await API.createEntity({
          title: `New ${cfg.label}`,
          content: '',
          type,
          position_x: center.x - 124,
          position_y: center.y - 70,
          color: '#18181b',
        });
        const full = await API.getEntity(data.uuid);
        S.entities.set(String(full.uuid), full);
        renderNode(full);
        renderConnections();
        setStatus('All changes saved');
      } catch (err) {
        setStatus(`Error: ${err.message}`, 'error');
      }
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

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') { cancelConnect(); hideTypePicker(); }
  if ((e.altKey || e.metaKey) && e.key === 'n') { e.preventDefault(); showTypePicker(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); UndoRedo.undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); UndoRedo.redo(); }
});

// ── Clipboard Paste → Auto-Create Node ───────────────────────────────────────
async function spawnNode(type, title, content) {
  const center = viewCenter();
  const jitter = () => (Math.random() - 0.5) * 40;
  try {
    setStatus('Saving…', 'saving');
    const data = await API.createEntity({
      title, content, type,
      position_x: center.x - 124 + jitter(),
      position_y: center.y - 70 + jitter(),
      color: '#18181b',
    });
    const full = await API.getEntity(data.uuid);
    S.entities.set(String(full.uuid), full);
    renderNode(full);
    renderConnections();
    setStatus('All changes saved');
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
  }
}

window.addEventListener('paste', async e => {
  if (e.target.matches('textarea, input, [contenteditable="true"]')) return;

  const items = Array.from(e.clipboardData?.items ?? []);

  // ── Image paste → upload to server ──────────────────────────────────────
  const imgItem = items.find(i => i.type.startsWith('image/'));
  if (imgItem) {
    e.preventDefault();
    const file = imgItem.getAsFile();
    try {
      setStatus('Uploading image…', 'saving');
      const { url } = await API.uploadImage(file);
      await spawnNode('IMAGE', 'Pasted Image', url);
    } catch (err) {
      setStatus(`Upload error: ${err.message}`, 'error');
    }
    return;
  }

  // ── Text paste ───────────────────────────────────────────────────────────
  const textItem = items.find(i => i.type === 'text/plain');
  if (textItem) {
    e.preventDefault();
    textItem.getAsString(text => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const lines = trimmed.split('\n');
      const title = lines[0].slice(0, 80) || 'Pasted Note';
      const content = lines.length > 1 ? lines.slice(1).join('\n').trim() : '';
      spawnNode('NOTE', title, content);
    });
  }
});

// ── Global error safety net ───────────────────────────────────────────────────
window.addEventListener('unhandledrejection', e => {
  console.error('Unhandled rejection:', e.reason);
  setStatus(`Unexpected error: ${e.reason?.message ?? e.reason}`, 'error');
});

// ─────────────────────────────────────────────────────────────────────────────
// ════════════════  GOD ULTRA — ALL 15 FEATURES  ════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────

// ══ [1] CURSOR SHADER — REMOVED (disabled by user preference)


// ══ [2] TOOLBAR EXTRA BUTTONS (Zoom-Fit, Export PNG, Sidebar toggle, JSON) ─
(function buildToolbarExtras() {
  const toolbar = document.querySelector('.toolbar');
  const extra = document.createElement('div');
  extra.className = 'toolbar-extra';
  extra.innerHTML = `
    <button class="toolbar-icon-btn" id="btn-zoom-fit" title="Zoom to Fit (Ctrl+0)">⊡</button>
    <button class="toolbar-icon-btn" id="btn-export-png" title="Export as PNG">📷</button>
    <button class="toolbar-icon-btn" id="btn-export-json" title="Export as JSON">↓</button>
    <button class="toolbar-icon-btn" id="btn-import-json" title="Import JSON Canvas">↑</button>
    <button class="toolbar-icon-btn" id="btn-auto-layout" title="Auto-Layout Nodes">⧉</button>`;
  toolbar.appendChild(extra);

  // Sidebar toggle button
  const sidebarToggle = document.createElement('button');
  sidebarToggle.id = 'sidebar-toggle';
  sidebarToggle.textContent = '⊞ Panel';
  document.body.appendChild(sidebarToggle);
})();

// ══ [3] ZOOM TO FIT (Ctrl+0) ────────────────────────────────────────────────
function zoomToFit() {
  if (S.entities.size === 0) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  S.entities.forEach(e => {
    minX = Math.min(minX, e.position_x);
    maxX = Math.max(maxX, e.position_x + (e.width || 248));
    minY = Math.min(minY, e.position_y);
    maxY = Math.max(maxY, e.position_y + (e.height || 140));
  });

  const pad = 80;
  const contentW = maxX - minX + pad * 2;
  const contentH = maxY - minY + pad * 2;
  const scaleX = viewport.clientWidth / contentW;
  const scaleY = viewport.clientHeight / contentH;
  const newZoom = Math.max(0.1, Math.min(2, Math.min(scaleX, scaleY)));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  S.zoom = newZoom;
  S.panX = viewport.clientWidth / 2 - centerX * newZoom;
  S.panY = viewport.clientHeight / 2 - centerY * newZoom;
  applyTransform();
  setStatus('Zoomed to fit all nodes');
}

document.getElementById('btn-zoom-fit')?.addEventListener('click', zoomToFit);

// ══ [4] SPOTLIGHT SEARCH (Ctrl+K) ────────────────────────────────────────────
(function buildSpotlight() {
  const overlay = document.createElement('div');
  overlay.id = 'spotlight-overlay';
  overlay.innerHTML = `
    <div id="spotlight-panel">
      <input id="spotlight-input" type="text" placeholder="Search nodes by title or content…" autocomplete="off" spellcheck="false"/>
      <div id="spotlight-results"></div>
    </div>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#spotlight-input');
  const results = overlay.querySelector('#spotlight-results');
  let activeIdx = -1;

  function openSpotlight() {
    overlay.classList.add('is-open');
    input.value = '';
    renderResults('');
    requestAnimationFrame(() => input.focus());
  }

  function closeSpotlight() {
    overlay.classList.remove('is-open');
    activeIdx = -1;
  }

  function flyToNode(uuid) {
    const entity = S.entities.get(String(uuid));
    if (!entity) return;
    closeSpotlight();
    const cx = entity.position_x + (entity.width || 248) / 2;
    const cy = entity.position_y + (entity.height || 140) / 2;
    centerViewportOn(cx, cy);
    setTimeout(() => {
      const el = document.querySelector(`.node[data-uuid="${uuid}"]`);
      if (el) { el.classList.add('focus-pulse'); setTimeout(() => el.classList.remove('focus-pulse'), 700); }
    }, 300);
  }

  function renderResults(query) {
    const q = query.trim().toLowerCase();
    const matches = [];
    S.entities.forEach(e => {
      if (!q || e.title.toLowerCase().includes(q) || (e.content || '').toLowerCase().includes(q)) {
        matches.push(e);
      }
    });

    if (matches.length === 0) {
      results.innerHTML = `<div class="spotlight-empty">No nodes found for "<strong>${query}</strong>"</div>`;
      return;
    }

    results.innerHTML = matches.slice(0, 12).map((e, i) => {
      const conf = TYPES[e.type] ?? TYPES.NOTE;
      return `<div class="spotlight-item${i === activeIdx ? ' is-active' : ''}" data-uuid="${e.uuid}">
        <span class="spotlight-item-icon">${conf.icon}</span>
        <span class="spotlight-item-title">${esc(e.title)}</span>
        <span class="spotlight-item-type">${e.type}</span>
      </div>`;
    }).join('');

    results.querySelectorAll('.spotlight-item').forEach(item => {
      item.addEventListener('click', () => flyToNode(item.dataset.uuid));
    });
  }

  input.addEventListener('input', () => { activeIdx = -1; renderResults(input.value); });

  input.addEventListener('keydown', e => {
    const items = results.querySelectorAll('.spotlight-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); renderResults(input.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderResults(input.value); }
    else if (e.key === 'Enter') { const active = results.querySelector('.spotlight-item.is-active'); if (active) flyToNode(active.dataset.uuid); }
    else if (e.key === 'Escape') closeSpotlight();
  });

  overlay.addEventListener('click', e => { if (e.target === overlay) closeSpotlight(); });
  window._openSpotlight = openSpotlight;
  window._closeSpotlight = closeSpotlight;
})();

// ══ [5] RIGHT-CLICK CONTEXT MENU ──────────────────────────────────────────────
(function buildContextMenu() {
  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.style.display = 'none';
  document.body.appendChild(menu);

  function closeMenu() { menu.style.display = 'none'; }

  function showMenu(x, y, items) {
    menu.innerHTML = items.map(item => {
      if (item === 'divider') return `<div class="ctx-divider"></div>`;
      return `<div class="ctx-item${item.danger ? ' ctx-item--danger' : ''}" data-action="${item.action}">
        <span class="ctx-item-icon">${item.icon}</span>
        <span class="ctx-item-label">${item.label}</span>
        ${item.kbd ? `<span class="ctx-item-kbd">${item.kbd}</span>` : ''}
      </div>`;
    }).join('');

    menu.style.display = 'block';
    const mw = 200, mh = menu.offsetHeight;
    menu.style.left = `${Math.min(x, window.innerWidth - mw - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - mh - 8)}px`;

    menu.querySelectorAll('.ctx-item').forEach(item => {
      item.addEventListener('click', () => { handleCtxAction(item.dataset.action); closeMenu(); });
    });
  }

  let ctxTargetUUID = null;

  function handleCtxAction(action) {
    switch (action) {
      case 'spotlight': window._openSpotlight(); break;
      case 'zoom-fit': zoomToFit(); break;
      case 'zoom-reset': S.zoom = 1; S.panX = 0; S.panY = 0; applyTransform(); break;
      case 'export-png': exportPNG(); break;
      case 'export-json': exportJSON(); break;
      case 'import-json': importJSON(); break;
      case 'auto-layout': autoLayout(); break;
      case 'focus-node': if (ctxTargetUUID) enterFocusMode(ctxTargetUUID); break;
      case 'delete-node': if (ctxTargetUUID) {
        const btn = document.querySelector(`.node[data-uuid="${ctxTargetUUID}"] .btn-delete`);
        btn?.click();
      } break;
    }
  }

  viewport.addEventListener('contextmenu', e => {
    e.preventDefault();
    const nodeEl = e.target.closest('.node');
    ctxTargetUUID = nodeEl?.dataset.uuid ?? null;

    const items = ctxTargetUUID
      ? [
        { icon: '🔭', label: 'Focus Node', action: 'focus-node' },
        { icon: '🔍', label: 'Search…', action: 'spotlight', kbd: 'Ctrl+K' },
        'divider',
        { icon: '⊡', label: 'Zoom to Fit', action: 'zoom-fit', kbd: 'Ctrl+0' },
        'divider',
        { icon: '🗑', label: 'Delete Node', action: 'delete-node', danger: true },
      ]
      : [
        { icon: '🔍', label: 'Spotlight Search', action: 'spotlight', kbd: 'Ctrl+K' },
        { icon: '⊡', label: 'Zoom to Fit', action: 'zoom-fit', kbd: 'Ctrl+0' },
        { icon: '⧉', label: 'Auto-Layout', action: 'auto-layout' },
        'divider',
        { icon: '📷', label: 'Export PNG', action: 'export-png' },
        { icon: '↓', label: 'Export JSON', action: 'export-json' },
        { icon: '↑', label: 'Import JSON', action: 'import-json' },
        'divider',
        { icon: '↺', label: 'Reset View', action: 'zoom-reset' },
      ];

    showMenu(e.clientX, e.clientY, items);
  });

  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
})();

// ══ [6] EXPORT PNG ──────────────────────────────────────────────────────────
async function exportPNG() {
  setStatus('Capturing canvas…', 'saving');
  try {
    // Use the browser's native print-like approach via SVG foreignObject
    const bounds = getCanvasBounds();
    const scale = 1.5;
    const W = Math.round(bounds.width * scale);
    const H = Math.round(bounds.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(0, 0, W, H);

    // Draw each node as a rectangle block
    S.entities.forEach(entity => {
      const x = (entity.position_x - bounds.minX) * scale;
      const y = (entity.position_y - bounds.minY) * scale;
      const w = (entity.width || 248) * scale;
      const h = (entity.height || 140) * scale;
      const conf = TYPES[entity.type] ?? TYPES.NOTE;

      ctx.save();
      ctx.fillStyle = 'rgba(20,20,25,0.9)';
      ctx.strokeStyle = accent(entity) + '88';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 8 * scale);
      ctx.fill();
      ctx.stroke();

      // Header line
      ctx.fillStyle = accent(entity) + 'aa';
      ctx.fillRect(x, y, w, 3 * scale);

      // Title text
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${13 * scale}px Inter, sans-serif`;
      ctx.fillText(entity.title.slice(0, 30), x + 10 * scale, y + 24 * scale);

      // Type label
      ctx.fillStyle = accent(entity);
      ctx.font = `${9 * scale}px monospace`;
      ctx.fillText(entity.type, x + 10 * scale, y + 38 * scale);

      ctx.restore();
    });

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `space-canvas-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Canvas exported as PNG');
    }, 'image/png');
  } catch (err) {
    setStatus(`Export failed: ${err.message}`, 'error');
  }
}
document.getElementById('btn-export-png')?.addEventListener('click', exportPNG);

// ══ [7] EXPORT JSON ──────────────────────────────────────────────────────────
function exportJSON() {
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    entities: Array.from(S.entities.values()),
    bloodlines: S.bloodlines,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `space-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Canvas exported as JSON');
}
document.getElementById('btn-export-json')?.addEventListener('click', exportJSON);

function importJSON() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) { fileInput.remove(); return; }

    setStatus('Importing canvas JSON…', 'saving');
    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      const rawEntities = Array.isArray(payload) ? payload : (payload.entities || []);
      const rawBloodlines = payload.bloodlines || [];

      if (!Array.isArray(rawEntities) || rawEntities.length === 0) {
        throw new Error('Invalid or empty JSON format (no entities found)');
      }

      const uuidMap = {};
      let importedCount = 0;

      // Spawn entities
      for (const ent of rawEntities) {
        const created = await API.createEntity({
          type: ent.type || 'NOTE',
          title: ent.title || 'Imported Node',
          content: ent.content || '',
          color: ent.color || '#18181b',
          position_x: ent.position_x ?? 100,
          position_y: ent.position_y ?? 100,
          width: ent.width || 248,
          height: ent.height || 140,
        });
        const oldUuid = String(ent.uuid);
        const newUuid = String(created.uuid);
        uuidMap[oldUuid] = newUuid;
        S.entities.set(newUuid, created);
        importedCount++;
      }

      // Reconstruct connections
      for (const bl of rawBloodlines) {
        const newSrc = uuidMap[String(bl.source)];
        const newTgt = uuidMap[String(bl.target)];
        if (newSrc && newTgt) {
          try {
            const createdBl = await API.createBloodline(newSrc, newTgt);
            S.bloodlines.push(createdBl);
          } catch (_) { }
        }
      }

      renderAll();
      setTimeout(zoomToFit, 200);
      setStatus(`Imported ${importedCount} nodes & connections ✓`);
    } catch (err) {
      console.error('Import failed:', err);
      setStatus(`Import Error: ${err.message}`, 'error');
    } finally {
      fileInput.remove();
    }
  });

  fileInput.click();
}
document.getElementById('btn-import-json')?.addEventListener('click', importJSON);

// ══ [8] AUTO-LAYOUT ENGINE (force-directed) ──────────────────────────────────
function autoLayout() {
  if (S.entities.size < 2) { setStatus('Need more nodes to auto-layout'); return; }
  setStatus('Running auto-layout…', 'saving');

  const nodes = Array.from(S.entities.values()).map(e => ({
    uuid: String(e.uuid),
    x: e.position_x,
    y: e.position_y,
    w: e.width || 248,
    h: e.height || 140,
    vx: 0, vy: 0,
  }));

  const nodeMap = Object.fromEntries(nodes.map(n => [n.uuid, n]));
  const iterations = 80;
  const repulsion = 18000;
  const attraction = 0.05;
  const damping = 0.85;
  const idealDist = 320;

  for (let i = 0; i < iterations; i++) {
    // Repulsion between all pairs
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const na = nodes[a], nb = nodes[b];
        const dx = na.x - nb.x || 0.1;
        const dy = na.y - nb.y || 0.1;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        na.vx += (dx / dist) * force;
        na.vy += (dy / dist) * force;
        nb.vx -= (dx / dist) * force;
        nb.vy -= (dy / dist) * force;
      }
    }

    // Attraction along bloodlines
    S.bloodlines.forEach(bl => {
      const src = nodeMap[String(bl.source)];
      const tgt = nodeMap[String(bl.target)];
      if (!src || !tgt) return;
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const diff = (dist - idealDist) * attraction;
      src.vx += (dx / dist) * diff;
      src.vy += (dy / dist) * diff;
      tgt.vx -= (dx / dist) * diff;
      tgt.vy -= (dy / dist) * diff;
    });

    // Apply velocities with damping
    nodes.forEach(n => {
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
    });
  }

  // Commit snapped positions
  nodes.forEach(n => {
    const entity = S.entities.get(n.uuid);
    if (!entity) return;
    entity.position_x = snap(n.x);
    entity.position_y = snap(n.y);
    const el = document.querySelector(`.node[data-uuid="${n.uuid}"]`);
    if (el) { el.style.left = `${entity.position_x}px`; el.style.top = `${entity.position_y}px`; }
    API.patchEntity(n.uuid, { position_x: entity.position_x, position_y: entity.position_y });
  });

  renderConnections();
  updateMinimap();
  setTimeout(zoomToFit, 200);
  setStatus('Auto-layout complete ✓');
}
document.getElementById('btn-auto-layout')?.addEventListener('click', autoLayout);

// ══ [9] FOCUS MODE ──────────────────────────────────────────────────────────
const focusExitBtn = document.createElement('button');
focusExitBtn.id = 'focus-exit-btn';
focusExitBtn.textContent = '✕ Exit Focus Mode';
focusExitBtn.addEventListener('click', exitFocusMode);
document.body.appendChild(focusExitBtn);

function enterFocusMode(uuid) {
  document.querySelectorAll('.node').forEach(el => el.classList.remove('is-focused'));
  const el = document.querySelector(`.node[data-uuid="${uuid}"]`);
  if (!el) return;
  el.classList.add('is-focused');
  document.body.classList.add('focus-mode');
  const entity = S.entities.get(uuid);
  if (entity) centerViewportOn(entity.position_x + (entity.width || 248) / 2, entity.position_y + (entity.height || 140) / 2);
  setStatus('Focus mode — click "Exit Focus Mode" to return');
}

function exitFocusMode() {
  document.body.classList.remove('focus-mode');
  document.querySelectorAll('.node').forEach(el => el.classList.remove('is-focused'));
  setStatus('All changes saved');
}

// Double-click node header to enter focus mode
nodesLayer.addEventListener('dblclick', e => {
  const nodeEl = e.target.closest('.node');
  if (!nodeEl) return;
  if (e.target.closest('.node-note-preview') || e.target.closest('textarea') || e.target.closest('input')) return;
  enterFocusMode(nodeEl.dataset.uuid);
});

// ══ [10] TAG SYSTEM & FILTER BAR ─────────────────────────────────────────────
const tagBar = document.createElement('div');
tagBar.id = 'tag-bar';
tagBar.classList.add('is-empty');
document.body.appendChild(tagBar);

let activeTag = null;

function extractTags() {
  const tags = new Set();
  S.entities.forEach(e => {
    const matches = (e.title + ' ' + (e.content || '')).match(/#[\w-]+/g) || [];
    matches.forEach(t => tags.add(t));
  });
  return tags;
}

function refreshTagBar() {
  const tags = extractTags();
  if (tags.size === 0) { tagBar.classList.add('is-empty'); return; }
  tagBar.classList.remove('is-empty');
  tagBar.innerHTML = `<span class="tag-chip${!activeTag ? ' is-active' : ''}" data-tag="__all__">All</span>` +
    Array.from(tags).map(t => `<span class="tag-chip${activeTag === t ? ' is-active' : ''}" data-tag="${esc(t)}">${esc(t)}</span>`).join('');

  tagBar.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeTag = chip.dataset.tag === '__all__' ? null : chip.dataset.tag;
      applyTagFilter();
      refreshTagBar();
    });
  });
}

function applyTagFilter() {
  document.querySelectorAll('.node').forEach(el => {
    const entity = S.entities.get(el.dataset.uuid);
    if (!activeTag || !entity) { el.style.opacity = ''; el.style.pointerEvents = ''; return; }
    const text = entity.title + ' ' + (entity.content || '');
    const matches = text.includes(activeTag);
    el.style.opacity = matches ? '' : '0.18';
    el.style.pointerEvents = matches ? '' : 'none';
  });
}

// ══ [11] FLOATING SIDEBAR PANEL ──────────────────────────────────────────────
(function buildSidebar() {
  const panel = document.createElement('div');
  panel.id = 'sidebar-panel';
  document.body.appendChild(panel);

  function refreshSidebar() {
    const stats = { total: S.entities.size };
    Object.keys(TYPES).forEach(t => {
      stats[t] = Array.from(S.entities.values()).filter(e => e.type === t).length;
    });

    panel.innerHTML = `
      <p class="sidebar-title">Canvas Stats</p>
      <div class="sidebar-stat-row"><span>Total Nodes</span><span class="sidebar-stat-val">${stats.total}</span></div>
      ${Object.entries(TYPES).map(([t, cfg]) => `
        <div class="sidebar-stat-row">
          <span>${cfg.icon} ${cfg.label}</span>
          <span class="sidebar-stat-val" style="color:${cfg.color}">${stats[t] || 0}</span>
        </div>`).join('')}
      <p class="sidebar-title">Quick Templates</p>
      <button class="sidebar-template-btn" data-type="NOTE" data-title="Meeting Notes" data-content="# Agenda\n- Item 1\n- Item 2">☑ Meeting Notes</button>
      <button class="sidebar-template-btn" data-type="TODO" data-title="Sprint Tasks" data-content="[ ] Task 1\n[ ] Task 2\n[ ] Task 3">✓ Sprint Tasks</button>
      <button class="sidebar-template-btn" data-type="CODE" data-title="Code Snippet" data-content="///lang=javascript\n// Your code here">⌥ Code Snippet</button>
      <button class="sidebar-template-btn" data-type="CANVAS" data-title="Sketch Board" data-content="">⬡ Sketch Board</button>
      <p class="sidebar-title">Actions</p>
      <button class="sidebar-section-btn" id="sb-zoom-fit">⊡ Zoom to Fit</button>
      <button class="sidebar-section-btn" id="sb-auto-layout">⧉ Auto-Layout</button>
      <button class="sidebar-section-btn" id="sb-export-json">↓ Export JSON</button>
      <button class="sidebar-section-btn" id="sb-import-json">↑ Import JSON</button>
      <p class="sidebar-title">Settings</p>
      <button class="sidebar-section-btn" id="sb-anim-toggle" style="background: var(--surface-2); border: 1px solid rgba(255,255,255,0.1); color: var(--text)">${document.body.classList.contains('animations-off') ? '▶ Enable Animations' : '⏸ Disable Animations'}</button>`;

    panel.querySelectorAll('.sidebar-template-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { type, title, content } = btn.dataset;
        await spawnNode(type, title, content);
        refreshSidebar();
        refreshTagBar();
      });
    });

    panel.querySelector('#sb-zoom-fit')?.addEventListener('click', zoomToFit);
    panel.querySelector('#sb-auto-layout')?.addEventListener('click', autoLayout);
    panel.querySelector('#sb-export-json')?.addEventListener('click', exportJSON);
    panel.querySelector('#sb-import-json')?.addEventListener('click', importJSON);
    panel.querySelector('#sb-anim-toggle')?.addEventListener('click', () => {
      document.body.classList.toggle('animations-off');
      const isOff = document.body.classList.contains('animations-off');
      panel.querySelector('#sb-anim-toggle').textContent = isOff ? '▶ Enable Animations' : '⏸ Disable Animations';
      setStatus(isOff ? 'Animations disabled' : 'Animations enabled');
      // Stop/start particle flow
      if (isOff) {
        if (particleRAF) { cancelAnimationFrame(particleRAF); particleRAF = null; }
        connLayer.querySelectorAll('.flow-particle').forEach(p => p.remove());
      } else {
        startParticleFlow();
      }
    });
  }

  const toggle = document.getElementById('sidebar-toggle');
  toggle?.addEventListener('click', () => {
    panel.classList.toggle('is-open');
    if (panel.classList.contains('is-open')) refreshSidebar();
  });

  window._refreshSidebar = refreshSidebar;
})();

// ══ [12] CONNECTION HOVER TOOLTIP ────────────────────────────────────────────
(function buildConnTooltip() {
  const tooltip = document.createElement('div');
  tooltip.id = 'conn-tooltip';
  tooltip.innerHTML = `<div class="tt-type"></div><div class="tt-title"></div>`;
  document.body.appendChild(tooltip);

  connLayer.addEventListener('mouseover', e => {
    const path = e.target.closest('.connection-path');
    if (!path) return;
    const tgtUUID = path.dataset.target;
    const entity = S.entities.get(tgtUUID);
    if (!entity) return;
    const conf = TYPES[entity.type] ?? TYPES.NOTE;
    tooltip.querySelector('.tt-type').textContent = `${conf.icon} ${entity.type}`;
    tooltip.querySelector('.tt-title').textContent = entity.title;
    tooltip.classList.add('is-visible');
  });

  connLayer.addEventListener('mousemove', e => {
    tooltip.style.left = `${e.clientX + 14}px`;
    tooltip.style.top = `${e.clientY - 10}px`;
  });

  connLayer.addEventListener('mouseout', e => {
    if (!e.relatedTarget?.closest('.connection-path')) tooltip.classList.remove('is-visible');
  });
})();

// ══ [13] ANIMATED PARTICLE DATA FLOW ─────────────────────────────────────────
const particles = [];
let particleRAF = null;

function spawnParticle(path) {
  const length = path.getTotalLength();
  if (length < 10) return;
  particles.push({ path, t: 0, speed: 0.004 + Math.random() * 0.003, length });
}

function animateParticles() {
  // Remove old particles SVG elements
  connLayer.querySelectorAll('.flow-particle').forEach(p => p.remove());

  particles.forEach((p, i) => {
    p.t += p.speed;
    if (p.t > 1) { particles.splice(i, 1); return; }
    try {
      const pt = p.path.getPointAtLength(p.t * p.length);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', 3.5);
      circle.setAttribute('fill', '#a78bfa');
      circle.setAttribute('opacity', String(1 - p.t));
      circle.classList.add('flow-particle');
      connLayer.appendChild(circle);
    } catch (_) { }
  });

  particleRAF = requestAnimationFrame(animateParticles);
}

function startParticleFlow() {
  if (particleRAF) return;
  animateParticles();

  // Spawn particles on interval
  setInterval(() => {
    const paths = Array.from(connLayer.querySelectorAll('.connection-path'));
    paths.forEach(path => {
      if (Math.random() < 0.4) spawnParticle(path);
    });
  }, 800);
}

// ══ [14] NODE BOOKMARKS / WAYPOINTS ──────────────────────────────────────────
(function buildWaypoints() {
  const bar = document.createElement('div');
  bar.id = 'waypoint-bar';
  document.body.appendChild(bar);

  const waypoints = {};

  function render() {
    bar.innerHTML = [1, 2, 3, 4, 5].map(n =>
      `<button class="waypoint-btn${waypoints[n] ? ' is-set' : ''}" data-n="${n}" title="${waypoints[n] ? `Go to waypoint ${n}` : `Save waypoint ${n} (Ctrl+${n})`}">${n}</button>`
    ).join('');
    bar.querySelectorAll('.waypoint-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const n = parseInt(btn.dataset.n);
        if (e.shiftKey || !waypoints[n]) {
          waypoints[n] = { panX: S.panX, panY: S.panY, zoom: S.zoom };
          setStatus(`Waypoint ${n} saved`);
          render();
        } else {
          const wp = waypoints[n];
          Object.assign(S, { panX: wp.panX, panY: wp.panY, zoom: wp.zoom });
          applyTransform();
          setStatus(`Teleported to waypoint ${n}`);
        }
      });
    });
  }

  render();

  // Keyboard teleport (Ctrl+1..5)
  window.addEventListener('keydown', e => {
    if (!e.ctrlKey && !e.metaKey) return;
    const n = parseInt(e.key);
    if (n >= 1 && n <= 5) {
      e.preventDefault();
      if (e.shiftKey || !waypoints[n]) {
        waypoints[n] = { panX: S.panX, panY: S.panY, zoom: S.zoom };
        setStatus(`Waypoint ${n} saved`);
        render();
      } else {
        const wp = waypoints[n];
        Object.assign(S, { panX: wp.panX, panY: wp.panY, zoom: wp.zoom });
        applyTransform();
        setStatus(`Teleported to waypoint ${n}`);
      }
    }
  });
})();

// ══ [15] PERFORMANCE VIRTUALIZATION ─────────────────────────────────────────
function virtualizeNodes() {
  if (S.entities.size < 30) return; // Only kick in for large canvases
  const vp = viewport.getBoundingClientRect();
  const margin = 300;

  document.querySelectorAll('.node').forEach(el => {
    const rect = el.getBoundingClientRect();
    const visible = rect.right > vp.left - margin &&
      rect.left < vp.right + margin &&
      rect.bottom > vp.top - margin &&
      rect.top < vp.bottom + margin;
    el.style.visibility = visible ? '' : 'hidden';
    el.style.pointerEvents = visible ? '' : 'none';
  });
}

// ── Virtualize on wheel scroll ────────────────────────────────────────────────
viewport.addEventListener('wheel', () => { setTimeout(virtualizeNodes, 50); }, { passive: true });

// ══ KEYBOARD SHORTCUTS EXTENSION ─────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); window._openSpotlight(); }
  if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); zoomToFit(); }
  if (e.key === 'Escape') exitFocusMode();
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  setStatus('Loading…', 'saving');
  try {
    // Fetch all pages of entities + bloodlines in parallel
    const [entities, bloodlines] = await Promise.all([
      API.getAllEntities(),
      API.getBloodlines(),
    ]);
    entities.forEach(e => S.entities.set(String(e.uuid), e));
    S.bloodlines = bloodlines;
    renderAll();
    setStatus('All changes saved');
    hideLoading();
  } catch (err) {
    console.error(err);
    setStatus('Failed to load canvas', 'error');
    if (loadingOverlay) {
      loadingOverlay.querySelector('.loading-label').textContent = 'Failed to load canvas.';
    }
  }
  applyTransform();
}

init();
