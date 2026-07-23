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
            plugin.message(sender, "&cSelect an NPC first with &f/npc select&c.");
            return true;
        }

        if (args.length < 1) {
            plugin.message(sender, "&cUsage: /customdialogs npc <id|remove>");
            return true;
        }

        if (args[0].equalsIgnoreCase("remove")) {
            if (npc.hasTrait(DialogTrait.class)) {
                npc.removeTrait(DialogTrait.class);
            }
            plugin.message(sender, "&aCleared the dialog binding on NPC &f" + npc.getName() + "&a.");
            return true;
        }

        String id = args[0];
        if (!plugin.dialogs().exists(id)) {
            plugin.message(sender, "&cUnknown dialog: &f" + id);
            return true;
        }

        npc.getOrAddTrait(DialogTrait.class).setDialogId(id);
        plugin.message(sender, "&aNPC &f" + npc.getName()
                + " &awill now open dialog &f" + id + "&a on right-click.");
        return true;
    }

    @Override
    protected void onNoPermission(CommandSender sender) {
        plugin.message(sender, "&cYou don't have permission to bind dialogs to NPCs.");
    }
}
