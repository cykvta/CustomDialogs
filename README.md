# CustomDialogs

A Spigot/Paper plugin that builds Minecraft **custom screens** using the new
Paper **Dialog API**, defined entirely from config.

> **Status:** base only. Dialogs render and open, but buttons are **inert** —
> clicking one just closes the screen. Button actions come later.

## Requirements

- **Paper 1.21.6+** (the Dialog API was added in 1.21.6).
- **Java 21**.

## Building

Uses Maven; CykutaAPI is shaded into the final jar.

```bash
mvn clean package
```

The plugin jar lands in `target/CustomDialogs-1.0.0-SNAPSHOT.jar`.
(IntelliJ: open the folder as a Maven project and run the `package` lifecycle.)

## Commands

Registered at runtime via CykutaAPI (no `plugin.yml` entries):

| Command | Permission | Description |
|---|---|---|
| `/customdialogs` (aliases `/cd`, `/dialogs`) | `customdialogs.command` | Help |
| `/customdialogs open <id> [player]` | `customdialogs.open` | Open a dialog |
| `/customdialogs list` | `customdialogs.list` | List loaded dialog ids |
| `/customdialogs reload` | `customdialogs.reload` | Reload configs + dialogs |

## Defining dialogs

Dialogs live in the plugin's `dialogs/` folder — **one dialog per `.yml` file**.
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

Nest as many subfolders as you like. The example files are extracted from the
jar on first run.

Each file is a single dialog:

```yaml
title: "&b&lWelcome!"
external-title: "&bWelcome"     # optional (shown on the pause-menu button)
can-close-with-escape: true
type: multi_action              # multi_action (default) | notice | confirmation
columns: 2                      # multi_action only
body:
  - "&7Welcome to the server!"
buttons:                        # inert for now
  - label: "&aContinue"
    tooltip: "Close this screen"
    width: 150
```

Open it with `/customdialogs open example/dialog/simple`.

**Button count per type:** `notice` = 0–1, `confirmation` = 2 (yes/no),
`multi_action` = 1+.

Colors use `&` codes and `#rrggbb` hex.

## Inputs (form fields)

A dialog can show **form inputs** the player fills in before clicking a button.
Button actions read a field's value with the `{key}` token. Four types:

```yaml
type: multi_action
inputs:
  - type: single_option           # a dropdown
    key: item
    label: "&7Item"
    options:
      - { id: diamond, display: "&bDiamond", default: true }
      - { id: bread,   display: "&eBread" }
  - type: number_range            # a slider
    key: amount
    label: "&7Amount"
    start: 1
    end: 64
    step: 1
    initial: 16
  - type: bool                    # a toggle
    key: announce
    label: "&7Announce it"
    on-true: "yes"                # value used for {announce} when checked
    on-false: "no"
  - type: text                    # a text field
    key: note
    label: "&7Note"
    max-length: 48
buttons:
  - label: "&aGive"
    actions:
      - "[console] give %player_name% {item} {amount}"
      - "[message] &aGave &f{amount}x {item}&7 ({note})"
```

`{key}` tokens are replaced with what the player entered, **before** PlaceholderAPI
runs, so inputs and `%placeholders%` can be mixed. Booleans substitute their
`on-true` / `on-false` text (default `true` / `false`); single-options substitute
the selected `id`; numbers drop a trailing `.0`. See
`dialogs/example/dialog/inputs.yml`. Inputs attach to normal dialogs
(`multi_action` / `notice` / `confirmation`).

## Conversations

`type: conversation` turns a dialog into a running dialogue whose **body grows
into a chat-like log** as the player picks responses:

```
Villager: Hello there, Steve! What brings you here?
Steve: Just exploring the area.
Villager: Wonderful! Take this for the road.
```

Each **step** is one NPC line plus the player's **responses** (buttons). Clicking
a response adds the player's line to the log, runs any actions, then advances to
the next step — or a named step via `goto`, for branching. When there is no next
step the conversation ends and the screen closes. Progress is tracked per player
and cleared on quit.

```yaml
type: conversation
columns: 1
player-name: "%player_name%"        # name shown for the player; defaults to the real name
npc-format: "&6{name}&7: &f{message}"
player-format: "&b{name}&7: &7{message}"
body:                               # optional intro shown above the log
  - "&8» You strike up a conversation."
steps:
  - id: start                       # optional; a goto target
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

`{name}`/`{message}` fill the format lines. The **player's name** (`player-name`)
is configurable and accepts any of: a literal string (e.g. `Jugador`), `{player}`
(the real Minecraft name, no PlaceholderAPI needed), or a `%placeholder%` such as
`%player_name%`; leave it blank for the real name. `{player}` also works inside any
other line. Use `say: ""` for a response that adds no player line. A step with no
responses shows a single close button (`end-label`).
See `dialogs/example/dialog/conversation.yml`. Binds nicely to a Citizens NPC:
`/customdialogs npc example/dialog/conversation`.

How much of the log stays visible (to avoid scrolling) is a **global** setting in
`config.yml` — `conversation.history` (`none` = keep all, or a number for the last
N lines), applied to every conversation.

## Messages

Every player-facing message lives in `plugins/CustomDialogs/lang.yml` and can be
edited freely (colors, wording, translations). `{placeholders}` in curly braces
(e.g. `{count}`, `{id}`, `{player}`) are filled in by the plugin — keep them.
The chat prefix stays in `config.yml`. Run `/customdialogs reload` to apply changes.

## Project layout

```
icu.cykuta.customdialogs
├── CustomDialogs.java            main plugin (config + commands + manager wiring)
├── command/                      CykutaAPI BaseCommand subclasses
│   ├── CommandCustomDialogs.java root command
│   ├── CommandOpen.java          open <id> [player]
│   ├── CommandList.java          list
│   └── CommandReload.java        reload
├── dialog/
│   ├── CustomDialog.java         parsed model + built Paper Dialog
│   ├── DialogButton.java         button model (record)
│   ├── DialogKind.java           notice / confirmation / multi_action
│   └── DialogManager.java        scans dialogs/ folder, builds & opens dialogs
└── util/
    └── Texts.java                & / hex string -> Adventure Component
```
