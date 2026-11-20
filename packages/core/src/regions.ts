/**
 * States, provinces and territories, by country, so an address can carry a
 * region's code and its name and any provider can be sent the form it wants.
 *
 * The lists are Printful's own, from https://api.printful.com/countries on
 * 2026-11-20: the five countries it keeps a state list for. US includes DC,
 * the territories (PR, GU, VI, AS, MP), the freely associated states (FM, MH,
 * PW) and the military codes (AA, AE, AP). JP uses Printful's two-digit
 * prefecture codes ("13" is Tokyo).
 */

export interface Region {
  code: string;
  name: string;
}

/**
 * A postal address that keeps both forms of the region. A source that knows
 * only one (a form that took "Nebraska", or Stripe's "NE") fills that one;
 * normalizePostalAddress fills the other where it can.
 */
export interface PostalAddress {
  name?: string;
  line1: string;
  line2?: string;
  city: string;
  /** The region's code, such as "NE" or "ON". */
  regionCode?: string;
  /** The region's name, such as "Nebraska" or "Ontario". */
  regionName?: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2, such as "US". */
  countryCode: string;
  phone?: string;
}

type Table = readonly (readonly [code: string, name: string])[];

const REGION_TABLE: Record<string, Table> = {
  AU: [["ACT", "Australian Capital Territory"], ["NSW", "New South Wales"], ["NT", "Northern Territory"], ["QLD", "Queensland"], ["SA", "South Australia"], ["TAS", "Tasmania"], ["VIC", "Victoria"], ["WA", "Western Australia"]],
  BR: [["AC", "Acre"], ["AL", "Alagoas"], ["AM", "Amazonas"], ["AP", "Amapá"], ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MG", "Minas Gerais"], ["MS", "Mato Grosso do Sul"], ["MT", "Mato Grosso"], ["PA", "Pará"], ["PB", "Paraíba"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["PR", "Paraná"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"], ["RO", "Rondônia"], ["RR", "Roraima"], ["RS", "Rio Grande do Sul"], ["SC", "Santa Catarina"], ["SE", "Sergipe"], ["SP", "São Paulo"], ["TO", "Tocantins"]],
  CA: [["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"]],
  JP: [["01", "Hokkaido"], ["02", "Aomori"], ["03", "Iwate"], ["04", "Miyagi"], ["05", "Akita"], ["06", "Yamagata"], ["07", "Fukushima"], ["08", "Ibaraki"], ["09", "Tochigi"], ["10", "Gunma"], ["11", "Saitama"], ["12", "Chiba"], ["13", "Tokyo"], ["14", "Kanagawa"], ["15", "Niigata"], ["16", "Toyama"], ["17", "Ishikawa"], ["18", "Fukui"], ["19", "Yamanashi"], ["20", "Nagano"], ["21", "Gifu"], ["22", "Shizuoka"], ["23", "Aichi"], ["24", "Mie"], ["25", "Shiga"], ["26", "Kyoto"], ["27", "Osaka"], ["28", "Hyogo"], ["29", "Nara"], ["30", "Wakayama"], ["31", "Tottori"], ["32", "Shimane"], ["33", "Okayama"], ["34", "Hiroshima"], ["35", "Yamaguchi"], ["36", "Tokushima"], ["37", "Kagawa"], ["38", "Ehime"], ["39", "Kochi"], ["40", "Fukuoka"], ["41", "Saga"], ["42", "Nagasaki"], ["43", "Kumamoto"], ["44", "Oita"], ["45", "Miyazaki"], ["46", "Kagoshima"], ["47", "Okinawa"]],
  US: [["AA", "Armed Forces Americas (except Canada)"], ["AE", "Armed Forces"], ["AK", "Alaska"], ["AL", "Alabama"], ["AP", "Armed Forces Pacific"], ["AR", "Arkansas"], ["AS", "American Samoa"], ["AZ", "Arizona"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DC", "District of Columbia"], ["DE", "Delaware"], ["FL", "Florida"], ["FM", "Federated States of Micronesia"], ["GA", "Georgia"], ["GU", "Guam"], ["HI", "Hawaii"], ["IA", "Iowa"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["MA", "Massachusetts"], ["MD", "Maryland"], ["ME", "Maine"], ["MH", "Marshall Islands"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MO", "Missouri"], ["MP", "Northern Mariana Islands"], ["MS", "Mississippi"], ["MT", "Montana"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["NE", "Nebraska"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NV", "Nevada"], ["NY", "New York"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["PR", "Puerto Rico"], ["PW", "Palau"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VA", "Virginia"], ["VI", "Virgin Islands"], ["VT", "Vermont"], ["WA", "Washington"], ["WI", "Wisconsin"], ["WV", "West Virginia"], ["WY", "Wyoming"]],
};

