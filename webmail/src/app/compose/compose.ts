import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { Addr, Api, Draft, DraftAttachment, Message, errorCode, errorMessage } from '../api';
import { Session } from '../session';
import { Icon } from '../icon';
import { Alert } from '../alert';
import { AddressField } from './address-field';
import { UI } from '../ui';
import { addrFull, fileSize, longDate, quote } from '../format';

const AUTOSAVE_MS = 10_000;
const MAX_UPLOAD = 25 * 1024 * 1024;

interface Upload {
  name: string;
  size: number;
  progress: number;
  error?: string;
}

/**
 * New message, reply, reply all, forward, or a resumed draft. Saves a draft
 * every 10 seconds while something changed, and when closed.
 */
@Component({
  selector: 'amelu-compose',
  imports: [FormsModule, Icon, Alert, AddressField],
  templateUrl: './compose.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-w-0 flex-1 flex-col', '(document:keydown.escape)': 'close()' },
})
export class Compose {
  protected readonly ui = UI;
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly session = inject(Session);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly to = signal<Addr[]>([]);
  protected readonly cc = signal<Addr[]>([]);
  protected readonly bcc = signal<Addr[]>([]);
  protected subject = '';
  protected text = '';
  protected readonly attachments = signal<DraftAttachment[]>([]);
  protected readonly uploads = signal<Upload[]>([]);
  protected readonly showCc = signal(false);
  protected readonly showBcc = signal(false);

  protected readonly draftId = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly sending = signal(false);
  protected readonly saving = signal(false);
  protected readonly savedAt = signal<Date | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly heading = signal('New message');

  private inReplyTo?: string;
  private references?: string[];
  private replyToId?: string;
  private forwardOfId?: string;
  private dirty = false;
  private lastSaved = '';
  private closed = false;

  protected readonly uploading = computed(() =>
    this.uploads().some((u) => u.progress < 100 && !u.error),
  );

