package icu.cykuta.customdialogs.command;

import icu.cykuta.api.command.BaseCommand;
import icu.cykuta.customdialogs.CustomDialogs;
import org.bukkit.command.CommandSender;

import java.util.List;

/**
 * Root command: {@code /customdialogs} (aliases: {@code /cd}, {@code /dialogs}).
 * <p>
 * Shows help and delegates to the {@code reload}, {@code open} and {@code list} subcommands.
 */
public final class CommandCustomDialogs extends BaseCommand {

    private final CustomDialogs plugin;

    public CommandCustomDialogs(CustomDialogs plugin) {
        super(plugin, "customdialogs", "customdialogs.command", CommandMode.BOTH);
        this.plugin = plugin;
        setAliases(List.of("cd", "dialogs"));

        addSubcommand(new CommandReload(plugin));
        addSubcommand(new CommandOpen(plugin));
        addSubcommand(new CommandList(plugin));
    }

    @Override
    protected boolean onCommand(CommandSender sender, String[] args) {
        plugin.send(sender, "help.header");
        plugin.send(sender, "help.open");
        plugin.send(sender, "help.list");
        plugin.send(sender, "help.reload");
        return true;
    }

    @Override
    protected void onNoPermission(CommandSender sender) {
        plugin.send(sender, "no-permission.command");
    }
}
