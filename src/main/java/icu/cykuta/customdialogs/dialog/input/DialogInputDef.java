package icu.cykuta.customdialogs.dialog.input;

import icu.cykuta.customdialogs.util.Placeholders;
import icu.cykuta.customdialogs.util.Texts;
import io.papermc.paper.dialog.DialogResponseView;
import io.papermc.paper.registry.data.dialog.input.DialogInput;
import io.papermc.paper.registry.data.dialog.input.NumberRangeDialogInput;
import io.papermc.paper.registry.data.dialog.input.SingleOptionDialogInput;
import io.papermc.paper.registry.data.dialog.input.TextDialogInput;
import net.kyori.adventure.text.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.UnaryOperator;

/**
 * A parsed {@code inputs} entry from a dialog file: a form field (text, boolean,
 * single-option dropdown or number-range slider) shown on the dialog, plus the
 * logic to turn it into a Paper {@link DialogInput} and to read its submitted
 * value back out of a {@link DialogResponseView}.
 * <p>
 * A field's value is exposed to button actions as the {@code {key}} token, e.g.
 * an input keyed {@code amount} can be used in {@code "[console] give %player_name% diamond {amount}"}.
 */
public final class DialogInputDef {

    private final DialogInputKind kind;
    private final String key;
    private final String label;
    private final int width;           // <= 0 -> use the client default
    private final boolean labelVisible;

    // text
    private final String initialText;
    private final int maxLength;       // <= 0 -> use the client default
    private final boolean multiline;
    private final int maxLines;        // <= 0 -> unset

    // bool
    private final boolean initialBool;
    private final String onTrue;
    private final String onFalse;

    // number range
    private final float start;
    private final float end;
    private final Float step;          // null -> unset
    private final Float initialNumber; // null -> unset
    private final String labelFormat;  // null -> client default

    // single option
    private final List<DialogInputOption> options;

    private DialogInputDef(DialogInputKind kind, String key, String label, int width, boolean labelVisible,
                           String initialText, int maxLength, boolean multiline, int maxLines,
                           boolean initialBool, String onTrue, String onFalse,
                           float start, float end, Float step, Float initialNumber, String labelFormat,
                           List<DialogInputOption> options) {
        this.kind = kind;
        this.key = key;
        this.label = label;
        this.width = width;
        this.labelVisible = labelVisible;
        this.initialText = initialText;
        this.maxLength = maxLength;
        this.multiline = multiline;
        this.maxLines = maxLines;
        this.initialBool = initialBool;
        this.onTrue = onTrue;
        this.onFalse = onFalse;
        this.start = start;
        this.end = end;
        this.step = step;
        this.initialNumber = initialNumber;
        this.labelFormat = labelFormat;
        this.options = List.copyOf(options);
    }

    public DialogInputKind kind() {
        return kind;
    }

    public String key() {
        return key;
    }

    /** Whether any shown text in this input may carry a placeholder (needs per-player rebuild). */
    public boolean usesPlaceholders() {
        if (Placeholders.contains(label) || Placeholders.contains(initialText)) {
            return true;
        }
        for (DialogInputOption o : options) {
            if (Placeholders.contains(o.display())) {
                return true;
            }
        }
        return false;
    }

    /**
     * Builds the Paper {@link DialogInput}. Shown text is run through {@code tx}
     * first (identity for the cached dialog, a per-player placeholder resolver at
     * open time) and color-processed.
     */
    public DialogInput toPaperInput(UnaryOperator<String> tx) {
        Component labelComponent = Texts.toComponent(tx.apply(label));
        return switch (kind) {
            case TEXT -> {
                TextDialogInput.Builder b = DialogInput.text(key, labelComponent).labelVisible(labelVisible);
                if (width > 0) {
                    b = b.width(width);
                }
                if (initialText != null) {
                    b = b.initial(tx.apply(initialText));
                }
                if (maxLength > 0) {
                    b = b.maxLength(maxLength);
                }
                if (multiline) {
                    b = b.multiline(TextDialogInput.MultilineOptions.create(maxLines > 0 ? maxLines : null, null));
                }
                yield b.build();
            }
            case BOOL -> DialogInput.bool(key, labelComponent, initialBool, onTrue, onFalse);
            case SINGLE_OPTION -> {
                List<SingleOptionDialogInput.OptionEntry> entries = new ArrayList<>();
                for (DialogInputOption o : options) {
                    entries.add(SingleOptionDialogInput.OptionEntry.create(
                            o.id(), Texts.toComponent(tx.apply(o.display())), o.initial()));
                }
                SingleOptionDialogInput.Builder b = DialogInput.singleOption(key, labelComponent, entries)
                        .labelVisible(labelVisible);
                if (width > 0) {
                    b = b.width(width);
                }
                yield b.build();
            }
            case NUMBER_RANGE -> {
                NumberRangeDialogInput.Builder b = DialogInput.numberRange(key, labelComponent, start, end);
                if (width > 0) {
                    b = b.width(width);
                }
                if (labelFormat != null) {
                    b = b.labelFormat(labelFormat);
                }
                if (step != null) {
                    b = b.step(step);
                }
                if (initialNumber != null) {
                    b = b.initial(initialNumber);
                }
                yield b.build();
            }
        };
    }

