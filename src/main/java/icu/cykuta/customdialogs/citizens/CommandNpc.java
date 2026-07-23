package icu.cykuta.customdialogs.citizens;

import icu.cykuta.api.command.BaseCommand;
import icu.cykuta.customdialogs.CustomDialogs;
import net.citizensnpcs.api.CitizensAPI;
import net.citizensnpcs.api.npc.NPC;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

/**
 * {@code /customdialogs npc <id|remove>} - binds the selected Citizens NPC to a
 * dialog (or clears its binding). Select an NPC first with {@code /npc select}.
 * <p>
 * Only registered when Citizens is installed (see {@link CitizensHook} wiring in
 * the plugin's {@code onEnable}).
 */
public final class CommandNpc extends BaseCommand {

    private final CustomDialogs plugin;

    public CommandNpc(CustomDialogs plugin) {
        super(plugin, "npc", "customdialogs.npc", CommandMode.PLAYER_ONLY);
        this.plugin = plugin;
    }

    @Override
    protected boolean onCommand(CommandSender sender, String[] args) {
        Player player = (Player) sender;

        NPC npc = CitizensAPI.getDefaultNPCSelector().getSelected(player);
        if (npc == null) {
            plugin.send(sender, "npc.select-first");
            return true;
        }

        if (args.length < 1) {
            plugin.send(sender, "npc.usage");
            return true;
        }

        if (args[0].equalsIgnoreCase("remove")) {
            if (npc.hasTrait(DialogTrait.class)) {
                npc.removeTrait(DialogTrait.class);
            }
            plugin.send(sender, "npc.cleared", "npc", npc.getName());
            return true;
        }

        String id = args[0];
        if (!plugin.dialogs().exists(id)) {
            plugin.send(sender, "npc.unknown-dialog", "id", id);
            return true;
        }

        npc.getOrAddTrait(DialogTrait.class).setDialogId(id);
        plugin.send(sender, "npc.bound", "npc", npc.getName(), "id", id);
        return true;
    }

    @Override
    protected void onNoPermission(CommandSender sender) {
        plugin.send(sender, "no-permission.npc");
    }
}
