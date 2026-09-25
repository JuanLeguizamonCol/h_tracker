import { FIXED_FEE_PERIOD_LABELS, FixedFeePeriod } from '@/types';
import { cn } from '@/lib/utils';

const PERIODS = Object.keys(FIXED_FEE_PERIOD_LABELS) as FixedFeePeriod[];

/** Label for the fixed-fee amount input — the amount means something different per period. */
export const fixedFeeAmountLabel = (period: FixedFeePeriod): string =>
  period === 'week' ? 'Fee per week ($)' : period === 'month' ? 'Fee per month ($)' : 'Fixed Fee Amount ($)';

/** "3 weeks", "1 week", "0.67 months" — what a fixed fee was multiplied by. */
export const formatFeeUnits = (units: number, period: FixedFeePeriod): string => {
  if (period === 'project') return 'whole project';
  return `${Number(units.toFixed(2))} ${period}${units === 1 ? '' : 's'}`;
};

/** The backend's message from a failed preview call (api.ts folds it into the error text). */
export const fixedFeeErrorMessage = (err: unknown): string => {
  const detail = err instanceof Error ? err.message.match(/"detail":"([^"]+)"/)?.[1] : undefined;
  return detail ?? 'Could not calculate the fixed fee.';
};

export function FixedFeePeriodPicker({
  value, onChange, disabled,
}: { value: FixedFeePeriod; onChange: (period: FixedFeePeriod) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Fixed fee period" className="inline-flex rounded-md border overflow-hidden">
      {PERIODS.map(period => (
        <button
          key={period}
          type="button"
          role="radio"
          aria-checked={value === period}
          disabled={disabled}
          onClick={() => onChange(period)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium border-r last:border-r-0 transition-colors disabled:opacity-50',
            value === period
              ? 'bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground hover:bg-muted',
          )}
        >
          {FIXED_FEE_PERIOD_LABELS[period]}
        </button>
      ))}
    </div>
  );
}
