package icu.cykuta.customdialogs.dialog;

import icu.cykuta.customdialogs.dialog.action.ActionExecutor;
import icu.cykuta.customdialogs.dialog.action.ButtonAction;
import icu.cykuta.customdialogs.dialog.action.ActionType;
import icu.cykuta.customdialogs.dialog.conversation.Conversation;
import icu.cykuta.customdialogs.dialog.conversation.ConversationManager;
import icu.cykuta.customdialogs.dialog.conversation.ConversationResponse;
import icu.cykuta.customdialogs.dialog.conversation.ConversationStep;
import icu.cykuta.api.config.ConfigManager;
import icu.cykuta.customdialogs.dialog.input.DialogInputDef;
import icu.cykuta.customdialogs.util.Placeholders;
import icu.cykuta.customdialogs.util.Texts;
import io.papermc.paper.dialog.Dialog;
import io.papermc.paper.dialog.DialogResponseView;
import io.papermc.paper.registry.data.dialog.ActionButton;
import io.papermc.paper.registry.data.dialog.DialogBase;
import io.papermc.paper.registry.data.dialog.action.DialogAction;
import io.papermc.paper.registry.data.dialog.body.DialogBody;
import io.papermc.paper.registry.data.dialog.input.DialogInput;
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
import java.util.HashMap;
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
    private final ConfigManager configs;
    private final ActionExecutor actions;
    private final ConversationManager conversations;

    /** id (lowercase) -> loaded dialog. Insertion order preserved for listings. */
    private final Map<String, CustomDialog> dialogs = new LinkedHashMap<>();

    public DialogManager(JavaPlugin plugin, ConfigManager configs) {
        this.plugin = plugin;
        this.configs = configs;
        this.actions = new ActionExecutor(plugin, this);
        this.conversations = new ConversationManager(plugin, this, actions);
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
        List<DialogInputDef> inputs = parseInputs(section);

        // Conversations are always assembled per-player, step by step, by the
        // conversation manager; there is no cached Paper dialog to pre-build.
        if (kind == DialogKind.CONVERSATION) {
            Conversation conversation = parseConversation(section);
            return new CustomDialog(id, title, externalTitle, canCloseWithEscape,
                    kind, columns, afterAction, body, buttons, inputs, conversation, true, null);
        }

        boolean usesPlaceholders = detectPlaceholders(title, externalTitle, body, buttons, inputs);

        // Pre-built dialog with no placeholder resolution and every button shown.
        // Used directly when the dialog has neither placeholders nor permission
        // buttons; otherwise a per-player copy is assembled at open time.
        Dialog dialog = assemble(id, title, externalTitle, kind, columns, afterAction,
                canCloseWithEscape, body, buttons, inputs, UnaryOperator.identity(), b -> true);

        return new CustomDialog(id, title, externalTitle, canCloseWithEscape,
                kind, columns, afterAction, body, buttons, inputs, null, usesPlaceholders, dialog);
    }

    /** Reads the optional {@code inputs} list into input definitions. */
    @SuppressWarnings("unchecked")
    private List<DialogInputDef> parseInputs(ConfigurationSection section) {
        List<DialogInputDef> result = new ArrayList<>();
        for (Map<?, ?> raw : section.getMapList("inputs")) {
            result.add(DialogInputDef.parse((Map<String, Object>) raw));
        }
        return result;
    }

    /** Parses the {@code conversation}-specific config (formats + steps). */
    @SuppressWarnings("unchecked")
    private Conversation parseConversation(ConfigurationSection section) {
        // Player name, line formats and the history limit are global settings
        // (config.yml), shared by every conversation — not configured per-dialog.
        var config = configs.get("config.yml");
        String playerName = config.getString("conversation.player-name", "%player_name%");
        String npcFormat = config.getString("conversation.npc-format", "&6{name}&7: &f{message}");
        String playerFormat = config.getString("conversation.player-format", "&b{name}&7: &7{message}");
        int history = parseHistory(config.getString("conversation.history", "none"));
        String endLabel = section.getString("end-label", "&7Close");
        int columns = Math.max(1, section.getInt("columns", 1)); // conversations default to 1 column

        List<ConversationStep> steps = new ArrayList<>();
        for (Map<?, ?> raw : section.getMapList("steps")) {
            Map<String, Object> map = (Map<String, Object>) raw;
            Object idObj = map.get("id");
            String stepId = idObj == null ? null : String.valueOf(idObj);
            String speaker = String.valueOf(map.getOrDefault("speaker", map.getOrDefault("name", "")));
            String text = String.valueOf(map.getOrDefault("text", map.getOrDefault("message", "")));
            steps.add(new ConversationStep(stepId, speaker, text, parseResponses(map)));
        }
        return new Conversation(playerName, npcFormat, playerFormat, endLabel, history, columns, steps);
    }

    /**
     * Parses the {@code history} value: the max number of log lines kept visible.
     * {@code none} (the default) / {@code 0} / a blank keep the whole log; a positive
     * number keeps only that many most-recent lines (to avoid scrolling).
     */
    private static int parseHistory(String raw) {
        if (raw == null) {
            return 0;
        }
        String s = raw.trim().toLowerCase();
        if (s.isEmpty() || s.equals("none") || s.equals("all") || s.equals("infinite")
                || s.equals("unlimited") || s.equals("off")) {
            return 0;
        }
        try {
            return Math.max(0, Integer.parseInt(s));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** Reads a step's {@code responses} (or {@code buttons}) list into response models. */
    @SuppressWarnings("unchecked")
    private List<ConversationResponse> parseResponses(Map<String, Object> stepMap) {
        List<ConversationResponse> result = new ArrayList<>();
        Object raw = stepMap.get("responses");
        if (raw == null) {
            raw = stepMap.get("buttons"); // accept either key
        }
        if (!(raw instanceof List<?> list)) {
            return result;
        }
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) {
                continue;
            }
            Map<String, Object> map = (Map<String, Object>) m;
            String label = String.valueOf(map.getOrDefault("label", ""));
            Object tooltipObj = map.get("tooltip");
            String tooltip = tooltipObj == null ? null : String.valueOf(tooltipObj);
            int width = map.get("width") instanceof Number n ? n.intValue() : ConversationResponse.DEFAULT_WIDTH;
            // "say" defaults to the label; an explicit blank means "no player line".
            String say = map.containsKey("say") ? String.valueOf(map.get("say")) : label;
            Object gotoObj = map.get("goto");
            String target = gotoObj == null ? null : String.valueOf(gotoObj);
            result.add(new ConversationResponse(label, tooltip, width, say, target, parseActions(map)));
        }
        return result;
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
                            List<String> body, List<DialogButton> buttons, List<DialogInputDef> inputs,
                            UnaryOperator<String> tx, Predicate<DialogButton> visible) {
        // --- Body ---
        List<DialogBody> bodyElements = new ArrayList<>();
        for (String line : body) {
            bodyElements.add(DialogBody.plainMessage(Texts.toComponent(tx.apply(line))));
        }

        // --- Inputs (form fields) ---
        List<DialogInput> dialogInputs = new ArrayList<>();
        for (DialogInputDef input : inputs) {
            dialogInputs.add(input.toPaperInput(tx));
        }

        // --- Base ---
        DialogBase.Builder baseBuilder = DialogBase.builder(Texts.toComponent(tx.apply(title)))
                .canCloseWithEscape(canCloseWithEscape)
                .pause(false) // never pause: this is a server plugin, pausing only affects singleplayer
                .afterAction(afterAction)
                .body(bodyElements)
                .inputs(dialogInputs);
        if (externalTitle != null) {
            baseBuilder.externalTitle(Texts.toComponent(tx.apply(externalTitle)));
        }
        DialogBase base = baseBuilder.build();

        // --- Buttons (permission-hidden ones are dropped) ---
        List<ActionButton> actionButtons = new ArrayList<>();
        for (DialogButton b : buttons) {
            if (visible.test(b)) {
                actionButtons.add(toActionButton(b, tx, inputs));
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
                def.body(), def.buttons(), def.inputs(), tx, visible);
    }

    /** True if any of the dialog's text carries a {@code %} (a possible placeholder). */
    private static boolean detectPlaceholders(String title, String externalTitle,
                                              List<String> body, List<DialogButton> buttons,
                                              List<DialogInputDef> inputs) {
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
        for (DialogInputDef in : inputs) {
            if (in.usesPlaceholders()) {
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
            case MULTI_ACTION, CONVERSATION -> {
                // CONVERSATION never reaches here (it is assembled by the conversation
                // manager, not this cached path); handled with multi_action for exhaustiveness.
                if (buttons.isEmpty()) {
                    plugin.getLogger().warning("Dialog '" + id
                            + "' is a multi_action but has no buttons; falling back to empty notice.");
                    yield DialogType.notice();
                }
                yield DialogType.multiAction(buttons, null, columns);
            }
        };
    }

    private ActionButton toActionButton(DialogButton b, UnaryOperator<String> tx, List<DialogInputDef> inputs) {
        Component tooltip = b.tooltip() == null ? null : Texts.toComponent(tx.apply(b.tooltip()));
        int width = Math.max(1, Math.min(1024, b.width()));
        return ActionButton.create(Texts.toComponent(tx.apply(b.label())), tooltip, width, buildAction(b, inputs));
    }

    /**
     * Turns a button's actions into a Paper {@link DialogAction}, or {@code null}
     * when it has none (in which case clicking only closes the screen). The click
     * callback reads the clicking player from the audience and the submitted input
     * values from the view, so {@code {key}} tokens in the actions resolve to what
     * the player entered. The same action works on both the cached and per-player dialog.
     */
    private DialogAction buildAction(DialogButton b, List<DialogInputDef> inputs) {
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
                actions.run(player, buttonActions, readInputs(view, inputs));
            }
        }, options);
    }

    /** Reads every input's submitted value into a {@code key -> value} map for {@code {key}} substitution. */
    private static Map<String, String> readInputs(DialogResponseView view, List<DialogInputDef> inputs) {
        if (view == null || inputs.isEmpty()) {
            return Map.of();
        }
        Map<String, String> values = new HashMap<>();
        for (DialogInputDef input : inputs) {
            values.put(input.key(), input.stringValue(view));
        }
        return values;
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
        // Conversations run as a stateful, per-player log built step by step.
        if (def.kind() == DialogKind.CONVERSATION) {
            conversations.start(player, def);
            return true;
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
