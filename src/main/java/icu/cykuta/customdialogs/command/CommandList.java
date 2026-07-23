package icu.cykuta.customdialogs.command;

import icu.cykuta.api.command.BaseCommand;
import icu.cykuta.customdialogs.CustomDialogs;
import org.bukkit.command.CommandSender;

/**
 * {@code /customdialogs list} - lists the ids of all loaded dialogs.
 */
public final class CommandList extends BaseCommand {

    private final CustomDialogs plugin;

    public CommandList(CustomDialogs plugin) {
        super(plugin, "list", "customdialogs.list", CommandMode.BOTH);
        this.plugin = plugin;
    }

    @Override
    protected boolean onCommand(CommandSender sender, String[] args) {
        if (plugin.dialogs().count() == 0) {
            plugin.message(sender, "&7No dialogs are loaded.");
            return true;
        }
        plugin.message(sender, "&7Dialogs (&f" + plugin.dialogs().count() + "&7): &f"
                + String.join("&7, &f", plugin.dialogs().ids()));
        return true;
    }

    @Override
    protected void onNoPermission(CommandSender sender) {
        plugin.message(sender, "&cYou don't have permission to list dialogs.");
    }
}
