package icu.cykuta.customdialogs.dialog.input;

/**
 * The kind of a dialog input, mapped from the {@code type} field of an entry in a
 * dialog's {@code inputs} list onto Paper's {@code DialogInput} factories.
 */
public enum DialogInputKind {

    /** A free text field ({@code DialogInput.text}). */
    TEXT,

    /** A yes/no toggle ({@code DialogInput.bool}). */
    BOOL,

    /** A dropdown of fixed options ({@code DialogInput.singleOption}). */
    SINGLE_OPTION,

    /** A slider over a numeric range ({@code DialogInput.numberRange}). */
    NUMBER_RANGE;

    /**
     * Resolves the {@code type} config value, defaulting to {@link #TEXT}.
     *
     * @param raw the raw config string, may be {@code null}
     * @return the matching kind, or {@link #TEXT} when unknown/blank
     */
    public static DialogInputKind from(String raw) {
        if (raw == null) {
            return TEXT;
        }
        return switch (raw.trim().toLowerCase()) {
            case "bool", "boolean", "toggle", "checkbox" -> BOOL;
            case "single_option", "single-option", "option", "options", "select", "choice" -> SINGLE_OPTION;
            case "number_range", "number-range", "range", "number", "slider" -> NUMBER_RANGE;
            default -> TEXT;
        };
    }
}
