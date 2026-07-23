package icu.cykuta.customdialogs.dialog.conversation;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The parsed definition of a {@code conversation} dialog: the ordered
 * {@link ConversationStep}s plus how each logged line is rendered.
 * <p>
 * Immutable; a reload produces a fresh instance. Runtime, per-player progress
 * (the growing log and current step) lives in the conversation manager, not here.
 */
public final class Conversation {

    private final String playerName;    // template for the player's display name; null/blank = real name
    private final String npcFormat;     // e.g. "&e{name}&7: &f{message}"
    private final String playerFormat;
    private final String endLabel;      // closing button for terminal steps
    private final int history;          // max visible log lines; 0 = keep all
    private final int columns;          // response buttons per row
    private final List<ConversationStep> steps;
    private final Map<String, Integer> index = new HashMap<>();

    public Conversation(String playerName, String npcFormat, String playerFormat, String endLabel,
                        int history, int columns, List<ConversationStep> steps) {
        this.playerName = playerName;
        this.npcFormat = npcFormat;
        this.playerFormat = playerFormat;
        this.endLabel = endLabel;
        this.history = Math.max(0, history);
        this.columns = Math.max(1, columns);
        this.steps = List.copyOf(steps);
        for (int i = 0; i < this.steps.size(); i++) {
            String id = this.steps.get(i).id();
            if (id != null && !id.isBlank()) {
                index.putIfAbsent(id.trim().toLowerCase(), i);
            }
        }
    }

    public String playerName() {
        return playerName;
    }

    public String npcFormat() {
        return npcFormat;
    }

    public String playerFormat() {
        return playerFormat;
    }

    public String endLabel() {
        return endLabel;
    }

    public int history() {
        return history;
    }

    public int columns() {
        return columns;
    }

    public List<ConversationStep> steps() {
        return steps;
    }

    public boolean isEmpty() {
        return steps.isEmpty();
    }

    /** The index of a step by id (case-insensitive), or {@code -1} when unknown. */
    public int indexOf(String id) {
        if (id == null) {
            return -1;
        }
        Integer i = index.get(id.trim().toLowerCase());
        return i == null ? -1 : i;
    }

    /** The step at {@code i}, or {@code null} when out of range. */
    public ConversationStep step(int i) {
        return i >= 0 && i < steps.size() ? steps.get(i) : null;
    }
}
