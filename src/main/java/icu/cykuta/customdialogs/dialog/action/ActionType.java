package icu.cykuta.customdialogs.dialog.action;

/**
 * The kind of thing a button action does, selected by the {@code [tag]} prefix
 * on a config action line.
 */
public enum ActionType {

    /** Run the value as a command from the clicking player. */
    PLAYER,

    /** Dispatch the value as a command from the server console. */
    CONSOLE,

    /** Run the value as a command from the player, with op granted only for that command. */
    OP,

    /** Open another dialog, addressed by its id (the value). */
    OPEN,

    /** Close the dialog screen. The value is ignored. */
    CLOSE,

    /** Send the value as a chat message to the clicking player. */
    MESSAGE,

    /** Broadcast the value to every player on the server. */
    BROADCAST;

    /**
     * Resolves a {@code [tag]} into an {@link ActionType}.
     *
     * @param tag the tag text without brackets (case-insensitive)
     * @return the matching type, or {@code null} when the tag is unknown
     */
    public static ActionType from(String tag) {
        return switch (tag.trim().toLowerCase()) {
            case "player", "run", "cmd", "command" -> PLAYER;
            case "console", "sudo" -> CONSOLE;
            case "op", "opcommand" -> OP;
            case "dialog", "open" -> OPEN;
            case "close" -> CLOSE;
            case "message", "msg", "tell" -> MESSAGE;
            case "broadcast", "announce" -> BROADCAST;
            default -> null;
        };
    }
}
