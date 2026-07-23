package icu.cykuta.customdialogs.command;

import icu.cykuta.api.command.BaseCommand;
import icu.cykuta.customdialogs.CustomDialogs;
import org.bukkit.Bukkit;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * {@code /customdialogs open <id> [player]} - opens a dialog for a player.
 * <p>
 * A player target may be omitted when a player runs the command (opens it for
 * themselves). From console the target is required.
 */
public final class CommandOpen extends BaseCommand {

    private final CustomDialogs plugin;

    public CommandOpen(CustomDialogs plugin) {
        super(plugin, "open", "customdialogs.open", CommandMode.BOTH);
        this.plugin = plugin;
    }

    @Override
    protected boolean onCommand(CommandSender sender, String[] args) {
        if (args.length < 1) {
            plugin.send(sender, "open.usage");
            return true;
        }

        String id = args[0];
        if (!plugin.dialogs().exists(id)) {
            plugin.send(sender, "open.unknown-dialog", "id", id);
            return true;
        }

        Player target;
        if (args.length >= 2) {
            target = Bukkit.getPlayerExact(args[1]);
            if (target == null) {
                plugin.send(sender, "open.player-not-found", "player", args[1]);
                return true;
            }
        } else if (sender instanceof Player self) {
            target = self;
        } else {
            plugin.send(sender, "open.console-needs-player", "id", id);
            return true;
        }

        plugin.dialogs().open(target, id);

        if (target.equals(sender)) {
            plugin.send(sender, "open.self", "id", id);
        } else {
            plugin.send(sender, "open.other", "id", id, "player", target.getName());
        }
        return true;
    }

    @Override
    protected void onNoPermission(CommandSender sender) {
        plugin.send(sender, "no-permission.open");
    }
}