    /**
     * The submitted value of this input as a string, for {@code {key}} substitution
     * in button actions. Booleans yield their {@code on-true}/{@code on-false}
     * text, options yield the selected id, numbers are trimmed of a trailing
     * {@code .0}, and a missing value yields an empty string.
     */
    public String stringValue(DialogResponseView view) {
        return switch (kind) {
            case TEXT, SINGLE_OPTION -> orEmpty(view.getText(key));
            case BOOL -> {
                Boolean v = view.getBoolean(key);
                yield (v != null && v) ? onTrue : onFalse;
            }
            case NUMBER_RANGE -> {
                Float f = view.getFloat(key);
                if (f == null) {
                    yield "";
                }
                yield f == Math.rint(f) ? Integer.toString((int) (float) f) : Float.toString(f);
            }
        };
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }

    /** Parses one {@code inputs} entry (a config map) into a definition. */
    @SuppressWarnings("unchecked")
    public static DialogInputDef parse(Map<String, Object> map) {
        DialogInputKind kind = DialogInputKind.from(str(map.get("type"), null));
        String key = str(map.get("key"), "");
        String label = str(map.get("label"), "");
        int width = intOr(map.get("width"), 0);
        boolean labelVisible = boolOr(map.get("label-visible"), true);

        String initialText = map.containsKey("initial") ? str(map.get("initial"), "") : null;
        int maxLength = intOr(map.get("max-length"), 0);
        boolean multiline = boolOr(map.get("multiline"), false);
        int maxLines = intOr(map.get("max-lines"), 0);

        boolean initialBool = boolOr(map.get("initial"), false);
        String onTrue = str(map.get("on-true"), "true");
        String onFalse = str(map.get("on-false"), "false");

        float start = floatOr(map.get("start"), 0f);
        float end = floatOr(map.get("end"), 1f);
        Float step = map.get("step") instanceof Number n ? n.floatValue() : null;
        Float initialNumber = kind == DialogInputKind.NUMBER_RANGE && map.get("initial") instanceof Number n
                ? n.floatValue() : null;
        String labelFormat = map.containsKey("label-format") ? str(map.get("label-format"), null) : null;

        List<DialogInputOption> options = new ArrayList<>();
        if (map.get("options") instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> raw) {
                    Map<String, Object> om = (Map<String, Object>) raw;
                    String id = str(om.get("id"), "");
                    String display = str(om.get("display"), id);
                    boolean initial = boolOr(om.getOrDefault("initial", om.get("default")), false);
                    options.add(new DialogInputOption(id, display, initial));
                }
            }
        }

        return new DialogInputDef(kind, key, label, width, labelVisible,
                initialText, maxLength, multiline, maxLines,
                initialBool, onTrue, onFalse,
                start, end, step, initialNumber, labelFormat, options);
    }

    private static String str(Object o, String dflt) {
        return o == null ? dflt : String.valueOf(o);
    }

    private static int intOr(Object o, int dflt) {
        return o instanceof Number n ? n.intValue() : dflt;
    }

    private static float floatOr(Object o, float dflt) {
        return o instanceof Number n ? n.floatValue() : dflt;
    }

    private static boolean boolOr(Object o, boolean dflt) {
        if (o instanceof Boolean b) {
            return b;
        }
        if (o != null) {
            return Boolean.parseBoolean(String.valueOf(o));
        }
        return dflt;
    }
}
