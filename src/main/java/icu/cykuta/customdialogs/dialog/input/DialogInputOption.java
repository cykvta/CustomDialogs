package icu.cykuta.customdialogs.dialog.input;

/**
 * One choice of a {@link DialogInputKind#SINGLE_OPTION} input.
 *
 * @param id      the value used when this option is selected (fed to {@code {key}} substitution)
 * @param display the shown label (with color codes); falls back to the id when blank
 * @param initial whether this option is selected by default
 */
public record DialogInputOption(String id, String display, boolean initial) {

    public DialogInputOption {
        if (display == null || display.isBlank()) {
            display = id;
        }
    }
}
