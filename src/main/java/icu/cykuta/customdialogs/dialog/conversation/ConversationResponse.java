package icu.cykuta.customdialogs.dialog.conversation;

import icu.cykuta.customdialogs.dialog.action.ButtonAction;

import java.util.List;

/**
 * One clickable response inside a {@link ConversationStep}.
 *
 * @param label   the button text (with color codes)
 * @param tooltip hover text, or {@code null} for none
 * @param width   button width in pixels (clamped to 1..1024 when built)
 * @param say     the line added to the log as the player's reply when clicked.
 *                Defaults to {@code label} when omitted; an explicit blank means
 *                "advance without adding a player line".
 * @param target  the id of the step to jump to, or {@code null}/blank to advance
 *                to the next step in order (the conversation ends when there is none)
 * @param actions extra actions run when clicked (commands, messages, ...), reusing
 *                the same {@code [tag]} action system as normal buttons
 */
public record ConversationResponse(String label, String tooltip, int width,
                                   String say, String target, List<ButtonAction> actions) {

    /** Default response width; a touch wider than a menu button, for sentences. */
    public static final int DEFAULT_WIDTH = 200;

    public ConversationResponse {
        actions = actions == null ? List.of() : List.copyOf(actions);
    }

    /** Whether clicking this response adds a player line to the log. */
    public boolean hasSay() {
        return say != null && !say.isBlank();
    }

    /** Whether this response jumps to a named step instead of the next one. */
    public boolean hasTarget() {
        return target != null && !target.isBlank();
    }
}
