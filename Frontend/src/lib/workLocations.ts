// Locations selectable per day/week in Weekly Log — where the work was
// actually performed, for state/international tax purposes when someone
// travels. Kept separate from Employee.location (home/office grouping).

export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
  'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
  'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];

export const INTERNATIONAL_WORK_LOCATIONS = ['Colombia', 'Ecuador'];

export const WORK_LOCATION_GROUPS: { label: string; options: string[] }[] = [
  { label: 'United States', options: US_STATES },
  { label: 'International', options: INTERNATIONAL_WORK_LOCATIONS },
];

export const ALL_WORK_LOCATIONS = [...US_STATES, ...INTERNATIONAL_WORK_LOCATIONS];
