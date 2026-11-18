import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { Icon } from '../icon';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Muted text after the label, e.g. a domain's status. */
  hint?: string;
}

let nextId = 0;

/**
 * A select with a search box: the trigger looks like the other inputs, the
 * menu filters as you type and works with the keyboard (arrows, Enter,
 * Escape). Two-way bind `value`.
 */
@Component({
  selector: 'amelu-combobox',
  imports: [Icon],
  template: `
    <button
      #trigger
      type="button"
      [id]="inputId()"
      class="mt-1.5 flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left text-[13px] outline-none hover:border-ink/20 focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-default disabled:opacity-50"
      [class.border-accent]="open()"
      [disabled]="disabled()"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      <span class="min-w-0 flex-1 truncate" [class.text-muted]="!selected()">{{ selected()?.label ?? placeholder() }}</span>
      <amelu-icon name="chevronDown" [size]="14" class="flex-none text-muted transition-transform" [class.rotate-180]="open()" />
    </button>

    @if (open()) {
      <div class="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line bg-surface" (keydown)="onListKey($event)">
        <label class="flex items-center gap-2 border-b border-line px-2.5">
          <amelu-icon name="search" [size]="14" class="flex-none text-muted" />
          <input
            #search
            type="text"
            class="h-9 w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-muted"
            [placeholder]="searchPlaceholder()"
            [attr.aria-label]="searchPlaceholder()"
            [attr.aria-activedescendant]="activeId()"
            [value]="query()"
            (input)="query.set($any($event.target).value); active.set(0)"
          />
        </label>
        <ul [id]="listId" role="listbox" class="max-h-60 overflow-auto py-1">
          @for (option of filtered(); track option.value; let i = $index) {
            <li
              [id]="listId + '-' + i"
              role="option"
              [attr.aria-selected]="option.value === value()"
              class="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[13px]"
              [class.bg-bg]="i === active()"
              (mouseenter)="active.set(i)"
              (mousedown)="$event.preventDefault()"
              (click)="choose(option)"
            >
              <span class="min-w-0 flex-1 truncate" [class.font-medium]="option.value === value()">{{ option.label }}</span>
              @if (option.hint) {
                <span class="flex-none text-[12px] text-muted">{{ option.hint }}</span>
              }
              @if (option.value === value()) {
                <amelu-icon name="check" [size]="13" class="flex-none text-link" />
              }
            </li>
          } @empty {
            <li class="px-2.5 py-2 text-[13px] text-muted">No matches</li>
          }
        </ul>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '(document:pointerdown)': 'onOutside($event)',
  },
})
export class Combobox {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input.required<ComboboxOption[]>();
  readonly value = model('');
  readonly placeholder = input('Choose…');
  readonly searchPlaceholder = input('Search');
  readonly disabled = input(false);
  /** For a <label for>. */
  readonly inputId = input(`combobox-${nextId}`);

  protected readonly listId = `combobox-list-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly selected = computed(() => this.options().find((o) => o.value === this.value()) ?? null);
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.options().filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q)) : this.options();
  });
  protected readonly activeId = computed(() => (this.filtered().length ? `${this.listId}-${this.active()}` : null));

  protected toggle(): void {
    if (this.open()) this.close(false);
    else this.show();
  }

  private show(): void {
    this.query.set('');
    this.active.set(Math.max(0, this.options().findIndex((o) => o.value === this.value())));
    this.open.set(true);
    queueMicrotask(() => this.search()?.nativeElement.focus());
  }

  private close(refocus: boolean): void {
    this.open.set(false);
    if (refocus) this.trigger().nativeElement.focus();
  }

  protected choose(option: ComboboxOption): void {
    this.value.set(option.value);
    this.close(true);
  }

  protected onTriggerKey(event: KeyboardEvent): void {
    if (!this.open() && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      this.show();
    }
  }

  protected onListKey(event: KeyboardEvent): void {
    const count = this.filtered().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (count) this.active.update((i) => (i + 1) % count);
        this.scrollActive();
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count) this.active.update((i) => (i - 1 + count) % count);
        this.scrollActive();
        break;
      case 'Enter': {
        event.preventDefault();
        const option = this.filtered()[this.active()];
        if (option) this.choose(option);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close(true);
        break;
      case 'Tab':
        this.close(false);
        break;
    }
  }

  private scrollActive(): void {
    queueMicrotask(() => document.getElementById(`${this.listId}-${this.active()}`)?.scrollIntoView({ block: 'nearest' }));
  }

  protected onOutside(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }
}
