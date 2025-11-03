/**
 * BRREG (Brønnøysundregistrene) API utilities
 * Official Norwegian business registry integration
 */

export type BrregCompany = {
  organisasjonsnummer: string;
  navn: string;
  organisasjonsform?: { kode: string; beskrivelse: string };
  adresse?: {
    adresse?: string[];
    postnummer?: string;
    poststed?: string;
  };
  forretningsadresse?: {
    land?: string;
    landkode?: string;
    postnummer?: string;
    poststed?: string;
    adresse?: string[];
    kommune?: string;
    kommunenummer?: string;
  };
  naeringskode1?: {
    kode: string;
    beskrivelse: string;
  };
  antallAnsatte?: number;
};

/**
 * Kinoa Tiltak AS - Hardcoded with real data from BRREG
 * Verified: 2025-11-03
 */
export const KINOA_TILTAK_AS: BrregCompany = {
  organisasjonsnummer: "921314582",
  navn: "KINOA TILTAK AS",
  organisasjonsform: {
    kode: "AS",
    beskrivelse: "Aksjeselskap",
  },
  forretningsadresse: {
    land: "Norge",
    landkode: "NO",
    postnummer: "1424",
    poststed: "SKI",
    adresse: ["Eplehagen 2"],
    kommune: "NORDRE FOLLO",
    kommunenummer: "3207",
  },
  naeringskode1: {
    kode: "86.992",
    beskrivelse: "Forebyggende helsearbeid",
  },
  antallAnsatte: 39,
};

/**
 * Search companies in BRREG by name
 */
export async function searchBrregCompany(query: string): Promise<BrregCompany[]> {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(query)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data._embedded?.enheter || [];
  } catch {
    return [];
  }
}

/**
 * Get company by organization number
 */
export async function getBrregCompanyByOrgnr(orgnr: string): Promise<BrregCompany | null> {
  try {
    const cleanOrgnr = orgnr.replace(/\s/g, "");
    const res = await fetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter/${cleanOrgnr}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Get all predefined companies (currently just Kinoa)
 */
export function getPredefinedCompanies(): BrregCompany[] {
  return [KINOA_TILTAK_AS];
}
