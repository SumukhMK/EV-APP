const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A row id, shortened to something a person can actually compare.
 *
 * Every id on these screens was designed against the fixtures, where a rider
 * is "R03", a bike is "BLRSS0428" and a job is "SVC-0022" — short, meaningful,
 * and sized to the column. A real database id is a 36-character uuid, which
 * needs more than a whole table column on its own. Where one was placed beside
 * a name the name was squeezed to nothing; where it stood alone it overflowed
 * the cell.
 *
 * So a uuid is cut to its first block, which is ample to tell two rows apart,
 * and the full value stays on the element's title for anyone who needs to copy
 * it. Anything that is not a uuid is returned untouched — a registry id is the
 * name of the bike and must never be abbreviated.
 */
export function shortId(id: string | null | undefined): string {
  if (!id) return '';
  return UUID.test(id) ? id.slice(0, 8) : id;
}