  constructor() {
    void this.init();
    const timer = setInterval(() => void this.autosave(), AUTOSAVE_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      if (!this.closed) void this.autosave();
    });
  }

  private async init(): Promise<void> {
    const params = this.params();
    try {
      const draft = params?.get('draft');
      const reply = params?.get('reply');
      const replyAll = params?.get('replyAll');
      const forward = params?.get('forward');
      if (draft) await this.resume(draft);
      else if (reply || replyAll) await this.prefillReply((reply ?? replyAll)!, !!replyAll);
      else if (forward) await this.prefillForward(forward);
      else await this.applySignature();
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not open the message'));
    } finally {
      this.loading.set(false);
      this.lastSaved = this.snapshot();
    }
  }

  private async resume(id: string): Promise<void> {
    const m = await firstValueFrom(this.api.getMessage(id));
    this.draftId.set(id);
    this.to.set(m.to);
    this.cc.set(m.cc);
    this.bcc.set(m.bcc);
    this.showCc.set(m.cc.length > 0);
    this.showBcc.set(m.bcc.length > 0);
    this.subject = m.subject;
    this.text = m.textBody;
    this.attachments.set(
      m.attachments.map((a) => ({ blobId: a.blobId, name: a.name, type: a.type, size: a.size })),
    );
    this.inReplyTo = m.inReplyTo[0];
    this.references = m.references;
    this.heading.set('Draft');
  }

  private async prefillReply(id: string, all: boolean): Promise<void> {
    const m = await firstValueFrom(this.api.getMessage(id));
    const me = this.session.account()?.email.toLowerCase();
    const replyTo = m.replyTo.length ? m.replyTo : m.from;
    this.to.set(replyTo);
    if (all) {
      const others = [...m.to, ...m.cc].filter(
        (a) =>
          a.email.toLowerCase() !== me &&
          !replyTo.some((r) => r.email.toLowerCase() === a.email.toLowerCase()),
      );
      this.cc.set(others);
      this.showCc.set(others.length > 0);
    }
    this.subject = m.subject.match(/^re:/i) ? m.subject : `Re: ${m.subject}`;
    this.inReplyTo = m.messageId[0];
    this.references = [...m.references, ...m.messageId];
    this.replyToId = m.id;
    this.heading.set(all ? 'Reply all' : 'Reply');
    const signature = await this.signature();
    this.text = `${signature}\n\nOn ${longDate(m.sentAt || m.receivedAt)}, ${m.from.map(addrFull).join(', ')} wrote:\n${quote(bodyText(m))}`;
  }

  private async prefillForward(id: string): Promise<void> {
    const m = await firstValueFrom(this.api.getMessage(id));
    this.subject = m.subject.match(/^fwd?:/i) ? m.subject : `Fwd: ${m.subject}`;
    this.forwardOfId = m.id;
    this.attachments.set(
      m.attachments
        .filter((a) => !a.inline)
        .map((a) => ({ blobId: a.blobId, name: a.name, type: a.type, size: a.size })),
    );
    this.heading.set('Forward');
    const signature = await this.signature();
    const header = [
      `From: ${m.from.map(addrFull).join(', ')}`,
      `Date: ${longDate(m.sentAt || m.receivedAt)}`,
      `Subject: ${m.subject}`,
      `To: ${m.to.map(addrFull).join(', ')}`,
    ].join('\n');
    this.text = `${signature}\n\n---------- Forwarded message ----------\n${header}\n\n${bodyText(m)}`;
  }

  private async applySignature(): Promise<void> {
    const signature = await this.signature();
    if (signature) this.text = signature;
  }

  private async signature(): Promise<string> {
    try {
      const settings = await firstValueFrom(this.api.getSettings());
      const sig = settings.identity.textSignature.trim();
      return sig ? `\n\n-- \n${sig}` : '';
    } catch {
      return '';
    }
  }

  private draft(): Draft {
    const draft: Draft = {
      to: this.to(),
      cc: this.cc(),
      bcc: this.bcc(),
      subject: this.subject,
      text: this.text,
      attachments: this.attachments(),
    };
    if (this.inReplyTo) draft.inReplyTo = this.inReplyTo;
    if (this.references?.length) draft.references = this.references;
    if (this.replyToId) draft.replyToId = this.replyToId;
    if (this.forwardOfId) draft.forwardOfId = this.forwardOfId;
    return draft;
  }

  private snapshot(): string {
    return JSON.stringify(this.draft());
  }

  private isEmpty(): boolean {
    return (
      !this.to().length &&
      !this.cc().length &&
      !this.bcc().length &&
      !this.subject.trim() &&
      !this.text.trim() &&
      !this.attachments().length
    );
  }

  protected markDirty(): void {
    this.dirty = true;
  }

  protected async autosave(): Promise<void> {
    if (this.loading() || this.sending() || this.saving() || this.closed) return;
    const snapshot = this.snapshot();
    if (snapshot === this.lastSaved || this.isEmpty()) return;
    await this.save(snapshot);
  }

  protected async saveNow(): Promise<void> {
    if (this.isEmpty()) return;
    await this.save(this.snapshot());
  }

  private async save(snapshot: string): Promise<void> {
    this.saving.set(true);
    try {
      const id = this.draftId();
      const result = await firstValueFrom(
        id ? this.api.updateDraft(id, this.draft()) : this.api.createDraft(this.draft()),
      );
      this.draftId.set(result.id);
      this.lastSaved = snapshot;
      this.savedAt.set(new Date());
      this.dirty = false;
    } catch (err) {
      this.error.set(errorMessage(err, 'Could not save the draft'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async send(): Promise<void> {
    if (this.sending() || this.uploading()) return;
    if (!this.to().length && !this.cc().length && !this.bcc().length) {
      this.error.set('Add at least one recipient.');
      return;
    }
    this.sending.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.send(this.draft(), this.draftId() ?? undefined));
      this.closed = true;
      await this.router.navigateByUrl('/');
    } catch (err) {
      const code = errorCode(err);
      this.error.set(
        code === 'NO_RECIPIENTS'
          ? 'Add at least one recipient.'
          : errorMessage(err, 'Could not send the message'),
      );
    } finally {
      this.sending.set(false);
    }
  }

  protected async discard(): Promise<void> {
    if (!this.isEmpty() && !confirm('Discard this message?')) return;
    this.closed = true;
    const id = this.draftId();
    if (id) await firstValueFrom(this.api.deleteDraft(id)).catch(() => undefined);
    await this.router.navigateByUrl('/');
  }

  /** Closes and keeps the draft (saved on destroy when it changed). */
  protected close(): void {
    if (this.closed) return;
    void this.router.navigateByUrl('/');
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    for (const file of Array.from(input.files ?? [])) void this.upload(file);
    input.value = '';
  }

  private async upload(file: File): Promise<void> {
    const entry: Upload = { name: file.name, size: file.size, progress: 0 };
    this.uploads.set([...this.uploads(), entry]);
    const patch = (changes: Partial<Upload>) =>
      this.uploads.set(
        this.uploads().map((u) => (u === entry ? Object.assign(entry, changes) : u)),
      );
    if (file.size > MAX_UPLOAD) {
      patch({ error: 'Larger than 25 MB' });
      return;
    }
    try {
      await new Promise<void>((resolve, reject) => {
        this.api.upload(file).subscribe({
          next: (event) => {
            if (event.type === HttpEventType.UploadProgress && event.total)
              patch({ progress: Math.round((event.loaded / event.total) * 100) });
            if (event.type === HttpEventType.Response && event.body) {
              this.attachments.set([
                ...this.attachments(),
                {
                  blobId: event.body.blobId,
                  name: event.body.name || file.name,
                  type: event.body.type || file.type,
                  size: event.body.size || file.size,
                },
              ]);
              patch({ progress: 100 });
              this.uploads.set(this.uploads().filter((u) => u !== entry));
              this.markDirty();
            }
          },
          error: reject,
          complete: resolve,
        });
      });
    } catch (err) {
      patch({ error: errorMessage(err, 'Upload failed') });
    }
  }

  protected removeUpload(upload: Upload): void {
    this.uploads.set(this.uploads().filter((u) => u !== upload));
  }

  protected removeAttachment(index: number): void {
    this.attachments.set(this.attachments().filter((_, i) => i !== index));
    this.markDirty();
  }

  protected size(bytes: number): string {
    return fileSize(bytes);
  }
}

// Replies quote the plain text; when a message only has HTML, strip the tags.
function bodyText(m: Message): string {
  if (m.textBody) return m.textBody;
  const div = document.createElement('div');
  div.innerHTML = m.htmlBody
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n');
  return div.textContent?.replace(/\n{3,}/g, '\n\n').trim() ?? '';
}
