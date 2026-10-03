package com.evrental.vehicle;

import java.util.List;

/**
 * What the commit actually did.
 *
 * <p>{@code skipped} counts only rows that previewed as importable and then
 * could not be imported — not the rows the preview already reported, which
 * the operator has seen. A non-empty {@code skippedRows} means the screen has
 * something to tell them that the preview did not.
 */
public record ImportResultResponse(int imported, int skipped, List<SkippedRowResponse> skippedRows) {
}
