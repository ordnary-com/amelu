import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Addr } from '../api';
import { Icon } from '../icon';
import { addrLabel, parseAddrs } from '../format';

/** Recipients as chips; Enter, comma, Tab or blur turns typed text into chips. */
@Component({
  selector: 'amelu-address-field',
  imports: [FormsModule, Icon],
  template: `
    <div
      class="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-line px-2 py-1 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
    >
      @for (addr of value(); track $index) {
        <span
          class="inline-flex max-w-full items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[12px]"
          [title]="addr.email"
        >
          <span class="truncate">{{ label(addr) }}</span>
          <button
            type="button"
            class="cursor-pointer rounded-full p-0.5 text-muted hover:text-ink"
            [attr.aria-label]="'Remove ' + addr.email"
            (click)="remove($index)"
          >
            <amelu-icon name="close" [size]="11" [strokeWidth]="2.5" />
          </button>
        </span>
      }
      <input
        type="text"
        [id]="id()"
        class="min-w-[8rem] flex-1 bg-transparent py-0.5 text-[13px] outline-none placeholder:text-muted"
        [placeholder]="value().length ? '' : placeholder()"
        [(ngModel)]="text"
        [ngModelOptions]="{ standalone: true }"
        autocomplete="off"
        (keydown)="onKey($event)"
        (blur)="commit()"
      />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AddressField {
  readonly id = input('');
  readonly placeholder = input('');
  readonly value = model<Addr[]>([]);
  protected text = '';
  protected readonly focused = signal(false);

  protected label(addr: Addr): string {
    return addrLabel(addr);
  }

  protected remove(index: number): void {
    this.value.set(this.value().filter((_, i) => i !== index));
  }

  protected commit(): void {
    const parsed = parseAddrs(this.text);
    if (parsed.length) this.value.set([...this.value(), ...parsed]);
    if (parsed.length || !this.text.includes('@')) this.text = '';
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',' || event.key === 'Tab' || event.key === ';') {
      if (this.text.trim()) {
        event.preventDefault();
        this.commit();
      }
    } else if (event.key === 'Backspace' && !this.text && this.value().length) {
      this.remove(this.value().length - 1);
    }
  }
}
