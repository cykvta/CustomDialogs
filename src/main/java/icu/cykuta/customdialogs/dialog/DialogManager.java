package icu.cykuta.customdialogs.dialog;

import icu.cykuta.customdialogs.dialog.action.ActionExecutor;
import icu.cykuta.customdialogs.dialog.action.ButtonAction;
import icu.cykuta.customdialogs.dialog.action.ActionType;
import icu.cykuta.customdialogs.util.Placeholders;
import icu.cykuta.customdialogs.util.Texts;
import io.papermc.paper.dialog.Dialog;
import io.papermc.paper.registry.data.dialog.ActionButton;
import io.papermc.paper.registry.data.dialog.DialogBase;
import io.papermc.paper.registry.data.dialog.action.DialogAction;
import io.papermc.paper.registry.data.dialog.body.DialogBody;
import io.papermc.paper.registry.data.dialog.type.DialogType;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickCallback;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.logging.Level;
import java.util.stream.Stream;

/**
 * Loads dialog definitions from the plugin's {@code dialogs/} folder and turns
 * each one into a Paper {@link Dialog} (a "custom screen").
 * <p>
 * Layout: one dialog per {@code .yml} file. Subfolders act as categories, and the
 * dialog id is the file's path under {@code dialogs/} without the extension:
 * <pre>
 *   dialogs/example/dialog/simple.yml   ->   id: example/dialog/simple
 * </pre>
 * On first run the bundled example dialogs are extracted from the jar.
 * <p>
 * Buttons may run actions on click (commands, opening other dialogs, closing,
 * messages) and may be gated behind a permission; a button with no actions just
 * closes the screen.
 */
public final class DialogManager {

    private static final String FOLDER = "dialogs";
    private static final String EXT = ".yml";

    private final JavaPlugin plugin;
    private final ActionExecutor actions;

    /** id (lowercase) -> loaded dialog. Insertion order preserved for listings. */
    private final Map<String, CustomDialog> dialogs = new LinkedHashMap<>();

    public DialogManager(JavaPlugin plugin) {
        this.plugin = plugin;
        this.actions = new ActionExecutor(plugin, this);
    }

    /** The on-disk {@code dialogs/} folder inside the plugin's data folder. */
    public File folder() {
        return new File(plugin.getDataFolder(), FOLDER);
    }

    /**
     * (Re)scans the {@code dialogs/} folder and rebuilds every dialog. Safe to
     * call again for reloads; the previous set is discarded first.
     */
    public void loadAll() {
        dialogs.clear();

        File root = folder();
        if (!root.exists()) {
            extractDefaults();
        }
        if (!root.isDirectory()) {
            plugin.getLogger().warning("Dialogs folder is missing; no dialogs loaded.");
            return;
        }

        Path rootPath = root.toPath();
        try (Stream<Path> stream = Files.walk(rootPath)) {
            stream.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().toLowerCase().endsWith(EXT))
                    .sorted()
                    .forEach(p -> loadFile(rootPath, p));
        } catch (IOException e) {
            plugin.getLogger().log(Level.WARNING, "Failed to scan dialogs folder: " + e.getMessage(), e);
        }

