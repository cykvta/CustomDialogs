package icu.cykuta.customdialogs.util;

import icu.cykuta.api.util.Text;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;

/**
 * Bridges CykutaAPI's {@link Text} color processing (which produces a legacy
 * section-code string) into Adventure {@link Component}s, as required by the
 * Paper Dialog API.
 */
public final class Texts {

    /** Reads {@code §} section codes, including the "§x" repeated-hex format Bukkit emits. */
    private static final LegacyComponentSerializer SECTION = LegacyComponentSerializer.builder()
            .character(LegacyComponentSerializer.SECTION_CHAR)
            .hexColors()
            .useUnusualXRepeatedCharacterHexFormat()
            .build();

    private Texts() {
    }

    /**
     * Turns a raw config string (with {@code &} codes / {@code #rrggbb} hex) into a Component.
     *
     * @param raw the raw string, may be {@code null}
     * @return the parsed component, or {@link Component#empty()} when {@code raw} is null
     */
    public static Component toComponent(String raw) {
        if (raw == null) {
            return Component.empty();
        }
        // Text.color -> legacy section string; then deserialize into a Component.
        return SECTION.deserialize(Text.color(raw));
    }
}
