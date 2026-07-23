# CustomDialogs

A Spigot/Paper plugin that builds Minecraft **custom screens** using the Paper
**Dialog API**, defined entirely from config — menus, notices, confirmations,
**form inputs** and branching **conversations**.

<p align="center">
  <a href="USAGE.md"><img src="https://img.shields.io/badge/%F0%9F%93%96%20Usage%20Guide-for%20server%20admins-5865F2?style=for-the-badge" alt="Usage Guide"></a>
</p>

> **Server admin?** Everything in-game — installing, commands, permissions, config
> and how to write dialogs — is in the **[Usage Guide](USAGE.md)**. This README is
> about building the plugin from source.

## Requirements

- **JDK 21** (Paper 1.21.8 / the Dialog API require it).
- **Maven**.
- Targets the **Paper 1.21.6+** API (the Dialog API was added in 1.21.6).

## Building

CykutaAPI is shaded into the final jar; PlaceholderAPI and Citizens are
`provided` (soft dependencies supplied by the server at runtime).

```bash
mvn clean package
```

The shaded plugin jar lands at `target/CustomDialogs-<version>.jar`
(the `original-*.jar` alongside it is the pre-shade artifact — don't ship it).
In IntelliJ, open the folder as a Maven project and run the `package` lifecycle.

## Web builder

`web-builder/` is a **node-based visual editor** (static HTML/CSS/JS plus one
vendored library, [Drawflow](https://github.com/jerosoler/Drawflow)) that produces
dialog `.yml` files. Open `web-builder/index.html` directly, or serve the folder.
It is published to GitHub Pages by `.github/workflows/pages.yml`. See
`web-builder/` for details.

## Releasing (CI)

`.github/workflows/release.yml` runs on pushes to `master` that change `pom.xml`:

1. Bump `<version>` in `pom.xml` to a **final** version (e.g. `1.1.0` — `-SNAPSHOT`
   versions are intentionally skipped).
2. Push to `master`.

The workflow builds with JDK 21 and, if no release exists for that version yet,
publishes a GitHub Release tagged with the version (tag == `project.version`, so it
matches the in-game update checker) and uploads `CustomDialogs-<version>.jar`.

## Project layout

```
icu.cykuta.customdialogs
├── CustomDialogs.java              main plugin: config, commands, update check, wiring
├── command/                        CykutaAPI BaseCommand subclasses (root, open, list, reload)
├── citizens/                       optional Citizens integration (hook, trait, /...npc command)
├── dialog/
│   ├── CustomDialog.java           parsed model + built Paper Dialog
│   ├── DialogButton.java           button model (record)
│   ├── DialogKind.java             notice / confirmation / multi_action / conversation
│   ├── DialogManager.java          scans dialogs/, builds & opens dialogs
│   ├── action/                     button action model + executor
│   ├── conversation/               conversation model + per-player runner
│   └── input/                      form inputs (text / bool / single_option / number_range)
└── util/                           Texts (& / hex -> Component), Placeholders (PAPI bridge)
```

## Dependencies

- **CykutaAPI** — config, commands, update checker, text/color utils (shaded).
- **Paper API 1.21.8** — Bukkit + Adventure + the Dialog API (`provided`).
- **PlaceholderAPI**, **Citizens** — optional, `provided` (softdepend).
