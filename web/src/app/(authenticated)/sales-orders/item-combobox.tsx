"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui";
import styles from "./sales-orders-ui.module.css";

export type ItemComboboxOption = {
  id: string;
  code: string;
  name: string;
  baseUnit: string;
};

export function formatItemOptionLabel(item: ItemComboboxOption): string {
  return `${item.code}－${item.name}`;
}

function findOption(
  items: ItemComboboxOption[],
  id: string,
): ItemComboboxOption | undefined {
  return items.find((item) => item.id === id);
}

export function filterItemOptions(
  items: ItemComboboxOption[],
  query: string,
): ItemComboboxOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter(
    (item) =>
      item.code.toLowerCase().includes(normalized) ||
      item.name.toLowerCase().includes(normalized),
  );
}

export function ItemCombobox({
  id,
  items,
  value,
  onChange,
  disabled = false,
  label,
  placeholder = "輸入品項代碼或名稱搜尋",
}: {
  id?: string;
  items: ItemComboboxOption[];
  value: string;
  onChange: (itemId: string) => void;
  disabled?: boolean;
  label: string;
  placeholder?: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  // null = not actively being typed into; displayed text is derived from `value`.
  const [draftQuery, setDraftQuery] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedLabel = (() => {
    const selected = findOption(items, value);
    return selected ? formatItemOptionLabel(selected) : "";
  })();
  const displayValue = open && draftQuery !== null ? draftQuery : selectedLabel;
  const filtered = filterItemOptions(items, open ? (draftQuery ?? "") : "");
  const safeHighlightedIndex = Math.min(
    highlightedIndex,
    Math.max(filtered.length - 1, 0),
  );
  const activeOption = open ? filtered[safeHighlightedIndex] : undefined;

  function openList() {
    setOpen(true);
    setHighlightedIndex(0);
  }

  function closeAndRevert() {
    setOpen(false);
    setDraftQuery(null);
  }

  function selectItem(item: ItemComboboxOption) {
    onChange(item.id);
    setOpen(false);
    setDraftQuery(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setHighlightedIndex((index) =>
        Math.min(index + 1, Math.max(filtered.length - 1, 0)),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (open && filtered[safeHighlightedIndex]) {
        event.preventDefault();
        selectItem(filtered[safeHighlightedIndex]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        closeAndRevert();
      }
    }
  }

  return (
    <div className={styles.comboboxRoot}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeOption ? `${listboxId}-option-${activeOption.id}` : undefined
        }
        aria-label={label}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={displayValue}
        onFocus={openList}
        onChange={(event) => {
          setDraftQuery(event.target.value);
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={closeAndRevert}
      />
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          className={styles.comboboxListbox}
          onMouseDown={(event) => event.preventDefault()}
        >
          {filtered.length === 0 ? (
            <li className={styles.comboboxEmpty} role="presentation">
              查無符合的品項
            </li>
          ) : (
            filtered.map((item, index) => (
              <li
                key={item.id}
                id={`${listboxId}-option-${item.id}`}
                role="option"
                aria-selected={item.id === value}
                data-highlighted={
                  index === safeHighlightedIndex ? "" : undefined
                }
                className={styles.comboboxOption}
                onClick={() => selectItem(item)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <span className={styles.comboboxOptionCode}>{item.code}</span>
                <span>{item.name}</span>
                <span className={styles.comboboxOptionUnit}>
                  {item.baseUnit}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
