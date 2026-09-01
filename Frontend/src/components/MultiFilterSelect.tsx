import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface MultiFilterSelectProps {
  label: string; selected: string[]; allLabel: string;
  options: { value: string; label: string }[];
  onChange: (v: string[]) => void;
  onClear: () => void;
}

export function MultiFilterSelect({ label, selected, allLabel, options, onChange, onClear }: MultiFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const isActive = selected.length > 0;
  const filteredOptions = useMemo(
    () => query.trim() ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options,
    [options, query]
  );
  const triggerLabel = !isActive
    ? allLabel
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} selected`;

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between min-h-[16px]">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {isActive && (
          <button onClick={onClear} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setQuery(''); }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={`w-full justify-start text-sm font-normal h-9 ${isActive ? 'border-primary/60 bg-primary/5' : ''}`}
          >
            <span className="truncate">{triggerLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="start">
          {options.length > 6 && (
            <div className="p-2 border-b">
              <Input
                placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground italic">No options available</div>
            ) : (
              filteredOptions.map(o => (
                <label key={o.value} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-muted">
                  <Checkbox checked={selected.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                  <span className="truncate">{o.label}</span>
                </label>
              ))
            )}
          </div>
          {isActive && (
            <div className="border-t p-1">
              <button
                onClick={() => onChange([])}
                className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear selection
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
