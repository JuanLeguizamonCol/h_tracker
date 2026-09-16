// Area Category → Business Unit cascade. 1:1 by name for every area except
// "Office of the CFO", which also covers the "SG&A" business unit.
const CFO_AREA_CATEGORY = 'Office of the CFO';
const CFO_BUSINESS_UNITS = ['Office of the CFO', 'SG&A'];

export function businessUnitValuesForArea(area: string): string[] {
  if (!area) return [];
  return area === CFO_AREA_CATEGORY ? CFO_BUSINESS_UNITS : [area];
}

/**
 * Business unit options allowed for the selected area (all of them when no
 * area is picked yet). `currentValue` — the business unit already on the
 * project/form — is always kept in the list even if it falls outside the
 * cascade rule, so an existing project with an old/mismatched combination
 * (e.g. an area category retired from selection, like "Other") still shows
 * its real value on load instead of looking blank. Picking a new area
 * re-applies the cascade via `nextBusinessUnitForArea` below.
 */
export function businessUnitOptionsForArea<T extends { value: string }>(area: string, businessUnits: T[], currentValue?: string): T[] {
  if (!area) return businessUnits;
  const allowed = businessUnitValuesForArea(area);
  return businessUnits.filter(bu => allowed.includes(bu.value) || bu.value === currentValue);
}

/** The business unit to carry over when the area changes — kept if still valid, auto-picked if there's exactly one option, else cleared. */
export function nextBusinessUnitForArea(area: string, currentBusinessUnit: string): string {
  const allowed = businessUnitValuesForArea(area);
  if (allowed.includes(currentBusinessUnit)) return currentBusinessUnit;
  return allowed.length === 1 ? allowed[0] : '';
}
