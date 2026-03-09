import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export type ComboboxOption = {
  value: string;
  label: string;
  searchText?: string; // extra text to search against (e.g. description)
  renderLabel?: React.ReactNode; // custom JSX for dropdown & trigger display
};

type ComboboxProps = {
  options: ComboboxOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
};

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  className,
  triggerClassName,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((opt) => opt.value === value);

  // Scroll the list to the top whenever the popover opens
  React.useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: 0 });
      });
    }
  }, [open]);

  // Select the currently highlighted item on Tab key
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Tab' && open) {
        // Find the currently highlighted [data-selected="true"] item
        const highlighted = listRef.current?.querySelector('[data-selected="true"]');
        if (highlighted) {
          e.preventDefault();
          (highlighted as HTMLElement).click();
        }
      }
    },
    [open],
  );

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
            disabled && 'opacity-75 bg-gray-50',
            triggerClassName,
          )}
        >
          <span className="truncate min-w-0">
            {selected ? (selected.renderLabel ?? selected.label) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('p-0', className)} align="start">
        <Command onKeyDown={handleKeyDown}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList ref={listRef}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.searchText ?? option.label}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {option.renderLabel ?? option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
