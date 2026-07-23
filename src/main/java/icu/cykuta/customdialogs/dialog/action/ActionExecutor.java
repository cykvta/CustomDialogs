package icu.cykuta.customdialogs.dialog.action;

import icu.cykuta.customdialogs.dialog.DialogManager;
import icu.cykuta.customdialogs.util.Placeholders;
import icu.cykuta.customdialogs.util.Texts;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;
import java.util.Map;
import java.util.logging.Level;

/**
 * Runs the {@link ButtonAction}s attached to a dialog button when it is clicked.
 * <p>
 * Every action's value is resolved through PlaceholderAPI for the clicking
 * player first, so commands and messages may use {@code %placeholders%}.
 * Actions run in order; a failure in one is logged and does not stop the rest.
 */
public final class ActionExecutor {

    private final JavaPlugin plugin;
    private final DialogManager dialogs;

    public ActionExecutor(JavaPlugin plugin, DialogManager dialogs) {
        this.plugin = plugin;
        this.dialogs = dialogs;
    }

    /** Runs {@code actions} for {@code player}, in order (no dialog input values). */
    public void run(Player player, List<ButtonAction> actions) {
        run(player, actions, Map.of());
    }

    /**
     * Runs {@code actions} for {@code player}, in order, substituting dialog input
     * values ({@code {key}} tokens) from {@code inputs} into each action first.
     */
    public void run(Player player, List<ButtonAction> actions, Map<String, String> inputs) {
        for (ButtonAction action : actions) {
            try {
                execute(player, action, inputs);
            } catch (Exception e) {
                plugin.getLogger().log(Level.WARNING,
                        "Failed to run action [" + action.type() + "] for " + player.getName()
                                + ": " + e.getMessage(), e);
            }
        }
    }

    private void execute(Player player, ButtonAction action, Map<String, String> inputs) {
        String value = Placeholders.apply(player, substituteInputs(action.value(), inputs));
        switch (action.type()) {
            case PLAYER -> player.performCommand(value);
            case CONSOLE -> Bukkit.dispatchCommand(Bukkit.getConsoleSender(), value);
            case OP -> runAsOp(player, value);
            case MESSAGE -> player.sendMessage(Texts.toComponent(value));
            case BROADCAST -> Bukkit.getServer().broadcast(Texts.toComponent(value));
            case CLOSE -> player.closeDialog();
            case OPEN -> openDialog(player, value);
        }
    }

    /** Replaces {@code {key}} tokens with the matching dialog input value. */
    private static String substituteInputs(String value, Map<String, String> inputs) {
        if (value == null || inputs.isEmpty() || value.indexOf('{') < 0) {
            return value;
        }
        String out = value;
        for (Map.Entry<String, String> entry : inputs.entrySet()) {
            out = out.replace("{" + entry.getKey() + "}", entry.getValue() == null ? "" : entry.getValue());
        }
        return out;
    }

    /** Runs a command as the player with op granted only for that single command. */
    private void runAsOp(Player player, String command) {
        boolean wasOp = player.isOp();
        try {
            player.setOp(true);
            player.performCommand(command);
        } finally {
            if (!wasOp) {
                player.setOp(false);
            }
        }
    }

    /** Opens another dialog next tick, so the current screen closes cleanly first. */
    private void openDialog(Player player, String id) {
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            if (!dialogs.open(player, id)) {
                plugin.getLogger().warning("Button tried to open an unknown dialog: " + id);
            }
        });
    }
}
