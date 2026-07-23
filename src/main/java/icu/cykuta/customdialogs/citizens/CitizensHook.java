package icu.cykuta.customdialogs.citizens;

import icu.cykuta.customdialogs.CustomDialogs;
import net.citizensnpcs.api.CitizensAPI;
import net.citizensnpcs.api.event.CitizensEnableEvent;
import net.citizensnpcs.api.trait.TraitFactory;
import net.citizensnpcs.api.trait.TraitInfo;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

/**
 * Optional Citizens integration. Registers the {@link DialogTrait} so NPCs can
 * open dialogs on click, and re-registers it when Citizens reloads.
 * <p>
 * This class (and every class it touches) is only loaded when Citizens is
 * present, so the plugin runs fine without it.
 */
public final class CitizensHook implements Listener {

    private final CustomDialogs plugin;

    public CitizensHook(CustomDialogs plugin) {
        this.plugin = plugin;
    }

    /** Binds the dialog manager, registers the trait and starts listening. */
    public void enable() {
        DialogTrait.bind(plugin.dialogs());
        registerTrait();
        plugin.getServer().getPluginManager().registerEvents(this, plugin);
        plugin.getLogger().info("Citizens found: 'customdialog' NPC trait registered.");
    }

    /** A Citizens reload clears registered traits, so register again. */
    @EventHandler
    public void onCitizensEnable(CitizensEnableEvent event) {
        registerTrait();
    }

    private void registerTrait() {
        TraitFactory factory = CitizensAPI.getTraitFactory();
        // Guard against double registration (initial enable vs. reload event).
        if (factory.getTraitClass(DialogTrait.NAME) == null) {
            factory.registerTrait(TraitInfo.create(DialogTrait.class));
        }
    }
}
