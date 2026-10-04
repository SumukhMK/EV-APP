package com.evrental.vehicle;

import com.evrental.common.ValidationException;
import java.util.Map;

/**
 * The whole file is unusable — as opposed to one row of it being wrong.
 *
 * <p>A {@link ValidationException} on the {@code file} field, so the status
 * and the message are the ones every other 422 has, plus a small map of
 * facts the screen can lay out as more than a sentence: which columns were
 * missing, which were found, which were expected. The message alone still
 * says everything; the details only let the UI say it better.
 */
public class ImportFileException extends ValidationException {

    private final transient Map<String, Object> details;

    public ImportFileException(String message) {
        this(message, Map.of());
    }

    public ImportFileException(String message, Map<String, Object> details) {
        super("file", message);
        this.details = Map.copyOf(details);
    }

    public Map<String, Object> details() {
        return details;
    }
}
