/**
 * Agency codes as src/core/AgencyDB.ts emits them (the `a` field of each DB entry),
 * mapped to the histogram segment tokens in tokens.css.
 *
 * Agency colour is used only for histogram segments. Every other surface shows the
 * code as neutral text, so these functions are for the chart and nothing else.
 */
export const AGENCY_CODES = ['FHP', 'INT', 'LOC', 'FWC', 'FDLE', 'TEC'] as const

export type AgencyCode = (typeof AGENCY_CODES)[number]

const SEGMENT_VAR: Record<AgencyCode, string> = {
  FHP: 'var(--ag-fhp)',
  INT: 'var(--ag-int)',
  LOC: 'var(--ag-loc)',
  FWC: 'var(--ag-fwc)',
  FDLE: 'var(--ag-fdle)',
  TEC: 'var(--ag-tec)',
}

const NEUTRAL_VAR = 'var(--ag-neutral)'

/** True when the code is one of the six agencies that own a histogram segment. */
export function isAgencyCode(code: string | null | undefined): code is AgencyCode {
  return typeof code === 'string' && (AGENCY_CODES as readonly string[]).includes(code)
}

/**
 * The histogram fill for an agency code. Everything else, including UNK, a missing
 * code and unit calls (pass null), returns the neutral token.
 */
export function agencyFill(code: string | null | undefined): string {
  return isAgencyCode(code) ? SEGMENT_VAR[code] : NEUTRAL_VAR
}
