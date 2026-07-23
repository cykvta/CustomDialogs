package icu.cykuta.customdialogs;

import icu.cykuta.api.command.CommandRegistry;
import icu.cykuta.api.config.ConfigManager;
import icu.cykuta.api.update.UpdateChecker;
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
        this.configManager.register("lang.yml");

        // --- Dialogs (loaded from the dialogs/ folder, one file per dialog) ---
        this.dialogManager = new DialogManager(this, configManager);
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

        // --- Update check (CykutaAPI, GitHub releases; toggle via config) ---
        boolean updateCheck = configManager.get("config.yml").getBoolean("update-check", true);
        new UpdateChecker(this, "cykvta/CustomDialogs", updateCheck).check(result -> {
            if (result.isOutdated()) {
                getLogger().warning("A new version is available: " + result.latestVersion()
                        + " (you're running " + result.currentVersion() + "). Download it at "
                        + result.downloadUrl());
            }
        });

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

    /**
     * Looks up a raw message from {@code lang.yml} by its dotted key (under the
     * {@code messages} root), returning the key itself if it is missing.
     */
    public String lang(String key) {
        return configManager.get("lang.yml").getString("messages." + key, key);
    }

    /**
     * Sends a prefixed message from {@code lang.yml}, replacing {@code {name}}
     * placeholders with the given {@code name, value} pairs.
     *
     * <pre>send(sender, "open.self", "id", dialogId);</pre>
     */
    public void send(CommandSender sender, String key, String... replacements) {
        String message = lang(key);
        for (int i = 0; i + 1 < replacements.length; i += 2) {
            message = message.replace("{" + replacements[i] + "}", replacements[i + 1]);
        }
        message(sender, message);
    }
}
