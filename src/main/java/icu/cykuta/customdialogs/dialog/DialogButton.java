package icu.cykuta.customdialogs.dialog;

import icu.cykuta.customdialogs.dialog.action.ButtonAction;

import java.util.List;

/**
 * A single dialog button as read from config.
 *
 * @param label      the button text (with color codes)
 * @param tooltip    the hover text, or {@code null} for none
 * @param width      the button width in pixels (clamped to 1..1024 when built)
 * @param permission the permission required to see the button, or {@code null}/blank
 *                   for none. Players without it don't see the button at all
 *                   (the Dialog API has no "disabled button" state).
 * @param actions    the actions run, in order, when the button is clicked; empty
 *                   means clicking only closes the screen
 */
public record DialogButton(String label, String tooltip, int width,
                           String permission, List<ButtonAction> actions) {

    /** Default button width used when config omits it. */
    public static final int DEFAULT_WIDTH = 150;

    public DialogButton {
        actions = actions == null ? List.of() : List.copyOf(actions);
    }

    /** Whether this button is gated behind a permission. */
    public boolean hasPermission() {
        return permission != null && !permission.isBlank();
    }
}
