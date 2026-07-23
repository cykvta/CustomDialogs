# CustomDialogs — Usage Guide

For **server administrators** running the plugin. Everything in-game: installing,
commands, permissions, configuration, and how to write dialogs, form inputs and
conversations.

> Building from source instead? See the [README](README.md).

---

## Install

1. Requires **Paper 1.21.6+** and **Java 21** (the Dialog API was added in 1.21.6).
2. Put `CustomDialogs-<version>.jar` in your server's `plugins/` folder.
3. *(Optional)* Install **PlaceholderAPI** for `%placeholders%`, and **Citizens**
   to open dialogs from NPCs.
4. Start the server. On first run it creates `plugins/CustomDialogs/` with
   `config.yml`, `lang.yml` and a `dialogs/` folder of examples.

Prefer not to write YAML by hand? Use the **[visual builder](#visual-builder-no-yaml)**.

---

## Commands

The root command is `/customdialogs` (aliases `/cd`, `/dialogs`).

| Command | Permission | Description |
|---|---|---|
| `/customdialogs` | `customdialogs.command` | Show the help list |
| `/customdialogs open <id> [player]` | `customdialogs.open` | Open a dialog for yourself, or for another `player` |
| `/customdialogs list` | `customdialogs.list` | List the ids of all loaded dialogs |
| `/customdialogs reload` | `customdialogs.reload` | Reload `config.yml`, `lang.yml` and every dialog |
| `/customdialogs npc <id\|remove>` | `customdialogs.npc` | Bind the selected Citizens NPC to a dialog (or clear it) — *Citizens only* |

From the console you must always give a target player for `open`.

## Permissions

| Permission | Grants | Default |
|---|---|---|
| `customdialogs.command` | the base command / help | op |
| `customdialogs.open` | opening dialogs | op |
| `customdialogs.list` | listing dialogs | op |
| `customdialogs.reload` | reloading | op |
| `customdialogs.npc` | binding dialogs to Citizens NPCs | op |

Individual **buttons** can also require their own permission (see below); players
without it simply don't see the button.

---

## Configuration (`config.yml`)

```yaml
# Prefix on plugin chat messages. Supports & color codes and #rrggbb hex.
prefix: "&8[&bCustomDialogs&8] "

# Check GitHub on startup for a newer release and log a note if one is out.
# Informational only (nothing is downloaded). Set false to disable.
update-check: true

# Settings shared by every conversation dialog (type: conversation):
conversation:
  # Visible log lines, to avoid scrolling. "none" = keep the whole conversation;
  # a number keeps only that many most-recent lines.
  history: none
  # Name shown for the player's lines: a literal (e.g. "Player"), {player}
  # (the real name, no PlaceholderAPI), or a %placeholder%. Blank = real name.
  player-name: "%player_name%"
  # How each logged line looks. {name} = the speaker, {message} = the line.
  npc-format: "&6{name}&7: &f{message}"
  player-format: "&b{name}&7: &7{message}"
```

## Messages (`lang.yml`)

Every player-facing message lives in `lang.yml` and can be freely reworded,
recolored or translated. `{placeholders}` in curly braces (e.g. `{count}`, `{id}`,
`{player}`) are filled in by the plugin — keep them as-is.

Run `/customdialogs reload` after editing any config, lang or dialog file.

---

## Writing dialogs

Dialogs live in `plugins/CustomDialogs/dialogs/` — **one dialog per `.yml` file**.
Subfolders act as categories, and the **dialog id is the file path under
`dialogs/` without the extension**:

```
plugins/CustomDialogs/dialogs/
├── example/
│   └── dialog/
│       ├── simple.yml     ->  id: example/dialog/simple
│       └── confirm.yml    ->  id: example/dialog/confirm
└── menus/
    └── main.yml           ->  id: menus/main
```

Open one with `/customdialogs open example/dialog/simple`.

### Fields

```yaml
title: "&b&lWelcome!"            # screen title
external-title: "&bWelcome"      # optional: short title on the pause-menu button
can-close-with-escape: true      # default: true
type: multi_action               # multi_action (default) | notice | confirmation | conversation
columns: 2                       # multi_action / conversation: buttons per row
after-action: close              # close (default) | none (stay open) | wait
body:                            # text lines; supports %placeholders%
  - "&7Welcome to the server!"
buttons:
  - label: "&aContinue"
    tooltip: "Close this screen" # optional hover text
    width: 150                   # optional, 1..1024 (default 150)
    permission: "server.vip"     # optional; players without it don't see the button
    actions:                     # optional; see "Button actions" below
      - "[message] &aWelcome, %player_name%!"
      - "[close]"
```

**Button count per type:** `notice` = 0–1, `confirmation` = 2 (yes/no),
`multi_action` = 1+. Colors use `&` codes and `#rrggbb` hex.

### Button actions

Each `actions` line runs in order when the button is clicked. A leading `[tag]`
picks what it does; a line with no tag runs as a player command.

| Tag | Effect |
|---|---|
| `[player] <cmd>` | run `<cmd>` as the clicking player (the default) |
| `[console] <cmd>` | run `<cmd>` from the server console |
| `[op] <cmd>` | run `<cmd>` as the player, op'd for just that command |
| `[dialog] <id>` | open another dialog |
| `[close]` | close the screen |
| `[message] <text>` | send a chat message to the player |
| `[broadcast] <text>` | broadcast to everyone |

Shorthands: `message:` (one chat line), `messages:` (a list of chat lines) and
`command:` (a single `[player]` command). A button with **no** actions just closes.

> Tip: for a menu that stays open after each click, set `after-action: none`.

---

## Form inputs

A dialog can show **form fields** the player fills in before clicking a button.
Button actions read a field's value with the `{key}` token. Four types:

```yaml
type: multi_action
inputs:
  - type: single_option          # a dropdown
    key: item
    label: "&7Item"
    options:
      - { id: diamond, display: "&bDiamond", default: true }
      - { id: bread,   display: "&eBread" }
  - type: number_range           # a slider
    key: amount
    label: "&7Amount"
    start: 1
    end: 64
    step: 1
    initial: 16
  - type: bool                   # a toggle
    key: announce
    label: "&7Announce it"
    on-true: "yes"               # value used for {announce} when checked
    on-false: "no"
  - type: text                   # a text field
    key: note
    label: "&7Note"
    max-length: 48
buttons:
  - label: "&aGive"
    actions:
      - "[console] give %player_name% {item} {amount}"
      - "[message] &aGave &f{amount}x {item}&7 ({note})"
```

`{key}` tokens are replaced with what the player entered **before** PlaceholderAPI
runs, so inputs and `%placeholders%` mix freely. Booleans substitute their
`on-true` / `on-false` text (default `true` / `false`), single-options substitute
the selected `id`, and numbers drop a trailing `.0`. See
`dialogs/example/dialog/inputs.yml`. Inputs work on normal dialogs
(`multi_action` / `notice` / `confirmation`).

---

## Conversations

`type: conversation` turns a dialog into a running dialogue whose **body grows
into a chat-like log** as the player picks responses:

```
Villager: Hello there, Steve! What brings you here?
Steve: Just exploring the area.
Villager: Wonderful! Take this for the road.
```

Each **step** is one NPC line plus the player's **responses** (buttons). Clicking a
response adds the player's line to the log, runs any actions, then advances to the
next step — or a named step via `goto`, for branching. When there is no next step
the conversation ends and the screen closes. Progress is tracked per player and
cleared on quit.

```yaml
type: conversation
columns: 1
body:                               # optional intro shown above the log
  - "&8» You strike up a conversation."
steps:
  - id: start                       # optional; used as a goto target
    speaker: "Villager"
    text: "Hello there, {player}! What brings you here?"
    responses:
      - label: "&aJust exploring."
        say: "Just exploring the area."   # logged as the player's line; defaults to the label
        goto: friendly                    # optional; defaults to the next step
      - label: "&eGot any work?"
        goto: work
  - id: friendly
    speaker: "Villager"
    text: "Wonderful! Take this for the road."
    responses:
      - label: "&aThank you!"
        actions:
          - "[console] give %player_name% bread 3"
          - "[close]"
```

Per-conversation fields are just `columns`, `end-label` (the close button on a
terminal step, default `&7Close`), `body` and the `steps`. Everything else —
**player name, the NPC/player line formats and the history limit** — is a **global**
setting in the `conversation` section of `config.yml` (see above), shared by every
conversation.

- `{player}` anywhere in a line resolves to the configured player name.
- `say: ""` makes a response add no player line (silent advance).
- A step with no responses shows a single close button.

See `dialogs/example/dialog/conversation.yml`.

## Citizens (NPC dialogues)

With **Citizens** installed you can open a dialog by right-clicking an NPC:

1. Select the NPC: `/npc select`
2. Bind it: `/customdialogs npc example/dialog/conversation`
3. Right-click the NPC to open the dialog. Remove the binding with
   `/customdialogs npc remove`.

The binding is stored on the NPC and survives restarts.

---

## Visual builder (no YAML)

A **node-based web builder** lets you design dialogs, inputs and conversations
visually and download the ready-to-use `.yml` — drag nodes, wire responses, see a
live preview and copy/download the file.

- Hosted: **https://cykvta.github.io/CustomDialogs/**
- Or open `web-builder/index.html` from the repo locally.

Download the `.yml` it produces into `plugins/CustomDialogs/dialogs/`, then run
`/customdialogs reload`.

---

## Apply changes

After editing any dialog, `config.yml` or `lang.yml`, run:

```
/customdialogs reload
```
