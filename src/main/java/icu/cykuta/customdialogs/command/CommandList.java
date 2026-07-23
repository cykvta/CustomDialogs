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
            plugin.send(sender, "list.empty");
            return true;
        }
        String separator = plugin.lang("list.separator");
        plugin.send(sender, "list.header",
                "count", String.valueOf(plugin.dialogs().count()),
                "dialogs", String.join(separator, plugin.dialogs().ids()));
        return true;
    }

    @Override
    protected void onNoPermission(CommandSender sender) {
        plugin.send(sender, "no-permission.list");
    }
}
