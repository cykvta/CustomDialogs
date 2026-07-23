package icu.cykuta.customdialogs.citizens;

import icu.cykuta.customdialogs.dialog.DialogManager;
import net.citizensnpcs.api.event.NPCRightClickEvent;
import net.citizensnpcs.api.persistence.Persist;
import net.citizensnpcs.api.trait.Trait;
import net.citizensnpcs.api.trait.TraitName;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;

/**
 * A Citizens trait that binds a NPC to a dialog: right-clicking the NPC opens
 * that dialog for the clicking player.
 * <p>
 * The dialog id is persisted per-NPC by Citizens (via {@link Persist}), so it
 * survives restarts. Attach and set it with {@code /customdialogs npc <id>}.
 * <p>
 * The {@link DialogManager} is shared through a static reference set once by
 * {@link CitizensHook}, because Citizens instantiates traits with a no-arg
 * constructor and cannot inject dependencies.
 */
@TraitName("customdialog")
public final class DialogTrait extends Trait {

    /** The trait name, also used as the Citizens command/registry key. */
    public static final String NAME = "customdialog";

    private static DialogManager dialogs;

    @Persist
    private String dialogId = "";

    public DialogTrait() {
        super(NAME);
    }

    /** Wires the shared dialog manager used by every trait instance. */
    static void bind(DialogManager manager) {
        dialogs = manager;
    }

    @EventHandler
    public void onRightClick(NPCRightClickEvent event) {
        // The handler fires for every NPC click; only react to this NPC's.
        if (event.getNPC() != getNPC() || dialogId == null || dialogId.isBlank() || dialogs == null) {
            return;
        }
        Player player = event.getClicker();
        dialogs.open(player, dialogId); // unknown id -> open() is a no-op returning false
    }

    /** The bound dialog id, or an empty string when none is set. */
    public String getDialogId() {
        return dialogId;
    }

    public void setDialogId(String dialogId) {
        this.dialogId = dialogId == null ? "" : dialogId;
    }
}
