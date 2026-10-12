import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../api';
import { injectDomain } from '../../domain-context';
import { PageHeader } from '../../page-header/page-header';
import { Alert } from '../../alert/alert';
import { Icon } from '../../icon';
import { UI } from '../../ui';
import { ImportMailboxResult, MailboxesApi } from '../mailboxes-api';

// Matches what ImportMailboxesCSV in backend/internal/handlers/mailboxes.go actually does with each column.
const FIELDS = [
  { name: 'Name', description: 'Required, name of the mailbox owner. Used only for organizational purposes within this panel.' },
  { name: 'Address', description: 'Required, address of the mailbox to create. Only the local part is considered while the domain is ignored.' },
  {
    name: 'Password',
    description: 'If present, the mailbox password, minimum 8 characters. If left empty, a password is generated and shown once on the results page instead.',
  },
  { name: 'InviteEmail', description: 'Not supported in bulk import, ignored if present. A password is generated instead.' },
  { name: 'ForwardEmail', description: 'If present, mail to the new mailbox is also forwarded to this address.' },
  { name: 'ExpirationDate', description: 'If present, the date the mailbox expires, as YYYY-MM-DD.' },
  { name: 'RemoveUponExpiration', description: 'true or 1 to delete the mailbox once it expires.' },
];

const EXAMPLES = ['Bob, bob@domain.tld, s3cReTPa55,,,,', 'Alice, alice@domain.tld,,,,,', 'Evan Spy, evan@spy.tld, pa$$word,,,,'];

/** The current dashboard's /domains/:id/mailboxes/import: bulk create mailboxes from pasted CSV. */
@Component({
  selector: 'amelu-import-mailboxes',
  imports: [RouterLink, PageHeader, Alert, Icon],
  templateUrl: './import-mailboxes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ImportMailboxes {
  private readonly api = inject(MailboxesApi);
  protected readonly ui = UI;
  protected readonly ctx = injectDomain();
  protected readonly base = computed(() => `/domains/${this.ctx.id()}`);
  protected readonly fields = FIELDS;
  protected readonly format = FIELDS.map((f) => f.name).join(', ');
  protected readonly examples = EXAMPLES.join('\n');

  protected readonly csv = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly results = signal<ImportMailboxResult[] | null>(null);
  protected readonly copied = signal<string | null>(null);

  protected readonly rowCount = computed(() => this.csv().split('\n').filter((line) => line.trim() !== '').length);
  protected readonly summary = computed(() => {
    const results = this.results() ?? [];
    const failed = results.filter((r) => r.error).length;
    return { created: results.length - failed, failed };
  });

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.csv().trim() || this.busy()) return;
    this.error.set(null);
    this.busy.set(true);
    try {
      const { results } = await firstValueFrom(this.api.importCsv(this.ctx.id(), this.csv()));
      this.results.set(results ?? []);
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not import mailboxes'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(result: ImportMailboxResult): Promise<void> {
    if (!result.password) return;
    await navigator.clipboard.writeText(result.password);
    this.copied.set(result.address);
  }

  protected again(): void {
    this.results.set(null);
    this.csv.set('');
    this.copied.set(null);
  }
}
