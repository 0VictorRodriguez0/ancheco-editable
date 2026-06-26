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
  // Modo demo local: cuando se corre desde localhost, no pedimos PAT ni hacemos commits;
  // se carga content.json del server local y los cambios solo viven en memoria.
  // Sirve para que Andy (o quien sea) pruebe el editor antes de tocar producción.
  const IS_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

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
    /* ===== Modal Constantes de cálculo ===== */
    #ae-calc-modal { position: fixed; inset: 0; z-index: 99998; background: rgba(15,23,42,.55); display: none; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; }
    #ae-calc-modal.show { display: flex; }
    #ae-calc-card { background: #fff; border-radius: 16px; max-width: 720px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,.25); font-family: Montserrat, system-ui, sans-serif; color: #1e3a5f; }
    #ae-calc-card header { padding: 18px 22px; border-bottom: 1px solid #eef2f7; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    #ae-calc-card header h2 { margin:0; font-size: 18px; font-weight: 800; }
    #ae-calc-card header .ae-x { background: transparent; border: 0; font-size: 22px; cursor: pointer; color: #64748b; padding: 0 6px; }
    #ae-calc-card .ae-intro { padding: 14px 22px; background: #fff7ed; color: #7c2d12; font-size: 12.5px; line-height: 1.5; border-bottom: 1px solid #fde8c5; }
    #ae-calc-card .ae-grp { padding: 16px 22px; border-bottom: 1px solid #f1f5f9; }
    #ae-calc-card .ae-grp:last-child { border-bottom: 0; }
    #ae-calc-card .ae-grp h3 { margin: 0 0 10px 0; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: #e57a2c; }
    #ae-calc-card .ae-row { display: grid; grid-template-columns: 1fr 160px; gap: 14px; padding: 8px 0; align-items: center; }
    #ae-calc-card .ae-row .ae-lbl { font-size: 13px; line-height: 1.35; }
    #ae-calc-card .ae-row .ae-lbl b { display:block; font-weight: 700; color: #1e3a5f; }
    #ae-calc-card .ae-row .ae-lbl small { display:block; color: #64748b; font-size: 11.5px; margin-top: 2px; }
    #ae-calc-card .ae-row .ae-inp { display: flex; align-items: center; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0 10px; transition: border-color .15s, background .15s; }
    #ae-calc-card .ae-row .ae-inp:focus-within { border-color: #e57a2c; background: #fff; }
    #ae-calc-card .ae-row .ae-inp.dirty { border-color: #1bbf6a; background: #ecfdf5; }
    #ae-calc-card .ae-row .ae-inp .prefix, #ae-calc-card .ae-row .ae-inp .suffix { color: #94a3b8; font-size: 13px; font-weight: 600; }
    #ae-calc-card .ae-row .ae-inp input { border: 0; background: transparent; padding: 9px 6px; font-size: 14px; font-weight: 700; color: #1e3a5f; width: 100%; text-align: right; font-family: inherit; outline: none; }
    #ae-calc-card .ae-row .ae-inp input[type=number]::-webkit-outer-spin-button,
    #ae-calc-card .ae-row .ae-inp input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    #ae-calc-card footer { padding: 14px 22px; display: flex; gap: 10px; justify-content: flex-end; background: #f8fafc; border-radius: 0 0 16px 16px; }
    #ae-calc-card footer button { border: 0; border-radius: 999px; padding: 9px 18px; font-weight: 700; font-size: 13px; cursor: pointer; font-family: inherit; }
    #ae-calc-card footer .ae-cancel { background: transparent; color: #64748b; }
    #ae-calc-card footer .ae-apply { background: #e57a2c; color: #fff; }
    #ae-calc-card footer .ae-apply:disabled { background: #cbd5e1; cursor: not-allowed; }
    #ancheco-editor-bar .btn-calc { background: rgba(255,255,255,.12); color: #fff; }
    #ancheco-editor-bar .btn-calc:hover { background: rgba(255,255,255,.22); }
    /* ===== Tabs del modal de Constantes ===== */
    #ae-calc-card .ae-tabs { display:flex; gap:4px; padding: 10px 22px 0; border-bottom: 1px solid #eef2f7; overflow-x:auto; }
    #ae-calc-card .ae-tab { background: transparent; border: 0; padding: 10px 16px; font-family: inherit; font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer; border-bottom: 3px solid transparent; transition: color .15s, border-color .15s; white-space: nowrap; display:flex; align-items:center; gap:6px; }
    #ae-calc-card .ae-tab:hover { color: #1e3a5f; }
    #ae-calc-card .ae-tab.active { color: #e57a2c; border-bottom-color: #e57a2c; }
    #ae-calc-card .ae-tab .ae-tab-icon { font-size: 16px; }
    #ae-calc-card .ae-tab .ae-tab-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #1bbf6a; margin-left: 4px; }
    #ae-calc-card .ae-panel { display: none; }
    #ae-calc-card .ae-panel.active { display: block; }
    #ae-calc-card .ae-panel-empty { padding: 40px 22px; text-align: center; color: #94a3b8; font-size: 13px; }
    #ae-calc-card .ae-subhead { padding: 14px 22px 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .8px; color: #94a3b8; display:flex; align-items:center; gap:6px; }
    #ae-calc-card .ae-subhead .ae-icon { font-size: 14px; }
    /* ===== Bloque "Cómo se calcula la cotización final" ===== */
    #ae-calc-card .ae-howto { margin: 14px 22px; padding: 16px; background: linear-gradient(180deg,#fff7ed 0%,#fffaf3 100%); border: 1.5px solid #fde8c5; border-radius: 12px; }
    #ae-calc-card .ae-howto-title { font-size: 13px; font-weight: 800; color: #c2410c; margin: 0 0 4px 0; display:flex; align-items:center; gap:6px; }
    #ae-calc-card .ae-howto-sub { font-size: 12px; color: #7c2d12; margin: 0 0 12px 0; line-height: 1.45; }
    #ae-calc-card .ae-howto-sub b { color: #c2410c; }
    #ae-calc-card .ae-step { display: grid; grid-template-columns: 28px 1fr 130px; gap: 10px; align-items: center; background: #fff; border: 1px solid #fde8c5; border-radius: 8px; padding: 10px 12px; margin-bottom: 6px; font-family: 'SFMono-Regular', Consolas, Monaco, monospace; font-size: 12px; }
    #ae-calc-card .ae-step .ae-step-num { width: 22px; height: 22px; background: #e57a2c; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; font-family: Montserrat, system-ui, sans-serif; }
    #ae-calc-card .ae-step .ae-step-body { line-height: 1.45; }
    #ae-calc-card .ae-step .ae-step-name { font-family: Montserrat, system-ui, sans-serif; font-weight: 700; color: #1e3a5f; font-size: 12px; margin-bottom: 2px; }
    #ae-calc-card .ae-step .ae-step-formula { color: #64748b; font-size: 11.5px; }
    #ae-calc-card .ae-step .ae-step-val { font-weight: 800; color: #1e3a5f; text-align: right; font-size: 13px; }
    #ae-calc-card .ae-step.ae-step-total { background: #1e3a5f; border-color: #1e3a5f; margin-top: 10px; }
    #ae-calc-card .ae-step.ae-step-total .ae-step-num { background: #fff; color: #e57a2c; }
    #ae-calc-card .ae-step.ae-step-total .ae-step-name { color: #fff; font-size: 13px; }
    #ae-calc-card .ae-step.ae-step-total .ae-step-formula { color: #cbd5e1; }
    #ae-calc-card .ae-step.ae-step-total .ae-step-val { color: #fff; font-size: 18px; }
    /* ===== Ecuación visual (cápsulas + operadores) ===== */
    #ae-calc-card .ae-eq { display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:8px 6px; padding: 14px 6px; background:#fff; border:1px solid #fde8c5; border-radius:10px; margin-bottom:10px; }
    #ae-calc-card .ae-eq-cap { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:10px; padding:8px 12px; min-width:90px; transition: all .15s; }
    #ae-calc-card .ae-eq-cap.editable { background:#fffaf3; border-color:#fde8c5; cursor:pointer; position:relative; }
    #ae-calc-card .ae-eq-cap.editable:hover { background:#fef3e8; border-color:#e57a2c; transform:translateY(-1px); box-shadow:0 4px 10px rgba(229,122,44,.15); }
    #ae-calc-card .ae-eq-cap.editable::after { content:'✎'; position:absolute; top:-7px; right:-7px; background:#e57a2c; color:#fff; width:18px; height:18px; border-radius:50%; font-size:10px; display:flex; align-items:center; justify-content:center; font-family: Montserrat,sans-serif; font-weight:700; }
    #ae-calc-card .ae-eq-cap .ae-eq-name { font-family: Montserrat, system-ui, sans-serif; font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.4px; text-align:center; max-width:160px; line-height:1.25; }
    #ae-calc-card .ae-eq-cap .ae-eq-val { font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-size:14px; font-weight:800; color:#1e3a5f; margin-top:2px; }
    #ae-calc-card .ae-eq-cap.editable .ae-eq-val { color:#e57a2c; }
    #ae-calc-card .ae-eq-op { font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-size:22px; font-weight:800; color:#94a3b8; padding:0 4px; }
    #ae-calc-card .ae-eq-eq { font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-size:22px; font-weight:800; color:#1e3a5f; padding:0 6px; }
    #ae-calc-card .ae-eq-result { background:#1e3a5f; color:#fff; padding:10px 16px; border-radius:10px; display:flex; flex-direction:column; align-items:center; gap:2px; }
    #ae-calc-card .ae-eq-result .ae-eq-name { color:#fde8c5; font-family: Montserrat, system-ui, sans-serif; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; }
    #ae-calc-card .ae-eq-result .ae-eq-val { font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-size:20px; font-weight:800; margin-top:2px; }
    #ae-calc-card .ae-eq-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color:#64748b; margin-top:8px; padding-left:4px; }
    #ae-calc-card .ae-eq-legend span { display:flex; align-items:center; gap:5px; }
    #ae-calc-card .ae-eq-legend .ae-dot { width:10px; height:10px; border-radius:3px; display:inline-block; }
    #ae-calc-card .ae-eq-legend .ae-dot.fixed { background:#e2e8f0; border:1px solid #cbd5e1; }
    #ae-calc-card .ae-eq-legend .ae-dot.edit { background:#fffaf3; border:1.5px solid #e57a2c; }
    /* ===== Popover universal (single/table/bracket) ===== */
    #ae-pop { position:fixed; z-index:100001; background:#fff; border-radius:12px; box-shadow:0 14px 40px rgba(15,23,42,.25); font-family: Montserrat,system-ui,sans-serif; min-width:300px; max-width:380px; max-height:70vh; overflow:hidden; display:flex; flex-direction:column; border:1.5px solid #e2e8f0; }
    #ae-pop.show { animation: ae-pop-in .15s ease-out; }
    @keyframes ae-pop-in { from { opacity:0; transform:translateY(-4px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
    #ae-pop header { padding:12px 14px; border-bottom:1px solid #eef2f7; display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
    #ae-pop header h4 { margin:0; font-size:13px; font-weight:800; color:#1e3a5f; line-height:1.3; }
    #ae-pop header h4 small { display:block; font-weight:500; color:#64748b; font-size:11px; margin-top:2px; }
    #ae-pop header .ae-x { background:transparent; border:0; font-size:18px; cursor:pointer; color:#64748b; padding:0 4px; line-height:1; }
    #ae-pop .ae-pop-body { padding:12px 14px; overflow-y:auto; flex:1; }
    #ae-pop .ae-pop-single { display:flex; align-items:center; background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:8px; padding:4px 10px; }
    #ae-pop .ae-pop-single:focus-within { border-color:#e57a2c; background:#fff; }
    #ae-pop .ae-pop-single .prefix, #ae-pop .ae-pop-single .suffix { color:#94a3b8; font-size:13px; font-weight:600; }
    #ae-pop .ae-pop-single input { border:0; background:transparent; padding:9px 6px; font-size:15px; font-weight:700; color:#1e3a5f; width:100%; text-align:right; outline:none; font-family: 'SFMono-Regular',Consolas,Monaco,monospace; }
    #ae-pop table.ae-pop-table { width:100%; border-collapse:collapse; }
    #ae-pop table.ae-pop-table th, #ae-pop table.ae-pop-table td { padding:6px 8px; font-size:12px; }
    #ae-pop table.ae-pop-table th { text-align:left; color:#64748b; font-weight:700; text-transform:uppercase; font-size:10px; letter-spacing:.5px; border-bottom:1px solid #e2e8f0; }
    #ae-pop table.ae-pop-table td { border-bottom:1px solid #f1f5f9; }
    #ae-pop table.ae-pop-table td:first-child { font-weight:700; color:#1e3a5f; }
    #ae-pop table.ae-pop-table input { width:90px; border:1px solid #e2e8f0; border-radius:5px; padding:4px 6px; text-align:right; font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-weight:700; color:#1e3a5f; outline:none; }
    #ae-pop table.ae-pop-table input:focus { border-color:#e57a2c; }
    #ae-pop .ae-pop-bracket .ae-br-row { display:grid; grid-template-columns:50px 1fr 90px 30px; gap:6px; align-items:center; padding:5px 0; border-bottom:1px solid #f1f5f9; }
    #ae-pop .ae-pop-bracket .ae-br-row label { font-size:10px; color:#94a3b8; font-weight:700; text-transform:uppercase; }
    #ae-pop .ae-pop-bracket .ae-br-row input { border:1px solid #e2e8f0; border-radius:5px; padding:4px 6px; font-size:12px; text-align:right; font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-weight:700; color:#1e3a5f; outline:none; }
    #ae-pop .ae-pop-bracket .ae-br-row input:focus { border-color:#e57a2c; }
    #ae-pop .ae-pop-bracket .ae-br-del { background:transparent; border:0; cursor:pointer; color:#94a3b8; font-size:14px; }
    #ae-pop .ae-pop-bracket .ae-br-del:hover { color:#d93636; }
    #ae-pop .ae-pop-bracket .ae-br-add { width:100%; margin-top:6px; padding:6px; border:1.5px dashed #cbd5e1; background:transparent; border-radius:6px; cursor:pointer; font-size:11px; color:#64748b; font-weight:700; }
    #ae-pop .ae-pop-bracket .ae-br-add:hover { border-color:#e57a2c; color:#e57a2c; }
    #ae-pop .ae-pop-preview { padding:8px 12px; background:#fffaf3; border-top:1px solid #fde8c5; border-bottom:1px solid #fde8c5; font-size:11px; color:#7c2d12; font-family:'SFMono-Regular',Consolas,Monaco,monospace; }
    #ae-pop .ae-pop-preview b { color:#c2410c; }
    #ae-pop footer { padding:10px 14px; display:flex; justify-content:space-between; gap:8px; background:#f8fafc; border-top:1px solid #eef2f7; }
    #ae-pop footer button { border:0; border-radius:999px; padding:7px 14px; font-weight:700; font-size:12px; cursor:pointer; font-family:inherit; }
    #ae-pop footer .ae-restore { background:transparent; color:#64748b; border:1px solid #cbd5e1; }
    #ae-pop footer .ae-cancel { background:transparent; color:#64748b; }
    #ae-pop footer .ae-apply { background:#e57a2c; color:#fff; }
    #ae-pop footer .ae-apply:disabled { background:#cbd5e1; cursor:not-allowed; }
    #ae-pop-backdrop { position:fixed; inset:0; z-index:100000; background:transparent; }
    .ae-eq-cap.editing { box-shadow:0 0 0 3px rgba(229,122,44,.35); transform:translateY(-1px); }
    /* ===== Formula Lab sub-modal ===== */
    #ae-flab-modal { position: fixed; inset: 0; z-index: 100000; background: rgba(15,23,42,.65); display:none; align-items:flex-start; justify-content:center; padding:32px 16px; overflow-y:auto; }
    #ae-flab-modal.show { display:flex; }
    #ae-flab-card { background:#fff; border-radius:16px; max-width:920px; width:100%; box-shadow:0 20px 60px rgba(0,0,0,.3); font-family:Montserrat,system-ui,sans-serif; color:#1e3a5f; }
    #ae-flab-card header { padding:16px 22px; border-bottom:1px solid #eef2f7; display:flex; align-items:center; justify-content:space-between; gap:12px; }
    #ae-flab-card header h2 { margin:0; font-size:16px; font-weight:800; }
    #ae-flab-card header h2 small { display:block; font-weight:500; color:#64748b; font-size:11px; margin-top:2px; }
    #ae-flab-card .ae-flab-grid { display:grid; grid-template-columns: 1.5fr 220px; gap:0; }
    #ae-flab-card .ae-flab-left { padding:16px 22px; border-right:1px solid #f1f5f9; }
    #ae-flab-card .ae-flab-right { padding:16px 22px; background:#f8fafc; max-height:520px; overflow-y:auto; }
    #ae-flab-card .ae-flab-section { margin-bottom: 18px; }
    #ae-flab-card .ae-flab-section h3 { margin: 0 0 8px 0; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: #64748b; }
    #ae-flab-card textarea#ae-flab-expr { width:100%; box-sizing:border-box; min-height:90px; resize:vertical; padding:12px 14px; border:2px solid #e2e8f0; border-radius:10px; font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-size:14px; line-height:1.5; color:#1e3a5f; background:#fafbfc; transition: border-color .15s, background .15s; outline:none; }
    #ae-flab-card textarea#ae-flab-expr:focus { border-color:#e57a2c; background:#fff; }
    #ae-flab-card textarea#ae-flab-expr.ok { border-color:#1bbf6a; }
    #ae-flab-card textarea#ae-flab-expr.err { border-color:#d93636; background:#fef2f2; }
    #ae-flab-card .ae-flab-status { font-size:12px; margin-top:8px; font-weight:600; }
    #ae-flab-card .ae-flab-status.ok { color:#1bbf6a; }
    #ae-flab-card .ae-flab-status.err { color:#d93636; }
    #ae-flab-card .ae-flab-vars { list-style:none; padding:0; margin:0; }
    #ae-flab-card .ae-flab-vars li { margin-bottom:6px; }
    #ae-flab-card .ae-flab-vars button { width:100%; text-align:left; background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; cursor:pointer; font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-size:12px; color:#1e3a5f; transition: all .12s; }
    #ae-flab-card .ae-flab-vars button:hover { background:#fef3e8; border-color:#e57a2c; }
    #ae-flab-card .ae-flab-vars small { display:block; color:#64748b; font-size:10px; font-family: Montserrat,sans-serif; margin-top:2px; font-weight:500; }
    #ae-flab-card .ae-flab-preview { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; margin-top:6px; }
    #ae-flab-card .ae-flab-preview .pv { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:10px; text-align:center; }
    #ae-flab-card .ae-flab-preview .pv .pv-label { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:.5px; font-weight:700; }
    #ae-flab-card .ae-flab-preview .pv .pv-val { font-size:18px; font-weight:800; color:#1e3a5f; margin-top:4px; }
    #ae-flab-card .ae-flab-preview .pv .pv-delta { font-size:11px; font-weight:600; margin-top:2px; }
    #ae-flab-card .ae-flab-preview .pv .pv-delta.up { color:#d97c0d; }
    #ae-flab-card .ae-flab-preview .pv .pv-delta.down { color:#1bbf6a; }
    #ae-flab-card .ae-flab-preview .pv .pv-delta.zero { color:#94a3b8; }
    #ae-flab-card footer { padding:14px 22px; display:flex; gap:10px; justify-content:space-between; background:#f8fafc; border-radius:0 0 16px 16px; border-top:1px solid #f1f5f9; }
    #ae-flab-card footer button { border:0; border-radius:999px; padding:9px 18px; font-weight:700; font-size:13px; cursor:pointer; font-family:inherit; }
    #ae-flab-card footer .ae-restore { background:transparent; color:#64748b; border:1px solid #cbd5e1; }
    #ae-flab-card footer .ae-cancel { background:transparent; color:#64748b; }
    #ae-flab-card footer .ae-apply { background:#e57a2c; color:#fff; }
    #ae-flab-card footer .ae-apply:disabled { background:#cbd5e1; cursor:not-allowed; }
    /* ===== Breakdown "Cómo se calcula" ===== */
    #ae-flab-card .ae-breakdown { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 14px; font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-size:13px; line-height:1.6; color:#1e3a5f; }
    #ae-flab-card .ae-breakdown .ae-bd-line { display:flex; justify-content:space-between; gap:10px; align-items:baseline; padding:3px 0; border-bottom:1px dashed #e2e8f0; }
    #ae-flab-card .ae-breakdown .ae-bd-line:last-child { border-bottom:0; padding-top:8px; margin-top:4px; border-top:1.5px solid #1e3a5f; font-weight:800; font-size:15px; color:#e57a2c; }
    #ae-flab-card .ae-breakdown .ae-bd-step { color:#64748b; font-family: Montserrat, system-ui, sans-serif; font-size:12px; }
    #ae-flab-card .ae-breakdown .ae-bd-step b { color:#1e3a5f; font-weight:700; }
    #ae-flab-card .ae-breakdown .ae-bd-val { font-weight:700; }
    /* ===== Casos editables ===== */
    #ae-flab-card .ae-cases { display:flex; flex-direction:column; gap:8px; }
    #ae-flab-card .ae-case { background:#fff; border:1.5px solid #e2e8f0; border-radius:10px; padding:10px 12px; transition: border-color .15s; }
    #ae-flab-card .ae-case.custom { border-color:#fde8c5; background:#fffaf3; }
    #ae-flab-card .ae-case-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
    #ae-flab-card .ae-case-name { font-weight:700; font-size:13px; color:#1e3a5f; background:transparent; border:0; padding:2px 0; font-family:inherit; outline:none; flex:1; min-width:0; }
    #ae-flab-card .ae-case-name:focus { border-bottom:1px solid #e57a2c; }
    #ae-flab-card .ae-case-actions { display:flex; gap:6px; align-items:center; flex-shrink:0; }
    #ae-flab-card .ae-case-result { font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-size:14px; font-weight:800; color:#e57a2c; }
    #ae-flab-card .ae-case-result.bad { color:#d93636; font-size:11px; font-weight:600; }
    #ae-flab-card .ae-case-del { background:transparent; border:0; cursor:pointer; color:#94a3b8; font-size:16px; padding:0 4px; line-height:1; }
    #ae-flab-card .ae-case-del:hover { color:#d93636; }
    #ae-flab-card .ae-case-vars { display:grid; grid-template-columns:1fr 110px; gap:4px 8px; align-items:center; }
    #ae-flab-card .ae-case-vars label { font-size:11px; color:#64748b; font-family: Montserrat, system-ui, sans-serif; font-weight:600; }
    #ae-flab-card .ae-case-vars input { background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:4px 8px; font-size:12px; font-weight:700; color:#1e3a5f; font-family:'SFMono-Regular',Consolas,Monaco,monospace; text-align:right; outline:none; }
    #ae-flab-card .ae-case-vars input:focus { border-color:#e57a2c; background:#fff; }
    #ae-flab-card .ae-case-add { background:transparent; border:1.5px dashed #cbd5e1; color:#64748b; padding:8px; border-radius:10px; cursor:pointer; font-family:inherit; font-size:12px; font-weight:700; transition: all .15s; }
    #ae-flab-card .ae-case-add:hover { border-color:#e57a2c; color:#e57a2c; background:#fffaf3; }
    /* Distinción visual en el modal padre: ● constante vs ⚡ fórmula */
    #ae-calc-card .ae-row.ae-row-formula { background: #fffaf3; border-radius: 8px; padding-left: 8px; padding-right: 8px; margin-left: -8px; margin-right: -8px; cursor: pointer; }
    #ae-calc-card .ae-row.ae-row-formula:hover { background: #fef3e8; }
    #ae-calc-card .ae-row.ae-row-formula .ae-lbl b::before { content: '⚡ '; }
    #ae-calc-card .ae-row.ae-row-formula .ae-inp { background:#fff; pointer-events:none; }
    #ae-calc-card .ae-row.ae-row-formula .ae-inp input { font-family:'SFMono-Regular',Consolas,Monaco,monospace; font-size:11px; text-align:left; padding:6px; color:#64748b; }
  `;
  document.head.appendChild(style);

  // ============= CONSTANTES DE CÁLCULO (Tier 1) =============
  // Define las constantes editables del modal "Constantes de cálculo". Cada item:
  //  - path: ruta dentro de calc.* en content.json
  //  - label / hint: textos amigables que Andy verá (sin tecnicismos)
  //  - unit: prefijo/sufijo del input ('$' antes, '%' después, '' nada)
  //  - min/max/step: validación del input number
  //  - fallback: valor por defecto si content.json no lo tiene (debe coincidir con el del código)
  //  - affects: wizard que se re-renderiza al aplicar ('educativo' | 'gmm' | 'mascota' | 'patrimonial' | 'all')
  // Tabs por producto. Cada tab agrupa fórmulas + constantes de ese cotizador.
  const WIZARDS = [
    { key: 'educativo',   icon: '🎓', label: 'Educativo' },
    { key: 'gmm',         icon: '🏥', label: 'Gastos Médicos' },
    { key: 'auto',        icon: '🚗', label: 'Auto' },
    { key: 'mascota',     icon: '🐾', label: 'Mascota' },
    { key: 'patrimonial', icon: '🏠', label: 'Hogar' },
    { key: 'ahorro',      icon: '💰', label: 'Ahorro' }
  ];

  const CALC_FIELDS = [
    { wizard: 'educativo', items: [
      { path: 'educativo.primas.5', label: 'Prima base — 5 años de pago', hint: 'Referencia: papá 37 años, hijo 1 año, meta $1.1M.', unit: '$', min: 1000, max: 500000, step: 100, fallback: 82670, affects: 'educativo' },
      { path: 'educativo.primas.10', label: 'Prima base — 10 años de pago', hint: 'Referencia: papá 37 años, hijo 1 año, meta $1.1M.', unit: '$', min: 1000, max: 500000, step: 100, fallback: 43735, affects: 'educativo' },
      { path: 'educativo.primas.alcanzada', label: 'Prima base — Hasta edad alcanzada', hint: 'Pago hasta los 18 años del menor.', unit: '$', min: 1000, max: 500000, step: 100, fallback: 25760, affects: 'educativo' },
      { path: 'educativo.refProteccion', label: 'Protección de referencia', hint: 'Suma asegurada del ejemplo del material (anclaje del cálculo).', unit: '$', min: 100000, max: 10000000, step: 50000, fallback: 1100000, affects: 'educativo' },
      { path: 'educativo.refTitularAge', label: 'Edad de referencia del contratante', hint: 'Edad del papá del ejemplo del material.', unit: '', suffix: 'años', min: 18, max: 75, step: 1, fallback: 37, affects: 'educativo' },
      { path: 'educativo.ageFactorPerYear', label: 'Factor por año de edad del contratante', hint: 'Cuánto sube la prima por cada año adicional (0.04 = 4%).', unit: '', suffix: '× edad', min: 0, max: 0.20, step: 0.005, fallback: 0.04, affects: 'educativo' }
    ]},
    { wizard: 'gmm', items: [
      { path: 'gmm.addons.cda', label: 'Cero Deducible por Accidente (CDA)', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 50000, step: 100, fallback: 1800, affects: 'gmm' },
      { path: 'gmm.addons.mp', label: 'Maternidad Plus Personaliza (MP)', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 50000, step: 100, fallback: 5200, affects: 'gmm' },
      { path: 'gmm.addons.ahr', label: 'Ampliación Hospitalaria Nacional (AHR)', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 50000, step: 100, fallback: 2800, affects: 'gmm' }
    ]},
    { wizard: 'mascota', items: [
      { path: 'mascota.addons.fallece', label: 'Fallecimiento', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 20000, step: 10, fallback: 720, affects: 'mascota' },
      { path: 'mascota.addons.robo', label: 'Robo con violencia', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 20000, step: 10, fallback: 480, affects: 'mascota' },
      { path: 'mascota.addons.rc', label: 'RC mascota ampliada', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 20000, step: 10, fallback: 540, affects: 'mascota' }
    ]},
    { wizard: 'patrimonial', items: [
      { path: 'patrimonial.addons.funmascotas', label: 'Servicio funerario mascotas', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 5000, step: 1, fallback: 348, affects: 'patrimonial' }
    ]},
    { wizard: 'auto', items: [
      { path: 'auto.baseRate', label: 'Tasa base (% del valor del auto)', hint: 'Anualidad base = valor del auto × esta tasa. Default 5% (0.05).', unit: '', suffix: '× valor', min: 0.01, max: 0.20, step: 0.005, fallback: 0.05, affects: 'auto' },
      { path: 'auto.addons.sustituto', label: 'Addon: Auto sustituto', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 10000, step: 10, fallback: 960, affects: 'auto' },
      { path: 'auto.addons.llantas', label: 'Addon: Llantas y rines', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 10000, step: 10, fallback: 1511, affects: 'auto' },
      { path: 'auto.addons.llave', label: 'Addon: Pérdida total de llave', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 10000, step: 10, fallback: 621, affects: 'auto' }
    ]}
  ];

  // ============= FORMULAS (Fase 1 MVP) =============
  // Definiciones de las fórmulas editables. Cada fórmula tiene:
  //  - path: ruta en calc.formulas.* del content.json
  //  - label / hint: textos amigables que Andy verá en el modal
  //  - default: fórmula hardcoded original (botón "Restaurar default")
  //  - vars: lista de variables disponibles con descripción y valor de ejemplo
  //  - preview: 3 escenarios fijos para probar la fórmula en vivo (joven/promedio/mayor)
  //  - format: 'money' (formatea como $X) o 'plain' (número simple, ej. factor 1.04)
  const FORMULA_DEFS = [
    {
      path: 'educativo.ageFactor',
      label: 'Educativo · Factor por edad del contratante',
      hint: 'Cuánto multiplica la prima base según la edad del papá/mamá. Si pones 1, todas las edades pagan lo mismo.',
      default: '1 + (edad_titular - referencia_edad) * factor_por_anio',
      affects: 'educativo',
      format: 'plain',
      vars: [
        { name: 'edad_titular', desc: 'Edad del papá/mamá que contrata', sample: 37 },
        { name: 'referencia_edad', desc: 'Edad del ejemplo del material', sample: 37 },
        { name: 'factor_por_anio', desc: 'Cuánto sube por cada año de edad', sample: 0.04 }
      ],
      preview: [
        { label: 'Joven (25)', vars: { edad_titular: 25, referencia_edad: 37, factor_por_anio: 0.04 } },
        { label: 'Promedio (40)', vars: { edad_titular: 40, referencia_edad: 37, factor_por_anio: 0.04 } },
        { label: 'Mayor (60)', vars: { edad_titular: 60, referencia_edad: 37, factor_por_anio: 0.04 } }
      ]
    },
    {
      path: 'gmm.ageMultiplier',
      label: 'GMM · Multiplicador por edad',
      hint: 'Cuánto sube la prima de GMM con la edad. Usa el operador "?" para ramas: "condición ? valorSi : valorNo".',
      default: 'edad <= 45 ? (1 + 0.0093 * (edad - 25)) : (1 + 0.0093 * 20 + 0.05 * (edad - 45))',
      affects: 'gmm',
      format: 'plain',
      vars: [
        { name: 'edad', desc: 'Edad del asegurado', sample: 35 }
      ],
      preview: [
        { label: 'Joven (25)', vars: { edad: 25 } },
        { label: 'Promedio (45)', vars: { edad: 45 } },
        { label: 'Mayor (65)', vars: { edad: 65 } }
      ]
    },
    {
      path: 'gmm.totalConIVA',
      label: 'GMM · Total con derecho de póliza + IVA',
      hint: 'Cómo se calcula el total final cobrado al cliente desde la prima neta.',
      default: '(prima_neta + derecho_poliza * cantidad_asegurados) * (1 + iva)',
      affects: 'gmm',
      format: 'money',
      vars: [
        { name: 'prima_neta', desc: 'Prima sin impuestos ni derechos', sample: 25000 },
        { name: 'derecho_poliza', desc: 'Cargo por asegurado ($970 típico)', sample: 970 },
        { name: 'cantidad_asegurados', desc: 'Cuántas personas en la póliza', sample: 1 },
        { name: 'iva', desc: 'IVA en decimal (0.16 = 16%)', sample: 0.16 }
      ],
      preview: [
        { label: 'Individual', vars: { prima_neta: 25000, derecho_poliza: 970, cantidad_asegurados: 1, iva: 0.16 } },
        { label: 'Pareja', vars: { prima_neta: 48000, derecho_poliza: 970, cantidad_asegurados: 2, iva: 0.16 } },
        { label: 'Familia 4', vars: { prima_neta: 75000, derecho_poliza: 970, cantidad_asegurados: 4, iva: 0.16 } }
      ]
    },
    {
      path: 'patrimonial.hidrometCosto',
      label: 'Hogar · Costo de cobertura Hidrometeorológicos',
      hint: 'Andy dijo "duplica más o menos la anualidad". Hoy es prima base × 1 (igual al base). Cambia el factor para ajustar.',
      default: 'prima_base * factor_hidromet',
      affects: 'patrimonial',
      format: 'money',
      vars: [
        { name: 'prima_base', desc: 'Prima base de la casa antes de extras', sample: 8598 },
        { name: 'factor_hidromet', desc: 'Multiplicador (1 = duplica la anualidad)', sample: 1 }
      ],
      preview: [
        { label: 'Casa $1M', vars: { prima_base: 3500, factor_hidromet: 1 } },
        { label: 'Casa $2M', vars: { prima_base: 8598, factor_hidromet: 1 } },
        { label: 'Casa $5M', vars: { prima_base: 22000, factor_hidromet: 1 } }
      ]
    },
    {
      path: 'educativo.primaFinal',
      label: 'Educativo · Prima final',
      hint: 'Cómo se combina la prima base del plazo con la protección elegida y la edad del titular.',
      default: 'prima_base * (proteccion_elegida / proteccion_referencia) * factor_edad',
      affects: 'educativo',
      format: 'money',
      vars: [
        { name: 'prima_base', desc: 'Prima del plazo elegido (5/10/alcanzada años)', sample: 43735 },
        { name: 'proteccion_elegida', desc: 'Suma asegurada que escogió el cliente', sample: 1000000 },
        { name: 'proteccion_referencia', desc: 'Suma del ejemplo del material', sample: 1100000 },
        { name: 'factor_edad', desc: 'Multiplicador por edad del titular', sample: 1 }
      ],
      preview: [
        { label: '$500k', vars: { prima_base: 43735, proteccion_elegida: 500000, proteccion_referencia: 1100000, factor_edad: 1 } },
        { label: '$1M', vars: { prima_base: 43735, proteccion_elegida: 1000000, proteccion_referencia: 1100000, factor_edad: 1 } },
        { label: '$1.5M', vars: { prima_base: 43735, proteccion_elegida: 1500000, proteccion_referencia: 1100000, factor_edad: 1 } }
      ]
    }
  ];

  function findFormulaDef(path) { return FORMULA_DEFS.find(f => f.path === path); }

  // ============= KNOB REGISTRY (popover universal) =============
  // Mapa de path → definición editable. Soporta 3 tipos:
  //   single   — un solo número (calc.<path>)
  //   table    — objeto con claves fijas; cada clave tiene su valor (calc.<path> = {key1: 0.85, key2: 1.0})
  //   bracket  — array ordenado [{minVal, mult}, ...] (calc.<path> = [{minVal:0,mult:1},{minVal:5,mult:1.08}])
  // Las cápsulas del howto leen este registry; si una cápsula tiene un path acá registrado,
  // es editable y el popover sabe qué editor abrir.
  const KNOB_REGISTRY = {
    // ===== GMM =====
    'gmmTables.maleRef25': { kind:'single', label:'Prima base hombre 25 años (Nivel B, suma 40.8M)', hint:'Es el ancla de toda la prima GMM. Subirlo 1% mueve todo el cotizador.', unit:'$', min:1000, max:100000, step:10, fallback:14260, affects:'gmm' },
    'gmmTables.tierMult': { kind:'table', label:'Multiplicador por nivel hospitalario', hint:'Cuánto cobra cada nivel respecto a Nivel B (=1.0). A=más barato, D=más caro.', rows:[
      { key:'A', label:'Nivel A · Premium (ABC, Ángeles, Amerimed)', fallback:0.85 },
      { key:'B', label:'Nivel B · Alto (Galenia, Médica Sur, Costamed)', fallback:1.0 },
      { key:'C', label:'Nivel C · Medio (Hospiten, Hospital de Tulum)', fallback:1.13 },
      { key:'D', label:'Nivel D · Básico (Mayan, UMIS)', fallback:1.28 }
    ], min:0.1, max:5, step:0.01, affects:'gmm' },
    'gmmTables.sumMult': { kind:'table', label:'Multiplicador por suma asegurada', hint:'Referencia: 40.8M = 1.0. Sumas menores bajan, mayores suben.', rows:[
      { key:'2.2',  label:'$2.2M · Básica', fallback:0.42 },
      { key:'17.5', label:'$17.5M · Intermedia', fallback:0.82 },
      { key:'40.8', label:'$40.8M · Personaliza estándar', fallback:1.0 },
      { key:'58.3', label:'$58.3M · Premium', fallback:1.12 }
    ], min:0.1, max:5, step:0.01, affects:'gmm' },
    // ===== AUTO =====
    'auto.baseRate': { kind:'single', label:'Tasa base (% del valor del auto)', hint:'Default 5% (0.05). Es el ancla de toda la prima Auto.', unit:'', suffix:'× valor', min:0.01, max:0.20, step:0.005, fallback:0.05, affects:'auto' },
    'auto.covMult': { kind:'table', label:'Multiplicador por cobertura', hint:'Amplia = 1.0 (referencia). RC mucho más barato, Amplia Total más caro.', rows:[
      { key:'rc',          label:'Responsabilidad Civil', fallback:0.35 },
      { key:'limitada',    label:'Limitada', fallback:0.65 },
      { key:'amplia',      label:'Amplia', fallback:1.0 },
      { key:'ampliaTotal', label:'Amplia Total', fallback:1.176 }
    ], min:0.05, max:3, step:0.005, affects:'auto' },
    'auto.useMult': { kind:'table', label:'Multiplicador por uso del auto', hint:'Particular = 1.0. Comercial cobra más por más exposición.', rows:[
      { key:'particular', label:'Particular',  fallback:1.0 },
      { key:'comercial',  label:'Comercial',   fallback:1.3 }
    ], min:0.5, max:5, step:0.05, affects:'auto' },
    'auto.dtMult': { kind:'table', label:'Multiplicador por deducible de robo', hint:'Deducible mayor = prima menor. 10% es referencia.', rows:[
      { key:'5',  label:'5% deducible',  fallback:1.15 },
      { key:'10', label:'10% deducible', fallback:1.0 },
      { key:'15', label:'15% deducible', fallback:0.9 }
    ], min:0.5, max:2, step:0.01, affects:'auto' },
    'auto.ddMult': { kind:'table', label:'Multiplicador por deducible de daños', hint:'Deducible mayor = prima menor. 5% es referencia.', rows:[
      { key:'3',  label:'3% deducible',  fallback:1.15 },
      { key:'5',  label:'5% deducible',  fallback:1.0 },
      { key:'10', label:'10% deducible', fallback:0.88 }
    ], min:0.5, max:2, step:0.01, affects:'auto' },
    'auto.ageBrackets': { kind:'bracket', label:'Factor por edad del auto', hint:'Brackets escalonados: el sistema toma el bracket cuyo "Desde" sea el mayor ≤ edad. Default: 0→×1.0, 5→×1.08, 8→×1.18.', defaults:[
      { minVal:0, mult:1.0 }, { minVal:5, mult:1.08 }, { minVal:8, mult:1.18 }
    ], affects:'auto' },
    // ===== MASCOTA =====
    'mascotaTables.basePerPlan': { kind:'table', label:'Prima base por plan', hint:'El precio base de cada plan antes de factor edad y especie.', rows:[
      { key:'esencial', label:'Cuidado Esencial', fallback:2050 },
      { key:'superior', label:'Cuidado Superior', fallback:3650 },
      { key:'maximo',   label:'Cuidado Máximo',   fallback:4490 }
    ], min:0, max:50000, step:10, unit:'$', affects:'mascota' },
    'mascotaTables.sumPorPlan': { kind:'table', label:'Suma asegurada por plan', hint:'Cuánto cubre cada plan en gastos médicos veterinarios anuales.', rows:[
      { key:'esencial', label:'Cuidado Esencial', fallback:10000 },
      { key:'superior', label:'Cuidado Superior', fallback:20000 },
      { key:'maximo',   label:'Cuidado Máximo',   fallback:30000 }
    ], min:0, max:200000, step:1000, unit:'$', affects:'mascota' },
    'mascotaTables.factorEspecie': { kind:'table', label:'Multiplicador por especie', hint:'Perro = 1.1 (más caro por enfermedades comunes). Gato = 1.0.', rows:[
      { key:'perro', label:'Perro', fallback:1.1 },
      { key:'gato',  label:'Gato',  fallback:1.0 }
    ], min:0.5, max:3, step:0.05, affects:'mascota' },
    // ===== PATRIMONIAL =====
    'patrimonialTables.rates.homeRate':    { kind:'single', label:'Tasa por valor de la casa (×)', hint:'Default 0.00098 = $980/año por cada $1M de valor de casa.', unit:'', suffix:'× casa', min:0.0001, max:0.01, step:0.00005, fallback:0.00098, affects:'patrimonial' },
    'patrimonialTables.rates.contentsRate':{ kind:'single', label:'Tasa por contenidos (×)', hint:'Default 0.00220 = $2,200/año por cada $1M de contenidos.', unit:'', suffix:'× contenidos', min:0.0001, max:0.02, step:0.00005, fallback:0.00220, affects:'patrimonial' },
    'patrimonialTables.rates.fixedBase':   { kind:'single', label:'Base fija del plan A tu medida', hint:'Suma fija que cubre extras premium (teletrabajo, menaje, etc.).', unit:'$', min:0, max:50000, step:10, fallback:5978, affects:'patrimonial' }
  };

  // ============= POPOVER UNIVERSAL =============
  function closePopover() {
    document.querySelector('.ae-eq-cap.editing')?.classList.remove('editing');
    document.getElementById('ae-pop')?.remove();
    document.getElementById('ae-pop-backdrop')?.remove();
  }
  function positionPopover(pop, anchor) {
    const r = anchor.getBoundingClientRect();
    const popR = pop.getBoundingClientRect();
    const margin = 8;
    let top = r.bottom + margin;
    let left = r.left + r.width/2 - popR.width/2;
    if (top + popR.height > window.innerHeight - 8) top = r.top - popR.height - margin;
    if (left + popR.width > window.innerWidth - 8) left = window.innerWidth - popR.width - 8;
    if (left < 8) left = 8;
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }
  function openKnobPopover(capEl) {
    const path = capEl.dataset.editPath;
    const knob = KNOB_REGISTRY[path];
    if (!knob) return;
    closePopover();
    capEl.classList.add('editing');
    // Backdrop transparente para capturar clicks fuera
    const backdrop = document.createElement('div');
    backdrop.id = 'ae-pop-backdrop';
    backdrop.addEventListener('click', closePopover);
    document.body.appendChild(backdrop);
    // Estado temporal del knob (snapshot del CMS actual)
    let staging;
    if (knob.kind === 'single') {
      staging = N(path, knob.fallback);
    } else if (knob.kind === 'table') {
      staging = {};
      knob.rows.forEach(r => { staging[r.key] = NT(path, r.key, r.fallback); });
    } else if (knob.kind === 'bracket') {
      const existing = window.__cms?.get?.('calc.' + path);
      staging = Array.isArray(existing) ? JSON.parse(JSON.stringify(existing)) : JSON.parse(JSON.stringify(knob.defaults));
    }

    const pop = document.createElement('div');
    pop.id = 'ae-pop';
    pop.classList.add('show');
    const bodyHtml = (function() {
      if (knob.kind === 'single') {
        return `<div class="ae-pop-single">
          ${knob.unit==='$' ? '<span class="prefix">$</span>' : ''}
          <input type="number" min="${knob.min}" max="${knob.max}" step="${knob.step}" value="${staging}" />
          ${knob.suffix ? `<span class="suffix">${knob.suffix}</span>` : ''}
        </div>`;
      } else if (knob.kind === 'table') {
        return `<table class="ae-pop-table"><thead><tr><th>${knob.unit==='$'?'Opción':'Opción'}</th><th style="text-align:right">${knob.unit==='$'?'Valor ($)':'Multiplicador (×)'}</th></tr></thead><tbody>${
          knob.rows.map(r => `<tr>
            <td>${r.label}<div style="font-size:10px;color:#94a3b8;font-family:monospace">key: ${r.key}</div></td>
            <td style="text-align:right"><input type="number" min="${knob.min}" max="${knob.max}" step="${knob.step}" data-row-key="${r.key}" value="${staging[r.key]}" /></td>
          </tr>`).join('')
        }</tbody></table>`;
      } else if (knob.kind === 'bracket') {
        return `<div class="ae-pop-bracket">
          <div class="ae-br-row" style="border-bottom:0;padding-bottom:0;color:#94a3b8;font-size:10px;text-transform:uppercase;font-weight:700">
            <label>Desde</label><label></label><label>Mult.</label><label></label>
          </div>
          ${staging.map((b, i) => `<div class="ae-br-row" data-br-idx="${i}">
            <input type="number" min="0" max="100" step="1" data-br-field="minVal" value="${b.minVal}"/>
            <span style="font-size:11px;color:#64748b">→</span>
            <input type="number" min="0.1" max="10" step="0.01" data-br-field="mult" value="${b.mult}"/>
            ${i===0 ? '<span title="Base no se borra" style="color:#cbd5e1;font-size:14px;text-align:center">·</span>' : '<button type="button" class="ae-br-del" data-br-del="'+i+'" title="Eliminar">×</button>'}
          </div>`).join('')}
          <button type="button" class="ae-br-add">+ Agregar bracket</button>
        </div>`;
      }
      return '';
    })();
    pop.innerHTML = `
      <header>
        <h4>${knob.label}<small>${knob.hint || ''}</small></h4>
        <button class="ae-x" type="button">×</button>
      </header>
      <div class="ae-pop-body">${bodyHtml}</div>
      <div class="ae-pop-preview" id="ae-pop-preview"></div>
      <footer>
        <button type="button" class="ae-restore">↺ Default</button>
        <div style="display:flex;gap:8px">
          <button type="button" class="ae-cancel">Cancelar</button>
          <button type="button" class="ae-apply">Aplicar</button>
        </div>
      </footer>`;
    document.body.appendChild(pop);
    positionPopover(pop, capEl);

    function refreshPreview() {
      const prev = pop.querySelector('#ae-pop-preview');
      if (knob.kind === 'single') {
        prev.innerHTML = `Valor: <b>${staging}</b>${knob.suffix ? ' ' + knob.suffix : ''}`;
      } else if (knob.kind === 'table') {
        prev.innerHTML = Object.entries(staging).map(([k, v]) => `${k}: <b>${v}</b>`).join(' · ');
      } else if (knob.kind === 'bracket') {
        const sorted = [...staging].sort((a, b) => a.minVal - b.minVal);
        prev.innerHTML = sorted.map(b => `≥${b.minVal} → <b>×${b.mult}</b>`).join(' · ');
      }
    }

    function commit() {
      const cmsPath = 'calc.' + path;
      setByPath(workingContent, cmsPath, staging);
      if (window.__cms && window.__cms.data) setByPath(window.__cms.data, cmsPath, staging);
      const original = getByPath(originalContent, cmsPath);
      if (JSON.stringify(staging) === JSON.stringify(original)) dirtyKeys.delete(cmsPath);
      else dirtyKeys.add(cmsPath);
      try { if (typeof window.__cmsRecalc === 'function') window.__cmsRecalc(knob.affects); } catch(_) {}
      renderBar();
      // refresh howto del tab afectado
      const calcModal = document.getElementById('ae-calc-modal');
      const howtoBox = calcModal?.querySelector(`.ae-howto[data-howto="${knob.affects}"]`);
      if (howtoBox) howtoBox.innerHTML = buildHowto(knob.affects);
      closePopover();
      toast('Cambio aplicado. La cotización se actualizó.');
    }

    // Event handlers según kind
    if (knob.kind === 'single') {
      const inp = pop.querySelector('input');
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v)) staging = v; refreshPreview(); });
      inp.focus(); inp.select();
    } else if (knob.kind === 'table') {
      pop.querySelectorAll('input[data-row-key]').forEach(inp => {
        inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (isFinite(v)) staging[inp.dataset.rowKey] = v; refreshPreview(); });
      });
    } else if (knob.kind === 'bracket') {
      const rerenderBrackets = () => {
        const wrap = pop.querySelector('.ae-pop-bracket');
        wrap.innerHTML = `<div class="ae-br-row" style="border-bottom:0;padding-bottom:0;color:#94a3b8;font-size:10px;text-transform:uppercase;font-weight:700"><label>Desde</label><label></label><label>Mult.</label><label></label></div>` +
          staging.map((b, i) => `<div class="ae-br-row" data-br-idx="${i}">
            <input type="number" min="0" max="100" step="1" data-br-field="minVal" value="${b.minVal}"/>
            <span style="font-size:11px;color:#64748b">→</span>
            <input type="number" min="0.1" max="10" step="0.01" data-br-field="mult" value="${b.mult}"/>
            ${i===0 ? '<span title="Base no se borra" style="color:#cbd5e1;font-size:14px;text-align:center">·</span>' : '<button type="button" class="ae-br-del" data-br-del="'+i+'" title="Eliminar">×</button>'}
          </div>`).join('') + `<button type="button" class="ae-br-add">+ Agregar bracket</button>`;
        wireBracket();
        refreshPreview();
      };
      const wireBracket = () => {
        pop.querySelectorAll('.ae-pop-bracket input').forEach(inp => {
          inp.addEventListener('input', () => {
            const idx = parseInt(inp.closest('[data-br-idx]').dataset.brIdx);
            const field = inp.dataset.brField;
            const v = parseFloat(inp.value);
            if (isFinite(v)) staging[idx][field] = v;
            refreshPreview();
          });
        });
        pop.querySelectorAll('.ae-br-del').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.brDel);
            if (idx > 0) { staging.splice(idx, 1); rerenderBrackets(); }
          });
        });
        pop.querySelector('.ae-br-add')?.addEventListener('click', () => {
          const last = staging[staging.length - 1];
          staging.push({ minVal: (last?.minVal || 0) + 1, mult: 1.0 });
          rerenderBrackets();
        });
      };
      wireBracket();
    }
    refreshPreview();
    pop.querySelector('.ae-x').addEventListener('click', closePopover);
    pop.querySelector('.ae-cancel').addEventListener('click', closePopover);
    pop.querySelector('.ae-restore').addEventListener('click', () => {
      if (!confirm('¿Restaurar el valor original del sistema?')) return;
      if (knob.kind === 'single') staging = knob.fallback;
      else if (knob.kind === 'table') { staging = {}; knob.rows.forEach(r => staging[r.key] = r.fallback); }
      else if (knob.kind === 'bracket') staging = JSON.parse(JSON.stringify(knob.defaults));
      // Re-render del body completo
      closePopover();
      setTimeout(() => openKnobPopover(capEl), 30);
    });
    pop.querySelector('.ae-apply').addEventListener('click', commit);
  }

  // ============= "Cómo se calcula la cotización final" =============
  // Para cada producto, descompone el cálculo del cotizador con un escenario concreto.
  // Cada paso muestra: nombre legible · fórmula con valores actuales · resultado intermedio.
  // El total final aparece en una caja oscura destacada.
  // Lee N() / F() / hardcoded para que cambios de Andy se reflejen al re-abrir el modal.
  function moneyOrNum(v, isMoney) { return isMoney ? fmtMoney(v) : (Math.round(v*100)/100).toString(); }

  function howtoStep(num, name, formula, value, isTotal) {
    const cls = isTotal ? 'ae-step ae-step-total' : 'ae-step';
    return `<div class="${cls}">
      <div class="ae-step-num">${num}</div>
      <div class="ae-step-body">
        <div class="ae-step-name">${name}</div>
        <div class="ae-step-formula">${formula}</div>
      </div>
      <div class="ae-step-val">${value}</div>
    </div>`;
  }

  // Construye la ecuación visual con cápsulas y operadores.
  // parts: array de {name, value, editable, kind?, path?} alternando cápsulas y operadores.
  // Para operador: {op: '×' | '+' | '÷' | '−'}
  // Para cápsula editable: {name, value, editable:true, kind:'number'|'formula', path:'educativo.primas.10'}
  //   - kind:'number' → al hacer click busca en CALC_FIELDS por path y abre el modal padre con foco en ese input
  //   - kind:'formula' → al hacer click abre Formula Lab para esa fórmula
  // Total: {name, value} — caja oscura destacada al final.
  function eqCapsule(p) {
    if (p.op) return `<div class="ae-eq-op">${p.op}</div>`;
    if (p.eq) return `<div class="ae-eq-eq">=</div>`;
    const editable = p.editable ? 'editable' : '';
    const dataAttrs = p.editable ? `data-edit-kind="${p.kind||''}" data-edit-path="${p.path||''}"` : '';
    const title = p.editable ? (p.kind === 'formula' ? 'Click para editar esta fórmula' : 'Click para editar este número') : (p.title || 'Valor interno (no editable todavía)');
    return `<div class="ae-eq-cap ${editable}" ${dataAttrs} title="${title}">
      <div class="ae-eq-name">${p.name}</div>
      <div class="ae-eq-val">${p.value}</div>
    </div>`;
  }
  function eqRender(parts, total) {
    return `
      <div class="ae-eq">
        ${parts.map(eqCapsule).join('')}
        <div class="ae-eq-eq">=</div>
        <div class="ae-eq-result">
          <div class="ae-eq-name">${total.name}</div>
          <div class="ae-eq-val">${total.value}</div>
        </div>
      </div>
      <div class="ae-eq-legend">
        <span><span class="ae-dot fixed"></span> Valor interno (lo cambia el equipo técnico)</span>
        <span><span class="ae-dot edit"></span> Editable — click en la cápsula para abrir el editor</span>
      </div>`;
  }

  function buildHowtoEducativo() {
    const refProt = N('educativo.refProteccion', 1100000);
    const refEdad = N('educativo.refTitularAge', 37);
    const fpa = N('educativo.ageFactorPerYear', 0.04);
    const prima10 = N('educativo.primas.10', 43735);
    const proteccion = 1000000, edadTitular = 37;
    const factorProt = proteccion / refProt;
    const factorEdad = Math.max(0.5, Math.min(3, F('educativo.ageFactor', {edad_titular:edadTitular, referencia_edad:refEdad, factor_por_anio:fpa}, 1+(edadTitular-refEdad)*fpa)));
    const total = prima10 * factorProt * factorEdad;
    const eq = eqRender([
      { name:'Prima base 10 años', value: fmtMoney(prima10), editable:true, kind:'number', path:'educativo.primas.10' },
      { op:'×' },
      { name:'Factor por protección', value: `×${factorProt.toFixed(3)}`, editable:true, kind:'number', path:'educativo.refProteccion', title:'Depende de la "Protección de referencia" — click para editar' },
      { op:'×' },
      { name:'Factor por edad', value: `×${factorEdad.toFixed(3)}`, editable:true, kind:'formula', path:'educativo.ageFactor', title:'Fórmula editable — click para abrir el Formula Lab' }
    ], { name:'Prima anual final', value: fmtMoney(Math.round(total)) });
    return `
      <p class="ae-howto-title">📐 Cómo se calcula la cotización final</p>
      <p class="ae-howto-sub">Ejemplo: <b>Papá de 37 años, hijo de 1 año, plazo de 10 años, protección $1,000,000</b>.</p>
      ${eq}`;
  }

  function buildHowtoMascota() {
    const basePlan = NT('mascotaTables.basePerPlan', 'maximo', 4490);
    const edad = 5;
    const factorEdad = 1 + Math.max(0, edad - 3) * 0.06;
    const factorEspecie = NT('mascotaTables.factorEspecie', 'perro', 1.1);
    const addonFallece = N('mascota.addons.fallece', 720);
    const total = basePlan * factorEdad * factorEspecie + addonFallece;
    const eq = eqRender([
      { name:'Prima base (Máximo)', value: fmtMoney(basePlan), editable:true, kind:'table', path:'mascotaTables.basePerPlan' },
      { op:'×' },
      { name:'Factor por edad', value: `×${factorEdad.toFixed(2)}`, editable:false, title:'Fórmula interna: 1 + max(0, edad−3) × 0.06' },
      { op:'×' },
      { name:'Factor por especie', value: `×${factorEspecie}`, editable:true, kind:'table', path:'mascotaTables.factorEspecie' },
      { op:'+' },
      { name:'Addon Fallecimiento', value: fmtMoney(addonFallece), editable:true, kind:'number', path:'mascota.addons.fallece' }
    ], { name:'Prima anual final', value: fmtMoney(Math.round(total)) });
    return `
      <p class="ae-howto-title">📐 Cómo se calcula la cotización final</p>
      <p class="ae-howto-sub">Ejemplo: <b>Perro de 5 años, plan Cuidado Máximo, con addon "Fallecimiento"</b>.</p>
      ${eq}`;
  }

  function buildHowtoGmm() {
    const maleRef25 = N('gmmTables.maleRef25', 14260);
    const edad = 35;
    const ageMultFallback = edad <= 45 ? (1 + 0.0093*(edad-25)) : (1 + 0.0093*20 + 0.05*(edad-45));
    const ageMult = F('gmm.ageMultiplier', {edad}, ageMultFallback);
    const tierMult = NT('gmmTables.tierMult', 'B', 1.0);
    const dedMult = Math.pow(0.955, -2);
    const sumMult = NT('gmmTables.sumMult', '40.8', 1.0);
    const neta = maleRef25 * ageMult * tierMult * dedMult * sumMult;
    const derecho = N('factors.gmm.derechoPoliza', 970);
    const iva = N('factors.gmm.iva', 0.16);
    const totalFallback = (neta + derecho * 1) * (1 + iva);
    const total = F('gmm.totalConIVA', {prima_neta:neta, derecho_poliza:derecho, cantidad_asegurados:1, iva}, totalFallback);
    const eq = eqRender([
      { name:'Base hombre 25 años', value: fmtMoney(maleRef25), editable:true, kind:'number', path:'gmmTables.maleRef25' },
      { op:'×' },
      { name:'Factor por edad', value: `×${ageMult.toFixed(3)}`, editable:true, kind:'formula', path:'gmm.ageMultiplier' },
      { op:'×' },
      { name:'Factor nivel B', value: `×${tierMult.toFixed(2)}`, editable:true, kind:'table', path:'gmmTables.tierMult' },
      { op:'×' },
      { name:'Factor deducible', value: `×${dedMult.toFixed(3)}`, editable:false, title:'0.955^(deducible − referencia). Se puede editar desde aquí en versión futura.' },
      { op:'×' },
      { name:'Factor suma asegurada', value: `×${sumMult.toFixed(2)}`, editable:true, kind:'table', path:'gmmTables.sumMult' },
      { op:'+' },
      { name:'Derecho de póliza', value: fmtMoney(derecho), editable:true, kind:'formula', path:'gmm.totalConIVA', title:'Incluido en la fórmula editable "Total con derecho + IVA"' },
      { op:'×' },
      { name:'IVA', value: `×${(1+iva).toFixed(2)}`, editable:true, kind:'formula', path:'gmm.totalConIVA' }
    ], { name:'Prima anual final', value: fmtMoney(Math.round(total)) });
    return `
      <p class="ae-howto-title">📐 Cómo se calcula la cotización final</p>
      <p class="ae-howto-sub">Ejemplo: <b>Hombre, 35 años, no fumador, individual, Nivel B, deducible $21,000, suma asegurada $40.8M, sin addons</b>.</p>
      ${eq}`;
  }

  function buildHowtoPatrimonial() {
    const hv = 2000000, cv = 300000;
    const homeRate = N('patrimonialTables.rates.homeRate', 0.00098);
    const contentsRate = N('patrimonialTables.rates.contentsRate', 0.00220);
    const fixedBase = N('patrimonialTables.rates.fixedBase', 5978);
    const fHidromet = N('factors.patrimonial.factorHidromet', 1);
    const s1 = hv * homeRate;
    const s2 = cv * contentsRate;
    const basePrima = s1 + s2 + fixedBase;
    const hidromet = F('patrimonial.hidrometCosto', {prima_base:basePrima, factor_hidromet:fHidromet}, basePrima);
    const total = basePrima + hidromet;
    const eq = eqRender([
      { name:'Edificio', value: fmtMoney(s1), editable:true, kind:'number', path:'patrimonialTables.rates.homeRate', title:`$2,000,000 × ${homeRate} — click para editar la tasa` },
      { op:'+' },
      { name:'Contenidos', value: fmtMoney(s2), editable:true, kind:'number', path:'patrimonialTables.rates.contentsRate', title:`$300,000 × ${contentsRate} — click para editar la tasa` },
      { op:'+' },
      { name:'Base fija plan', value: fmtMoney(fixedBase), editable:true, kind:'number', path:'patrimonialTables.rates.fixedBase' },
      { op:'+' },
      { name:'Addon hidromet', value: fmtMoney(hidromet), editable:true, kind:'formula', path:'patrimonial.hidrometCosto' }
    ], { name:'Prima anual final', value: fmtMoney(Math.round(total)) });
    return `
      <p class="ae-howto-title">📐 Cómo se calcula la cotización final</p>
      <p class="ae-howto-sub">Ejemplo: <b>Casa de $2,000,000, contenidos $300,000, plan "A tu medida", con addon Hidrometeorológicos</b>.</p>
      ${eq}`;
  }

  function buildHowtoAuto() {
    const v = 300000, edad = 6;
    const baseRate = N('auto.baseRate', 0.05);
    const ageMult = NB('auto.ageBrackets', edad, 1.08);
    const useMult = NT('auto.useMult', 'particular', 1.0);
    const covMult = NT('auto.covMult', 'amplia', 1.0);
    const dtMult = NT('auto.dtMult', '5', 1.15);
    const ddMult = NT('auto.ddMult', '5', 1.0);
    const total = v * baseRate * ageMult * useMult * covMult * dtMult * ddMult;
    const eq = eqRender([
      { name:'Valor del auto', value: fmtMoney(v), editable:false, title:'Lo elige el cliente en el wizard (default $300,000)' },
      { op:'×' },
      { name:'Tasa base', value: `×${baseRate}`, editable:true, kind:'number', path:'auto.baseRate' },
      { op:'×' },
      { name:'Factor edad (6 años)', value: `×${ageMult}`, editable:true, kind:'bracket', path:'auto.ageBrackets' },
      { op:'×' },
      { name:'Factor uso', value: `×${useMult}`, editable:true, kind:'table', path:'auto.useMult' },
      { op:'×' },
      { name:'Factor cobertura', value: `×${covMult}`, editable:true, kind:'table', path:'auto.covMult' },
      { op:'×' },
      { name:'Factor deducible robo', value: `×${dtMult}`, editable:true, kind:'table', path:'auto.dtMult' },
      { op:'×' },
      { name:'Factor deducible daños', value: `×${ddMult}`, editable:true, kind:'table', path:'auto.ddMult' }
    ], { name:'Prima anual final', value: fmtMoney(Math.round(total)) });
    return `
      <p class="ae-howto-title">📐 Cómo se calcula la cotización final</p>
      <p class="ae-howto-sub">Ejemplo: <b>Auto de $300,000, año 2020 (6 años), uso particular, cobertura amplia, deducibles 5%/5%, sin addons</b>.</p>
      ${eq}`;
  }

  function buildHowtoAhorro() {
    // El cotizador Ahorro NO calcula prima: la "cotización" es la aportación que elige el cliente.
    // Lo que SE PROYECTA son los saldos futuros (a 65 y 70 años) usando la tabla AHORRO_MULT.
    // Aquí explicamos visualmente esa diferencia para que Andy no confunda "prima" con "aportación".
    const aportacion = 36000, anios = 10, totalAportado = aportacion * anios;
    const eq = eqRender([
      { name:'Aportación anual', value: fmtMoney(aportacion), editable:false, title:'Lo elige el cliente con el slider' },
      { op:'×' },
      { name:'Años aportando', value: anios.toString(), editable:false, title:'Lo elige el cliente (5/10/15 años)' }
    ], { name:'Total aportado', value: fmtMoney(totalAportado) });
    return `
      <p class="ae-howto-title">📐 Cómo se calcula la cotización final</p>
      <p class="ae-howto-sub"><b>Aclaración importante:</b> Ahorro/Inversión/Retiro NO tiene prima como GMM o Auto. El número que ve el cliente es la <b>aportación anual</b> que él mismo eligió. Lo que sí calculamos es la <b>proyección del saldo</b> a los 65 años usando tablas internas de rendimiento (calibradas a casos reales de Carola/Sofía/Elia del material GNP).</p>
      ${eq}
      <p class="ae-howto-sub" style="margin-top:10px"><b>Lo que se proyecta (no editable todavía desde aquí):</b> el saldo a los 65 años se interpola con la tabla AHORRO_MULT por edad de entrada y producto. Si AnCheco actualiza esos casos, hay que tocarlo del lado técnico.</p>`;
  }

  function buildHowto(wizardKey) {
    try {
      if (wizardKey === 'educativo') return buildHowtoEducativo();
      if (wizardKey === 'mascota') return buildHowtoMascota();
      if (wizardKey === 'gmm') return buildHowtoGmm();
      if (wizardKey === 'patrimonial') return buildHowtoPatrimonial();
      if (wizardKey === 'auto') return buildHowtoAuto();
      if (wizardKey === 'ahorro') return buildHowtoAhorro();
    } catch(e) { return '<p class="ae-howto-sub" style="color:#d93636">No se pudo calcular el ejemplo: ' + e.message + '</p>'; }
    return '';
  }

  function fmtMoney(v) { return '$' + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function fmtPlain(v) { return (typeof v === 'number') ? (Math.round(v*1000)/1000).toString() : '—'; }

  function evalFormula(expr, vars) {
    try {
      if (typeof exprEval === 'undefined') return { ok: false, err: 'expr-eval no cargó' };
      const p = new exprEval.Parser();
      const parsed = p.parse(expr);
      const used = parsed.variables();
      const allowed = new Set(Object.keys(vars));
      for (const v of used) {
        if (!allowed.has(v)) return { ok: false, err: `Variable "${v}" no existe. Disponibles: ${[...allowed].join(', ')}` };
      }
      const r = parsed.evaluate(vars);
      if (typeof r !== 'number' || !isFinite(r)) return { ok: false, err: 'Resultado no es un número válido' };
      return { ok: true, value: r };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  }

  // Construye el breakdown paso a paso: muestra la fórmula con los valores sustituidos
  // y, si la fórmula es de operaciones simples, descompone los pasos intermedios.
  function buildBreakdown(expr, vars, format) {
    const fmt = format === 'money' ? fmtMoney : fmtPlain;
    // Línea 1: la fórmula con cada variable reemplazada por su valor visible
    let sustituida = expr;
    // Reemplazamos variables del más largo al más corto para evitar colisiones (ej. "edad" dentro de "edad_titular")
    const sortedVars = Object.keys(vars).sort((a,b) => b.length - a.length);
    sortedVars.forEach(v => {
      const re = new RegExp('\\b' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      const val = vars[v];
      const display = (typeof val === 'number' && Math.abs(val) >= 1000 && format === 'money') ? fmtMoney(val) : String(val);
      sustituida = sustituida.replace(re, display);
    });
    const r = evalFormula(expr, vars);
    const finalVal = r.ok ? fmt(r.value) : '—';
    return `
      <div class="ae-bd-line">
        <span class="ae-bd-step"><b>Fórmula:</b></span>
        <span class="ae-bd-val">${expr.replace(/</g,'&lt;')}</span>
      </div>
      <div class="ae-bd-line">
        <span class="ae-bd-step"><b>Con valores:</b></span>
        <span class="ae-bd-val">${sustituida.replace(/</g,'&lt;')}</span>
      </div>
      <div class="ae-bd-line">
        <span class="ae-bd-step"><b>Resultado:</b></span>
        <span class="ae-bd-val">${finalVal}</span>
      </div>`;
  }

  function openFormulaLab(def) {
    let modal = document.getElementById('ae-flab-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'ae-flab-modal';
    const currentExpr = getByPath(workingContent, 'calc.formulas.' + def.path) || def.default;
    // Casos: arrancan con los del def y se les suman los custom guardados en content.json
    const customCasesPath = 'calc.formulasCases.' + def.path;
    const customCases = getByPath(workingContent, customCasesPath);
    const baseCases = def.preview.map(p => ({ label: p.label, vars: {...p.vars}, builtin: true }));
    const initialCases = [
      ...baseCases,
      ...(Array.isArray(customCases) ? customCases.map(c => ({...c, builtin: false})) : [])
    ];

    modal.innerHTML = `
      <div id="ae-flab-card">
        <header>
          <h2>${def.label}<small>${def.hint}</small></h2>
          <button class="ae-x" type="button" style="background:transparent;border:0;font-size:22px;cursor:pointer;color:#64748b;padding:0 6px">×</button>
        </header>
        <div class="ae-flab-grid">
          <div class="ae-flab-left">
            <div class="ae-flab-section">
              <h3>1. Fórmula</h3>
              <textarea id="ae-flab-expr" spellcheck="false">${String(currentExpr).replace(/</g,'&lt;')}</textarea>
              <div id="ae-flab-status" class="ae-flab-status ok">✓ Compila bien</div>
            </div>
            <div class="ae-flab-section">
              <h3>2. Cómo se calcula (usando el primer caso de prueba)</h3>
              <div class="ae-breakdown" id="ae-flab-breakdown">—</div>
            </div>
            <div class="ae-flab-section">
              <h3>3. Casos de prueba — editá los valores para probar la fórmula con tus criterios</h3>
              <div class="ae-cases" id="ae-flab-cases"></div>
              <button type="button" class="ae-case-add" id="ae-flab-add-case" style="margin-top:8px;width:100%">+ Agregar caso propio</button>
            </div>
          </div>
          <div class="ae-flab-right">
            <div class="ae-flab-section">
              <h3>Variables disponibles<br><span style="font-weight:500;text-transform:none;color:#94a3b8">(click para insertar)</span></h3>
              <ul class="ae-flab-vars">
                ${def.vars.map(v => `<li><button type="button" data-var="${v.name}">${v.name}<small>${v.desc}</small></button></li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
        <footer>
          <button type="button" class="ae-restore">↺ Restaurar default</button>
          <div style="display:flex;gap:10px">
            <button type="button" class="ae-cancel">Cancelar</button>
            <button type="button" class="ae-apply">Aplicar</button>
          </div>
        </footer>
      </div>`;
    document.body.appendChild(modal);
    modal.classList.add('show');
    const ta = modal.querySelector('#ae-flab-expr');
    const statusEl = modal.querySelector('#ae-flab-status');
    const casesEl = modal.querySelector('#ae-flab-cases');
    const breakdownEl = modal.querySelector('#ae-flab-breakdown');
    const applyBtn = modal.querySelector('.ae-apply');
    const close = () => modal.remove();

    // Estado mutable de los casos (incluye custom)
    let cases = initialCases;

    function renderCases() {
      const expr = ta.value.trim();
      const fmt = def.format === 'money' ? fmtMoney : fmtPlain;
      casesEl.innerHTML = cases.map((c, idx) => {
        const r = expr ? evalFormula(expr, c.vars) : { ok: false, err: 'vacía' };
        const resultHtml = r.ok
          ? `<span class="ae-case-result">${fmt(r.value)}</span>`
          : `<span class="ae-case-result bad" title="${r.err.replace(/"/g,'&quot;')}">no calcula</span>`;
        const delHtml = c.builtin ? '' : `<button type="button" class="ae-case-del" data-del="${idx}" title="Eliminar caso">×</button>`;
        const nameHtml = c.builtin
          ? `<span class="ae-case-name" style="cursor:default">${c.label}</span>`
          : `<input class="ae-case-name" data-case-name="${idx}" value="${String(c.label).replace(/"/g,'&quot;')}" placeholder="Nombre del caso" />`;
        return `
          <div class="ae-case ${c.builtin?'':'custom'}" data-case-idx="${idx}">
            <div class="ae-case-head">
              ${nameHtml}
              <div class="ae-case-actions">
                ${resultHtml}
                ${delHtml}
              </div>
            </div>
            <div class="ae-case-vars">
              ${def.vars.map(v => `
                <label>${v.name} <span style="color:#94a3b8;font-weight:500">— ${v.desc}</span></label>
                <input type="number" step="any" data-case-var="${idx}|${v.name}" value="${c.vars[v.name] != null ? c.vars[v.name] : ''}" placeholder="${v.sample}"/>
              `).join('')}
            </div>
          </div>`;
      }).join('');
    }

    function renderBreakdown() {
      const expr = ta.value.trim();
      if (!expr || !cases.length) { breakdownEl.innerHTML = '<span style="color:#94a3b8;font-family:Montserrat,system-ui,sans-serif;font-size:12px">Escribe una fórmula y agrega un caso de prueba para ver el cálculo paso a paso.</span>'; return; }
      breakdownEl.innerHTML = buildBreakdown(expr, cases[0].vars, def.format);
    }

    function validate() {
      const expr = ta.value.trim();
      if (!expr) {
        ta.classList.remove('ok','err'); ta.classList.add('err');
        statusEl.className = 'ae-flab-status err'; statusEl.textContent = '✗ La fórmula está vacía';
        applyBtn.disabled = true;
        renderCases(); renderBreakdown();
        return false;
      }
      // Validar con el primer caso (o sample por defecto si no hay casos)
      const sampleVars = (cases[0] && cases[0].vars) ? cases[0].vars : (() => { const s = {}; def.vars.forEach(v => s[v.name] = v.sample); return s; })();
      const r = evalFormula(expr, sampleVars);
      if (r.ok) {
        ta.classList.remove('err'); ta.classList.add('ok');
        statusEl.className = 'ae-flab-status ok'; statusEl.textContent = '✓ Compila bien';
        applyBtn.disabled = false;
      } else {
        ta.classList.remove('ok'); ta.classList.add('err');
        statusEl.className = 'ae-flab-status err'; statusEl.textContent = '✗ ' + r.err;
        applyBtn.disabled = true;
      }
      renderCases();
      renderBreakdown();
      return r.ok;
    }

    ta.addEventListener('input', validate);
    modal.querySelector('.ae-x').addEventListener('click', close);
    modal.querySelector('.ae-cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelectorAll('button[data-var]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.var;
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + v + ta.value.slice(end);
      ta.focus(); ta.selectionStart = ta.selectionEnd = start + v.length;
      validate();
    }));
    // Edición de los inputs de variables y nombre de cada caso
    casesEl.addEventListener('input', (e) => {
      const tgt = e.target;
      if (tgt.matches('[data-case-var]')) {
        const [idxStr, varName] = tgt.dataset.caseVar.split('|');
        const idx = parseInt(idxStr);
        const raw = tgt.value.trim();
        const num = raw === '' ? def.vars.find(v => v.name === varName).sample : parseFloat(raw);
        if (cases[idx]) {
          cases[idx].vars[varName] = isFinite(num) ? num : 0;
          // Re-evaluar solo este caso (no toda la lista para no perder focus)
          const expr = ta.value.trim();
          const fmt = def.format === 'money' ? fmtMoney : fmtPlain;
          const r = expr ? evalFormula(expr, cases[idx].vars) : { ok: false };
          const resEl = casesEl.querySelector(`.ae-case[data-case-idx="${idx}"] .ae-case-result`);
          if (resEl) {
            if (r.ok) { resEl.className = 'ae-case-result'; resEl.textContent = fmt(r.value); }
            else { resEl.className = 'ae-case-result bad'; resEl.textContent = 'no calcula'; }
          }
          if (idx === 0) renderBreakdown();
        }
      } else if (tgt.matches('[data-case-name]')) {
        const idx = parseInt(tgt.dataset.caseName);
        if (cases[idx]) cases[idx].label = tgt.value;
      }
    });
    casesEl.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        const idx = parseInt(del.dataset.del);
        if (cases[idx] && !cases[idx].builtin) {
          cases.splice(idx, 1);
          renderCases();
          renderBreakdown();
        }
      }
    });
    modal.querySelector('#ae-flab-add-case').addEventListener('click', () => {
      const newVars = {};
      def.vars.forEach(v => newVars[v.name] = v.sample);
      cases.push({ label: 'Caso ' + (cases.filter(c => !c.builtin).length + 1), vars: newVars, builtin: false });
      renderCases();
    });
    modal.querySelector('.ae-restore').addEventListener('click', () => {
      if (!confirm('¿Restaurar la fórmula default del sistema?\n(Los casos de prueba que agregaste se mantienen.)')) return;
      ta.value = def.default; validate();
    });
    modal.querySelector('.ae-apply').addEventListener('click', () => {
      const expr = ta.value.trim();
      if (!validate()) return;
      const path = 'calc.formulas.' + def.path;
      setByPath(workingContent, path, expr);
      if (window.__cms && window.__cms.data) setByPath(window.__cms.data, path, expr);
      // Persistir casos custom (sin los builtin) en calc.formulasCases.<path>
      const customToSave = cases.filter(c => !c.builtin).map(c => ({ label: c.label, vars: c.vars }));
      setByPath(workingContent, customCasesPath, customToSave);
      if (window.__cms && window.__cms.data) setByPath(window.__cms.data, customCasesPath, customToSave);
      // invalida cache + marca dirty + re-renderiza wizard
      if (typeof window.__cmsFormulaInvalidate === 'function') window.__cmsFormulaInvalidate();
      const original = getByPath(originalContent, path) || def.default;
      if (expr === original) dirtyKeys.delete(path); else dirtyKeys.add(path);
      const originalCases = getByPath(originalContent, customCasesPath);
      if (JSON.stringify(customToSave) === JSON.stringify(originalCases || [])) dirtyKeys.delete(customCasesPath);
      else dirtyKeys.add(customCasesPath);
      try { if (typeof window.__cmsRecalc === 'function') window.__cmsRecalc(def.affects); } catch(_) {}
      renderBar();
      const calcModal = document.getElementById('ae-calc-modal');
      if (calcModal && calcModal.classList.contains('show')) {
        const inp = calcModal.querySelector(`input[data-formula-path="${def.path}"]`);
        if (inp) inp.value = expr;
        // refrescar el howto del tab afectado (las cápsulas leen N()/F() en vivo)
        const howtoBox = calcModal.querySelector(`.ae-howto[data-howto="${def.affects}"]`);
        if (howtoBox) howtoBox.innerHTML = buildHowto(def.affects);
      }
      close();
      toast('Fórmula aplicada. La cotización se actualizó.');
    });
    validate(); // estado inicial
  }

  function formatNum(v, step) {
    if (typeof v !== 'number' || !isFinite(v)) return '';
    // Decimales según el step (0.005 → 3, 1 → 0)
    const dec = (step != null && step < 1) ? Math.min(4, String(step).split('.')[1]?.length || 2) : 0;
    if (dec === 0) return String(Math.round(v)); // enteros: sin tocar
    // Decimales: strip ceros finales SOLO después del punto, conservar el resto
    return Number(v).toFixed(dec).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }

  function openCalcModal() {
    let modal = document.getElementById('ae-calc-modal');
    if (modal) { modal.classList.add('show'); return; }
    modal = document.createElement('div');
    modal.id = 'ae-calc-modal';
    // Cuenta cambios pendientes por wizard (para el dot verde en la tab)
    const dirtyCountFor = (wKey) => {
      let n = 0;
      dirtyKeys.forEach(k => {
        if (k.startsWith('calc.formulas.' + wKey + '.')) n++;
        else if (k.startsWith('calc.formulasCases.' + wKey + '.')) n++;
        else if (k.startsWith('calc.' + wKey + '.')) n++;
      });
      return n;
    };

    const tabsHtml = WIZARDS.map((w, i) => {
      const dot = dirtyCountFor(w.key) > 0 ? '<span class="ae-tab-dot"></span>' : '';
      return `<button type="button" class="ae-tab${i===0?' active':''}" data-tab="${w.key}"><span class="ae-tab-icon">${w.icon}</span>${w.label}${dot}</button>`;
    }).join('');

    const panelHtml = (wKey) => {
      const formulas = FORMULA_DEFS.filter(f => f.path.split('.')[0] === wKey);
      const constsGroup = CALC_FIELDS.find(g => g.wizard === wKey);
      const consts = constsGroup ? constsGroup.items : [];
      let html = '';
      // Bloque "Cómo se calcula la cotización final" arriba del todo
      const howtoHtml = buildHowto(wKey);
      if (howtoHtml) html += `<div class="ae-howto" data-howto="${wKey}">${howtoHtml}</div>`;
      if (formulas.length) {
        html += `<div class="ae-subhead"><span class="ae-icon">⚡</span> Fórmulas (click para editar)</div>`;
        html += `<div class="ae-grp">${formulas.map(f => {
          const cur = getByPath(workingContent, 'calc.formulas.' + f.path) || f.default;
          const isDirty = dirtyKeys.has('calc.formulas.' + f.path);
          return `
            <div class="ae-row ae-row-formula" data-formula-path-row="${f.path}">
              <div class="ae-lbl"><b>${f.label}</b><small>${f.hint}</small></div>
              <div class="ae-inp ${isDirty ? 'dirty' : ''}">
                <input type="text" readonly data-formula-path="${f.path}" value="${String(cur).replace(/"/g,'&quot;')}" title="Click para abrir el editor de fórmulas" />
              </div>
            </div>`;
        }).join('')}</div>`;
      }
      if (consts.length) {
        html += `<div class="ae-subhead"><span class="ae-icon">●</span> Números editables</div>`;
        html += `<div class="ae-grp">${consts.map(it => {
          const cur = getByPath(workingContent, 'calc.' + it.path);
          const val = (typeof cur === 'number' && isFinite(cur)) ? cur : it.fallback;
          const isDirty = dirtyKeys.has('calc.' + it.path);
          return `
            <div class="ae-row">
              <div class="ae-lbl"><b>${it.label}</b><small>${it.hint}</small></div>
              <div class="ae-inp ${isDirty ? 'dirty' : ''}">
                ${it.unit === '$' ? '<span class="prefix">$</span>' : ''}
                <input type="number" data-calc-path="${it.path}" data-calc-affects="${it.affects}" data-calc-fallback="${it.fallback}" min="${it.min}" max="${it.max}" step="${it.step}" value="${formatNum(val, it.step)}" />
                ${it.suffix ? `<span class="suffix">${it.suffix}</span>` : ''}
              </div>
            </div>`;
        }).join('')}</div>`;
      }
      if (!html) html = `<div class="ae-panel-empty">No hay valores editables para este producto todavía.</div>`;
      return html;
    };

    const panelsHtml = WIZARDS.map((w, i) =>
      `<div class="ae-panel${i===0?' active':''}" data-panel="${w.key}">${panelHtml(w.key)}</div>`
    ).join('');

    modal.innerHTML = `
      <div id="ae-calc-card">
        <header>
          <h2>Constantes de cálculo</h2>
          <button class="ae-x" type="button" aria-label="Cerrar">×</button>
        </header>
        <div class="ae-intro">
          Aquí editás los <b>números</b> (●) y las <b>fórmulas</b> (⚡) que usan los cotizadores. Elegí el producto en las pestañas de arriba, cambia un valor y verás el efecto en vivo. Después guarda con el botón <b>Guardar</b> de la barra de abajo.
        </div>
        <div class="ae-tabs">${tabsHtml}</div>
        <div class="ae-panels">${panelsHtml}</div>
        <footer>
          <button class="ae-cancel" type="button">Cerrar</button>
        </footer>
      </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('show');
    const close = () => modal.classList.remove('show');
    modal.querySelector('.ae-x').addEventListener('click', close);
    modal.querySelector('.ae-cancel').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    // Switch entre tabs
    modal.querySelectorAll('.ae-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const wKey = tab.dataset.tab;
        modal.querySelectorAll('.ae-tab').forEach(t => t.classList.toggle('active', t === tab));
        modal.querySelectorAll('.ae-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === wKey));
      });
    });

    // Click en una fila de fórmula → abre Formula Lab (event delegation para sobrevivir re-renders)
    modal.addEventListener('click', (e) => {
      const row = e.target.closest('.ae-row-formula');
      if (row && modal.contains(row)) {
        const path = row.dataset.formulaPathRow;
        const def = findFormulaDef(path);
        if (def) openFormulaLab(def);
      }
    });

    // Click en una cápsula editable del howto → abre editor (event delegation para sobrevivir re-renders)
    modal.addEventListener('click', (e) => {
      const cap = e.target.closest('.ae-eq-cap.editable');
      if (!cap || !modal.contains(cap)) return;
      e.stopPropagation();
      const kind = cap.dataset.editKind;
      const path = cap.dataset.editPath;
      if (!path) return;
      if (kind === 'formula') {
        const def = findFormulaDef(path);
        if (def) openFormulaLab(def);
      } else if (KNOB_REGISTRY[path]) {
        // Popover universal inline (no scroll a otro lado)
        openKnobPopover(cap);
      } else {
        // Fallback: scroll a input number en la sección de constantes
        const inp = modal.querySelector(`input[data-calc-path="${path}"]`);
        if (inp) {
          inp.scrollIntoView({ block: 'center', behavior: 'smooth' });
          setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 300);
        }
      }
    });

    // Cambio en cualquier input → debounce 250ms → setByPath → recalc + dirty + render
    let debounceTimer = null;
    modal.addEventListener('input', (e) => {
      const inp = e.target.closest('input[data-calc-path]');
      if (!inp) return;
      const path = 'calc.' + inp.dataset.calcPath;
      const affects = inp.dataset.calcAffects;
      const fallback = parseFloat(inp.dataset.calcFallback);
      const raw = inp.value.trim();
      const parsed = raw === '' ? fallback : parseFloat(raw);
      const wrap = inp.closest('.ae-inp');
      if (!isFinite(parsed)) { wrap?.style.setProperty('border-color', '#d93636'); return; }
      wrap?.style.removeProperty('border-color');
      setByPath(workingContent, path, parsed);
      if (window.__cms && window.__cms.data) setByPath(window.__cms.data, path, parsed);
      const original = getByPath(originalContent, path);
      if (parsed === original) { dirtyKeys.delete(path); wrap?.classList.remove('dirty'); }
      else { dirtyKeys.add(path); wrap?.classList.add('dirty'); }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try { if (typeof window.__cmsRecalc === 'function') window.__cmsRecalc(affects); } catch(_) {}
        renderBar();
        // Refrescar el "Cómo se calcula" del tab activo (lee N() en vivo)
        const howtoBox = modal.querySelector(`.ae-howto[data-howto="${affects}"]`);
        if (howtoBox) howtoBox.innerHTML = buildHowto(affects);
      }, 250);
    });
  }

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
        <button class="btn-calc" id="ae-calc" title="Editar las constantes de cálculo (primas base, factores, etc.)">⚙ Constantes</button>
        <button class="btn-ghost" id="ae-discard">Descartar</button>
        <button class="btn-save" id="ae-save">Guardar</button>
      `;
      document.body.appendChild(bar);
      bar.querySelector('#ae-save').addEventListener('click', save);
      bar.querySelector('#ae-discard').addEventListener('click', discard);
      bar.querySelector('#ae-logout').addEventListener('click', logout);
      bar.querySelector('#ae-calc').addEventListener('click', openCalcModal);
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
    if (IS_LOCAL) {
      const res = await fetch(`/${CONTENT_PATH}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`GET local → ${res.status}`);
      fileSha = 'local-demo';
      return await res.json();
    }
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
    if (IS_LOCAL) {
      // En modo demo local no persiste; solo simulamos el delay y retornamos.
      await new Promise(r => setTimeout(r, 200));
      return;
    }
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
      toast(IS_LOCAL
        ? 'Modo demo local: simulamos el guardado, pero no escribe a GitHub.'
        : 'Guardado. Cambios en vivo en ~1 minuto.',
        IS_LOCAL ? 'warn' : undefined);
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
    if (!IS_LOCAL && !token) {
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
      toast(IS_LOCAL
        ? 'Modo demo local. Editás libremente pero los cambios NO se persisten.'
        : 'Editor cargado. Click en cualquier texto resaltado para editar.',
        IS_LOCAL ? 'warn' : undefined);
    }, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
