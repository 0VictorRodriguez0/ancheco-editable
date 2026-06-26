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
  const CALC_FIELDS = [
    { group: 'Plan Educativo · Profesional', items: [
      { path: 'educativo.primas.5', label: 'Prima base — 5 años de pago', hint: 'Referencia: papá 37 años, hijo 1 año, meta $1.1M.', unit: '$', min: 1000, max: 500000, step: 100, fallback: 82670, affects: 'educativo' },
      { path: 'educativo.primas.10', label: 'Prima base — 10 años de pago', hint: 'Referencia: papá 37 años, hijo 1 año, meta $1.1M.', unit: '$', min: 1000, max: 500000, step: 100, fallback: 43735, affects: 'educativo' },
      { path: 'educativo.primas.alcanzada', label: 'Prima base — Hasta edad alcanzada', hint: 'Pago hasta los 18 años del menor.', unit: '$', min: 1000, max: 500000, step: 100, fallback: 25760, affects: 'educativo' },
      { path: 'educativo.refProteccion', label: 'Protección de referencia', hint: 'Suma asegurada del ejemplo del material (anclaje del cálculo).', unit: '$', min: 100000, max: 10000000, step: 50000, fallback: 1100000, affects: 'educativo' },
      { path: 'educativo.refTitularAge', label: 'Edad de referencia del contratante', hint: 'Edad del papá del ejemplo del material.', unit: '', suffix: 'años', min: 18, max: 75, step: 1, fallback: 37, affects: 'educativo' },
      { path: 'educativo.ageFactorPerYear', label: 'Factor por año de edad del contratante', hint: 'Cuánto sube la prima por cada año adicional (0.04 = 4%).', unit: '', suffix: '× edad', min: 0, max: 0.20, step: 0.005, fallback: 0.04, affects: 'educativo' }
    ]},
    { group: 'Gastos Médicos Mayores · Coberturas extra', items: [
      { path: 'gmm.addons.cda', label: 'Cero Deducible por Accidente (CDA)', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 50000, step: 100, fallback: 1800, affects: 'gmm' },
      { path: 'gmm.addons.mp', label: 'Maternidad Plus Personaliza (MP)', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 50000, step: 100, fallback: 5200, affects: 'gmm' },
      { path: 'gmm.addons.ahr', label: 'Ampliación Hospitalaria Nacional (AHR)', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 50000, step: 100, fallback: 2800, affects: 'gmm' }
    ]},
    { group: 'Mascota · Coberturas extra', items: [
      { path: 'mascota.addons.fallece', label: 'Fallecimiento', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 20000, step: 10, fallback: 720, affects: 'mascota' },
      { path: 'mascota.addons.robo', label: 'Robo con violencia', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 20000, step: 10, fallback: 480, affects: 'mascota' },
      { path: 'mascota.addons.rc', label: 'RC mascota ampliada', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 20000, step: 10, fallback: 540, affects: 'mascota' }
    ]},
    { group: 'Hogar / Patrimonial · Coberturas extra', items: [
      { path: 'patrimonial.addons.funmascotas', label: 'Servicio funerario mascotas', hint: 'Anualidad fija que se suma cuando el cliente lo selecciona.', unit: '$', min: 0, max: 5000, step: 1, fallback: 348, affects: 'patrimonial' }
    ]}
  ];

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
    modal.innerHTML = `
      <div id="ae-calc-card">
        <header>
          <h2>Constantes de cálculo</h2>
          <button class="ae-x" type="button" aria-label="Cerrar">×</button>
        </header>
        <div class="ae-intro">
          Aquí editás los <b>números</b> que usan los cotizadores. Cambia uno, presiona <b>Aplicar</b> y verás el efecto en vivo en la cotización. Después guarda con el botón <b>Guardar</b> de la barra de abajo. Las fórmulas que combinan estos números viven en el código y solo el equipo técnico las cambia.
        </div>
        ${CALC_FIELDS.map(grp => `
          <div class="ae-grp">
            <h3>${grp.group}</h3>
            ${grp.items.map(it => {
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
            }).join('')}
          </div>`).join('')}
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
