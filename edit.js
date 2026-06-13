/* ============================================================
   Editor in-place para AnCheco — v2 (seguridad + UX)
   ------------------------------------------------------------
   Cómo se activa:  abrir la página con ?edit=1
   Autenticación:   pide un Personal Access Token (PAT) la primera vez,
                    lo guarda en localStorage para próximas sesiones.
   Cómo guarda:     hace commit directo al repo via GitHub API.
                    Cada save → 1 commit → Pages re-publica solo.

   Fixes incluidos (vs v1):
   - BUG-001: sanitización de innerHTML (whitelist tags inline seguros)
   - BUG-002: workingContent visible al hydrateCMS → re-render preserva ediciones
   - BUG-005: T() helper escapa atributos
   - BUG-007: catch de 409/422 conflict → refresca SHA y permite reintento
   - BUG-008: beforeunload warning si hay cambios pendientes
   - BUG-009: PAT inválido → prompt sin recargar, preserva trabajo
   - BUG-010: Enter no inserta <div>/<br> en data-cms-html
   - BUG-011: paste sanitizado (sin mso-, sin style inline, sin tags peligrosos)
   - BUG-012: Firefox polyfill plaintext-only manual
   - Doble-click Guardar bloqueado (flag saving)
   - Botón "Cerrar sesión" para limpiar PAT
   ============================================================ */

