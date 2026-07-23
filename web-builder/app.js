/* ============================================================
   CustomDialogs Builder — node editor (Drawflow)
   Static, single vendored dependency (Drawflow, MIT).
   The graph is the editor; a plain `state` object is derived
   from it and fed to the (unchanged) YAML generator + preview.

   Node kinds & wiring:
     dialog   (0 in, 1 out)  root: settings + body
     button   (1 in, 0 out)  a dialog button + its actions
     step     (1 in, 1 out)  a conversation step (NPC line)
     response (1 in, 1 out)  a step's response; its out edge = goto

     dialog.out  -> button.in      (multi_action / notice / confirmation)
     dialog.out  -> step.in        (the start step, for conversation)
     step.out    -> response.in    (that step's responses)
     response.out-> step.in        (goto target; unconnected = next / end)
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "customdialogs-builder-v2";

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

  var DEFAULT_CONV = {
    playerName: "%player_name%",
    npcFormat: "&6{name}&7: &f{message}",
    playerFormat: "&b{name}&7: &7{message}",
    endLabel: "&7Close",
    history: 0
  };

  var INPUT_TYPES = [
    { v: "text",          label: "Text" },
    { v: "bool",          label: "Boolean" },
    { v: "single_option", label: "Single option" },
    { v: "number_range",  label: "Number range" }
  ];

  // ---------- Minecraft color/format parser (preview) ----------
  var MC_COLORS = {
    "0": "#000000", "1": "#0000AA", "2": "#00AA00", "3": "#00AAAA",
    "4": "#AA0000", "5": "#AA00AA", "6": "#FFAA00", "7": "#AAAAAA",
    "8": "#555555", "9": "#5555FF", "a": "#55FF55", "b": "#55FFFF",
    "c": "#FF5555", "d": "#FF55FF", "e": "#FFFF55", "f": "#FFFFFF"
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  // For values placed inside HTML attributes (value="...").
  function attr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }

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
      if ((ch === "&" && text[i + 1] === "#" && /^[0-9a-fA-F]{6}$/.test(text.substr(i + 2, 6)))) {
        flush(); state.color = "#" + text.substr(i + 2, 6); state.b = state.i = state.u = state.s = false; i += 7; continue;
      }
      if (ch === "#" && /^[0-9a-fA-F]{6}$/.test(text.substr(i + 1, 6))) {
        flush(); state.color = "#" + text.substr(i + 1, 6); state.b = state.i = state.u = state.s = false; i += 6; continue;
      }
      if (ch === "&" && i + 1 < text.length) {
        var code = text[i + 1].toLowerCase();
        if (MC_COLORS[code]) { flush(); state.color = MC_COLORS[code]; state.b = state.i = state.u = state.s = false; i++; continue; }
        if (code === "l") { flush(); state.b = true; i++; continue; }
        if (code === "o") { flush(); state.i = true; i++; continue; }
        if (code === "n") { flush(); state.u = true; i++; continue; }
        if (code === "m") { flush(); state.s = true; i++; continue; }
        if (code === "r") { flush(); state = { color: fallbackColor || "#e8eaf0", b: false, i: false, u: false, s: false }; i++; continue; }
        if (code === "k") { i++; continue; }
      }
      buffer += ch;
    }
    flush();
    return out || '<span style="color:' + (fallbackColor || "#e8eaf0") + '"></span>';
  }

  // ---------- Derived state (source for YAML + preview) ----------
  var state = defaultState();

  function defaultState() {
    return {
      id: "menus/main", title: "&d&lMain Menu", external: "&dMenu",
      type: "multi_action", columns: 2, after: "close", escape: true,
      body: ["&7Welcome, &f%player_name%&7."], buttons: [], inputs: [], conversation: defaultConversation()
    };
  }

  function newInput() {
    return { type: "text", key: "field", label: "&7Field", width: 0,
      initial: "", maxLength: 0, multiline: false,
      initialBool: false, onTrue: "true", onFalse: "false",
      start: 0, end: 10, step: 0, initialNumber: 0, labelFormat: "",
      options: [{ id: "option", display: "&fOption", def: true }] };
  }
  function defaultConversation() {
    return { playerName: DEFAULT_CONV.playerName, npcFormat: DEFAULT_CONV.npcFormat,
      playerFormat: DEFAULT_CONV.playerFormat, endLabel: DEFAULT_CONV.endLabel, history: 0, steps: [] };
  }
  function newButton() { return { label: "&aButton", tooltip: "", width: 150, permission: "", actions: [] }; }
  function newStep() { return { id: "", speaker: "Villager", text: "Hello there, {player}!", responses: [] }; }
  function newResponse() { return { label: "&aContinue", say: "", silent: false, goto: "", width: 200, tooltip: "", actions: [] }; }

  function exampleState() {
    return {
      id: "menus/main", title: "&d&lMain Menu", external: "&dMenu",
      type: "multi_action", columns: 2, after: "close", escape: true,
      body: ["&7Welcome, &f%player_name%&7. Pick an option below."],
      buttons: [
        { label: "&bProfile", tooltip: "Open your profile", width: 150, permission: "",
          actions: [{ type: "dialog", value: "example/dialog/simple" }] },
        { label: "&bTeleport", tooltip: "Go to spawn", width: 150, permission: "",
          actions: [{ type: "player", value: "spawn" }, { type: "close", value: "" }] },
        { label: "&eDaily reward", tooltip: "Claim your reward", width: 150, permission: "",
          actions: [{ type: "console", value: "give %player_name% diamond 1" }, { type: "message", value: "&aYou claimed a diamond!" }] },
        { label: "&cAdmin panel", tooltip: "Staff only", width: 150, permission: "customdialogs.menu.admin",
          actions: [{ type: "dialog", value: "example/dialog/confirm" }] }
      ],
      conversation: defaultConversation()
    };
  }
  function conversationExample() {
    return {
      id: "example/dialog/conversation", title: "&6&lVillager", external: "&6Villager",
      type: "conversation", columns: 1, after: "close", escape: true,
      body: ["&8» You strike up a conversation.", ""],
      buttons: [],
      conversation: {
        playerName: "%player_name%", npcFormat: "&6{name}&7: &f{message}", playerFormat: "&b{name}&7: &7{message}",
        endLabel: "&7Close", history: 0,
        steps: [
          { id: "start", speaker: "Villager", text: "Hello there, {player}! What brings you here?", responses: [
            { label: "&aJust exploring.", say: "Just exploring the area.", silent: false, goto: "friendly", width: 200, tooltip: "", actions: [] },
            { label: "&eGot any work?", say: "Do you have any work for me?", silent: false, goto: "work", width: 200, tooltip: "", actions: [] },
            { label: "&cNone of your business.", say: "None of your business.", silent: false, goto: "rude", width: 200, tooltip: "", actions: [] }
          ] },
          { id: "friendly", speaker: "Villager", text: "Wonderful! Take this for the road.", responses: [
            { label: "&aThank you!", say: "Thanks!", silent: false, goto: "", width: 200, tooltip: "",
              actions: [{ type: "console", value: "give %player_name% bread 3" }, { type: "close", value: "" }] }
          ] },
          { id: "work", speaker: "Villager", text: "The fields need tending. Interested?", responses: [
            { label: "&aI'll help.", say: "Sure, I'll help.", silent: false, goto: "friendly", width: 200, tooltip: "", actions: [] },
            { label: "&7Maybe later.", say: "Maybe later.", silent: false, goto: "goodbye", width: 200, tooltip: "", actions: [] }
          ] },
          { id: "rude", speaker: "Villager", text: "...well then. Good day to you.", responses: [] },
          { id: "goodbye", speaker: "Villager", text: "Safe travels, {player}.", responses: [
            { label: "&7Goodbye", say: "Goodbye.", silent: false, goto: "", width: 200, tooltip: "", actions: [] }
          ] }
        ]
      }
    };
  }

  function normalizeState(s) {
    var d = defaultState();
    s = s || {};
    for (var k in d) if (!(k in s)) s[k] = d[k];
    s.body = (s.body || []).slice();
    s.buttons = (s.buttons || []).map(function (b) {
      return { label: b.label || "", tooltip: b.tooltip || "", width: b.width || 150, permission: b.permission || "",
        actions: (b.actions || []).map(function (a) { return { type: a.type || "message", value: a.value || "" }; }) };
    });
    s.inputs = (s.inputs || []).map(normalizeInput);
    var c = s.conversation || {};
    s.conversation = {
      playerName: c.playerName != null ? c.playerName : DEFAULT_CONV.playerName,
      npcFormat: c.npcFormat || DEFAULT_CONV.npcFormat,
      playerFormat: c.playerFormat || DEFAULT_CONV.playerFormat,
      endLabel: c.endLabel != null ? c.endLabel : DEFAULT_CONV.endLabel,
      history: parseInt(c.history, 10) || 0,
      steps: (c.steps || []).map(function (st) {
        return { id: st.id || "", speaker: st.speaker || "", text: st.text || "",
          responses: (st.responses || []).map(function (r) {
            return { label: r.label || "", say: r.say != null ? r.say : "", silent: !!r.silent, goto: r.goto || "",
              width: r.width || 200, tooltip: r.tooltip || "",
              actions: (r.actions || []).map(function (a) { return { type: a.type || "message", value: a.value || "" }; }) };
          }) };
      })
    };
    return s;
  }

  function normalizeInput(i) {
    i = i || {};
    return {
      type: i.type || "text", key: i.key || "", label: i.label || "", width: i.width || 0,
      initial: i.initial != null ? i.initial : "", maxLength: i.maxLength || 0, multiline: !!i.multiline,
      initialBool: !!i.initialBool, onTrue: i.onTrue != null ? i.onTrue : "true", onFalse: i.onFalse != null ? i.onFalse : "false",
      start: num(i.start, 0), end: num(i.end, 10), step: num(i.step, 0), initialNumber: num(i.initialNumber, 0),
      labelFormat: i.labelFormat || "",
      options: (i.options || []).map(function (o) { return { id: o.id || "", display: o.display || "", def: !!o.def }; })
    };
  }
  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }

  // ---------- DOM refs ----------
  var $ = function (id) { return document.getElementById(id); };

  // ---------- Persistence ----------
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try { var raw = localStorage.getItem(STORAGE_KEY); if (raw) { var s = JSON.parse(raw); if (s && typeof s === "object") return s; } } catch (e) {}
    return null;
  }

  function clampInt(v, min, max, dflt) { var n = parseInt(v, 10); if (isNaN(n)) return dflt; return Math.max(min, Math.min(max, n)); }

  /* ============================================================
     NODE GRAPH (Drawflow)
     ============================================================ */
  var editor = null;
  var building = false;   // suppress refreshes while (re)building the graph

  function nodeData(id) {
    var n = editor.drawflow.drawflow.Home.data[id];
    return n ? n.data : {};
  }

  // ----- HTML builders -----
  function opt(value, label, sel) {
    return '<option value="' + attr(value) + '"' + (value === sel ? " selected" : "") + ">" + escapeHtml(label) + "</option>";
  }
  function typeOptions(sel) {
    return opt("multi_action", "multi_action", sel) + opt("notice", "notice", sel)
      + opt("confirmation", "confirmation", sel) + opt("conversation", "conversation", sel);
  }
  function afterOptions(sel) {
    return opt("close", "close", sel) + opt("none", "none (stay open)", sel) + opt("wait", "wait", sel);
  }

  function dialogNodeHtml(d) {
    return '' +
      '<div class="nd nd--dialog">' +
        '<div class="nd__title">Dialog <span class="nd__type-badge" data-badge></span></div>' +
        f("Id / path", '<input class="nd-i" data-k="id" spellcheck="false" value="' + attr(d.id) + '">') +
        f("Title", '<input class="nd-i" data-k="title" spellcheck="false" value="' + attr(d.title) + '">') +
        f("External title", '<input class="nd-i" data-k="external" spellcheck="false" value="' + attr(d.external) + '">') +
        '<div class="nd__row">' +
          f("Type", '<select class="nd-i" data-k="type">' + typeOptions(d.type) + '</select>') +
          '<div class="nd__f nd-colwrap">' + lbl("Columns") + '<input class="nd-i" type="number" min="1" max="8" data-k="columns" value="' + (d.columns || 2) + '"></div>' +
        '</div>' +
        '<div class="nd__row">' +
          f("After", '<select class="nd-i" data-k="after">' + afterOptions(d.after) + '</select>') +
          '<label class="nd__chk"><input type="checkbox" class="nd-i" data-k="escape"' + (d.escape ? " checked" : "") + '> ESC closes</label>' +
        '</div>' +
        '<div class="nd-conv">' +
          f("Close button (terminal step)", '<input class="nd-i" data-k="endLabel" spellcheck="false" value="' + attr(d.endLabel) + '">') +
          '<div class="nd__hint">Player name, the NPC/player line formats and the history limit are <b>global</b> — set them in the <code>conversation</code> section of config.yml.</div>' +
        '</div>' +
        '<div class="nd__list-h"><span data-body-label>Body</span><button class="nd-mini" data-add-body type="button">+ line</button></div>' +
        '<div class="nd-body-list" data-body-list></div>' +
      '</div>';
  }
  function buttonNodeHtml(d) {
    return '' +
      '<div class="nd nd--button">' +
        '<div class="nd__title">Button</div>' +
        f("Label", '<input class="nd-i" data-k="label" spellcheck="false" value="' + attr(d.label) + '">') +
        '<div class="nd__row">' +
          f("Tooltip", '<input class="nd-i" data-k="tooltip" spellcheck="false" value="' + attr(d.tooltip) + '">') +
          '<div class="nd__f"><span class="nd__lbl">Width</span><input class="nd-i" type="number" min="1" max="1024" data-k="width" value="' + (d.width || 150) + '"></div>' +
        '</div>' +
        f("Permission", '<input class="nd-i" data-k="permission" spellcheck="false" value="' + attr(d.permission) + '">') +
        actionsBlockHtml() +
      '</div>';
  }
  function stepNodeHtml(d) {
    return '' +
      '<div class="nd nd--step">' +
        '<div class="nd__title">Step</div>' +
        '<div class="nd__row">' +
          f("Step id", '<input class="nd-i" data-k="id" spellcheck="false" placeholder="start" value="' + attr(d.id) + '">') +
          f("Speaker", '<input class="nd-i" data-k="speaker" spellcheck="false" value="' + attr(d.speaker) + '">') +
        '</div>' +
        f("NPC line", '<input class="nd-i" data-k="text" spellcheck="false" value="' + attr(d.text) + '">') +
        '<button class="nd-mini nd-mini--wide" data-add-response type="button">+ Response node</button>' +
      '</div>';
  }
  function responseNodeHtml(d) {
    return '' +
      '<div class="nd nd--response">' +
        '<div class="nd__title">Response <span class="nd__goto-hint">out &rarr; goto</span></div>' +
        f("Label", '<input class="nd-i" data-k="label" spellcheck="false" value="' + attr(d.label) + '">') +
        f("Player says (blank = label)", '<input class="nd-i" data-k="say" spellcheck="false"' + (d.silent ? " disabled" : "") + ' value="' + attr(d.say) + '">') +
        '<div class="nd__row">' +
          '<div class="nd__f"><span class="nd__lbl">Width</span><input class="nd-i" type="number" min="1" max="1024" data-k="width" value="' + (d.width || 200) + '"></div>' +
          f("Tooltip", '<input class="nd-i" data-k="tooltip" spellcheck="false" value="' + attr(d.tooltip) + '">') +
        '</div>' +
        '<label class="nd__chk"><input type="checkbox" class="nd-i" data-k="silent"' + (d.silent ? " checked" : "") + '> Silent (no player line)</label>' +
        actionsBlockHtml() +
      '</div>';
  }
  function inputTypeOptions(sel) {
    return INPUT_TYPES.map(function (t) { return opt(t.v, t.label, sel); }).join("");
  }
  function inputNodeHtml(d) {
    return '' +
      '<div class="nd nd--input">' +
        '<div class="nd__title">Input <span class="nd__type-badge" data-ibadge></span></div>' +
        '<div class="nd__row">' +
          f("Type", '<select class="nd-i" data-k="type">' + inputTypeOptions(d.type) + '</select>') +
          f("Key", '<input class="nd-i" data-k="key" spellcheck="false" placeholder="amount" value="' + attr(d.key) + '">') +
        '</div>' +
        '<div class="nd__row">' +
          f("Label", '<input class="nd-i" data-k="label" spellcheck="false" value="' + attr(d.label) + '">') +
          '<div class="nd__f"><span class="nd__lbl">Width (0 = auto)</span><input class="nd-i" type="number" min="0" max="1024" data-k="width" value="' + (d.width || 0) + '"></div>' +
        '</div>' +
        // text
        '<div class="ig ig-text">' +
          f("Initial text", '<input class="nd-i" data-k="initial" spellcheck="false" value="' + attr(d.initial) + '">') +
          '<div class="nd__row">' +
            '<div class="nd__f"><span class="nd__lbl">Max length (0 = none)</span><input class="nd-i" type="number" min="0" max="9999" data-k="maxLength" value="' + (d.maxLength || 0) + '"></div>' +
            '<label class="nd__chk"><input type="checkbox" class="nd-i" data-k="multiline"' + (d.multiline ? " checked" : "") + '> Multiline</label>' +
          '</div>' +
        '</div>' +
        // bool
        '<div class="ig ig-bool">' +
          '<label class="nd__chk"><input type="checkbox" class="nd-i" data-k="initialBool"' + (d.initialBool ? " checked" : "") + '> Checked by default</label>' +
          '<div class="nd__row">' +
            f("Value when true", '<input class="nd-i" data-k="onTrue" spellcheck="false" value="' + attr(d.onTrue) + '">') +
            f("Value when false", '<input class="nd-i" data-k="onFalse" spellcheck="false" value="' + attr(d.onFalse) + '">') +
          '</div>' +
        '</div>' +
        // number range
        '<div class="ig ig-number">' +
          '<div class="nd__row">' +
            '<div class="nd__f"><span class="nd__lbl">Start</span><input class="nd-i" type="number" data-k="start" value="' + d.start + '"></div>' +
            '<div class="nd__f"><span class="nd__lbl">End</span><input class="nd-i" type="number" data-k="end" value="' + d.end + '"></div>' +
          '</div>' +
          '<div class="nd__row">' +
            '<div class="nd__f"><span class="nd__lbl">Step (0 = none)</span><input class="nd-i" type="number" data-k="step" value="' + d.step + '"></div>' +
            '<div class="nd__f"><span class="nd__lbl">Initial</span><input class="nd-i" type="number" data-k="initialNumber" value="' + d.initialNumber + '"></div>' +
          '</div>' +
          f("Label format (optional)", '<input class="nd-i" data-k="labelFormat" spellcheck="false" placeholder="options.generic_value" value="' + attr(d.labelFormat) + '">') +
        '</div>' +
        // single option
        '<div class="ig ig-option">' +
          '<div class="nd__list-h"><span>Options</span><button class="nd-mini" data-add-option type="button">+ option</button></div>' +
          '<div class="nd-option-list" data-option-list></div>' +
        '</div>' +
      '</div>';
  }

  function actionsBlockHtml() {
    return '<div class="nd__list-h"><span>Actions</span><button class="nd-mini" data-add-action type="button">+ action</button></div>' +
      '<div class="nd-action-list" data-action-list></div>';
  }
  function f(label, control) { return '<div class="nd__f">' + lbl(label) + control + "</div>"; }
  function lbl(label) { return '<span class="nd__lbl">' + escapeHtml(label) + "</span>"; }

  // ----- Node creation + listeners -----
  function addDialogNode(d, x, y) {
    var id = editor.addNode("dialog", 0, 1, x, y, "dialog", d, dialogNodeHtml(d));
    attachNode(id, "dialog");
    syncDialogType(id);
    renderBodyList(id);
    return id;
  }
  function addButtonNode(d, x, y) {
    var id = editor.addNode("button", 1, 0, x, y, "button", d, buttonNodeHtml(d));
    attachNode(id, "button");
    renderActionList(id);
    return id;
  }
  function addStepNode(d, x, y) {
    var id = editor.addNode("step", 1, 1, x, y, "step", d, stepNodeHtml(d));
    attachNode(id, "step");
    return id;
  }
  function addResponseNode(d, x, y) {
    var id = editor.addNode("response", 1, 1, x, y, "response", d, responseNodeHtml(d));
    attachNode(id, "response");
    renderActionList(id);
    return id;
  }
  function addInputNode(d, x, y) {
    var id = editor.addNode("input", 1, 0, x, y, "input", d, inputNodeHtml(d));
    attachNode(id, "input");
    syncInputType(id);
    renderOptionList(id);
    return id;
  }

  function attachNode(id, kind) {
    var root = document.getElementById("node-" + id);
    if (!root) return;
    // Keep clicks/keys inside form controls from dragging or deleting the node.
    root.querySelectorAll("input, select, textarea, button").forEach(function (el) {
      el.addEventListener("mousedown", function (e) { e.stopPropagation(); });
      el.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });
      el.addEventListener("keydown", function (e) { e.stopPropagation(); });
    });
    // Scalar/select/checkbox fields.
    root.querySelectorAll(".nd-i[data-k]").forEach(function (el) {
      var ev = (el.tagName === "SELECT" || el.type === "checkbox") ? "change" : "input";
      el.addEventListener(ev, function () {
        var k = el.getAttribute("data-k");
        // Changing the dialog type may need to drop now-incompatible nodes; handle
        // it separately so the change can be confirmed (or reverted) first.
        if (kind === "dialog" && k === "type") { handleDialogTypeChange(id, el); return; }
        var d = nodeData(id);
        if (el.type === "checkbox") d[k] = el.checked;
        else if (el.type === "number") d[k] = clampInt(el.value, parseInt(el.min, 10) || 0, parseInt(el.max, 10) || 9999, d[k] || 0);
        else d[k] = el.value;
        if (kind === "input" && k === "type") syncInputType(id);
        if (kind === "response" && k === "silent") {
          var say = root.querySelector('[data-k="say"]'); if (say) say.disabled = el.checked;
        }
        scheduleRefresh();
      });
    });
    // Buttons: add body line / action / response / option.
    var addBody = root.querySelector("[data-add-body]");
    if (addBody) addBody.addEventListener("click", function () { nodeData(id).body.push(""); renderBodyList(id); scheduleRefresh(); });
    var addAction = root.querySelector("[data-add-action]");
    if (addAction) addAction.addEventListener("click", function () {
      var d = nodeData(id); if (!d.actions) d.actions = []; d.actions.push({ type: "message", value: "" }); renderActionList(id); scheduleRefresh();
    });
    var addResp = root.querySelector("[data-add-response]");
    if (addResp) addResp.addEventListener("click", function () { spawnResponse(id); });
    var addOption = root.querySelector("[data-add-option]");
    if (addOption) addOption.addEventListener("click", function () {
      var d = nodeData(id); if (!d.options) d.options = []; d.options.push({ id: "option", display: "&fOption", def: false }); renderOptionList(id); scheduleRefresh();
    });
  }

  // Enable only the node-adds that make sense for the current dialog type:
  // conversations use steps/responses; every other type uses buttons/inputs.
  function syncToolbar() {
    var t = "multi_action";
    var did = findDialogId();
    if (did != null) t = nodeData(did).type || "multi_action";
    var isConv = t === "conversation";
    setDisabled("add-step", !isConv, "Only for conversation dialogs");
    setDisabled("add-button", isConv, "Not used by conversation dialogs");
    setDisabled("add-input", isConv, "Not used by conversation dialogs");
  }
  function setDisabled(id, disabled, why) {
    var el = $(id);
    if (!el) return;
    el.disabled = disabled;
    el.title = disabled ? why : "";
  }

  function nodesOfKinds(kinds) {
    var data = editor.drawflow.drawflow.Home.data;
    return Object.keys(data).filter(function (k) { return kinds.indexOf(data[k].name) >= 0; });
  }

  /**
   * Applies a Dialog-node type change. When the new type makes existing nodes
   * meaningless (conversation ⇄ regular), it asks to remove them first, and
   * reverts the change if the user declines.
   */
  function handleDialogTypeChange(id, el) {
    var d = nodeData(id);
    var prev = d.type || "multi_action";
    var next = el.value;
    if (next === prev) return;

    var toConversation = next === "conversation";
    // conversation uses steps/responses; every other type uses buttons/inputs.
    var victims = nodesOfKinds(toConversation ? ["button", "input"] : ["step", "response"]);
    if (victims.length) {
      var what = toConversation ? "button/input" : "step/response";
      var msg = "Switching to \"" + next + "\" will delete " + victims.length + " " + what
        + " node" + (victims.length === 1 ? "" : "s") + ", which that type can't use. Continue?";
      if (!window.confirm(msg)) {
        el.value = prev; // revert the dropdown; leave everything untouched
        return;
      }
      building = true;
      victims.forEach(function (nid) { editor.removeNodeId("node-" + nid); });
      building = false;
    }
    d.type = next;
    syncDialogType(id);
    syncToolbar();
    scheduleRefresh();
  }

  function syncInputType(id) {
    var root = document.getElementById("node-" + id);
    if (!root) return;
    var t = nodeData(id).type || "text";
    root.classList.toggle("nd--it-text", t === "text");
    root.classList.toggle("nd--it-bool", t === "bool");
    root.classList.toggle("nd--it-number", t === "number_range");
    root.classList.toggle("nd--it-option", t === "single_option");
    var badge = root.querySelector("[data-ibadge]");
    if (badge) badge.textContent = t;
  }

  function renderOptionList(id) {
    var root = document.getElementById("node-" + id);
    var wrap = root && root.querySelector("[data-option-list]");
    if (!wrap) return;
    var arr = nodeData(id).options || (nodeData(id).options = []);
    wrap.innerHTML = "";
    arr.forEach(function (o, idx) {
      var row = document.createElement("div");
      row.className = "nd-orow";
      row.innerHTML = '<input class="nd-oid" spellcheck="false" placeholder="id" value="' + attr(o.id) + '">' +
        '<input class="nd-odisp" spellcheck="false" placeholder="display" value="' + attr(o.display) + '">' +
        '<label class="nd-odef" title="Selected by default"><input type="radio" name="opt-' + id + '"' + (o.def ? " checked" : "") + '></label>' +
        '<button class="nd-x" title="Remove" type="button">&#215;</button>';
      var oid = row.querySelector(".nd-oid"), odisp = row.querySelector(".nd-odisp");
      var def = row.querySelector(".nd-odef input"), del = row.querySelector(".nd-x");
      [oid, odisp, def, del].forEach(stopDrag);
      oid.addEventListener("input", function () { o.id = this.value; scheduleRefresh(); });
      odisp.addEventListener("input", function () { o.display = this.value; scheduleRefresh(); });
      def.addEventListener("change", function () { arr.forEach(function (x) { x.def = false; }); o.def = this.checked; scheduleRefresh(); });
      del.addEventListener("click", function () { arr.splice(idx, 1); renderOptionList(id); scheduleRefresh(); });
      wrap.appendChild(row);
    });
  }

  function stopDrag(el) {
    el.addEventListener("mousedown", function (e) { e.stopPropagation(); });
    el.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });
    el.addEventListener("keydown", function (e) { e.stopPropagation(); });
  }

  function renderBodyList(id) {
    var root = document.getElementById("node-" + id);
    var wrap = root && root.querySelector("[data-body-list]");
    if (!wrap) return;
    var arr = nodeData(id).body || (nodeData(id).body = []);
    wrap.innerHTML = "";
    arr.forEach(function (line, idx) {
      var row = document.createElement("div");
      row.className = "nd-row";
      row.innerHTML = '<input class="nd-line" spellcheck="false" value="' + attr(line) + '">' +
        '<button class="nd-x" title="Remove" type="button">&#215;</button>';
      var input = row.querySelector(".nd-line");
      stopDrag(input);
      input.addEventListener("input", function () { arr[idx] = this.value; scheduleRefresh(); });
      var del = row.querySelector(".nd-x");
      stopDrag(del);
      del.addEventListener("click", function () { arr.splice(idx, 1); renderBodyList(id); scheduleRefresh(); });
      wrap.appendChild(row);
    });
  }

  function renderActionList(id) {
    var root = document.getElementById("node-" + id);
    var wrap = root && root.querySelector("[data-action-list]");
    if (!wrap) return;
    var arr = nodeData(id).actions || (nodeData(id).actions = []);
    wrap.innerHTML = "";
    arr.forEach(function (act, idx) {
      var row = document.createElement("div");
      row.className = "nd-arow";
      var options = ACTION_TYPES.map(function (t) { return opt(t.v, t.label, act.type); }).join("");
      row.innerHTML = '<select class="nd-atype">' + options + "</select>" +
        '<input class="nd-aval" spellcheck="false" placeholder="' + attr(actionMeta(act.type).hint) + '" value="' + attr(act.value) + '">' +
        '<button class="nd-x" title="Remove" type="button">&#215;</button>';
      var sel = row.querySelector(".nd-atype");
      var val = row.querySelector(".nd-aval");
      var del = row.querySelector(".nd-x");
      [sel, val, del].forEach(stopDrag);
      sel.addEventListener("change", function () {
        act.type = this.value;
        var m = actionMeta(act.type);
        val.placeholder = m.hint;
        val.style.visibility = m.needsValue ? "" : "hidden";
        scheduleRefresh();
      });
      val.style.visibility = actionMeta(act.type).needsValue ? "" : "hidden";
      val.addEventListener("input", function () { act.value = this.value; scheduleRefresh(); });
      del.addEventListener("click", function () { arr.splice(idx, 1); renderActionList(id); scheduleRefresh(); });
      wrap.appendChild(row);
    });
  }

  function syncDialogType(id) {
    var root = document.getElementById("node-" + id);
    if (!root) return;
    var t = nodeData(id).type;
    root.classList.toggle("nd--isconv", t === "conversation");
    root.classList.toggle("nd--hascols", t === "conversation" || t === "multi_action");
    var badge = root.querySelector("[data-badge]");
    if (badge) badge.textContent = t;
    var bl = root.querySelector("[data-body-label]");
    if (bl) bl.textContent = t === "conversation" ? "Body (intro)" : "Body";
  }

  // Create a response node wired to a step, placed to the right of it.
  function spawnResponse(stepId) {
    var pos = nodePos(stepId);
    var rid = addResponseNode(newResponse(), pos.x + 320, pos.y + siblingOffset(stepId));
    editor.addConnection(stepId, rid, "output_1", "input_1");
    scheduleRefresh();
  }
  function nodePos(id) {
    var n = editor.drawflow.drawflow.Home.data[id];
    return { x: n ? n.pos_x : 40, y: n ? n.pos_y : 40 };
  }
  function siblingOffset(stepId) {
    var n = editor.drawflow.drawflow.Home.data[stepId];
    var c = n && n.outputs && n.outputs.output_1 ? n.outputs.output_1.connections.length : 0;
    return c * 60;
  }

  // ----- state -> graph -----
  function buildGraphFromState(s) {
    s = normalizeState(s);
    building = true;
    editor.clear();
    var d = {
      id: s.id, title: s.title, external: s.external, type: s.type, columns: s.columns,
      after: s.after, escape: !!s.escape, body: s.body.slice(),
      playerName: s.conversation.playerName, npcFormat: s.conversation.npcFormat,
      playerFormat: s.conversation.playerFormat, endLabel: s.conversation.endLabel, history: s.conversation.history
    };
    // Start clear of the floating explorer panel on the left.
    var COL0 = 320, COL1 = 700, COL2 = 1120;
    var dialogId = addDialogNode(d, COL0, 40);

    if (s.type === "conversation") {
      var stepIds = [], idToNode = {};
      s.conversation.steps.forEach(function (st, i) {
        var nid = addStepNode({ id: st.id || "", speaker: st.speaker || "", text: st.text || "" }, COL1, 40 + i * 230);
        stepIds.push(nid);
        if (st.id && st.id.trim()) idToNode[st.id.trim().toLowerCase()] = nid;
      });
      if (stepIds.length) editor.addConnection(dialogId, stepIds[0], "output_1", "input_1");
      var ry = 40;
      s.conversation.steps.forEach(function (st, i) {
        (st.responses || []).forEach(function (r) {
          var rid = addResponseNode({ label: r.label || "", say: r.say != null ? r.say : "", silent: !!r.silent,
            width: r.width || 200, tooltip: r.tooltip || "", actions: (r.actions || []).slice() }, COL2, ry);
          ry += 190;
          editor.addConnection(stepIds[i], rid, "output_1", "input_1");
          if (r.goto && r.goto.trim()) {
            var tgt = idToNode[r.goto.trim().toLowerCase()];
            if (tgt) editor.addConnection(rid, tgt, "output_1", "input_1");
          }
        });
      });
    } else {
      s.inputs.forEach(function (inp, i) {
        var iid = addInputNode(normalizeInput(inp), COL1, 40 + i * 260);
        editor.addConnection(dialogId, iid, "output_1", "input_1");
      });
      var bx = s.inputs.length ? COL2 : COL1;
      s.buttons.forEach(function (b, i) {
        var bid = addButtonNode({ label: b.label, tooltip: b.tooltip, width: b.width, permission: b.permission,
          actions: (b.actions || []).slice() }, bx, 40 + i * 210);
        editor.addConnection(dialogId, bid, "output_1", "input_1");
      });
    }
    building = false;
    refresh();
  }

  // ----- graph -> state -----
  function outConns(n) {
    var r = [];
    if (n.outputs && n.outputs.output_1 && n.outputs.output_1.connections) {
      n.outputs.output_1.connections.forEach(function (c) { r.push(String(c.node)); });
    }
    return r;
  }

  function readStateFromGraph() {
    var data = editor.export().drawflow.Home.data;
    var st = defaultState();
    st.buttons = []; st.inputs = []; st.conversation.steps = [];
    var dialog = null, steps = [], buttons = [], inputs = [];
    Object.keys(data).forEach(function (k) {
      var n = data[k];
      if (n.name === "dialog") dialog = n;
      else if (n.name === "step") steps.push(n);
      else if (n.name === "button") buttons.push(n);
      else if (n.name === "input") inputs.push(n);
    });
    if (dialog) {
      var d = dialog.data;
      st.id = d.id || ""; st.title = d.title || ""; st.external = d.external || "";
      st.type = d.type || "multi_action"; st.columns = parseInt(d.columns, 10) || 2;
      st.after = d.after || "close"; st.escape = !!d.escape; st.body = (d.body || []).slice();
      // Player name + line formats are global (config.yml); the builder shows the
      // defaults in the preview and never writes them per-dialog.
      st.conversation.playerName = DEFAULT_CONV.playerName;
      st.conversation.npcFormat = DEFAULT_CONV.npcFormat;
      st.conversation.playerFormat = DEFAULT_CONV.playerFormat;
      st.conversation.endLabel = d.endLabel != null ? d.endLabel : DEFAULT_CONV.endLabel;
      st.conversation.history = parseInt(d.history, 10) || 0;
    }

    if (st.type === "conversation") {
      steps.sort(byY);
      var referenced = {};
      Object.keys(data).forEach(function (k) {
        var n = data[k];
        if (n.name === "response") outConns(n).forEach(function (t) { if (data[t] && data[t].name === "step") referenced[t] = true; });
      });
      var emitId = {};
      steps.forEach(function (n) {
        var uid = (n.data.id || "").trim();
        emitId[n.id] = uid ? uid : (referenced[n.id] ? ("step" + n.id) : "");
      });
      var startNodeId = null;
      if (dialog) outConns(dialog).forEach(function (t) { if (!startNodeId && data[t] && data[t].name === "step") startNodeId = t; });
      var ordered = steps.slice();
      if (startNodeId) ordered.sort(function (a, b) {
        if (String(a.id) === String(startNodeId)) return -1;
        if (String(b.id) === String(startNodeId)) return 1;
        return byY(a, b);
      });
      ordered.forEach(function (n) {
        var stepObj = { id: emitId[n.id], speaker: n.data.speaker || "", text: n.data.text || "", responses: [] };
        var respNodes = outConns(n).map(function (t) { return data[t]; }).filter(function (x) { return x && x.name === "response"; });
        respNodes.sort(byY);
        respNodes.forEach(function (rn) {
          var gotoId = "";
          outConns(rn).forEach(function (t) { if (!gotoId && data[t] && data[t].name === "step") gotoId = emitId[t] || ""; });
          stepObj.responses.push({ label: rn.data.label || "", say: rn.data.say != null ? rn.data.say : "", silent: !!rn.data.silent,
            goto: gotoId, width: rn.data.width || 200, tooltip: rn.data.tooltip || "",
            actions: (rn.data.actions || []).map(function (a) { return { type: a.type || "message", value: a.value || "" }; }) });
        });
        st.conversation.steps.push(stepObj);
      });
    } else {
      inputs.sort(byY);
      inputs.forEach(function (n) { st.inputs.push(normalizeInput(n.data)); });
      buttons.sort(byY);
      buttons.forEach(function (n) {
        st.buttons.push({ label: n.data.label || "", tooltip: n.data.tooltip || "", width: n.data.width || 150,
          permission: n.data.permission || "",
          actions: (n.data.actions || []).map(function (a) { return { type: a.type || "message", value: a.value || "" }; }) });
      });
    }
    return st;
  }
  function byY(a, b) { return (a.pos_y || 0) - (b.pos_y || 0); }

  // ----- Auto-layout (re-derive positions from the current model) -----
  function autoLayout() {
    var snapshot = readStateFromGraph();
    buildGraphFromState(snapshot);
    toast("Nodes re-arranged.");
  }

  /* ============================================================
     YAML generation (reads `state`)
     ============================================================ */
  function q(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'; }
  function actionLine(act) {
    var meta = actionMeta(act.type);
    if (!meta.needsValue) return "[" + meta.tag + "]";
    return ("[" + meta.tag + "] " + (act.value || "")).trim();
  }

  function genYaml() {
    if (state.type === "conversation") return genConversationYaml();
    var L = [];
    L.push("title: " + q(state.title));
    if (state.external.trim()) L.push("external-title: " + q(state.external));
    L.push("type: " + state.type);
    if (state.type === "multi_action") L.push("columns: " + Math.max(1, state.columns));
    if (state.after !== "close") L.push("after-action: " + state.after);
    L.push("can-close-with-escape: " + (state.escape ? "true" : "false"));
    if (state.body.length) { L.push("body:"); state.body.forEach(function (line) { L.push("  - " + q(line)); }); }
    genInputsYaml(L);
    if (state.buttons.length) {
      L.push("buttons:");
      state.buttons.forEach(function (b) {
        L.push("  - label: " + q(b.label));
        if (b.tooltip && b.tooltip.trim()) L.push("    tooltip: " + q(b.tooltip));
        L.push("    width: " + Math.max(1, Math.min(1024, b.width || 150)));
        if (b.permission && b.permission.trim()) L.push("    permission: " + q(b.permission));
        if (b.actions.length) { L.push("    actions:"); b.actions.forEach(function (a) { L.push("      - " + q(actionLine(a))); }); }
      });
    }
    return L.join("\n") + "\n";
  }

  function genConversationYaml() {
    var conv = state.conversation;
    var L = [];
    L.push("title: " + q(state.title));
    if (state.external.trim()) L.push("external-title: " + q(state.external));
    L.push("type: conversation");
    L.push("columns: " + Math.max(1, state.columns));
    L.push("can-close-with-escape: " + (state.escape ? "true" : "false"));
    // Player name and line formats are global (config.yml), not written per-dialog.
    if (conv.endLabel && conv.endLabel.trim()) L.push("end-label: " + q(conv.endLabel));
    // Note: the visible-history limit is a global setting (config.yml), not per-dialog.
    if (state.body.length) { L.push("body:"); state.body.forEach(function (line) { L.push("  - " + q(line)); }); }
    if (conv.steps.length) {
      L.push("steps:");
      conv.steps.forEach(function (s) {
        var first = true;
        var head = function (key, val) { L.push((first ? "  - " : "    ") + key + ": " + val); first = false; };
        if (s.id && s.id.trim()) head("id", q(s.id));
        head("speaker", q(s.speaker || ""));
        head("text", q(s.text || ""));
        if (first) { L.push("  -"); first = false; }
        if (s.responses.length) {
          L.push("    responses:");
          s.responses.forEach(function (r) {
            L.push("      - label: " + q(r.label || ""));
            if (r.silent) L.push('        say: ""');
            else if (r.say && r.say.trim() && r.say !== r.label) L.push("        say: " + q(r.say));
            if (r.goto && r.goto.trim()) L.push("        goto: " + q(r.goto));
            if (r.tooltip && r.tooltip.trim()) L.push("        tooltip: " + q(r.tooltip));
            if (r.width && r.width !== 200) L.push("        width: " + Math.max(1, Math.min(1024, r.width)));
            if (r.actions.length) { L.push("        actions:"); r.actions.forEach(function (a) { L.push("          - " + q(actionLine(a))); }); }
          });
        }
      });
    }
    return L.join("\n") + "\n";
  }

  function genInputsYaml(L) {
    if (!state.inputs.length) return;
    L.push("inputs:");
    state.inputs.forEach(function (inp) {
      L.push("  - type: " + inp.type);
      L.push("    key: " + q(inp.key || ""));
      L.push("    label: " + q(inp.label || ""));
      if (inp.width > 0) L.push("    width: " + inp.width);
      if (inp.type === "text") {
        if (inp.initial && inp.initial.length) L.push("    initial: " + q(inp.initial));
        if (inp.maxLength > 0) L.push("    max-length: " + inp.maxLength);
        if (inp.multiline) L.push("    multiline: true");
      } else if (inp.type === "bool") {
        if (inp.initialBool) L.push("    initial: true");
        if (inp.onTrue && inp.onTrue !== "true") L.push("    on-true: " + q(inp.onTrue));
        if (inp.onFalse && inp.onFalse !== "false") L.push("    on-false: " + q(inp.onFalse));
      } else if (inp.type === "number_range") {
        L.push("    start: " + trimNum(inp.start));
        L.push("    end: " + trimNum(inp.end));
        if (inp.step > 0) L.push("    step: " + trimNum(inp.step));
        L.push("    initial: " + trimNum(inp.initialNumber));
        if (inp.labelFormat && inp.labelFormat.trim()) L.push("    label-format: " + q(inp.labelFormat));
      } else if (inp.type === "single_option") {
        if (inp.options.length) {
          L.push("    options:");
          inp.options.forEach(function (o) {
            L.push("      - id: " + q(o.id || ""));
            if (o.display && o.display.trim() && o.display !== o.id) L.push("        display: " + q(o.display));
            if (o.def) L.push("        default: true");
          });
        }
      }
    });
  }
  function trimNum(n) { n = Number(n) || 0; return n === Math.round(n) ? String(Math.round(n)) : String(n); }

  function fileName() {
    var id = (state.id || "dialog").trim().replace(/\.yml$/i, "");
    var seg = id.split("/").filter(Boolean).pop() || "dialog";
    return seg.replace(/[^a-zA-Z0-9._-]/g, "_") + ".yml";
  }
  function targetFolder() {
    var id = (state.id || "").trim().replace(/\.yml$/i, "");
    var parts = id.split("/").filter(Boolean); parts.pop();
    return "plugins/CustomDialogs/dialogs/" + (parts.length ? parts.join("/") + "/" : "");
  }

  /* ============================================================
     Preview (reads `state`)
     ============================================================ */
  function renderPreview() {
    var el = $("mc-preview");
    var html = "";
    if (state.external.trim()) html += '<div class="mc-ext">' + renderMc(state.external, "#9aa2b1") + "</div>";
    html += '<div class="mc-title">' + renderMc(state.title, "#ffffff") + "</div>";
    html += state.type === "conversation" ? conversationPreview() : dialogPreview();
    el.innerHTML = html;
  }
  function dialogPreview() {
    var html = "";
    if (state.body.length) {
      html += '<div class="mc-body">';
      state.body.forEach(function (line) { html += '<div class="mc-body__line">' + renderMc(line, "#d7dbe2") + "</div>"; });
      html += "</div>";
    }
    html += inputsPreview();
    if (state.buttons.length) {
      var cols = state.type === "multi_action" ? Math.max(1, state.columns) : state.type === "confirmation" ? 2 : 1;
      html += '<div class="mc-buttons" style="grid-template-columns:repeat(' + cols + ',1fr)">';
      state.buttons.forEach(function (b) {
        var w = Math.max(1, Math.min(1024, b.width || 150));
        var minw = Math.round(Math.max(80, Math.min(260, w * 0.9)));
        var tip = b.tooltip ? ' title="' + b.tooltip.replace(/&[0-9a-fk-orA-FK-OR#]/g, "").replace(/"/g, "&quot;") + '"' : "";
        html += '<div class="mc-btn" style="min-width:' + minw + 'px"' + tip + ">" + renderMc(b.label, "#ffffff") + "</div>";
      });
      html += "</div>";
    } else {
      html += '<div class="mc-empty">Add a button node to see it here.</div>';
    }
    return html;
  }
  function inputsPreview() {
    if (!state.inputs.length) return "";
    var html = '<div class="mc-inputs">';
    state.inputs.forEach(function (inp) {
      var label = '<div class="mc-input__label">' + renderMc(inp.label || "", "#c7cdd6") + "</div>";
      var field = "";
      if (inp.type === "bool") {
        field = '<div class="mc-input__bool">' + (inp.initialBool ? "&#9745;" : "&#9744;") + " " + renderMc(inp.label || "", "#c7cdd6") + "</div>";
        html += '<div class="mc-input">' + field + "</div>"; return;
      } else if (inp.type === "single_option") {
        var sel = inp.options.filter(function (o) { return o.def; })[0] || inp.options[0];
        field = '<div class="mc-input__field">&#9666; ' + renderMc(sel ? (sel.display || sel.id) : "", "#ffffff") + " &#9656;</div>";
      } else if (inp.type === "number_range") {
        field = '<div class="mc-input__field">' + renderMc(String(inp.initialNumber), "#ffffff") + ' <span class="mc-input__range">(' + trimNum(inp.start) + "–" + trimNum(inp.end) + ")</span></div>";
      } else {
        field = '<div class="mc-input__field mc-input__text">' + renderMc(inp.initial || "", "#ffffff") + "</div>";
      }
      html += '<div class="mc-input">' + label + field + "</div>";
    });
    html += "</div>";
    return html;
  }

  function conversationPreview() {
    var conv = state.conversation;
    var pn = conv.playerName || "";
    var sampleName = (!pn.trim() || pn.indexOf("%") >= 0 || pn.indexOf("{player}") >= 0) ? "Steve" : pn;
    var applyTokens = function (s) { return String(s == null ? "" : s).split("{player}").join(sampleName); };
    var html = "";
    if (state.body.length) {
      html += '<div class="mc-body">';
      state.body.forEach(function (line) { html += '<div class="mc-body__line">' + renderMc(applyTokens(line), "#d7dbe2") + "</div>"; });
      html += "</div>";
    }
    var first = conv.steps[0];
    if (!first) return html + '<div class="mc-empty">Add a step node to see the conversation.</div>';
    var npcLine = conv.npcFormat.split("{name}").join(first.speaker || "").split("{message}").join(first.text || "");
    html += '<div class="mc-body mc-log"><div class="mc-body__line">' + renderMc(applyTokens(npcLine), "#d7dbe2") + "</div></div>";
    if (first.responses.length) {
      var cols = Math.max(1, state.columns);
      html += '<div class="mc-buttons" style="grid-template-columns:repeat(' + cols + ',1fr)">';
      first.responses.forEach(function (r) {
        var w = Math.max(1, Math.min(1024, r.width || 200));
        var minw = Math.round(Math.max(80, Math.min(260, w * 0.9)));
        var tip = r.tooltip ? ' title="' + r.tooltip.replace(/&[0-9a-fk-orA-FK-OR#]/g, "").replace(/"/g, "&quot;") + '"' : "";
        html += '<div class="mc-btn" style="min-width:' + minw + 'px"' + tip + ">" + renderMc(applyTokens(r.label), "#ffffff") + "</div>";
      });
      html += "</div>";
    } else {
      html += '<div class="mc-buttons"><div class="mc-btn">' + renderMc(conv.endLabel || "&7Close", "#ffffff") + "</div></div>";
    }
    html += '<div class="mc-note">The body grows into a log as the player replies.</div>';
    return html;
  }

  // ---------- Update orchestration ----------
  var refreshTimer = null;
  function scheduleRefresh() {
    if (building) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 120);
  }
  function refresh() {
    if (building) return;
    state = readStateFromGraph();
    renderPreview();
    renderYaml();
    syncToolbar();
    save();
  }
  function renderYaml() {
    $("yaml-out").textContent = genYaml();
    $("yaml-filename").textContent = fileName();
    $("yaml-path").textContent = "→ " + targetFolder();
  }

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
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      ta.remove();
    }
  }

  function loadFromState(s) { fsResetIfNeeded(); buildGraphFromState(s); }
  function fsResetIfNeeded() {}

  // ---------- Toast ----------
  var toastTimer = null;
  function toast(msg, isError) {
    var el = $("toast");
    el.textContent = msg; el.hidden = false;
    el.classList.toggle("toast--error", !!isError);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2800);
  }

  /* ============================================================
     YAML parser (focused on the dialog schema) — unchanged logic
     ============================================================ */
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
        var q2 = p + 1;
        while (q2 < pending.length) {
          var am = pending[q2].match(/^-\s*([\s\S]*)$/);
          if (!am) break;
          var v = parseScalar(am[1]);
          btn.actions.push(isMsg ? { type: "message", value: v } : parseActionLine(v));
          q2++;
        }
        p = q2 - 1; continue;
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
  function lineIndent(l) { return l.match(/^ */)[0].length; }
  function lineSkip(l) { var t = l.trim(); return t === "" || t.charAt(0) === "#"; }
  function collectListEntries(lines, startIdx, parentIndent) {
    var entries = [], i = startIdx, itemIndent = null;
    while (i < lines.length) {
      var line = lines[i];
      if (lineSkip(line)) { i++; continue; }
      var ind = lineIndent(line);
      if (ind <= parentIndent) break;
      if (line.trim().charAt(0) !== "-") { i++; continue; }
      if (itemIndent === null) itemIndent = ind;
      if (ind < itemIndent) break;
      var block = [];
      var first = line.trim().replace(/^-\s*/, "");
      if (first) block.push({ indent: ind + 2, text: first });
      i++;
      while (i < lines.length) {
        var nl = lines[i];
        if (lineSkip(nl)) { i++; continue; }
        if (lineIndent(nl) <= itemIndent) break;
        block.push({ indent: lineIndent(nl), text: nl.trim() });
        i++;
      }
      entries.push(block);
    }
    return { entries: entries, next: i };
  }
  function parseResponseEntry(block) {
    var r = { label: "", say: "", silent: false, goto: "", width: 200, tooltip: "", actions: [] };
    var haveSay = false;
    for (var p = 0; p < block.length; p++) {
      var t = block[p].text;
      var listMatch = t.match(/^(actions|messages):\s*$/);
      if (listMatch) {
        var isMsg = listMatch[1] === "messages";
        var childIndent = block[p].indent, q2 = p + 1;
        while (q2 < block.length && block[q2].indent > childIndent) {
          var am = block[q2].text.match(/^-\s*([\s\S]*)$/);
          if (am) { var v = parseScalar(am[1]); r.actions.push(isMsg ? { type: "message", value: v } : parseActionLine(v)); }
          q2++;
        }
        p = q2 - 1; continue;
      }
      var kv = t.match(/^([A-Za-z0-9_-]+):([\s\S]*)$/);
      if (!kv) continue;
      var k = kv[1], val = parseScalar(kv[2]);
      if (k === "label") r.label = val;
      else if (k === "say") { r.say = val; haveSay = true; if (val === "") r.silent = true; }
      else if (k === "goto") r.goto = val;
      else if (k === "tooltip") r.tooltip = val;
      else if (k === "width") r.width = parseInt(val, 10) || 200;
      else if (k === "message") r.actions.push({ type: "message", value: val });
      else if (k === "command") r.actions.push({ type: "player", value: val });
    }
    if (!haveSay) r.say = r.label;
    return r;
  }
  function parseInputEntry(block) {
    var o = { type: "text", key: "", label: "", width: 0, initial: "", maxLength: 0, multiline: false,
      initialBool: false, onTrue: "true", onFalse: "false", start: 0, end: 10, step: 0, initialNumber: 0,
      labelFormat: "", options: [] };
    var rawInitial;
    for (var p = 0; p < block.length; p++) {
      var t = block[p].text;
      if (/^options:\s*$/.test(t)) {
        var childIndent = block[p].indent, q2 = p + 1, oiIndent = null;
        while (q2 < block.length && block[q2].indent > childIndent) {
          if (block[q2].text.charAt(0) === "-") {
            if (oiIndent === null) oiIndent = block[q2].indent;
            var ob = [];
            var of = block[q2].text.replace(/^-\s*/, "");
            if (of) ob.push({ indent: block[q2].indent + 2, text: of });
            q2++;
            while (q2 < block.length && block[q2].indent > oiIndent) { ob.push(block[q2]); q2++; }
            o.options.push(parseOptionEntry(ob));
          } else { q2++; }
        }
        p = q2 - 1; continue;
      }
      var kv = t.match(/^([A-Za-z0-9_-]+):([\s\S]*)$/);
      if (!kv) continue;
      var k = kv[1], val = parseScalar(kv[2]);
      if (k === "type") o.type = val;
      else if (k === "key") o.key = val;
      else if (k === "label") o.label = val;
      else if (k === "width") o.width = parseInt(val, 10) || 0;
      else if (k === "initial") rawInitial = val;
      else if (k === "max-length") o.maxLength = parseInt(val, 10) || 0;
      else if (k === "multiline") o.multiline = (val === "true");
      else if (k === "on-true") o.onTrue = val;
      else if (k === "on-false") o.onFalse = val;
      else if (k === "start") o.start = num(val, 0);
      else if (k === "end") o.end = num(val, 10);
      else if (k === "step") o.step = num(val, 0);
      else if (k === "label-format") o.labelFormat = val;
    }
    if (rawInitial !== undefined) {
      if (o.type === "bool") o.initialBool = (rawInitial === "true");
      else if (o.type === "number_range") o.initialNumber = num(rawInitial, 0);
      else o.initial = rawInitial;
    }
    return o;
  }
  function parseOptionEntry(block) {
    var o = { id: "", display: "", def: false };
    for (var p = 0; p < block.length; p++) {
      var kv = block[p].text.match(/^([A-Za-z0-9_-]+):([\s\S]*)$/);
      if (!kv) continue;
      var k = kv[1], val = parseScalar(kv[2]);
      if (k === "id") o.id = val;
      else if (k === "display") o.display = val;
      else if (k === "default" || k === "initial") o.def = (val === "true");
    }
    if (!o.display) o.display = o.id;
    return o;
  }

  function parseStepEntry(block) {
    var step = { id: "", speaker: "", text: "", responses: [] };
    for (var p = 0; p < block.length; p++) {
      var t = block[p].text;
      var listMatch = t.match(/^(responses|buttons):\s*$/);
      if (listMatch) {
        var childIndent = block[p].indent, q2 = p + 1, respIndent = null;
        while (q2 < block.length && block[q2].indent > childIndent) {
          if (block[q2].text.charAt(0) === "-") {
            if (respIndent === null) respIndent = block[q2].indent;
            var rblock = [];
            var rfirst = block[q2].text.replace(/^-\s*/, "");
            if (rfirst) rblock.push({ indent: block[q2].indent + 2, text: rfirst });
            q2++;
            while (q2 < block.length && block[q2].indent > respIndent) { rblock.push(block[q2]); q2++; }
            step.responses.push(parseResponseEntry(rblock));
          } else { q2++; }
        }
        p = q2 - 1; continue;
      }
      var kv = t.match(/^([A-Za-z0-9_-]+):([\s\S]*)$/);
      if (!kv) continue;
      var k = kv[1], val = parseScalar(kv[2]);
      if (k === "id") step.id = val;
      else if (k === "speaker" || k === "name") step.speaker = val;
      else if (k === "text" || k === "message") step.text = val;
    }
    return step;
  }
  function parseYaml(text) {
    var lines = String(text).split(/\r?\n/);
    var st = { id: "", title: "", external: "", type: "multi_action", columns: 2, after: "close", escape: true,
      body: [], buttons: [], inputs: [], conversation: { playerName: "", npcFormat: DEFAULT_CONV.npcFormat,
        playerFormat: DEFAULT_CONV.playerFormat, endLabel: DEFAULT_CONV.endLabel, history: 0, steps: [] } };
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
          var firstB = l.trim().replace(/^-\s*/, "");
          var pending = []; if (firstB) pending.push(firstB);
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
      if (key === "steps") {
        var collected = collectListEntries(lines, i + 1, 0);
        st.conversation.steps = collected.entries.map(parseStepEntry);
        i = collected.next; continue;
      }
      if (key === "inputs") {
        var col = collectListEntries(lines, i + 1, 0);
        st.inputs = col.entries.map(parseInputEntry);
        i = col.next; continue;
      }
      var val = parseScalar(m[2]);
      if (key === "title") st.title = val;
      else if (key === "external-title") st.external = val;
      else if (key === "type") st.type = (val === "notice" || val === "confirmation" || val === "conversation") ? val : "multi_action";
      else if (key === "columns") st.columns = parseInt(val, 10) || 2;
      else if (key === "after-action") st.after = (val === "none" || val === "wait") ? val : "close";
      else if (key === "can-close-with-escape") st.escape = (val === "true");
      else if (key === "player-name") st.conversation.playerName = val;
      else if (key === "npc-format") st.conversation.npcFormat = val;
      else if (key === "player-format") st.conversation.playerFormat = val;
      else if (key === "end-label") st.conversation.endLabel = val;
      else if (key === "history") st.conversation.history = parseInt(val, 10) || 0;
      i++;
    }
    return st;
  }

  /* ============================================================
     File System explorer (unchanged behavior)
     ============================================================ */
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
    entries.sort(function (a, b) { if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1; return a.name.localeCompare(b.name); });
    for (var k = 0; k < entries.length; k++) {
      var h = entries[k];
      var rel = path ? path + "/" + h.name : h.name;
      if (h.kind === "directory") node.dirs.push(await scanDir(h, rel));
      else if (h.kind === "file" && /\.ya?ml$/i.test(h.name)) node.files.push({ name: h.name, path: rel, id: rel.replace(/\.ya?ml$/i, ""), handle: h });
    }
    return node;
  }
  async function refreshTree() {
    try { fsState.tree = await scanDir(fsState.dirHandle, ""); renderTree(); }
    catch (e) { toast("Scan failed: " + e.message, true); }
  }
  function countFiles(node) { var n = node.files.length; node.dirs.forEach(function (d) { n += countFiles(d); }); return n; }
  function renderTree() {
    var container = $("ex-tree"); container.innerHTML = "";
    if (!fsState.tree) return;
    if (countFiles(fsState.tree) === 0) { container.innerHTML = '<p class="tree__empty">No .yml dialogs in this folder yet. Build one and Save to folder.</p>'; return; }
    container.appendChild(buildTreeGroup(fsState.tree));
  }
  function buildTreeGroup(node) {
    var ul = document.createElement("ul"); ul.className = "tree__group";
    node.dirs.forEach(function (dir) {
      var li = document.createElement("li");
      var head = document.createElement("div"); head.className = "tree__folder";
      var twist = document.createElement("span"); twist.className = "tree__twist"; twist.innerHTML = "&#9660;";
      var name = document.createElement("span"); name.textContent = dir.name;
      head.appendChild(twist); head.appendChild(name);
      var child = buildTreeGroup(dir);
      head.addEventListener("click", function () { var collapsed = head.classList.toggle("tree__folder--collapsed"); child.style.display = collapsed ? "none" : ""; });
      li.appendChild(head); li.appendChild(child); ul.appendChild(li);
    });
    node.files.forEach(function (file) {
      var li = document.createElement("li");
      var fEl = document.createElement("div");
      fEl.className = "tree__file" + (fsState.currentPath === file.path ? " tree__file--active" : "");
      fEl.textContent = file.name.replace(/\.ya?ml$/i, ""); fEl.title = file.id;
      fEl.addEventListener("click", function () { openFile(file); });
      li.appendChild(fEl); ul.appendChild(li);
    });
    return ul;
  }
  async function openFile(file) {
    try {
      var f = await file.handle.getFile();
      var parsed = parseYaml(await f.text());
      parsed.id = file.id;
      fsState.currentPath = file.path;
      buildGraphFromState(parsed);
      renderTree();
      toast("Opened " + file.name);
    } catch (e) { toast("Could not open " + file.name + ": " + e.message, true); }
  }
  async function ensureDir(root, parts) { var d = root; for (var i = 0; i < parts.length; i++) d = await d.getDirectoryHandle(parts[i], { create: true }); return d; }
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

  /* ============================================================
     Init
     ============================================================ */
  function zoomReset() {
    try {
      editor.zoom = 1; editor.canvas_x = 0; editor.canvas_y = 0;
      if (editor.zoom_refresh) editor.zoom_refresh();
      var el = editor.precanvas;
      if (el) el.style.transform = "translate(0px, 0px) scale(1)";
    } catch (e) {}
  }

  function init() {
    editor = new Drawflow($("drawflow"));
    editor.reroute = true;
    editor.reroute_fix_curvature = true;
    editor.start();
    editor.on("connectionCreated", scheduleRefresh);
    editor.on("connectionRemoved", scheduleRefresh);
    editor.on("nodeRemoved", scheduleRefresh);
    editor.on("nodeMoved", scheduleRefresh);

    // Top bar
    $("btn-download").addEventListener("click", download);
    $("btn-copy").addEventListener("click", copyYaml);
    $("btn-example").addEventListener("click", function () {
      fsState.currentPath = null;
      buildGraphFromState(state.type === "conversation" ? conversationExample() : exampleState());
      if (fsState.tree) renderTree();
    });
    $("btn-reset").addEventListener("click", function () {
      if (confirm("Start a new, empty dialog? Your current one will be cleared.")) {
        fsState.currentPath = null; buildGraphFromState(defaultState()); if (fsState.tree) renderTree();
      }
    });

    // Canvas toolbar
    $("add-step").addEventListener("click", function () {
      var nid = addStepNode(newStep(), 700, 80 + Math.round(Math.random() * 60));
      // Auto-connect to the dialog as the start step if nothing is wired yet.
      var dialogId = findDialogId();
      if (dialogId != null) {
        var dn = editor.drawflow.drawflow.Home.data[dialogId];
        var has = dn && dn.outputs && dn.outputs.output_1 && dn.outputs.output_1.connections.length;
        if (!has) editor.addConnection(dialogId, nid, "output_1", "input_1");
      }
      scheduleRefresh();
    });
    $("add-button").addEventListener("click", function () {
      var nid = addButtonNode(newButton(), 700, 80 + Math.round(Math.random() * 60));
      var dialogId = findDialogId();
      if (dialogId != null) editor.addConnection(dialogId, nid, "output_1", "input_1");
      scheduleRefresh();
    });
    $("add-input").addEventListener("click", function () {
      var nid = addInputNode(newInput(), 700, 80 + Math.round(Math.random() * 60));
      var dialogId = findDialogId();
      if (dialogId != null) editor.addConnection(dialogId, nid, "output_1", "input_1");
      scheduleRefresh();
    });
    $("btn-layout").addEventListener("click", autoLayout);
    $("zoom-in").addEventListener("click", function () { editor.zoom_in(); });
    $("zoom-out").addEventListener("click", function () { editor.zoom_out(); });
    $("zoom-reset").addEventListener("click", zoomReset);

    // Explorer
    $("ex-open").addEventListener("click", openFolder);
    $("ex-refresh").addEventListener("click", function () { if (fsState.dirHandle) refreshTree(); });
    $("btn-save").addEventListener("click", saveToFolder);
    if (!fsSupported) $("ex-hint").textContent = "Tip: open in Chrome or Edge to browse and save your dialogs folder directly.";

    // Floating panels: collapse / re-open.
    setupPanels();

    var saved = load();
    buildGraphFromState(saved || exampleState());
  }

  function setupPanels() {
    function setCollapsed(panelId, collapsed) {
      var panel = $(panelId);
      var reopen = document.querySelector('.panel-reopen[data-panel="' + panelId + '"]');
      if (panel) panel.classList.toggle("collapsed", collapsed);
      if (reopen) reopen.hidden = !collapsed;
    }
    document.querySelectorAll(".panel__toggle").forEach(function (btn) {
      btn.addEventListener("click", function () { setCollapsed(btn.getAttribute("data-panel"), true); });
    });
    document.querySelectorAll(".panel-reopen").forEach(function (btn) {
      btn.addEventListener("click", function () { setCollapsed(btn.getAttribute("data-panel"), false); });
    });
  }

  function findDialogId() {
    var data = editor.drawflow.drawflow.Home.data;
    var ids = Object.keys(data);
    for (var i = 0; i < ids.length; i++) if (data[ids[i]].name === "dialog") return data[ids[i]].id;
    return null;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
