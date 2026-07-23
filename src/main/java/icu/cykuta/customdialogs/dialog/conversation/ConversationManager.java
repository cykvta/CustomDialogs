package icu.cykuta.customdialogs.dialog.conversation;

import icu.cykuta.customdialogs.dialog.CustomDialog;
import icu.cykuta.customdialogs.dialog.DialogManager;
import icu.cykuta.customdialogs.dialog.action.ActionExecutor;
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
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Runs {@code conversation} dialogs: dialogue that plays out as a growing chat-like
 * log inside the dialog body.
 * <p>
 * Each conversation is a small state machine kept per player. Opening one starts a
 * fresh {@link Session}: the first step's NPC line is pushed to the log and the
 * step's response buttons are shown. Clicking a response optionally adds the
 * player's line to the log, runs any extra actions, then advances (to the next
 * step, or a {@code goto} target), re-showing the dialog with the longer log. When
 * there is no next step the conversation ends and the screen closes.
 * <p>
 * Sessions are dropped when the conversation ends or the player disconnects.
 */
public final class ConversationManager implements Listener {

    private final JavaPlugin plugin;
    private final DialogManager dialogs;
    private final ActionExecutor actions;

    private final Map<UUID, Session> sessions = new ConcurrentHashMap<>();

    public ConversationManager(JavaPlugin plugin, DialogManager dialogs, ActionExecutor actions) {
        this.plugin = plugin;
        this.dialogs = dialogs;
        this.actions = actions;
        plugin.getServer().getPluginManager().registerEvents(this, plugin);
    }

    /** Per-player progress through one conversation. */
    private static final class Session {
        final String dialogId;
        final Conversation conv;
        final String playerName;      // resolved once, reused for {player} + player-format
        final Deque<String> log = new ArrayDeque<>();
        int stepIndex;

        Session(String dialogId, Conversation conv, String playerName) {
            this.dialogId = dialogId;
            this.conv = conv;
            this.playerName = playerName;
        }
    }

    /** Starts (or restarts) the conversation defined by {@code def} for {@code player}. */
    public void start(Player player, CustomDialog def) {
        Conversation conv = def.conversation();
        if (conv == null || conv.isEmpty()) {
            plugin.getLogger().warning("Conversation dialog '" + def.id() + "' has no steps; nothing to open.");
            return;
        }
        Session session = new Session(def.id(), conv, resolvePlayerName(player, conv));
        sessions.put(player.getUniqueId(), session);
        goTo(player, def, session, 0);
    }

