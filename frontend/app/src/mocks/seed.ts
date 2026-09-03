/**
 * Deterministic pseudo-randomness for the fixtures.
 *
 * The wireframe shows a 137-bike fleet but only lists twelve. Rather than
 * paste 137 rows, the explicitly-designed rows are kept verbatim and the
 * remainder is generated from a fixed seed — so the data is stable across
 * reloads, across machines, and in screenshots, while pagination, filters and
 * counts all behave like the real registry will.
 *
 * Replaced wholesale by the tenant spreadsheet once Abhiram has it cleaned.
 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

export const FIRST_NAMES = [
  'Dulan', 'Raju', 'Ashwin', 'Nabam', 'Imran', 'Lalit', 'Sohail', 'Prakash',
  'Yash', 'Girish', 'Rakesh', 'Tarun', 'Sandeep', 'Faizal', 'Bhaskar', 'Vinod',
  'Manoj', 'Suresh', 'Ravi', 'Kiran', 'Deepak', 'Naveen', 'Arun', 'Santosh',
  'Mahesh', 'Ganesh', 'Vijay', 'Anil', 'Rajesh', 'Pradeep', 'Umesh', 'Harish',
] as const;

export const LAST_NAMES = [
  'Hajong', 'Debnath', 'Kamath', 'Tada', 'Shaikh', 'Chhetri', 'Ahmed', 'Bhandari',
  'Karkera', 'Poojary', 'Suvarna', 'Bhatia', 'Rathore', 'Rahman', 'Nayak', 'Shetty',
  'Naik', 'Kumar', 'Reddy', 'Rao', 'Pai', 'Hegde', 'Gowda', 'Acharya',
] as const;

export const MODELS = [
  'Eagle-SunM',
  'Sprinto-SunM',
  'Sprinto-SunM Plus',
  'Sprinto-SunM Pro',
  'Sprinto-BS',
] as const;

export const HUBS = ['Bengaluru', 'HSR Layout', 'Koramangala', 'Whitefield'] as const;

export const STAFF = [
  'Meenakshi Iyer',
  'Abhinandan',
  'Dhananjay',
  'Priya Menon',
  'Ravi Shastri',
] as const;
