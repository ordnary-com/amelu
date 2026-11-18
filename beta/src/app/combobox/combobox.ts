import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { HlmComboboxImports } from '@spartan-ng/helm/combobox';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Muted text after the label, e.g. a domain's status. */
  hint?: string;
}

let nextId = 0;

/**
 * A select with a search box, on spartan's combobox: options are plain
 * {value, label} records and `value` is the chosen option's value, so forms
 * keep string signals.
 */
@Component({
  selector: 'amelu-combobox',
  imports: [HlmComboboxImports],
  template: `
    <hlm-combobox [value]="selected()" (valueChange)="value.set($event?.value ?? '')" [itemToString]="toLabel" [disabled]="disabled()">
      <hlm-combobox-trigger class="h-9 w-full justify-between rounded-md border-line font-normal" [buttonId]="inputId()">
        <span hlmComboboxValue class="truncate" [placeholder]="placeholder()"></span>
      </hlm-combobox-trigger>
      <hlm-combobox-content *hlmComboboxPortal>
        <hlm-combobox-input [placeholder]="searchPlaceholder()" [showTrigger]="false" />
        <hlm-combobox-empty>No matches</hlm-combobox-empty>
        <div hlmComboboxList>
          @for (option of options(); track option.value) {
            <hlm-combobox-item [value]="option">
              <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
              @if (option.hint) {
                <span class="flex-none text-xs text-muted-foreground">{{ option.hint }}</span>
              }
            </hlm-combobox-item>
          }
        </div>
      </hlm-combobox-content>
    </hlm-combobox>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class Combobox {
  readonly options = input.required<ComboboxOption[]>();
  readonly value = model('');
  readonly placeholder = input('Choose');
  readonly searchPlaceholder = input('Search');
  readonly disabled = input(false);
  /** For a <label for>. */
  readonly inputId = input(`combobox-${nextId++}`);

  protected readonly selected = computed(() => this.options().find((o) => o.value === this.value()) ?? null);
  protected readonly toLabel = (o: ComboboxOption) => o.label;
}
