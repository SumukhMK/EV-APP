package com.evrental.vehicle;

import java.util.List;

/**
 * An upload reduced to rows of text, whatever it arrived as.
 *
 * @param rows      every non-blank row, header included, cells as the text a
 *                  person would have typed
 * @param sheetName the sheet the rows came from, or null for a CSV — shown
 *                  in the preview so an operator who meant another sheet
 *                  finds out before committing
 * @param format    "xlsx", "xls" or "csv", decided from the bytes
 */
record ImportFile(List<List<String>> rows, String sheetName, String format) {
}