        plugin.getLogger().info("Loaded " + dialogs.size() + " dialog(s).");
    }

    /** Loads a single dialog file, deriving its id from the path under {@code dialogs/}. */
    private void loadFile(Path root, Path file) {
        String relative = root.relativize(file).toString().replace('\\', '/');
        String id = relative.substring(0, relative.length() - EXT.length());
        try {
            YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file.toFile());
            CustomDialog dialog = build(id, yaml);
            dialogs.put(id.toLowerCase(), dialog);
        } catch (Exception e) {
            plugin.getLogger().log(Level.WARNING, "Failed to load dialog '" + id + "': " + e.getMessage(), e);
        }
    }

    /** Copies the bundled example dialogs from the jar into the data folder (first run only). */
    private void extractDefaults() {
        try {
            URI location = plugin.getClass().getProtectionDomain().getCodeSource().getLocation().toURI();
            File source = new File(location);
            if (!source.isFile()) {
                return; // running exploded (e.g. IDE); nothing to extract
            }
            try (JarFile jar = new JarFile(source)) {
                Enumeration<JarEntry> entries = jar.entries();
                while (entries.hasMoreElements()) {
                    String name = entries.nextElement().getName();
                    if (name.startsWith(FOLDER + "/") && name.toLowerCase().endsWith(EXT)) {
                        plugin.saveResource(name, false);
                    }
                }
            }
        } catch (Exception e) {
            plugin.getLogger().log(Level.WARNING, "Could not extract default dialogs: " + e.getMessage(), e);
        }
    }

    /** Parses one config (a single dialog file's root) into a {@link CustomDialog}. */
    private CustomDialog build(String id, ConfigurationSection section) {
        String title = section.getString("title", id);
        String externalTitle = section.getString("external-title", null);
        boolean canCloseWithEscape = section.getBoolean("can-close-with-escape", true);
        DialogKind kind = DialogKind.from(section.getString("type"));
        int columns = Math.max(1, section.getInt("columns", 2));
        DialogBase.DialogAfterAction afterAction = parseAfterAction(section.getString("after-action"));
        List<String> body = section.getStringList("body");
        List<DialogButton> buttons = parseButtons(section);

        boolean usesPlaceholders = detectPlaceholders(title, externalTitle, body, buttons);

        // Pre-built dialog with no placeholder resolution and every button shown.
        // Used directly when the dialog has neither placeholders nor permission
        // buttons; otherwise a per-player copy is assembled at open time.
        Dialog dialog = assemble(id, title, externalTitle, kind, columns, afterAction,
                canCloseWithEscape, body, buttons, UnaryOperator.identity(), b -> true);

        return new CustomDialog(id, title, externalTitle, canCloseWithEscape,
                kind, columns, afterAction, body, buttons, usesPlaceholders, dialog);
    }

    /**
     * Builds a Paper {@link Dialog} from a dialog's raw pieces. Every config
     * string is run through {@code tx} first (identity for the cached dialog, a
     * per-player placeholder resolver at open time), and only buttons accepted by
     * {@code visible} are included (all of them for the cached dialog).
     */
    private Dialog assemble(String id, String title, String externalTitle, DialogKind kind,
                            int columns, DialogBase.DialogAfterAction afterAction,
                            boolean canCloseWithEscape,
                            List<String> body, List<DialogButton> buttons,
                            UnaryOperator<String> tx, Predicate<DialogButton> visible) {
        // --- Body ---
        List<DialogBody> bodyElements = new ArrayList<>();
        for (String line : body) {
            bodyElements.add(DialogBody.plainMessage(Texts.toComponent(tx.apply(line))));
        }

        // --- Base ---
        DialogBase.Builder baseBuilder = DialogBase.builder(Texts.toComponent(tx.apply(title)))
                .canCloseWithEscape(canCloseWithEscape)
                .pause(false) // never pause: this is a server plugin, pausing only affects singleplayer
                .afterAction(afterAction)
                .body(bodyElements);
        if (externalTitle != null) {
            baseBuilder.externalTitle(Texts.toComponent(tx.apply(externalTitle)));
        }
        DialogBase base = baseBuilder.build();

        // --- Buttons (permission-hidden ones are dropped) ---
        List<ActionButton> actionButtons = new ArrayList<>();
        for (DialogButton b : buttons) {
            if (visible.test(b)) {
                actionButtons.add(toActionButton(b, tx));
            }
        }

        // --- Type ---
        DialogType type = buildType(id, kind, actionButtons, columns);

        // --- Assemble ---
        return Dialog.create(factory -> factory.empty()
                .base(base)
                .type(type));
    }

    /**
     * Assembles a per-player copy of {@code def}: placeholders are resolved for
     * {@code player} and permission-gated buttons they lack are hidden.
     */
    private Dialog buildFor(Player player, CustomDialog def) {
        UnaryOperator<String> tx = s -> Placeholders.apply(player, s);
        Predicate<DialogButton> visible = b -> !b.hasPermission() || player.hasPermission(b.permission());
        return assemble(def.id(), def.title(), def.externalTitle(), def.kind(), def.columns(),
                def.afterAction(), def.canCloseWithEscape(),
                def.body(), def.buttons(), tx, visible);
    }

    /** True if any of the dialog's text carries a {@code %} (a possible placeholder). */
    private static boolean detectPlaceholders(String title, String externalTitle,
                                              List<String> body, List<DialogButton> buttons) {
        if (Placeholders.contains(title) || Placeholders.contains(externalTitle)) {
            return true;
        }
        for (String line : body) {
            if (Placeholders.contains(line)) {
                return true;
            }
        }
        for (DialogButton b : buttons) {
            if (Placeholders.contains(b.label()) || Placeholders.contains(b.tooltip())) {
                return true;
            }
        }
        return false;
    }

    private DialogType buildType(String id, DialogKind kind, List<ActionButton> buttons, int columns) {
        return switch (kind) {
            case NOTICE -> buttons.isEmpty()
                    ? DialogType.notice()
                    : DialogType.notice(buttons.get(0));
            case CONFIRMATION -> {
                if (buttons.size() < 2) {
                    plugin.getLogger().warning("Dialog '" + id
                            + "' is a confirmation but has fewer than 2 buttons; falling back to notice.");
                    yield buttons.isEmpty() ? DialogType.notice() : DialogType.notice(buttons.get(0));
                }
                yield DialogType.confirmation(buttons.get(0), buttons.get(1));
            }
            case MULTI_ACTION -> {
                if (buttons.isEmpty()) {
                    plugin.getLogger().warning("Dialog '" + id
                            + "' is a multi_action but has no buttons; falling back to empty notice.");
                    yield DialogType.notice();
                }
                yield DialogType.multiAction(buttons, null, columns);
            }
        };
    }

    private ActionButton toActionButton(DialogButton b, UnaryOperator<String> tx) {
        Component tooltip = b.tooltip() == null ? null : Texts.toComponent(tx.apply(b.tooltip()));
        int width = Math.max(1, Math.min(1024, b.width()));
        return ActionButton.create(Texts.toComponent(tx.apply(b.label())), tooltip, width, buildAction(b));
    }

    /**
     * Turns a button's actions into a Paper {@link DialogAction}, or {@code null}
     * when it has none (in which case clicking only closes the screen). The click
     * callback reads the clicking player from the audience, so the same action
     * works on both the cached and the per-player dialog.
     */
    private DialogAction buildAction(DialogButton b) {
        List<ButtonAction> buttonActions = b.actions();
        if (buttonActions.isEmpty()) {
            return null;
        }
        ClickCallback.Options options = ClickCallback.Options.builder()
                .uses(ClickCallback.UNLIMITED_USES)
                .lifetime(ClickCallback.DEFAULT_LIFETIME)
                .build();
        return DialogAction.customClick((view, audience) -> {
            if (audience instanceof Player player) {
                actions.run(player, buttonActions);
            }
        }, options);
    }

    @SuppressWarnings("unchecked")
    private List<DialogButton> parseButtons(ConfigurationSection section) {
        List<DialogButton> result = new ArrayList<>();
        for (Map<?, ?> raw : section.getMapList("buttons")) {
            Map<String, Object> map = (Map<String, Object>) raw;
            String label = String.valueOf(map.getOrDefault("label", ""));
            Object tooltipObj = map.get("tooltip");
            String tooltip = tooltipObj == null ? null : String.valueOf(tooltipObj);
            int width = map.get("width") instanceof Number n ? n.intValue() : DialogButton.DEFAULT_WIDTH;
            Object permObj = map.get("permission");
            String permission = permObj == null ? null : String.valueOf(permObj);
            result.add(new DialogButton(label, tooltip, width, permission, parseActions(map)));
        }
        return result;
    }

    /**
     * Reads a button's actions, in run order:
     * <ol>
     *   <li>the {@code actions} list (each line parsed by {@link ButtonAction#parse});</li>
     *   <li>{@code message} / {@code messages} response line(s) sent to the clicking
     *       player's chat (shorthand for {@code [message]} actions);</li>
     *   <li>a {@code command} shorthand run as the clicking player.</li>
     * </ol>
     */
    private static List<ButtonAction> parseActions(Map<String, Object> map) {
        List<ButtonAction> result = new ArrayList<>();
        if (map.get("actions") instanceof List<?> list) {
            for (Object o : list) {
                if (o != null) {
                    result.add(ButtonAction.parse(String.valueOf(o)));
                }
            }
        }
        // Chat response(s): "message" (single line) and/or "messages" (a list).
        if (map.get("messages") instanceof List<?> lines) {
            for (Object line : lines) {
                if (line != null) {
                    result.add(new ButtonAction(ActionType.MESSAGE, String.valueOf(line)));
                }
            }
        }
        Object message = map.get("message");
        if (message != null) {
            result.add(new ButtonAction(ActionType.MESSAGE, String.valueOf(message)));
        }
        Object command = map.get("command");
        if (command != null) {
            result.add(new ButtonAction(ActionType.PLAYER, String.valueOf(command)));
        }
        return result;
    }

    /** Maps the optional {@code after-action} config value; defaults to {@code CLOSE}. */
    private static DialogBase.DialogAfterAction parseAfterAction(String raw) {
        if (raw == null) {
            return DialogBase.DialogAfterAction.CLOSE;
        }
        return switch (raw.trim().toLowerCase()) {
            case "none", "stay", "keep", "keep-open" -> DialogBase.DialogAfterAction.NONE;
            case "wait", "wait_for_response", "wait-for-response" -> DialogBase.DialogAfterAction.WAIT_FOR_RESPONSE;
            default -> DialogBase.DialogAfterAction.CLOSE;
        };
    }

    /**
     * Shows the dialog with the given id to a player.
     *
     * @return {@code true} if a dialog was found and shown, {@code false} otherwise
     */
    public boolean open(Player player, String id) {
        CustomDialog def = dialogs.get(id.toLowerCase());
        if (def == null) {
            return false;
        }
        // Rebuild per-player when placeholders need resolving (and PAPI is present)
        // or buttons are permission-gated; otherwise show the cached dialog.
        boolean perPlayer = (def.usesPlaceholders() && Placeholders.isAvailable())
                || def.hasPermissionButtons();
        Dialog dialog = perPlayer ? buildFor(player, def) : def.dialog();
        player.showDialog(dialog);
        return true;
    }

    public boolean exists(String id) {
        return dialogs.containsKey(id.toLowerCase());
    }

    public CustomDialog get(String id) {
        return dialogs.get(id.toLowerCase());
    }

    /** Ids in load order, unmodifiable. */
    public Set<String> ids() {
        return Collections.unmodifiableSet(dialogs.keySet());
    }

    public int count() {
        return dialogs.size();
    }
}