/** Other names people and services use for a region, by country. Matched after the same folding as names. */
const ALIASES: Record<string, Record<string, string>> = {
  US: {
    "washington dc": "DC",
    "washington d c": "DC",
    "d c": "DC",
    "us virgin islands": "VI",
    "u s virgin islands": "VI",
    "united states virgin islands": "VI",
    "armed forces europe": "AE",
    "armed forces middle east": "AE",
    "armed forces africa": "AE",
    "armed forces canada": "AE",
    "armed forces americas": "AA",
    micronesia: "FM",
  },
  CA: { newfoundland: "NL", labrador: "NL", pei: "PE", "yukon territory": "YT" },
  AU: {},
  BR: {},
  JP: {},
};

/** Lower case, no accents, punctuation as spaces, single spaces. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Japanese prefecture names also arrive as "Tokyo-to", "Osaka-fu", "Aichi-ken" or "Aichi Prefecture". */
function foldJapanese(value: string): string {
  return fold(value).replace(/ (to|fu|ken|prefecture)$/, "");
}

/** The countries this module has a region list for. */
export const REGION_COUNTRIES: readonly string[] = Object.keys(REGION_TABLE);

/** A country's regions, or null when there is no list for it. */
export function regionsOf(countryCode: string): readonly Region[] | null {
  const table = REGION_TABLE[countryCode.trim().toUpperCase()];
  return table ? table.map(([code, name]) => ({ code, name })) : null;
}

/**
 * The region a code or name refers to, in a country with a list. Accepts the
 * code ("NE", "ne"), the name ("Nebraska", "nebraska"), the ISO 3166-2 form
 * ("US-NE") and a few common other names ("Washington DC", "PEI"). Returns
 * null when the country has no list or nothing matches.
 */
export function resolveRegion(countryCode: string, input: string | null | undefined): Region | null {
  const country = countryCode.trim().toUpperCase();
  const table = REGION_TABLE[country];
  if (!table || !input?.trim()) return null;
  let raw = input.trim();
  if (raw.toUpperCase().startsWith(`${country}-`)) raw = raw.slice(country.length + 1);
  const upper = raw.toUpperCase();
  // JP codes are two digits; "1" means "01".
  const asCode = country === "JP" && /^\d{1,2}$/.test(upper) ? upper.padStart(2, "0") : upper;
  const byCode = table.find(([code]) => code === asCode);
  if (byCode) return { code: byCode[0], name: byCode[1] };
  const folded = country === "JP" ? foldJapanese(raw) : fold(raw);
  const byName = table.find(([, name]) => (country === "JP" ? foldJapanese(name) : fold(name)) === folded);
  if (byName) return { code: byName[0], name: byName[1] };
  const alias = ALIASES[country]?.[folded];
  const aliased = alias ? table.find(([code]) => code === alias) : undefined;
  return aliased ? { code: aliased[0], name: aliased[1] } : null;
}

/** Thrown when a provider needs a region code for a country and the address's region can't be matched to one. */
export class UnresolvedRegionError extends Error {
  constructor(
    readonly countryCode: string,
    readonly region: string | null,
    readonly provider?: string,
  ) {
    const where = provider ? `${provider} needs` : "This needs";
    super(
      region?.trim()
        ? `"${region}" is not a state, province or territory of ${countryCode} that we recognise. ${where} its code.`
        : `The address has no state, province or territory. ${where} one for ${countryCode}.`,
    );
    this.name = "UnresolvedRegionError";
  }
}

/**
 * The region to send a provider: its code when the country is one the
 * provider wants codes for (throwing UnresolvedRegionError if there is no
 * match), otherwise the input trimmed, or undefined when empty.
 */
export function regionForProvider(
  countryCode: string,
  input: string | null | undefined,
  options: { codesFor: readonly string[]; provider: string },
): string | undefined {
  const country = countryCode.trim().toUpperCase();
  if (options.codesFor.includes(country)) {
    const match = resolveRegion(country, input);
    if (!match) throw new UnresolvedRegionError(country, input ?? null, options.provider);
    return match.code;
  }
  return input?.trim() || undefined;
}

/** Fills whichever of regionCode/regionName is missing when the region can be matched, and upper-cases the country. */
export function normalizePostalAddress(address: PostalAddress): PostalAddress {
  const countryCode = address.countryCode.trim().toUpperCase();
  const match = resolveRegion(countryCode, address.regionCode) ?? resolveRegion(countryCode, address.regionName);
  return {
    ...address,
    countryCode,
    ...(match ? { regionCode: match.code, regionName: match.name } : {}),
  };
}
