/**
 * Market reference data for the M ladder.
 *
 * These tables are curated rather than exhaustive on purpose: M3/M4 handle
 * anything missing, and a wrong airport code is worse than none. To widen
 * coverage, load the OurAirports dataset (filtered to `type = large_airport |
 * medium_airport` with a non-empty `iata_code`) and merge it into
 * `AIRPORT_CODES` at build time — the engine reads these as plain data.
 */

/** M1 — IATA metropolitan area codes, keyed "normalized city|ST". */
export const METRO_CODES: Record<string, string> = {
  'new york|NY': 'NYC', 'brooklyn|NY': 'NYC', 'queens|NY': 'NYC',
  'newark|NJ': 'NYC', 'jersey city|NJ': 'NYC',
  'chicago|IL': 'CHI', 'schaumburg|IL': 'CHI', 'naperville|IL': 'CHI',
  'oak brook|IL': 'CHI', 'evanston|IL': 'CHI',
  'washington|DC': 'WAS', 'arlington|VA': 'WAS', 'alexandria|VA': 'WAS', 'bethesda|MD': 'WAS',
  'detroit|MI': 'DTT', 'dearborn|MI': 'DTT', 'troy|MI': 'DTT', 'livonia|MI': 'DTT',
};

/** M2 — primary commercial-service airport by market, keyed "normalized city|ST". */
export const AIRPORT_CODES: Record<string, string> = {
  // Indiana
  'indianapolis|IN': 'IND', 'carmel|IN': 'IND', 'fishers|IN': 'IND', 'greenwood|IN': 'IND',
  'evansville|IN': 'EVV', 'newburgh|IN': 'EVV',
  'fort wayne|IN': 'FWA', 'south bend|IN': 'SBN', 'mishawaka|IN': 'SBN',
  'lafayette|IN': 'LAF', 'west lafayette|IN': 'LAF', 'bloomington|IN': 'BMG',
  'terre haute|IN': 'HUF', 'muncie|IN': 'MIE', 'gary|IN': 'GYY',
  'columbus|IN': 'BAK', 'elkhart|IN': 'EKM',
  // Kentucky
  'louisville|KY': 'SDF', 'lexington|KY': 'LEX', 'owensboro|KY': 'OWB',
  'paducah|KY': 'PAH', 'bowling green|KY': 'BWG', 'covington|KY': 'CVG', 'florence|KY': 'CVG',
  // Ohio
  'cincinnati|OH': 'CVG', 'columbus|OH': 'CMH', 'cleveland|OH': 'CLE', 'dayton|OH': 'DAY',
  'toledo|OH': 'TOL', 'akron|OH': 'CAK', 'youngstown|OH': 'YNG',
  // Illinois
  'springfield|IL': 'SPI', 'peoria|IL': 'PIA', 'rockford|IL': 'RFD', 'champaign|IL': 'CMI',
  'bloomington|IL': 'BMI', 'normal|IL': 'BMI', 'moline|IL': 'MLI', 'quincy|IL': 'UIN',
  'decatur|IL': 'DEC', 'marion|IL': 'MWA',
  // Michigan
  'grand rapids|MI': 'GRR', 'lansing|MI': 'LAN', 'flint|MI': 'FNT',
  'kalamazoo|MI': 'AZO', 'traverse city|MI': 'TVC', 'saginaw|MI': 'MBS',
  // Tennessee
  'nashville|TN': 'BNA', 'memphis|TN': 'MEM', 'knoxville|TN': 'TYS', 'chattanooga|TN': 'CHA',
  // Missouri / Kansas
  'st louis|MO': 'STL', 'saint louis|MO': 'STL', 'kansas city|MO': 'MCI',
  'springfield|MO': 'SGF', 'columbia|MO': 'COU', 'joplin|MO': 'JLN',
  'overland park|KS': 'MCI', 'wichita|KS': 'ICT',
  // Upper Midwest
  'milwaukee|WI': 'MKE', 'madison|WI': 'MSN', 'green bay|WI': 'GRB', 'appleton|WI': 'ATW',
  'la crosse|WI': 'LSE', 'minneapolis|MN': 'MSP', 'st paul|MN': 'MSP', 'duluth|MN': 'DLH',
  'rochester|MN': 'RST', 'des moines|IA': 'DSM', 'cedar rapids|IA': 'CID',
  'davenport|IA': 'MLI', 'sioux city|IA': 'SUX', 'waterloo|IA': 'ALO',
  'omaha|NE': 'OMA', 'lincoln|NE': 'LNK',
  // South
  'atlanta|GA': 'ATL', 'savannah|GA': 'SAV', 'augusta|GA': 'AGS', 'macon|GA': 'MCN',
  'birmingham|AL': 'BHM', 'huntsville|AL': 'HSV', 'mobile|AL': 'MOB', 'montgomery|AL': 'MGM',
  'new orleans|LA': 'MSY', 'baton rouge|LA': 'BTR', 'shreveport|LA': 'SHV',
  'jackson|MS': 'JAN', 'little rock|AR': 'LIT', 'bentonville|AR': 'XNA', 'fayetteville|AR': 'XNA',
  'charlotte|NC': 'CLT', 'raleigh|NC': 'RDU', 'durham|NC': 'RDU', 'greensboro|NC': 'GSO',
  'winston salem|NC': 'INT', 'wilmington|NC': 'ILM', 'asheville|NC': 'AVL', 'fayetteville|NC': 'FAY',
  'charleston|SC': 'CHS', 'columbia|SC': 'CAE', 'greenville|SC': 'GSP', 'myrtle beach|SC': 'MYR',
  'jacksonville|FL': 'JAX', 'orlando|FL': 'MCO', 'tampa|FL': 'TPA', 'miami|FL': 'MIA',
  'fort lauderdale|FL': 'FLL', 'west palm beach|FL': 'PBI', 'fort myers|FL': 'RSW',
  'sarasota|FL': 'SRQ', 'tallahassee|FL': 'TLH', 'pensacola|FL': 'PNS', 'destin|FL': 'VPS',
  // Northeast / Mid-Atlantic
  'boston|MA': 'BOS', 'worcester|MA': 'ORH', 'providence|RI': 'PVD', 'hartford|CT': 'BDL',
  'philadelphia|PA': 'PHL', 'pittsburgh|PA': 'PIT', 'harrisburg|PA': 'MDT', 'allentown|PA': 'ABE',
  'baltimore|MD': 'BWI', 'richmond|VA': 'RIC', 'norfolk|VA': 'ORF', 'virginia beach|VA': 'ORF',
  'roanoke|VA': 'ROA', 'charleston|WV': 'CRW', 'buffalo|NY': 'BUF', 'rochester|NY': 'ROC',
  'syracuse|NY': 'SYR', 'albany|NY': 'ALB', 'portland|ME': 'PWM', 'manchester|NH': 'MHT',
  'burlington|VT': 'BTV',
  // West / Southwest
  'dallas|TX': 'DFW', 'fort worth|TX': 'DFW', 'houston|TX': 'IAH', 'austin|TX': 'AUS',
  'san antonio|TX': 'SAT', 'el paso|TX': 'ELP', 'lubbock|TX': 'LBB', 'corpus christi|TX': 'CRP',
  'oklahoma city|OK': 'OKC', 'tulsa|OK': 'TUL', 'denver|CO': 'DEN', 'colorado springs|CO': 'COS',
  'salt lake city|UT': 'SLC', 'boise|ID': 'BOI', 'albuquerque|NM': 'ABQ',
  'phoenix|AZ': 'PHX', 'tucson|AZ': 'TUS', 'las vegas|NV': 'LAS', 'reno|NV': 'RNO',
  'los angeles|CA': 'LAX', 'san diego|CA': 'SAN', 'san francisco|CA': 'SFO',
  'san jose|CA': 'SJC', 'sacramento|CA': 'SMF', 'fresno|CA': 'FAT',
  'seattle|WA': 'SEA', 'spokane|WA': 'GEG', 'portland|OR': 'PDX', 'eugene|OR': 'EUG',
  'billings|MT': 'BIL', 'sioux falls|SD': 'FSD', 'fargo|ND': 'FAR',
  'anchorage|AK': 'ANC', 'honolulu|HI': 'HNL',
};

