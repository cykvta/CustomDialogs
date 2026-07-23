package icu.cykuta.customdialogs;

import icu.cykuta.api.command.CommandRegistry;
import icu.cykuta.api.config.ConfigManager;
import icu.cykuta.api.util.Text;
import icu.cykuta.customdialogs.citizens.CitizensHook;
import icu.cykuta.customdialogs.citizens.CommandNpc;
import icu.cykuta.customdialogs.command.CommandCustomDialogs;
import icu.cykuta.customdialogs.dialog.DialogManager;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * CustomDialogs main entry point.
 * <p>
 * Wires up CykutaAPI's config + command systems and the {@link DialogManager},
 * which builds Minecraft custom screens (Paper Dialogs) from the {@code dialogs/} folder.
 */
public final class CustomDialogs extends JavaPlugin {

    private ConfigManager configManager;
    private DialogManager dialogManager;

    @Override
    public void onEnable() {
        // --- Config (CykutaAPI) ---
        this.configManager = new ConfigManager(this);
        this.configManager.register("config.yml");

        // --- Dialogs (loaded from the dialogs/ folder, one file per dialog) ---
        this.dialogManager = new DialogManager(this);
        this.dialogManager.loadAll();

        // --- Commands (CykutaAPI) ---
        CommandCustomDialogs root = new CommandCustomDialogs(this);

        // --- Optional Citizens integration (soft dependency) ---
        // Guarded so the Citizens classes are only ever loaded when it's installed.
        if (getServer().getPluginManager().getPlugin("Citizens") != null) {
            new CitizensHook(this).enable();
            root.addSubcommand(new CommandNpc(this));
        }

        new CommandRegistry(this).register(root);

        getLogger().info("CustomDialogs enabled.");
    }

    @Override
    public void onDisable() {
        getLogger().info("CustomDialogs disabled.");
    }

    public ConfigManager configs() {
        return configManager;
    }

    public DialogManager dialogs() {
        return dialogManager;
    }

    /** The configured chat prefix, already color-processed. */
    public String prefix() {
        return Text.color(configManager.get("config.yml").getString("prefix", ""));
    }

    /** Sends a prefixed, color-processed message to a sender. */
    public void message(CommandSender sender, String message) {
        sender.sendMessage(prefix() + Text.color(message));
    }
}
