/* ============================================================
   CustomDialogs Builder
   Static, dependency-free. Builds a dialog model, renders a
   Minecraft-flavored preview + YAML, and downloads the .yml.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "customdialogs-builder-v1";

  // Action types -> config [tag] and UI metadata.
  var ACTION_TYPES = [
    { v: "player",    label: "Run as player",  tag: "player",    needsValue: true,  hint: "spawn" },
    { v: "console",   label: "Run as console", tag: "console",   needsValue: true,  hint: "give %player_name% diamond 1" },
    { v: "op",        label: "Run as op",      tag: "op",        needsValue: true,  hint: "command the player normally can't run" },
    { v: "dialog",    label: "Open dialog",    tag: "dialog",    needsValue: true,  hint: "menus/main" },
    { v: "message",   label: "Send message",   tag: "message",   needsValue: true,  hint: "&aHello %player_name%" },
    { v: "broadcast", label: "Broadcast",      tag: "broadcast", needsValue: true,  hint: "&e%player_name% joined the event" },
    { v: "close",     label: "Close screen",   tag: "close",     needsValue: false, hint: "" }
  ];
  function actionMeta(v) {
    for (var i = 0; i < ACTION_TYPES.length; i++) if (ACTION_TYPES[i].v === v) return ACTION_TYPES[i];
    return ACTION_TYPES[0];
  }

  var TYPE_NOTES = {
    multi_action: "Grid of any number of buttons. The simplest choice for menus.",
    notice: "One centered button (extra buttons are ignored by the client).",
    confirmation: "Exactly two buttons, shown as a yes / no bar."
  };

  // ---------- Minecraft color/format parser ----------
  var MC_COLORS = {
    "0": "#000000", "1": "#0000AA", "2": "#00AA00", "3": "#00AAAA",
    "4": "#AA0000", "5": "#AA00AA", "6": "#FFAA00", "7": "#AAAAAA",
    "8": "#555555", "9": "#5555FF", "a": "#55FF55", "b": "#55FFFF",
    "c": "#FF5555", "d": "#FF55FF", "e": "#FFFF55", "f": "#FFFFFF"
  };

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Turns "&a&lHi #ff0000red" into styled HTML spans.
  function renderMc(text, fallbackColor) {
    if (text == null) text = "";
    var out = "";
    var state = { color: fallbackColor || "#e8eaf0", b: false, i: false, u: false, s: false };
    var buffer = "";

    function flush() {
      if (!buffer) return;
      var cls = [];
      if (state.b) cls.push("mc-b");
      if (state.i) cls.push("mc-i");
      if (state.u && state.s) cls.push("mc-us");
      else if (state.u) cls.push("mc-u");
      else if (state.s) cls.push("mc-s");
      out += '<span class="' + cls.join(" ") + '" style="color:' + state.color + '">' + escapeHtml(buffer) + "</span>";
      buffer = "";
    }

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      // &#RRGGBB  or  raw #RRGGBB
      if ((ch === "&" && text[i + 1] === "#" && /^[0-9a-fA-F]{6}$/.test(text.substr(i + 2, 6)))) {
        flush(); state.color = "#" + text.substr(i + 2, 6); state.b = state.i = state.u = state.s = false; i += 7; continue;
      }
      if (ch === "#" && /^[0-9a-fA-F]{6}$/.test(text.substr(i + 1, 6))) {
        flush(); state.color = "#" + text.substr(i + 1, 6); state.b = state.i = state.u = state.s = false; i += 6; continue;
      }
      // &<code>
      if (ch === "&" && i + 1 < text.length) {
        var code = text[i + 1].toLowerCase();
        if (MC_COLORS[code]) { flush(); state.color = MC_COLORS[code]; state.b = state.i = state.u = state.s = false; i++; continue; }
        if (code === "l") { flush(); state.b = true; i++; continue; }
        if (code === "o") { flush(); state.i = true; i++; continue; }
        if (code === "n") { flush(); state.u = true; i++; continue; }
        if (code === "m") { flush(); state.s = true; i++; continue; }
        if (code === "r") { flush(); state = { color: fallbackColor || "#e8eaf0", b: false, i: false, u: false, s: false }; i++; continue; }
        if (code === "k") { i++; continue; } // obfuscated: skip the code, show nothing special
      }
      buffer += ch;
    }
    flush();
    return out || '<span style="color:' + (fallbackColor || "#e8eaf0") + '"></span>';
  }

  // ---------- State ----------
  var state = defaultState();

  function defaultState() {
    return {
      id: "menus/main",
      title: "&d&lMain Menu",
      external: "&dMenu",
      type: "multi_action",
      columns: 2,
      after: "close",
      escape: true,
      body: ["&7Welcome, &f%player_name%&7."],
      buttons: []
    };
  }

  function exampleState() {
    return {
      id: "menus/main",
      title: "&d&lMain Menu",
      external: "&dMenu",
      type: "multi_action",
      columns: 2,
      after: "close",
      escape: true,
      body: ["&7Welcome, &f%player_name%&7. Pick an option below."],
      buttons: [
        { label: "&bProfile", tooltip: "Open your profile", width: 150, permission: "",
          actions: [{ type: "dialog", value: "example/dialog/simple" }] },
        { label: "&bTeleport", tooltip: "Go to spawn", width: 150, permission: "",
          actions: [{ type: "player", value: "spawn" }, { type: "close", value: "" }] },
        { label: "&eDaily reward", tooltip: "Claim your reward", width: 150, permission: "",
          actions: [{ type: "console", value: "give %player_name% diamond 1" },
                    { type: "message", value: "&aYou claimed a diamond!" }] },
        { label: "&cAdmin panel", tooltip: "Staff only", width: 150, permission: "customdialogs.menu.admin",
          actions: [{ type: "dialog", value: "example/dialog/confirm" }] }
      ]
    };
  }

  function newButton() {
    return { label: "&aButton", tooltip: "", width: 150, permission: "", actions: [] };
  }

  // ---------- DOM refs ----------
  var $ = function (id) { return document.getElementById(id); };
  var bodyList = $("body-list"), buttonList = $("button-list");
  var bodyEmpty = $("body-empty"), buttonEmpty = $("button-empty");

  // ---------- Persistence ----------
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { var s = JSON.parse(raw); if (s && typeof s === "object") return s; }
    } catch (e) {}
    return null;
  }

  // ---------- Settings binding ----------
  function bindSettings() {
    $("f-id").addEventListener("input", function () { state.id = this.value; update(); });
    $("f-title").addEventListener("input", function () { state.title = this.value; update(); });
    $("f-external").addEventListener("input", function () { state.external = this.value; update(); });
    $("f-type").addEventListener("change", function () { state.type = this.value; syncTypeUi(); update(); });
    $("f-columns").addEventListener("input", function () { state.columns = clampInt(this.value, 1, 8, 2); update(); });
    $("f-after").addEventListener("change", function () { state.after = this.value; update(); });
    $("f-escape").addEventListener("change", function () { state.escape = this.checked; update(); });
  }

  function fillSettings() {
    $("f-id").value = state.id;
    $("f-title").value = state.title;
    $("f-external").value = state.external;
    $("f-type").value = state.type;
    $("f-columns").value = state.columns;
    $("f-after").value = state.after;
    $("f-escape").checked = !!state.escape;
    syncTypeUi();
  }

  function syncTypeUi() {
    $("columns-field").style.display = state.type === "multi_action" ? "" : "none";
    $("type-note").textContent = TYPE_NOTES[state.type] || "";
  }

  function clampInt(v, min, max, dflt) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return dflt;
    return Math.max(min, Math.min(max, n));
  }

  // ---------- Body list ----------
  function renderBody() {
    bodyList.innerHTML = "";
    state.body.forEach(function (line, idx) { bodyList.appendChild(bodyRow(line, idx)); });
    bodyEmpty.style.display = state.body.length ? "none" : "";
  }

  function bodyRow(line, idx) {
    var node = $("tpl-body-line").content.firstElementChild.cloneNode(true);
    var input = node.querySelector(".js-line");
    input.value = line;
    input.addEventListener("input", function () { state.body[idx] = this.value; updatePreviewOnly(); });
    node.querySelector(".js-up").addEventListener("click", function () { move(state.body, idx, -1); renderBody(); update(); });
    node.querySelector(".js-down").addEventListener("click", function () { move(state.body, idx, 1); renderBody(); update(); });
    node.querySelector(".js-del").addEventListener("click", function () { state.body.splice(idx, 1); renderBody(); update(); });
    return node;
  }

  // ---------- Buttons ----------
  function renderButtons() {
    buttonList.innerHTML = "";
    state.buttons.forEach(function (btn, idx) { buttonList.appendChild(buttonCard(btn, idx)); });
    buttonEmpty.style.display = state.buttons.length ? "none" : "";
  }

  function buttonCard(btn, idx) {
    var node = $("tpl-button").content.firstElementChild.cloneNode(true);
    node.querySelector(".js-badge").textContent = "Button " + (idx + 1);

    var label = node.querySelector(".js-label");
    label.value = btn.label;
    label.addEventListener("input", function () { btn.label = this.value; updatePreviewOnly(); });

    var tooltip = node.querySelector(".js-tooltip");
    tooltip.value = btn.tooltip || "";
    tooltip.addEventListener("input", function () { btn.tooltip = this.value; updateYamlOnly(); });

    var width = node.querySelector(".js-width");
    width.value = btn.width;
    width.addEventListener("input", function () { btn.width = clampInt(this.value, 1, 1024, 150); updatePreviewOnly(); });

    var perm = node.querySelector(".js-perm");
    perm.value = btn.permission || "";
    perm.addEventListener("input", function () { btn.permission = this.value; updateYamlOnly(); });

    node.querySelector(".js-bup").addEventListener("click", function () { move(state.buttons, idx, -1); renderButtons(); update(); });
    node.querySelector(".js-bdown").addEventListener("click", function () { move(state.buttons, idx, 1); renderButtons(); update(); });
    node.querySelector(".js-bdel").addEventListener("click", function () { state.buttons.splice(idx, 1); renderButtons(); update(); });

    var actionsWrap = node.querySelector(".js-actions");
    var actionsEmpty = node.querySelector(".js-actions-empty");
    renderActions(actionsWrap, actionsEmpty, btn);

    node.querySelector(".js-add-action").addEventListener("click", function () {
      btn.actions.push({ type: "message", value: "" });
      renderActions(actionsWrap, actionsEmpty, btn);
      update();
    });

    return node;
  }

  function renderActions(wrap, emptyEl, btn) {
    wrap.innerHTML = "";
    btn.actions.forEach(function (act, aIdx) { wrap.appendChild(actionRow(act, aIdx, btn, wrap, emptyEl)); });
    emptyEl.style.display = btn.actions.length ? "none" : "";
  }

  function actionRow(act, aIdx, btn, wrap, emptyEl) {
    var node = $("tpl-action").content.firstElementChild.cloneNode(true);
    var typeSel = node.querySelector(".js-atype");
    ACTION_TYPES.forEach(function (t) {
      var opt = document.createElement("option");
      opt.value = t.v; opt.textContent = t.label; typeSel.appendChild(opt);
    });
    typeSel.value = act.type;

    var valueInput = node.querySelector(".js-avalue");
    var meta = actionMeta(act.type);
    valueInput.value = act.value || "";
    valueInput.placeholder = meta.hint;
    node.classList.toggle("action-row--novalue", !meta.needsValue);

    typeSel.addEventListener("change", function () {
      act.type = this.value;
      var m = actionMeta(act.type);
      valueInput.placeholder = m.hint;
      node.classList.toggle("action-row--novalue", !m.needsValue);
      updateYamlOnly();
    });
    valueInput.addEventListener("input", function () { act.value = this.value; updateYamlOnly(); });
    node.querySelector(".js-adel").addEventListener("click", function () {
      btn.actions.splice(aIdx, 1); renderActions(wrap, emptyEl, btn); update();
    });
    return node;
  }

  function move(arr, idx, delta) {
    var to = idx + delta;
    if (to < 0 || to >= arr.length) return;
    var tmp = arr[idx]; arr[idx] = arr[to]; arr[to] = tmp;
  }

  // ---------- Preview ----------
  function renderPreview() {
    var el = $("mc-preview");
    var html = "";
    if (state.external.trim()) html += '<div class="mc-ext">' + renderMc(state.external, "#9aa2b1") + "</div>";
    html += '<div class="mc-title">' + renderMc(state.title, "#ffffff") + "</div>";

    if (state.body.length) {
      html += '<div class="mc-body">';
      state.body.forEach(function (line) { html += '<div class="mc-body__line">' + renderMc(line, "#d7dbe2") + "</div>"; });
      html += "</div>";
    }

    var visible = state.buttons; // preview shows all (permissions are per-player at runtime)
    if (visible.length) {
      var cols = state.type === "multi_action" ? Math.max(1, state.columns)
               : state.type === "confirmation" ? 2 : 1;
      html += '<div class="mc-buttons" style="grid-template-columns:repeat(' + cols + ',1fr)">';
      visible.forEach(function (b) {
        var w = Math.max(1, Math.min(1024, b.width || 150));
        var minw = Math.round(Math.max(80, Math.min(260, w * 0.9)));
        var tip = b.tooltip ? ' title="' + b.tooltip.replace(/&[0-9a-fk-orA-FK-OR#]/g, "").replace(/"/g, "&quot;") + '"' : "";
        html += '<div class="mc-btn" style="min-width:' + minw + 'px"' + tip + ">" + renderMc(b.label, "#ffffff") + "</div>";
      });
      html += "</div>";
    } else {
      html += '<div class="mc-empty">Add a button to see it here.</div>';
    }
    el.innerHTML = html;
  }

  // ---------- YAML ----------
  function q(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }

  function actionLine(act) {
    var meta = actionMeta(act.type);
    if (!meta.needsValue) return "[" + meta.tag + "]";
    return ("[" + meta.tag + "] " + (act.value || "")).trim();
  }

  function genYaml() {
    var L = [];
    L.push("title: " + q(state.title));
    if (state.external.trim()) L.push("external-title: " + q(state.external));
    L.push("type: " + state.type);
    if (state.type === "multi_action") L.push("columns: " + Math.max(1, state.columns));
    if (state.after !== "close") L.push("after-action: " + state.after);
    L.push("can-close-with-escape: " + (state.escape ? "true" : "false"));

    if (state.body.length) {
      L.push("body:");
      state.body.forEach(function (line) { L.push("  - " + q(line)); });
    }

    if (state.buttons.length) {
      L.push("buttons:");
      state.buttons.forEach(function (b) {
        L.push("  - label: " + q(b.label));
        if (b.tooltip && b.tooltip.trim()) L.push("    tooltip: " + q(b.tooltip));
        L.push("    width: " + Math.max(1, Math.min(1024, b.width || 150)));
        if (b.permission && b.permission.trim()) L.push("    permission: " + q(b.permission));
        if (b.actions.length) {
          L.push("    actions:");
          b.actions.forEach(function (a) { L.push("      - " + q(actionLine(a))); });
        }
      });
    }
    return L.join("\n") + "\n";
  }

  function fileName() {
    var id = (state.id || "dialog").trim().replace(/\.yml$/i, "");
    var seg = id.split("/").filter(Boolean).pop() || "dialog";
    return seg.replace(/[^a-zA-Z0-9._-]/g, "_") + ".yml";
  }
  function targetFolder() {
    var id = (state.id || "").trim().replace(/\.yml$/i, "");
    var parts = id.split("/").filter(Boolean);
    parts.pop();
    var sub = parts.length ? parts.join("/") + "/" : "";
    return "plugins/CustomDialogs/dialogs/" + sub;
  }

  // ---------- Update orchestration ----------
  function renderYaml() {
    $("yaml-out").textContent = genYaml();
    $("yaml-filename").textContent = fileName();
    $("yaml-path").textContent = "→ " + targetFolder();
    $("path-hint").textContent = "Downloads as " + fileName() + " — place it in " + targetFolder();
  }
  function update() { renderPreview(); renderYaml(); save(); }
  function updatePreviewOnly() { renderPreview(); renderYaml(); save(); }
  function updateYamlOnly() { renderYaml(); save(); }

  // ---------- Top bar actions ----------
  function download() {
    var blob = new Blob([genYaml()], { type: "text/yaml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copyYaml() {
    var text = genYaml();
    var btn = $("btn-copy"), original = btn.textContent;
    function done() { btn.textContent = "Copied!"; setTimeout(function () { btn.textContent = original; }, 1200); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else { fallback(); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      ta.remove();
    }
  }

  function loadState(newState) {
    state = newState;
    // Backfill any missing fields from defaults.
    var d = defaultState();
    for (var k in d) if (!(k in state)) state[k] = d[k];
    state.buttons = (state.buttons || []).map(function (b) {
      return { label: b.label || "", tooltip: b.tooltip || "", width: b.width || 150,
               permission: b.permission || "", actions: (b.actions || []).map(function (a) {
                 return { type: a.type || "message", value: a.value || "" }; }) };
    });
    fillSettings(); renderBody(); renderButtons(); update();
  }

  // ---------- Toast ----------
  var toastTimer = null;
  function toast(msg, isError) {
    var el = $("toast");
    el.textContent = msg; el.hidden = false;
    el.classList.toggle("toast--error", !!isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2800);
  }

  // ---------- YAML parser (focused on the dialog schema) ----------
  function parseScalar(raw) {
    if (raw == null) return "";
    var s = String(raw).trim();
    if (s === "") return "";
    if (s.charAt(0) === '"') {
      var out = "", esc = false;
      for (var i = 1; i < s.length; i++) {
        var c = s.charAt(i);
        if (esc) { out += (c === "n" ? "\n" : c === "t" ? "\t" : c); esc = false; }
        else if (c === "\\") { esc = true; }
        else if (c === '"') { break; }
        else out += c;
      }
      return out;
    }
    if (s.charAt(0) === "'") {
      var res = "", j = 1;
      while (j < s.length) {
        var ch = s.charAt(j);
        if (ch === "'") { if (s.charAt(j + 1) === "'") { res += "'"; j += 2; continue; } break; }
        res += ch; j++;
      }
      return res;
    }
    var hash = s.indexOf(" #"); if (hash >= 0) s = s.slice(0, hash).trim();
    return s;
  }

  function parseActionLine(value) {
    var str = String(value);
    var m = str.match(/^\s*\[([^\]]+)\]\s*([\s\S]*)$/);
    var map = { player: "player", run: "player", cmd: "player", command: "player",
      console: "console", sudo: "console", op: "op", opcommand: "op",
      dialog: "dialog", open: "dialog", close: "close",
      message: "message", msg: "message", tell: "message",
      broadcast: "broadcast", announce: "broadcast" };
    if (m) { var t = map[m[1].trim().toLowerCase()]; if (t) return { type: t, value: t === "close" ? "" : m[2].trim() }; }
    return { type: "player", value: str.trim() };
  }

  function buildButtonFromPending(pending) {
    var btn = { label: "", tooltip: "", width: 150, permission: "", actions: [] };
    for (var p = 0; p < pending.length; p++) {
      var t = pending[p];
      var listMatch = t.match(/^(actions|messages):\s*$/);
      if (listMatch) {
        var isMsg = listMatch[1] === "messages";
        var q = p + 1;
        while (q < pending.length) {
          var am = pending[q].match(/^-\s*([\s\S]*)$/);
          if (!am) break;
          var v = parseScalar(am[1]);
          btn.actions.push(isMsg ? { type: "message", value: v } : parseActionLine(v));
          q++;
        }
        p = q - 1; continue;
      }
      var kv = t.match(/^([A-Za-z0-9_-]+):([\s\S]*)$/);
      if (!kv) continue;
      var k = kv[1], val = parseScalar(kv[2]);
      if (k === "label") btn.label = val;
      else if (k === "tooltip") btn.tooltip = val;
      else if (k === "width") btn.width = parseInt(val, 10) || 150;
      else if (k === "permission") btn.permission = val;
      else if (k === "message") btn.actions.push({ type: "message", value: val });
      else if (k === "command") btn.actions.push({ type: "player", value: val });
    }
    return btn;
  }

  function parseYaml(text) {
    var lines = String(text).split(/\r?\n/);
    var st = { id: "", title: "", external: "", type: "multi_action", columns: 2,
      after: "close", escape: true, body: [], buttons: [] };
    var indent = function (l) { return l.match(/^ */)[0].length; };
    var skip = function (l) { var t = l.trim(); return t === "" || t.charAt(0) === "#"; };
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (skip(line) || indent(line) !== 0) { i++; continue; }
      var m = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
      if (!m) { i++; continue; }
      var key = m[1];

      if (key === "body") {
        i++; var arr = [];
        while (i < lines.length) {
          var bl = lines[i];
          if (skip(bl)) { i++; continue; }
          if (indent(bl) === 0) break;
          var im = bl.trim().match(/^-\s*([\s\S]*)$/);
          if (!im) break;
          arr.push(parseScalar(im[1])); i++;
        }
        st.body = arr; continue;
      }

      if (key === "buttons") {
        i++; var btns = [];
        while (i < lines.length) {
          var l = lines[i];
          if (skip(l)) { i++; continue; }
          if (indent(l) === 0) break;
          if (l.trim().charAt(0) !== "-") { i++; continue; }
          var base = indent(l);
          var first = l.trim().replace(/^-\s*/, "");
          var pending = []; if (first) pending.push(first);
          i++;
          while (i < lines.length) {
            var nl = lines[i];
            if (skip(nl)) { i++; continue; }
            if (indent(nl) <= base) break;
            pending.push(nl.trim()); i++;
          }
          btns.push(buildButtonFromPending(pending));
        }
        st.buttons = btns; continue;
      }

      var val = parseScalar(m[2]);
      if (key === "title") st.title = val;
      else if (key === "external-title") st.external = val;
      else if (key === "type") st.type = (val === "notice" || val === "confirmation") ? val : "multi_action";
      else if (key === "columns") st.columns = parseInt(val, 10) || 2;
      else if (key === "after-action") st.after = (val === "none" || val === "wait") ? val : "close";
      else if (key === "can-close-with-escape") st.escape = (val === "true");
      i++;
    }
    return st;
  }

  // ---------- File System explorer ----------
  var fsSupported = !!window.showDirectoryPicker;
  var fsState = { dirHandle: null, tree: null, currentPath: null };

  async function openFolder() {
    if (!fsSupported) { toast("The folder explorer needs Chrome or Edge (File System Access API).", true); return; }
    try {
      var handle = await window.showDirectoryPicker({ id: "customdialogs-dialogs", mode: "readwrite" });
      fsState.dirHandle = handle;
      $("ex-folder").hidden = false; $("ex-folder").textContent = handle.name;
      $("ex-refresh").hidden = false; $("btn-save").hidden = false;
      $("ex-hint").textContent = "Click a dialog to edit it, then Save to folder.";
      await refreshTree();
    } catch (e) { if (e && e.name !== "AbortError") toast("Could not open folder: " + e.message, true); }
  }

  async function scanDir(dirHandle, path) {
    var node = { name: dirHandle.name, path: path, dirs: [], files: [] };
    var entries = [];
    for await (var entry of dirHandle.values()) entries.push(entry);
    entries.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (var k = 0; k < entries.length; k++) {
      var h = entries[k];
      var rel = path ? path + "/" + h.name : h.name;
      if (h.kind === "directory") {
        node.dirs.push(await scanDir(h, rel));
      } else if (h.kind === "file" && /\.ya?ml$/i.test(h.name)) {
        node.files.push({ name: h.name, path: rel, id: rel.replace(/\.ya?ml$/i, ""), handle: h });
      }
    }
    return node;
  }

  async function refreshTree() {
    try { fsState.tree = await scanDir(fsState.dirHandle, ""); renderTree(); }
    catch (e) { toast("Scan failed: " + e.message, true); }
  }

  function countFiles(node) {
    var n = node.files.length;
    node.dirs.forEach(function (d) { n += countFiles(d); });
    return n;
  }

  function renderTree() {
    var container = $("ex-tree"); container.innerHTML = "";
    if (!fsState.tree) return;
    if (countFiles(fsState.tree) === 0) {
      container.innerHTML = '<p class="tree__empty">No .yml dialogs in this folder yet. Build one and Save to folder.</p>';
      return;
    }
    container.appendChild(buildTreeGroup(fsState.tree));
  }

  function buildTreeGroup(node) {
    var ul = document.createElement("ul"); ul.className = "tree__group";
    node.dirs.forEach(function (dir) {
      var li = document.createElement("li");
      var head = document.createElement("div");
      head.className = "tree__folder";
      var twist = document.createElement("span"); twist.className = "tree__twist"; twist.innerHTML = "&#9660;";
      var name = document.createElement("span"); name.textContent = dir.name;
      head.appendChild(twist); head.appendChild(name);
      var child = buildTreeGroup(dir);
      head.addEventListener("click", function () {
        var collapsed = head.classList.toggle("tree__folder--collapsed");
        child.style.display = collapsed ? "none" : "";
      });
      li.appendChild(head); li.appendChild(child); ul.appendChild(li);
    });
    node.files.forEach(function (file) {
      var li = document.createElement("li");
      var f = document.createElement("div");
      f.className = "tree__file" + (fsState.currentPath === file.path ? " tree__file--active" : "");
      f.textContent = file.name.replace(/\.ya?ml$/i, "");
      f.title = file.id;
      f.addEventListener("click", function () { openFile(file); });
      li.appendChild(f); ul.appendChild(li);
    });
    return ul;
  }

  async function openFile(file) {
    try {
      var f = await file.handle.getFile();
      var text = await f.text();
      var parsed = parseYaml(text);
      parsed.id = file.id;
      fsState.currentPath = file.path;
      loadState(parsed);
      renderTree();
      toast("Opened " + file.name);
    } catch (e) { toast("Could not open " + file.name + ": " + e.message, true); }
  }

  async function ensureDir(root, parts) {
    var d = root;
    for (var i = 0; i < parts.length; i++) d = await d.getDirectoryHandle(parts[i], { create: true });
    return d;
  }

  async function ensurePermission(handle) {
    var opts = { mode: "readwrite" };
    if (!handle.queryPermission) return "granted";
    var p = await handle.queryPermission(opts);
    if (p === "granted") return "granted";
    return await handle.requestPermission(opts);
  }

  async function saveToFolder() {
    if (!fsState.dirHandle) { toast("Open a folder first, or use Download .yml.", true); return; }
    try {
      if (await ensurePermission(fsState.dirHandle) !== "granted") { toast("Write permission denied.", true); return; }
      var id = (state.id || "dialog").trim().replace(/\.ya?ml$/i, "");
      var parts = id.split("/").filter(Boolean);
      var fname = (parts.pop() || "dialog").replace(/[^a-zA-Z0-9._-]/g, "_") + ".yml";
      var dir = await ensureDir(fsState.dirHandle, parts);
      var fh = await dir.getFileHandle(fname, { create: true });
      var w = await fh.createWritable();
      await w.write(genYaml()); await w.close();
      fsState.currentPath = (parts.length ? parts.join("/") + "/" : "") + fname;
      await refreshTree();
      toast("Saved " + fname);
    } catch (e) { toast("Save failed: " + e.message, true); }
  }

  // ---------- Init ----------
  function init() {
    bindSettings();
    $("add-line").addEventListener("click", function () { state.body.push(""); renderBody(); update(); });
    $("add-button").addEventListener("click", function () { state.buttons.push(newButton()); renderButtons(); update(); });
    $("btn-download").addEventListener("click", download);
    $("btn-copy").addEventListener("click", copyYaml);
    $("btn-example").addEventListener("click", function () { fsState.currentPath = null; loadState(exampleState()); if (fsState.tree) renderTree(); });
    $("btn-reset").addEventListener("click", function () {
      if (confirm("Start a new, empty dialog? Your current one will be cleared.")) {
        fsState.currentPath = null; loadState(defaultState()); if (fsState.tree) renderTree();
      }
    });
    $("ex-open").addEventListener("click", openFolder);
    $("ex-refresh").addEventListener("click", function () { if (fsState.dirHandle) refreshTree(); });
    $("btn-save").addEventListener("click", saveToFolder);
    if (!fsSupported) $("ex-hint").textContent = "Tip: open in Chrome or Edge to browse and save your dialogs folder directly.";

    var saved = load();
    loadState(saved || exampleState());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
