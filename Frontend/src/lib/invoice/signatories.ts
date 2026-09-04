export type CompanyCode = 'IPC' | 'PI';

export interface Signatory {
  name: string;
  title: string;
}

export interface CompanyBank {
  bank_name: string;
  aba: string;
  account_name: string;
  account_number: string;
}

export interface CompanyProfile {
  name: string;
  legal_name: string;
  address: string;
  city_state_zip: string;
  phone: string;
  bank: CompanyBank;
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
    bank: {
      bank_name:      'Capital One',
      aba:            '065000090',
      account_name:   'Impact Point Co., LLC',
      account_number: '3316971352',
    },
  },
  PI: {
    name:           'Pegasus Insights',
    legal_name:     'Pegasus Insights LLC',
    address:        '',
    city_state_zip: '',
    phone:          '',
    bank: {
      bank_name:      '',
      aba:            '',
      account_name:   'Pegasus Insights LLC',
      account_number: '',
    },
  },
};

export function getSignatoriesForCompany(company: string): Signatory[] {
  return SIGNATORIES[(company as CompanyCode) in SIGNATORIES ? (company as CompanyCode) : 'IPC'];
}

export function getCompanyProfile(company: string): CompanyProfile {
  return COMPANY_PROFILES[(company as CompanyCode) in COMPANY_PROFILES ? (company as CompanyCode) : 'IPC'];
}
