export type CompanyCode = 'IPC' | 'PI';

export interface Signatory {
  name: string;
  title: string;
}

export interface CompanyProfile {
  name: string;
  legal_name: string;
  address: string;
  city_state_zip: string;
  phone: string;
}

export const SIGNATORIES: Record<CompanyCode, Signatory[]> = {
  IPC: [
    { name: 'Claus Johann Mayer', title: 'Managing Partner' },
    { name: 'Jorge Castellote',   title: 'Managing Partner' },
    { name: 'Craig Harwerth',     title: 'Senior Partner'   },
    { name: 'Tim Dunworth',       title: 'Partner'          },
  ],
  PI: [
    { name: 'Jose Mino', title: 'Managing Director' },
  ],
};

export const COMPANY_PROFILES: Record<CompanyCode, CompanyProfile> = {
  IPC: {
    name:           'Impact Point Co.',
    legal_name:     'Impact Point Co., LLC',
    address:        '104 Crandon Blvd., Suite #404',
    city_state_zip: 'Key Biscayne, FL, 33149',
    phone:          '+1 (786) 208 - 0588',
  },
  PI: {
    name:           'Pegasus Insights',
    legal_name:     'Pegasus Insights LLC',
    address:        '',
    city_state_zip: '',
    phone:          '',
  },
};

export function getSignatoriesForCompany(company: string): Signatory[] {
  return SIGNATORIES[(company as CompanyCode) in SIGNATORIES ? (company as CompanyCode) : 'IPC'];
}

export function getCompanyProfile(company: string): CompanyProfile {
  return COMPANY_PROFILES[(company as CompanyCode) in COMPANY_PROFILES ? (company as CompanyCode) : 'IPC'];
}
