package icu.cykuta.customdialogs.util;

import me.clip.placeholderapi.PlaceholderAPI;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

/**
 * Thin bridge to PlaceholderAPI, kept fully optional (a soft dependency).
 * <p>
 * The {@link PlaceholderAPI} class is only touched from {@link #apply} after an
 * {@link #isAvailable()} guard, so nothing here loads when PAPI is absent.
 */
public final class Placeholders {

    private Placeholders() {
    }

    /** Whether PlaceholderAPI is installed and enabled on this server. */
    public static boolean isAvailable() {
        return Bukkit.getPluginManager().isPluginEnabled("PlaceholderAPI");
    }

    /**
     * Cheap pre-check: a string can only carry a placeholder if it holds a {@code %}.
     * Used at load time to decide whether a dialog must be rebuilt per-player.
     */
    public static boolean contains(String text) {
        return text != null && text.indexOf('%') >= 0;
    }

    /**
     * Resolves {@code %placeholders%} in {@code text} for {@code player}.
     *
     * @return the text with placeholders replaced, or {@code text} unchanged when
     *         PAPI is absent or {@code player}/{@code text} is {@code null}
     */
    public static String apply(Player player, String text) {
        if (text == null || player == null || !isAvailable()) {
            return text;
        }
        return PlaceholderAPI.setPlaceholders(player, text);
    }
}
