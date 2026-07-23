package icu.cykuta.customdialogs.dialog.conversation;

import java.util.List;

/**
 * One turn of a conversation: the NPC's line ({@code speaker} + {@code text}),
 * pushed to the log when the step opens, plus the player's possible
 * {@code responses}.
 *
 * @param id        optional step id, usable as a {@code goto} target; {@code null} when unnamed
 * @param speaker   the NPC name shown for this line (fills {@code {name}} in {@code npc-format})
 * @param text      the NPC line (fills {@code {message}})
 * @param responses the response buttons; empty means the step is terminal and a
 *                  single closing button is shown instead
 */
public record ConversationStep(String id, String speaker, String text,
                               List<ConversationResponse> responses) {

    public ConversationStep {
        responses = responses == null ? List.of() : List.copyOf(responses);
    }
}
