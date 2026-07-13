#!/usr/bin/env python3
"""Regenera window.__cmsEmbedded en index.html desde content/content.json.

El HTML se copia al CRM (GHL Custom Code) donde no existe la carpeta content/;
sin este sync la copia del CRM queda congelada en el último estado.
Uso:  python3 sync_embedded.py
"""
import json
import re
from pathlib import Path

BASE = Path(__file__).parent
INDEX = BASE / "index.html"
CONTENT = BASE / "content" / "content.json"

# Caracteres peligrosos dentro de <script>...</script>:
LINE_SEP = " "  # LINE SEPARATOR
PARA_SEP = " "  # PARAGRAPH SEPARATOR


def safe_json_for_script(data) -> str:
    """JSON compacto, seguro para pegar dentro de <script>."""
    s = json.dumps(data, ensure_ascii=False)
    # </ -> <\/  (impide cerrar el <script> prematuramente)
    s = s.replace("</", "<\\/")
    # U+2028 y U+2029: válidos en JSON pero rompen JS como string literal.
    s = s.replace(LINE_SEP, "\\u2028")
    s = s.replace(PARA_SEP, "\\u2029")
    return s


def find_embedded_span(html: str):
    """Ubica el span exacto de `window.__cmsEmbedded = { ... };` haciendo
    match balanceado de llaves (no confía en regex greedy/lazy)."""
    m = re.search(r"window\.__cmsEmbedded\s*=\s*\{", html)
    if not m:
        return None
    start = m.start()
    brace_start = m.end() - 1  # posición del `{` de apertura
    depth = 0
    in_str = False
    esc = False
    i = brace_start
    while i < len(html):
        ch = html[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    # incluir la `};` final
                    j = i + 1
                    while j < len(html) and html[j] in " \t":
                        j += 1
                    if j < len(html) and html[j] == ";":
                        j += 1
                    return start, j
        i += 1
    return None


def main():
    html = INDEX.read_text(encoding="utf-8")
    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    embedded = safe_json_for_script(content)
    new_line = f"window.__cmsEmbedded = {embedded};"

    span = find_embedded_span(html)
    if not span:
        raise SystemExit("ERROR: no encontré `window.__cmsEmbedded = {...};` en index.html")

    start, end = span
    new_html = html[:start] + new_line + html[end:]
    if new_html == html:
        print("Sin cambios (ya coincide con content.json).")
        return
    INDEX.write_text(new_html, encoding="utf-8")
    print(f"OK: __cmsEmbedded sincronizado ({len(embedded):,} caracteres)")


if __name__ == "__main__":
    main()
