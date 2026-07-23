package icu.cykuta.customdialogs.dialog;

/**
 * The layout style of a dialog, mapped from the {@code type} field in a dialog file
 * onto Paper's {@code DialogType} factories.
 */
public enum DialogKind {

    /** A single informational screen with 0 or 1 button. */
    NOTICE,

    /** A yes / no screen with exactly two buttons. */
    CONFIRMATION,

    /** A grid of one or more buttons. */
    MULTI_ACTION;

    /**
     * Parses the {@code type} config value, falling back to {@link #MULTI_ACTION}.
     * <p>
     * {@code multi_action} is the default because it renders any number of buttons
     * (0, 1, 2 or many); {@code notice} and {@code confirmation} are opt-in for
     * their specific vanilla layouts (a single centered button, and a yes/no bar).
     *
     * @param raw the raw config string, may be {@code null}
     * @return the matching kind, or {@link #MULTI_ACTION} when unknown/blank
     */
    public static DialogKind from(String raw) {
        if (raw == null) {
            return MULTI_ACTION;
        }
        return switch (raw.trim().toLowerCase()) {
            case "notice", "info" -> NOTICE;
            case "confirmation", "confirm" -> CONFIRMATION;
            default -> MULTI_ACTION;
        };
    }
}
