import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, of } from 'rxjs';
import { errorMessage } from '../api';
import { Alert } from '../alert/alert';
import { EmptyState } from '../empty-state/empty-state';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';
import { WebmailApi, WebmailBranding } from './webmail-api';

const DEFAULT_ACCENT = '#0043ce';

/**
 * White-label webmail: the organization's own webmail address, on
 * <name>.webmail.amelu.org and optionally its own hostname, with its own
 * name, logo and colour. "Open in webmail" sends its mailboxes there.
 */
@Component({
  selector: 'amelu-organization-webmail',
  imports: [PageHeader, Alert, EmptyState, RouterLink],
  templateUrl: './organization-webmail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class OrganizationWebmail {
  private readonly api = inject(WebmailApi);
  protected readonly ui = UI;

  // undefined while loading, null when the request failed
  private readonly loaded = toSignal(this.api.get().pipe(catchError(() => of(null))), { initialValue: undefined });
  protected readonly branding = linkedSignal<WebmailBranding | null | undefined>(() => this.loaded());

  protected readonly enabled = linkedSignal(() => this.branding()?.enabled ?? false);
  protected readonly subdomain = linkedSignal(() => this.branding()?.subdomain ?? '');
  protected readonly productName = linkedSignal(() => this.branding()?.productName ?? '');
  protected readonly accentColor = linkedSignal(() => this.branding()?.accentColor ?? '');
  protected readonly supportUrl = linkedSignal(() => this.branding()?.supportUrl ?? '');
  protected readonly hostname = linkedSignal(() => this.branding()?.customHostname ?? '');

  protected readonly editable = computed(() => !!this.branding()?.allowed && !!this.branding()?.canManage);
  protected readonly changed = computed(() => {
    const b = this.branding();
    return (
      !!b &&
      (this.enabled() !== b.enabled ||
        this.subdomain().trim().toLowerCase() !== b.subdomain ||
        this.productName().trim() !== b.productName ||
        this.accentColor().trim().toLowerCase() !== b.accentColor ||
        this.supportUrl().trim() !== b.supportUrl)
    );
  });
  protected readonly previewAccent = computed(() =>
    /^#[0-9a-f]{6}$/i.test(this.accentColor().trim()) ? this.accentColor().trim() : DEFAULT_ACCENT,
  );
  protected readonly colorPickerValue = computed(() => this.previewAccent().toLowerCase());
  protected readonly logoUrl = computed(() => {
    const b = this.branding();
    return b?.hasLogo ? this.api.logoUrl(b.logoVersion) : null;
  });
  protected readonly subdomainAddress = computed(() => {
    const b = this.branding();
    const sub = this.subdomain().trim().toLowerCase();
    return b && sub ? `${sub}.${b.subdomainSuffix}` : '';
  });

  protected readonly busy = signal<'save' | 'logo' | 'hostname' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  private apply(result: WebmailBranding, notice: string): void {
    this.branding.set(result);
    this.notice.set(notice);
  }

  private async run(kind: 'save' | 'logo' | 'hostname', fallback: string, action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    this.notice.set(null);
    this.busy.set(kind);
    try {
      await action();
    } catch (err) {
      this.error.set(errorMessage(err, fallback));
    } finally {
      this.busy.set(null);
    }
  }

  protected save(event: Event): Promise<void> {
    event.preventDefault();
    return this.run('save', 'Could not save your webmail settings', async () => {
      const result = await firstValueFrom(
        this.api.update({
          enabled: this.enabled(),
          subdomain: this.subdomain(),
          productName: this.productName(),
          accentColor: this.accentColor(),
          supportUrl: this.supportUrl(),
        }),
      );
      this.apply(result, result.enabled ? `Your webmail is live at ${result.url.replace('https://', '')}.` : 'Saved.');
    });
  }

  protected pickColor(event: Event): void {
    this.accentColor.set((event.target as HTMLInputElement).value);
  }

  protected uploadLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return Promise.resolve();
    return this.run('logo', 'Could not upload the logo', async () => {
      this.apply(await firstValueFrom(this.api.uploadLogo(file)), 'Logo updated.');
    });
  }

  protected removeLogo(): Promise<void> {
    return this.run('logo', 'Could not remove the logo', async () => {
      this.apply(await firstValueFrom(this.api.deleteLogo()), 'Logo removed.');
    });
  }

  protected connectHostname(event: Event): Promise<void> {
    event.preventDefault();
    return this.run('hostname', 'Could not connect the hostname', async () => {
      const result = await firstValueFrom(this.api.setHostname(this.hostname()));
      this.apply(result, result.customHostnameStatus === 'active' ? `${result.customHostname} is connected.` : 'Add the DNS record below to finish.');
    });
  }

  protected checkHostname(): Promise<void> {
    return this.run('hostname', 'Could not check the hostname', async () => {
      const result = await firstValueFrom(this.api.get());
      this.apply(
        result,
        result.customHostnameStatus === 'active' ? `${result.customHostname} is connected.` : 'Not connected yet. DNS changes can take a few minutes.',
      );
    });
  }

  protected removeHostname(): Promise<void> {
    return this.run('hostname', 'Could not remove the hostname', async () => {
      this.apply(await firstValueFrom(this.api.removeHostname()), 'Hostname removed.');
    });
  }
}
