import { FixedFeePeriod } from '@/types';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Billing = 'hourly' | FixedFeePeriod;

const OPTIONS: { value: Billing; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'week', label: 'Fixed / week' },
  { value: 'month', label: 'Fixed / month' },
  { value: 'project', label: 'Fixed / project' },
];

const PLACEHOLDER: Record<Billing, string> = {
  hourly: '$ / hour', week: '$ / week', month: '$ / month', project: '$ total',
};

/** "$150/h", "$1,000/week", "$3,000/month", "$9,000 per project" — how a role bills. */
export function roleBillingLabel(role: {
  hourly_rate_usd: number; fixed_fee_period?: FixedFeePeriod | null; fixed_fee_amount?: number | null;
}): string {
  const money = (n: number) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (!role.fixed_fee_period) return `${money(role.hourly_rate_usd)}/h`;
  const amount = money(role.fixed_fee_amount ?? 0);
  return role.fixed_fee_period === 'project' ? `${amount} per project` : `${amount}/${role.fixed_fee_period}`;
}

/**
 * One role's billing: hourly (a $/hour rate) or a fixed fee per week / month /
 * project. `amount` is whichever number applies to the chosen type; the caller
 * maps it onto hourly_rate_usd or fixed_fee_amount when saving. With
 * allowFixed=false (project-level fixed fee / Managed Services own the billing)
 * it is just the hourly rate input.
 */
export function RoleBillingInput({
  period, amount, onChange, allowFixed = true,
}: {
  period: FixedFeePeriod | null;
  amount: number;
  onChange: (period: FixedFeePeriod | null, amount: number) => void;
  allowFixed?: boolean;
}) {
  const billing: Billing = allowFixed && period ? period : 'hourly';
  return (
    <div className="flex items-center gap-2">
      {allowFixed && (
        <Select value={billing} onValueChange={v => onChange(v === 'hourly' ? null : (v as FixedFeePeriod), amount)}>
          <SelectTrigger className="h-8 w-[136px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <Input
        type="number"
        min="0"
        step="0.5"
        value={amount || ''}
        onChange={e => onChange(billing === 'hourly' ? null : billing, parseFloat(e.target.value) || 0)}
        placeholder={PLACEHOLDER[billing]}
        className="h-8 w-28 text-right"
      />
    </div>
  );
}