    /** Handles a clicked response: log the reply, run its actions, then advance. */
    private void respond(Player player, ConversationResponse response) {
        Session session = sessions.get(player.getUniqueId());
        if (session == null) {
            return; // conversation already ended (e.g. a stale button)
        }
        CustomDialog def = dialogs.get(session.dialogId);
        if (def == null) {
            end(player);
            return;
        }

        if (response.hasSay()) {
            push(session, formatPlayer(player, session, response.say()));
        }
        if (!response.actions().isEmpty()) {
            actions.run(player, response.actions());
        }

        int next = response.hasTarget()
                ? session.conv.indexOf(response.target())
                : session.stepIndex + 1;
        if (response.hasTarget() && next < 0) {
            plugin.getLogger().warning("Conversation '" + def.id() + "' has a response pointing to unknown step '"
                    + response.target() + "'; ending.");
            end(player);
            return;
        }

        // Advance next tick so the clicked screen settles before we replace it.
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            Session current = sessions.get(player.getUniqueId());
            if (current != session || !player.isOnline()) {
                return; // conversation changed/ended, or the player left
            }
            if (session.conv.step(next) == null) {
                end(player);
            } else {
                goTo(player, def, session, next);
            }
        });
    }

    /** Moves to {@code index}: push its NPC line to the log and show the screen. */
    private void goTo(Player player, CustomDialog def, Session session, int index) {
        ConversationStep step = session.conv.step(index);
        if (step == null) {
            end(player);
            return;
        }
        session.stepIndex = index;
        push(session, formatNpc(player, session, step));
        player.showDialog(build(player, def, session, step));
    }

    /** Ends the conversation for {@code player} and closes the screen. */
    public void end(Player player) {
        sessions.remove(player.getUniqueId());
        if (player.isOnline()) {
            player.closeDialog();
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        sessions.remove(event.getPlayer().getUniqueId());
    }

    // ------------------------------------------------------------------
    // Dialog assembly
    // ------------------------------------------------------------------

    private Dialog build(Player player, CustomDialog def, Session session, ConversationStep step) {
        // Body = static intro lines (resolved live) followed by the running log.
        List<DialogBody> body = new ArrayList<>();
        for (String line : def.body()) {
            body.add(DialogBody.plainMessage(Texts.toComponent(resolve(player, session, line))));
        }
        for (String line : session.log) {
            body.add(DialogBody.plainMessage(Texts.toComponent(line)));
        }

        DialogBase.Builder base = DialogBase.builder(Texts.toComponent(resolve(player, session, def.title())))
                .canCloseWithEscape(def.canCloseWithEscape())
                .pause(false)
                .afterAction(DialogBase.DialogAfterAction.NONE) // we replace the screen ourselves
                .body(body);
        if (def.externalTitle() != null) {
            base.externalTitle(Texts.toComponent(resolve(player, session, def.externalTitle())));
        }

        List<ActionButton> buttons = new ArrayList<>();
        for (ConversationResponse response : step.responses()) {
            buttons.add(responseButton(player, session, response));
        }

        DialogType type;
        if (buttons.isEmpty()) {
            // Terminal step: offer a single closing button so the log can be dismissed.
            type = DialogType.notice(endButton(player, session));
        } else if (buttons.size() == 1) {
            type = DialogType.notice(buttons.get(0));
        } else {
            type = DialogType.multiAction(buttons, null, session.conv.columns());
        }

        DialogBase built = base.build();
        return Dialog.create(factory -> factory.empty().base(built).type(type));
    }

    private ActionButton responseButton(Player player, Session session, ConversationResponse response) {
        Component label = Texts.toComponent(resolve(player, session, response.label()));
        Component tooltip = response.tooltip() == null
                ? null
                : Texts.toComponent(resolve(player, session, response.tooltip()));
        int width = Math.max(1, Math.min(1024, response.width()));
        DialogAction action = DialogAction.customClick((view, audience) -> {
            if (audience instanceof Player clicker) {
                respond(clicker, response);
            }
        }, clickOptions());
        return ActionButton.create(label, tooltip, width, action);
    }

    private ActionButton endButton(Player player, Session session) {
        Component label = Texts.toComponent(resolve(player, session, session.conv.endLabel()));
        DialogAction action = DialogAction.customClick((view, audience) -> {
            if (audience instanceof Player clicker) {
                end(clicker);
            }
        }, clickOptions());
        return ActionButton.create(label, null, ConversationResponse.DEFAULT_WIDTH, action);
    }

    private static ClickCallback.Options clickOptions() {
        return ClickCallback.Options.builder()
                .uses(ClickCallback.UNLIMITED_USES)
                .lifetime(ClickCallback.DEFAULT_LIFETIME)
                .build();
    }

    // ------------------------------------------------------------------
    // Line formatting
    // ------------------------------------------------------------------

    private String formatNpc(Player player, Session session, ConversationStep step) {
        String speaker = step.speaker() == null ? "" : step.speaker();
        String message = step.text() == null ? "" : step.text();
        String line = session.conv.npcFormat().replace("{name}", speaker).replace("{message}", message);
        return resolve(player, session, line);
    }

    private String formatPlayer(Player player, Session session, String say) {
        String line = session.conv.playerFormat().replace("{name}", session.playerName).replace("{message}", say);
        return resolve(player, session, line);
    }

    /** Appends a line to the log, trimming to the configured history window. */
    private void push(Session session, String line) {
        session.log.addLast(line);
        int history = session.conv.history();
        if (history > 0) {
            while (session.log.size() > history) {
                session.log.removeFirst();
            }
        }
    }

    /** Applies the plugin-native {@code {player}} token, then PlaceholderAPI. */
    private String resolve(Player player, Session session, String text) {
        if (text == null) {
            return "";
        }
        String out = text.replace("{player}", session.playerName);
        return Placeholders.apply(player, out);
    }

    /**
     * The player's display name for the log, from the {@code player-name} config.
     * It may be:
     * <ul>
     *   <li>a literal string (e.g. {@code "Player"} / {@code "Jugador"}),</li>
     *   <li>{@code {player}} — the plugin-native token for the real (Bukkit) name,
     *       no PlaceholderAPI required,</li>
     *   <li>a {@code %placeholder%} resolved by PlaceholderAPI (e.g. {@code %player_name%}).</li>
     * </ul>
     * Falls back to the real name when unset, or when a {@code %placeholder%} is
     * left unresolved (PAPI absent).
     */
    private String resolvePlayerName(Player player, Conversation conv) {
        String template = conv.playerName();
        if (template == null || template.isBlank()) {
            return player.getName();
        }
        // {player} -> the real name, always available (independent of PlaceholderAPI).
        String withName = template.replace("{player}", player.getName());
        String resolved = Placeholders.apply(player, withName);
        if (resolved == null || resolved.isBlank() || resolved.contains("%")) {
            return player.getName(); // PAPI missing/unresolved -> fall back to the real name
        }
        return resolved;
    }
}
