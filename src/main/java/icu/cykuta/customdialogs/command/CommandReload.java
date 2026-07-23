package icu.cykuta.customdialogs.command;

import icu.cykuta.api.command.BaseCommand;
import icu.cykuta.customdialogs.CustomDialogs;
import org.bukkit.command.CommandSender;

/**
 * {@code /customdialogs reload} - reloads configs and rebuilds all dialogs.
 */
public final class CommandReload extends BaseCommand {

    private final CustomDialogs plugin;

    public CommandReload(CustomDialogs plugin) {
        super(plugin, "reload", "customdialogs.reload", CommandMode.BOTH);
        this.plugin = plugin;
    }

    @Override
    protected boolean onCommand(CommandSender sender, String[] args) {
        try {
            plugin.configs().reloadAll();
            plugin.dialogs().loadAll();
            plugin.message(sender, "&aReloaded &f" + plugin.dialogs().count() + "&a dialog(s).");
        } catch (Exception e) {
            plugin.message(sender, "&cReload failed: " + e.getMessage());
            plugin.getLogger().warning("Reload failed: " + e.getMessage());
        }
        return true;
    }

    @Override
    protected void onNoPermission(CommandSender sender) {
        plugin.message(sender, "&cYou don't have permission to reload CustomDialogs.");
    }
}
