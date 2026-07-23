package icu.cykuta.customdialogs.dialog.action;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A single action a button performs, parsed from a config line such as
 * {@code "[console] give %player_name% diamond"}.
 * <p>
 * Format: an optional leading {@code [tag]} picks the {@link ActionType}; the
 * remainder is the {@code value} (a command, a dialog id, or a message). A line
 * with no recognised tag is treated as a {@link ActionType#PLAYER} command, so
 * a bare {@code "spawn"} just runs {@code /spawn} as the clicking player.
 *
 * @param type  what the action does
 * @param value the command / dialog id / message it operates on
 */
public record ButtonAction(ActionType type, String value) {

    /** Matches an optional {@code [tag]} prefix and captures the tag and the rest. */
    private static final Pattern TAG = Pattern.compile("^\\s*\\[([^\\]]+)\\]\\s*(.*)$", Pattern.DOTALL);

    /**
     * Parses one raw config action line.
     *
     * @param raw the line, may be {@code null}
     * @return the parsed action, or {@code null} when {@code raw} is null
     */
    public static ButtonAction parse(String raw) {
        if (raw == null) {
            return null;
        }
        Matcher m = TAG.matcher(raw);
        if (m.matches()) {
            ActionType type = ActionType.from(m.group(1));
            if (type != null) {
                return new ButtonAction(type, m.group(2).trim());
            }
        }
        // No/unknown tag -> treat the whole line as a player command.
        return new ButtonAction(ActionType.PLAYER, raw.trim());
    }
}
