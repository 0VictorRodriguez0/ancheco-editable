/* ============================================================
   Editor in-place para AnCheco
   ------------------------------------------------------------
   Cómo se activa:  abrir la página con ?edit=1
   Autenticación:   pide un Personal Access Token (PAT) la primera vez,
                    lo guarda en localStorage para próximas sesiones.
   Cómo guarda:     hace commit directo al repo via GitHub API.
                    Cada save → 1 commit → Pages re-publica solo.
   ============================================================ */

(function () {
  if (!new URLSearchParams(location.search).has('edit')) return;

  const REPO_OWNER = '0VictorRodriguez0';
  const REPO_NAME  = 'ancheco-editable';
  const CONTENT_PATH = 'content/content.json';
  const BRANCH = 'main';
  const STORAGE_KEY = 'ancheco_editor_pat';

  let token = localStorage.getItem(STORAGE_KEY);
  let originalContent = null;   // copia profunda del JSON al cargar
  let workingContent = null;    // copia mutable que se edita
  let fileSha = null;           // SHA del archivo, requerido para commit
  let dirtyKeys = new Set();

  // ============= UTIL =============
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const getByPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const setByPath = (obj, path, value) => {
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((o, k) => (o[k] ??= {}), obj);
    target[last] = value;
  };

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
    #ancheco-editor-toast {
      position: fixed; bottom: 90px; right: 18px; z-index: 99999;
      background: #1bbf6a; color: #fff; padding: 10px 16px;
      border-radius: 10px; font-family: Montserrat, sans-serif; font-size: 13px;
      box-shadow: 0 6px 20px rgba(0,0,0,.2);
      opacity: 0; transform: translateY(10px); transition: all .25s;
    }
    #ancheco-editor-toast.show { opacity: 1; transform: translateY(0); }
    #ancheco-editor-toast.error { background: #d93636; }
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
        <button class="btn-ghost" id="ae-discard">Descartar</button>
        <button class="btn-save" id="ae-save">Guardar</button>
      `;
      document.body.appendChild(bar);
      bar.querySelector('#ae-save').addEventListener('click', save);
      bar.querySelector('#ae-discard').addEventListener('click', discard);
    }
    const n = dirtyKeys.size;
    bar.querySelector('#ae-count').textContent =
      n === 0 ? 'Sin cambios pendientes' : `${n} cambio${n>1?'s':''} sin guardar`;
    bar.querySelector('#ae-save').disabled = n === 0;
  }

  function toast(msg, isError) {
    let t = document.getElementById('ancheco-editor-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ancheco-editor-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), 3200);
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
    if (!res.ok) throw new Error(`GET ${ghUrl} → ${res.status} ${res.statusText}`);
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
      throw new Error(`PUT → ${res.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await res.json();
    fileSha = data.content.sha;
  }

  // ============= EDIT HANDLERS =============
  function makeEditable() {
    $$('[data-cms]').forEach(el => {
      el.contentEditable = 'plaintext-only';
      el.spellcheck = false;
      el.addEventListener('input', () => onEdit(el, el.dataset.cms, el.textContent));
    });
    $$('[data-cms-html]').forEach(el => {
      el.contentEditable = 'true';
      el.spellcheck = false;
      el.addEventListener('input', () => onEdit(el, el.dataset.cmsHtml, el.innerHTML));
    });
  }

  function onEdit(el, path, value) {
    setByPath(workingContent, path, value);
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

  async function save() {
    if (dirtyKeys.size === 0) return;
    const btn = document.querySelector('#ae-save');
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      await pushToGitHub(workingContent);
      originalContent = JSON.parse(JSON.stringify(workingContent));
      dirtyKeys.clear();
      $$('.dirty').forEach(el => el.classList.remove('dirty'));
      renderBar();
      btn.textContent = 'Guardar';
      toast('Guardado. Cambios en vivo en ~1 minuto.');
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Guardar';
      if (String(e).includes('401') || String(e).includes('403')) {
        toast('Token inválido. Borrando y pidiendo otro…', true);
        localStorage.removeItem(STORAGE_KEY);
        setTimeout(() => location.reload(), 1500);
      } else {
        toast('Error al guardar: ' + e.message, true);
      }
    }
  }

  function discard() {
    if (dirtyKeys.size === 0) return;
    if (!confirm(`¿Descartar ${dirtyKeys.size} cambio(s) sin guardar?`)) return;
    workingContent = JSON.parse(JSON.stringify(originalContent));
    hydrateAll();
    dirtyKeys.clear();
    $$('.dirty').forEach(el => el.classList.remove('dirty'));
    renderBar();
  }

  function hydrateAll() {
    $$('[data-cms]').forEach(el => {
      const v = getByPath(workingContent, el.dataset.cms);
      if (typeof v === 'string') el.textContent = v;
    });
    $$('[data-cms-html]').forEach(el => {
      const v = getByPath(workingContent, el.dataset.cmsHtml);
      if (typeof v === 'string') el.innerHTML = v;
    });
  }

  // ============= INIT =============
  async function init() {
    if (!token) {
      token = prompt(
        'Pega tu Personal Access Token de GitHub (fine-grained, scope: Contents R/W de ancheco-editable).\n\n' +
        'Solo se guarda en este navegador (localStorage).'
      );
      if (!token) return;
      localStorage.setItem(STORAGE_KEY, token.trim());
      token = token.trim();
    }

    try {
      originalContent = await loadFromGitHub();
      workingContent = JSON.parse(JSON.stringify(originalContent));
    } catch (e) {
      alert('No se pudo cargar el contenido desde GitHub: ' + e.message +
            '\n\nVerifica que el token tenga permisos sobre el repo. Se borrará el token guardado.');
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    // Esperar a que la hidratación del index.html termine antes de marcar editables
    setTimeout(() => {
      hydrateAll();
      makeEditable();
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