/**
 * Additional commercial IATA codes for the M4 screen only — markets MHG has
 * no presence in, but whose codes a derived candidate must not impersonate.
 */
const EXTRA_IATA: string[] = [
  'JFK', 'LGA', 'EWR', 'ORD', 'MDW', 'DCA', 'IAD', 'DTW', 'SNA', 'OAK', 'ONT', 'BUR',
  'PSP', 'MFR', 'SBA', 'MRY', 'BZN', 'JAC', 'ASE', 'EGE', 'GJT', 'IDA', 'GTF', 'MSO',
  'RAP', 'BIS', 'GFK', 'CWA', 'RHI', 'ESC', 'CIU', 'PLN', 'APN', 'MQT', 'SUN', 'COD',
  'CPR', 'LAR', 'RKS', 'TWF', 'LWS', 'PUW', 'YKM', 'PSC', 'ALW', 'BLI', 'OTH', 'RDM',
  'LMT', 'ACV', 'CEC', 'SBP', 'SMX', 'VIS', 'MMH', 'STS', 'CIC', 'RDD', 'MOD',
];

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

/** Build the M4 screen: IATA code to the place it belongs to. */
export function buildReservedIata(
  metro: Record<string, string> = METRO_CODES,
  airports: Record<string, string> = AIRPORT_CODES,
  extra: string[] = EXTRA_IATA,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, code] of Object.entries(metro)) {
    if (!out[code]) out[code] = titleCase(key.split('|')[0] ?? '');
  }
  for (const [key, code] of Object.entries(airports)) {
    if (!out[code]) out[code] = titleCase(key.split('|')[0] ?? '');
  }
  for (const code of extra) {
    if (!out[code]) out[code] = 'another market';
  }
  return out;
}

/** M5 — submarket word to the letter it contributes. */
export const SUBMARKET_LETTERS: Record<string, string> = {
  downtown: 'D', central: 'D', cbd: 'D',
  east: 'E', eastside: 'E',
  west: 'W', westside: 'W',
  north: 'N', northside: 'N',
  south: 'S', southside: 'S',
  airport: 'A',
  riverfront: 'R', river: 'R',
  university: 'U', campus: 'U',
  lakefront: 'L', lake: 'L',
  mall: 'M', park: 'P',
};