(function () {
  if (!new URLSearchParams(location.search).has('edit')) return;

  const REPO_OWNER = '0VictorRodriguez0';
  const REPO_NAME  = 'ancheco-editable';
  const CONTENT_PATH = 'content/content.json';
  const BRANCH = 'main';
  const STORAGE_KEY = 'ancheco_editor_pat';

  let token = localStorage.getItem(STORAGE_KEY);
  let originalContent = null;
  let workingContent = null;
  let fileSha = null;
  let dirtyKeys = new Set();
  let saving = false;

  // ============= UTIL =============
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const getByPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const setByPath = (obj, path, value) => {
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((o, k) => (o[k] ??= {}), obj);
    target[last] = value;
  };

  // FIX BUG-001 + BUG-011: Sanitizador HTML — whitelist mínima de tags inline seguros.
  // Bloquea <script>, <iframe>, <svg>, <object>, <embed>, <img>, eventos on*,
  // javascript: URIs, srcdoc, y todos los styles inline (Word/Docs paste basura).
  const ALLOWED_TAGS = new Set(['B','I','EM','STRONG','BR','A','SPAN','U','SMALL']);
  function sanitizeHTML(html) {
    if (typeof html !== 'string') return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const walk = (node) => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === 3) return;       // text node OK
        if (child.nodeType !== 1) { child.remove(); return; } // comment, etc → fuera
        if (!ALLOWED_TAGS.has(child.tagName)) {
          // unwrap: dejar el texto adentro, quitar el tag prohibido
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          child.remove();
          return;
        }
        // Atributos: solo href en <a>, resto fuera
        Array.from(child.attributes).forEach(attr => {
          const name = attr.name.toLowerCase();
          const val = attr.value || '';
          if (name === 'href' && child.tagName === 'A') {
            if (/^\s*(javascript|data|vbscript):/i.test(val)) child.removeAttribute(attr.name);
            else child.setAttribute('rel', 'noopener noreferrer');
          } else {
            child.removeAttribute(attr.name);
          }
        });
        walk(child);
      });
    };
    walk(tmp);
    return tmp.innerHTML;
  }
  // Expose para que la hidratación pública del index.html lo reuse
  window.__cmsSanitize = sanitizeHTML;

  // ============= STYLES =============
  const style = document.createElement('style');
  style.textContent = `
    [data-cms], [data-cms-html] {
      outline: 1.5px dashed rgba(229, 122, 44, 0.55);
      outline-offset: 4px;
      border-radius: 4px;
      transition: outline-color .15s, background-color .15s;
      cursor: text;
    }
    [data-cms]:hover, [data-cms-html]:hover {
      outline-color: rgba(229, 122, 44, 1);
      background: rgba(229, 122, 44, 0.06);
    }
    [data-cms]:focus, [data-cms-html]:focus {
      outline: 2px solid #e57a2c;
      background: rgba(229, 122, 44, 0.12);
    }
    [data-cms].dirty, [data-cms-html].dirty {
      outline-color: #1bbf6a;
    }
    [data-cms].dirty:hover, [data-cms-html].dirty:hover {
      background: rgba(27, 191, 106, 0.08);
    }
    #ancheco-editor-bar {
      position: fixed; bottom: 18px; right: 18px; z-index: 99999;
      background: #1e3a5f; color: #fff;
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(0,0,0,.22);
      padding: 12px 14px;
      font-family: Montserrat, system-ui, sans-serif;
      font-size: 13px;
      display: flex; align-items: center; gap: 12px;
      min-width: 280px;
    }
    #ancheco-editor-bar .dot {
      width: 8px; height: 8px; border-radius: 50%; background: #1bbf6a;
      animation: ae-pulse 1.6s ease-in-out infinite;
    }
    @keyframes ae-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    #ancheco-editor-bar .status { flex: 1; line-height: 1.3; }
    #ancheco-editor-bar .status strong { display:block; font-size: 12px; font-weight: 700; }
    #ancheco-editor-bar .status span { font-size: 11px; opacity: .8; }
    #ancheco-editor-bar button {
      border: 0; border-radius: 999px; padding: 8px 14px;
      font-weight: 700; font-size: 12px; cursor: pointer;
    }
    #ancheco-editor-bar .btn-save { background: #e57a2c; color: #fff; }
    #ancheco-editor-bar .btn-save:disabled { background: #6b7280; cursor: not-allowed; }
    #ancheco-editor-bar .btn-ghost { background: transparent; color: #fff; opacity: .7; }
    #ancheco-editor-bar .btn-ghost:hover { opacity: 1; }
    #ancheco-editor-bar .btn-logout { background: transparent; color: #fff; opacity: .5; font-size: 10px; padding: 4px 8px; }
    #ancheco-editor-bar .btn-logout:hover { opacity: 1; }
    #ancheco-editor-toast {
      position: fixed; bottom: 90px; right: 18px; z-index: 99999;
      background: #1bbf6a; color: #fff; padding: 10px 16px;
      border-radius: 10px; font-family: Montserrat, sans-serif; font-size: 13px;
      box-shadow: 0 6px 20px rgba(0,0,0,.2);
      opacity: 0; transform: translateY(10px); transition: all .25s;
      max-width: 340px;
    }
    #ancheco-editor-toast.show { opacity: 1; transform: translateY(0); }
    #ancheco-editor-toast.error { background: #d93636; }
    #ancheco-editor-toast.warn  { background: #d97c0d; }
  `;
  document.head.appendChild(style);

  // ============= BARRA FLOTANTE =============
  function renderBar() {
    let bar = document.getElementById('ancheco-editor-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'ancheco-editor-bar';
      bar.innerHTML = `
        <span class="dot"></span>
        <div class="status">
          <strong>Modo edición</strong>
          <span id="ae-count">0 cambios sin guardar</span>
        </div>
        <button class="btn-logout" id="ae-logout" title="Cerrar sesión (borra el token guardado)">⎋</button>
        <button class="btn-ghost" id="ae-discard">Descartar</button>
        <button class="btn-save" id="ae-save">Guardar</button>
      `;
      document.body.appendChild(bar);
      bar.querySelector('#ae-save').addEventListener('click', save);
      bar.querySelector('#ae-discard').addEventListener('click', discard);
      bar.querySelector('#ae-logout').addEventListener('click', logout);
    }
    const n = dirtyKeys.size;
    bar.querySelector('#ae-count').textContent =
      n === 0 ? 'Sin cambios pendientes' : `${n} cambio${n>1?'s':''} sin guardar`;
    bar.querySelector('#ae-save').disabled = n === 0 || saving;
  }

  function toast(msg, kind) {
    let t = document.getElementById('ancheco-editor-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ancheco-editor-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.remove('error', 'warn');
    if (kind === 'error') t.classList.add('error');
    else if (kind === 'warn') t.classList.add('warn');
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(t._hide);
    const dur = kind === 'error' ? 5000 : 3200;
    t._hide = setTimeout(() => t.classList.remove('show'), dur);
  }

  // ============= GITHUB API =============
  const ghHeaders = () => ({
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  });
  const ghUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${CONTENT_PATH}`;

  async function loadFromGitHub() {
    const res = await fetch(`${ghUrl}?ref=${BRANCH}&t=${Date.now()}`, { headers: ghHeaders() });
    if (!res.ok) {
      const err = new Error(`GET → ${res.status} ${res.statusText}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    fileSha = data.sha;
    const decoded = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
    return JSON.parse(decoded);
  }

  async function pushToGitHub(newContent) {
    const json = JSON.stringify(newContent, null, 2) + '\n';
    const b64 = btoa(unescape(encodeURIComponent(json)));
    const changedList = Array.from(dirtyKeys).slice(0, 6).join(', ');
    const more = dirtyKeys.size > 6 ? ` (+${dirtyKeys.size - 6} más)` : '';
    const body = {
      message: `Edit via in-place editor: ${changedList}${more}`,
      content: b64,
      sha: fileSha,
      branch: BRANCH
    };
    const res = await fetch(ghUrl, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      const errBody = await res.text();
      const err = new Error(`PUT → ${res.status}: ${errBody.slice(0, 200)}`);
      err.status = res.status;
      err.body = errBody;
      throw err;
    }
    const data = await res.json();
    fileSha = data.content.sha;
  }

  // ============= EDIT HANDLERS =============
  // Bloqueador de propagación: cuando el cliente hace click en un texto editable
  // dentro de un <button> del wizard, el button captura el click y ejecuta su
  // handler (cambia state, re-renderiza, destruye la edición). Necesitamos
  // detener la propagación ANTES de que llegue al padre.
  const stopAll = (e) => { e.stopPropagation(); e.stopImmediatePropagation(); };

  // FIX BUG-011: Paste handler que limpia HTML pegado desde Word/Docs
  function onPaste(el, e) {
    e.preventDefault();
    const isHtmlMode = el.hasAttribute('data-cms-html');
    const cd = e.clipboardData || window.clipboardData;
    if (!cd) return;
    if (isHtmlMode) {
      const html = cd.getData('text/html') || cd.getData('text/plain') || '';
      const clean = sanitizeHTML(html);
      document.execCommand('insertHTML', false, clean);
    } else {
      const text = cd.getData('text/plain') || '';
      document.execCommand('insertText', false, text);
    }
  }

  // FIX BUG-010 + BUG-012: Enter handler. Firefox no soporta plaintext-only,
  // así que aún en data-cms debemos prevenir manualmente <div>/<br>.
  function onKeydown(el, e) {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      // data-cms: blur (single-line text); data-cms-html: insertar <br> explícito
      e.preventDefault();
      if (el.hasAttribute('data-cms')) {
        el.blur();
      } else {
        document.execCommand('insertHTML', false, '<br>');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      el.blur();
    }
  }

  function attachOne(el) {
    if (el.dataset.cmsBound === '1') return;
    el.dataset.cmsBound = '1';

    // Bloqueamos click/mousedown en fase de captura para que NUNCA lleguen
    // al button padre (que tiene los handlers del wizard).
    ['mousedown', 'click', 'dblclick', 'pointerdown'].forEach(evt =>
      el.addEventListener(evt, stopAll, true)
    );
    el.addEventListener('keydown', (e) => onKeydown(el, e), true);
    el.addEventListener('paste', (e) => onPaste(el, e), true);

    if (el.hasAttribute('data-cms')) {
      // FIX BUG-012: si el browser no soporta plaintext-only (Firefox),
      // cae a 'true' pero los handlers de paste/keydown ya filtran HTML.
      el.contentEditable = 'plaintext-only';
      if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
      el.spellcheck = false;
      const v = getByPath(workingContent, el.dataset.cms);
      if (typeof v === 'string') el.textContent = v;
      el.addEventListener('input', () => onEdit(el, el.dataset.cms, el.textContent));
    } else if (el.hasAttribute('data-cms-html')) {
      el.contentEditable = 'true';
      el.spellcheck = false;
      const v = getByPath(workingContent, el.dataset.cmsHtml);
      if (typeof v === 'string') el.innerHTML = sanitizeHTML(v);
      el.addEventListener('input', () => onEdit(el, el.dataset.cmsHtml, sanitizeHTML(el.innerHTML)));
    }
  }

  function makeEditable() {
    $$('[data-cms]').forEach(attachOne);
    $$('[data-cms-html]').forEach(attachOne);
  }

  // MutationObserver: el wizard genera elementos editables sobre la marcha
  // (titles, explainers, addons). Cada vez que aparece un elemento nuevo con
  // data-cms o data-cms-html lo conectamos para que sea editable.
  function watchDOM() {
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          if (n.matches?.('[data-cms], [data-cms-html]')) attachOne(n);
          n.querySelectorAll?.('[data-cms], [data-cms-html]').forEach(attachOne);
        });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function onEdit(el, path, value) {
    setByPath(workingContent, path, value);
    // FIX BUG-002: actualizar también el window.__cms.data global para que
    // cuando el wizard se re-renderice y llame T(), lea el valor editado.
    if (window.__cms && window.__cms.data) {
      setByPath(window.__cms.data, path, value);
    }
    const original = getByPath(originalContent, path);
    if (value === original) {
      dirtyKeys.delete(path);
      el.classList.remove('dirty');
    } else {
      dirtyKeys.add(path);
      el.classList.add('dirty');
    }
    renderBar();
  }

  // FIX BUG-007 + BUG-009: catch específico de 409/422 y 401/403
  async function save() {
    if (dirtyKeys.size === 0 || saving) return;
    saving = true;
    const btn = document.querySelector('#ae-save');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      await pushToGitHub(workingContent);
      originalContent = JSON.parse(JSON.stringify(workingContent));
      dirtyKeys.clear();
      $$('.dirty').forEach(el => el.classList.remove('dirty'));
      btn.textContent = 'Guardar';
      toast('Guardado. Cambios en vivo en ~1 minuto.');
    } catch (e) {
      btn.textContent = 'Guardar';
      // FIX BUG-007: conflicto de SHA — refrescar y pedir reintento
      if (e.status === 409 || e.status === 422) {
        try {
          const remote = await loadFromGitHub();
          // Merge: aplicar los dirty del cliente sobre el remoto
          dirtyKeys.forEach(path => {
            const v = getByPath(workingContent, path);
            setByPath(remote, path, v);
          });
          originalContent = JSON.parse(JSON.stringify(remote));
          // workingContent ya contiene los cambios; mantener
          toast('Alguien más guardó. Refresqué los datos remotos y mantuve tus cambios — presiona Guardar otra vez.', 'warn');
        } catch (err2) {
          toast('Conflicto al guardar y no pude refrescar. Copia tu trabajo como respaldo: ' + err2.message, 'error');
        }
      // FIX BUG-009: PAT inválido — pedir nuevo sin recargar, mantener trabajo
      } else if (e.status === 401 || e.status === 403) {
        const newToken = prompt(
          'El token de GitHub no es válido o expiró.\n\n' +
          'Pega un nuevo Personal Access Token (fine-grained, Contents R/W de ancheco-editable).\n\n' +
          'Tus cambios siguen en memoria y se guardarán al reintentar.'
        );
        if (newToken && newToken.trim()) {
          token = newToken.trim();
          localStorage.setItem(STORAGE_KEY, token);
          toast('Token actualizado. Presiona Guardar otra vez.', 'warn');
        } else {
          toast('No se actualizó el token. Tus cambios siguen en memoria.', 'warn');
        }
      } else {
        toast('Error al guardar: ' + e.message, 'error');
      }
    } finally {
      saving = false;
      renderBar();
    }
  }

  function discard() {
    if (dirtyKeys.size === 0) return;
    if (!confirm(`¿Descartar ${dirtyKeys.size} cambio(s) sin guardar?`)) return;
    workingContent = JSON.parse(JSON.stringify(originalContent));
    if (window.__cms) window.__cms.data = workingContent;
    hydrateAll();
    dirtyKeys.clear();
    $$('.dirty').forEach(el => el.classList.remove('dirty'));
    renderBar();
  }

  function logout() {
    if (dirtyKeys.size > 0) {
      if (!confirm(`Tienes ${dirtyKeys.size} cambio(s) sin guardar. ¿Cerrar sesión y perderlos?`)) return;
    }
    localStorage.removeItem(STORAGE_KEY);
    token = null;
    toast('Sesión cerrada. Recarga para entrar con otro token.', 'warn');
  }

  function hydrateAll() {
    $$('[data-cms]').forEach(el => {
      const v = getByPath(workingContent, el.dataset.cms);
      if (typeof v === 'string') el.textContent = v;
    });
    $$('[data-cms-html]').forEach(el => {
      const v = getByPath(workingContent, el.dataset.cmsHtml);
      if (typeof v === 'string') el.innerHTML = sanitizeHTML(v);
    });
  }

  // FIX BUG-008: warn al cerrar pestaña con cambios pendientes
  window.addEventListener('beforeunload', (e) => {
    if (dirtyKeys.size > 0) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

  // ============= INIT =============
  async function init() {
    if (!token) {
      token = prompt(
        'Pega tu Personal Access Token de GitHub (fine-grained, scope: Contents R/W de ancheco-editable).\n\n' +
        'Solo se guarda en este navegador (localStorage). Usa el botón ⎋ en la barra para cerrar sesión.'
      );
      if (!token) return;
      token = token.trim();
      localStorage.setItem(STORAGE_KEY, token);
    }

    try {
      originalContent = await loadFromGitHub();
      workingContent = JSON.parse(JSON.stringify(originalContent));
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        alert('El token no tiene permisos sobre el repo. Se borrará y debes recargar para introducir otro.');
        localStorage.removeItem(STORAGE_KEY);
      } else {
        alert('No se pudo cargar el contenido desde GitHub: ' + e.message);
      }
      return;
    }

    // FIX BUG-002: sincronizar workingContent con __cms.data para que los
    // wizards que usan T() vean los cambios sin guardar al re-renderizar.
    if (window.__cms) {
      window.__cms.data = workingContent;
      window.__cms.get = (path) => getByPath(workingContent, path);
    }

    // Esperar a que la hidratación del index.html termine antes de marcar editables
    setTimeout(() => {
      hydrateAll();
      makeEditable();
      watchDOM();
      renderBar();
      toast('Editor cargado. Click en cualquier texto resaltado para editar.');
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
