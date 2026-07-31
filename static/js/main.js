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
const S = {
  zoom: 1, panX: 0, panY: 0,
  entities: new Map(),   // uuid → entity object
  bloodlines: [],
  isPanning: false,
  panStartX: 0, panStartY: 0,
  isDraggingNode: false,
  dragUUID: null,
  dragOffX: 0, dragOffY: 0,
  isResizingNode: false,
  resizeUUID: null,
  resizeHandle: null,
  resizeStartMouse: { x: 0, y: 0 },
  resizeStartPos: { x: 0, y: 0 },
  resizeStartSize: { w: 0, h: 0 },
  connectingFrom: null,
  saveTimer: null,
};

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

    return `<path class="connection-path" data-id="${b.id}"
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
    if (e.target.classList.contains('node-btn') || e.target.closest('.node-code-header-addon')) return;
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
    if (h.includes('e')) newW = Math.max(minW, S.resizeStartSize.w + dx);
    if (h.includes('s')) newH = Math.max(minH, S.resizeStartSize.h + dy);
    if (h.includes('w')) {
      const pW = S.resizeStartSize.w - dx;
      if (pW >= minW) { newW = pW; newX = S.resizeStartPos.x + dx; }
      else { newW = minW; newX = S.resizeStartPos.x + (S.resizeStartSize.w - minW); }
    }
    if (h.includes('n')) {
      const pH = S.resizeStartSize.h - dy;
      if (pH >= minH) { newH = pH; newY = S.resizeStartPos.y + dy; }
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
    return;
  }

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

// ── Mouseup ───────────────────────────────────────────────────────────────────
window.addEventListener('mouseup', () => {
  if (S.isResizingNode && S.resizeUUID) {
    const entity = S.entities.get(S.resizeUUID);
    const el = document.querySelector(`.node[data-uuid="${S.resizeUUID}"]`);
    if (el) el.classList.remove('is-resizing');
    if (entity) {
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
