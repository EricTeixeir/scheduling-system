import { SEARCH_MAX_LENGTH, type ClientSummary } from '@scheduling/shared';
import { useId, useState, type KeyboardEvent } from 'react';

import { FormField } from '@/components/form/form-field';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { messageFor } from '@/lib/errors/messages';
import { cn } from '@/lib/utils';

import { useClientSearch } from './use-admin-appointments';

const SEARCH_DEBOUNCE_MS = 300;

interface ClientComboboxProps {
  readonly selected: ClientSummary | null;
  readonly onSelect: (client: ClientSummary | null) => void;
  readonly error: string | undefined;
  readonly disabled: boolean;
}

export function ClientCombobox({ selected, onSelect, error, disabled }: ClientComboboxProps) {
  const listId = useId();
  const [text, setText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const q = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS);
  const search = useClientSearch(selected === null ? q : '');
  const options = search.data?.items ?? [];
  const isSearching = isOpen && selected === null && q !== '';
  const isListShown = isSearching && options.length > 0;
  const optionId = (index: number) => `${listId}-${String(index)}`;

  const choose = (client: ClientSummary) => {
    onSelect(client);
    setText(client.name);
    setIsOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index) => Math.max(Math.min(index + step, options.length - 1), 0));
    } else if (event.key === 'Enter' && isListShown) {
      const active = options.at(activeIndex);
      if (active === undefined) return;
      event.preventDefault();
      choose(active);
    }
  };

  return (
    <FormField
      label="Cliente"
      error={error}
      hint={selected === null ? 'Busque pelo nome ou e-mail.' : selected.email}
    >
      {(control) => (
        <div className="grid gap-2">
          <Input
            {...control}
            role="combobox"
            aria-expanded={isListShown}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={isListShown ? optionId(activeIndex) : undefined}
            type="search"
            autoComplete="off"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Nome ou e-mail"
            value={text}
            disabled={disabled}
            onChange={(event) => {
              setText(event.target.value);
              setIsOpen(true);
              setActiveIndex(0);
              if (selected !== null) onSelect(null);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              setIsOpen(false);
            }}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label="Clientes encontrados"
            hidden={!isListShown}
            className="max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-sm"
          >
            {isListShown
              ? options.map((client, index) => (
                  <li
                    key={client.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn(
                      'cursor-pointer rounded-sm px-3 py-2',
                      index === activeIndex && 'bg-accent text-accent-foreground',
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      choose(client);
                    }}
                  >
                    <p className="truncate text-sm font-medium">{client.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{client.email}</p>
                  </li>
                ))
              : null}
          </ul>
          {isSearching && !isListShown ? (
            <p role="status" className="text-sm text-muted-foreground">
              {search.isError
                ? messageFor(search.error)
                : search.isFetching || q !== text.trim()
                  ? 'Buscando clientes…'
                  : 'Nenhum cliente encontrado.'}
            </p>
          ) : null}
        </div>
      )}
    </FormField>
  );
}
