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
