package icu.cykuta.customdialogs.dialog;

import io.papermc.paper.dialog.Dialog;
import io.papermc.paper.registry.data.dialog.DialogBase;

import java.util.List;

/**
 * A dialog definition loaded from config, together with the built Paper
 * {@link Dialog} that is shown to players.
 * <p>
 * Instances are immutable snapshots; a reload produces fresh ones.
 */
public final class CustomDialog {

    private final String id;
    private final String title;
    private final String externalTitle;
    private final boolean canCloseWithEscape;
    private final DialogKind kind;
    private final int columns;
    private final DialogBase.DialogAfterAction afterAction;
    private final List<String> body;
    private final List<DialogButton> buttons;
    private final boolean usesPlaceholders;
    private final Dialog dialog;

    public CustomDialog(String id,
                        String title,
                        String externalTitle,
                        boolean canCloseWithEscape,
                        DialogKind kind,
                        int columns,
                        DialogBase.DialogAfterAction afterAction,
                        List<String> body,
                        List<DialogButton> buttons,
                        boolean usesPlaceholders,
                        Dialog dialog) {
        this.id = id;
        this.title = title;
        this.externalTitle = externalTitle;
        this.canCloseWithEscape = canCloseWithEscape;
        this.kind = kind;
        this.columns = columns;
        this.afterAction = afterAction;
        this.body = List.copyOf(body);
        this.buttons = List.copyOf(buttons);
        this.usesPlaceholders = usesPlaceholders;
        this.dialog = dialog;
    }

    public String id() {
        return id;
    }

    public String title() {
        return title;
    }

    public String externalTitle() {
        return externalTitle;
    }

    public boolean canCloseWithEscape() {
        return canCloseWithEscape;
    }

    public DialogKind kind() {
        return kind;
    }

    public int columns() {
        return columns;
    }

    /** What the screen does after a button is clicked (close / stay open / wait). */
    public DialogBase.DialogAfterAction afterAction() {
        return afterAction;
    }

    public List<String> body() {
        return body;
    }

    public List<DialogButton> buttons() {
        return buttons;
    }

    /**
     * Whether any text in this dialog contains a {@code %}, i.e. it may hold a
     * PlaceholderAPI placeholder and must be rebuilt per-player when shown.
     */
    public boolean usesPlaceholders() {
        return usesPlaceholders;
    }

    /**
     * Whether any button is permission-gated. Such dialogs must be assembled
     * per-player so the buttons a player may not use are hidden from them.
     */
    public boolean hasPermissionButtons() {
        for (DialogButton b : buttons) {
            if (b.hasPermission()) {
                return true;
            }
        }
        return false;
    }

    /**
     * The pre-built Paper dialog with no placeholder resolution. Shown as-is when
     * the dialog has no placeholders (or PAPI is absent); otherwise a per-player
     * copy is built at open time.
     */
    public Dialog dialog() {
        return dialog;
    }
}
