import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import DOMPurify from 'dompurify';
import { Api, Attachment, Folder, Message, blobUrl, errorMessage, rawUrl } from '../api';
import { Icon } from '../icon';
import { EmptyState } from '../empty-state';
import { UI } from '../ui';
import { addrFull, addrList, fileSize, longDate } from '../format';
import { apiUrl } from '../config';

// What the message iframe may do: no scripts, no forms, no same-origin
// access. Links open in a new tab via <base target>.
const SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

/** One open message: headers, sanitized body in an iframe, attachments, actions. */
@Component({
  selector: 'amelu-message-view',
  imports: [RouterLink, Icon, EmptyState],
  templateUrl: './message-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-w-0 flex-col' },
})
export class MessageView {
  protected readonly ui = UI;
  private readonly api = inject(Api);
  private readonly sanitizer = inject(DomSanitizer);

  readonly messageId = input.required<string>();
  readonly inTrash = input(false);
  readonly inJunk = input(false);
  readonly folders = input<Folder[]>([]);

  readonly back = output<void>();
  readonly seen = output<boolean>();
  readonly flagged = output<boolean>();
  readonly deleted = output<void>();
  readonly moved = output<Folder>();
  readonly spam = output<boolean>();

  // undefined while loading, null when it failed
  protected readonly message = signal<Message | undefined | null>(undefined);
  protected readonly error = signal<string | null>(null);
  protected readonly showImages = signal(false);
  protected readonly movePicker = signal(false);
  protected readonly sandbox = SANDBOX;

  protected readonly attachments = computed(() =>
    (this.message()?.attachments ?? []).filter((a) => !a.inline || !a.cid),
  );

  /** The body as a document for the iframe, built fresh when images are allowed. */
  protected readonly frameSrc = computed<SafeResourceUrl | null>(() => {
    const message = this.message();
    if (!message) return null;
    const doc = buildDocument(message, this.showImages());
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(doc);
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected readonly hasRemoteImages = computed(() => {
    const html = this.message()?.htmlBody ?? '';
    return /<img[^>]+src\s*=\s*["']?https?:/i.test(html) || /url\(\s*["']?https?:/i.test(html);
  });

  constructor() {
    effect(() => {
      const id = this.messageId();
      untracked(() => void this.load(id));
    });
  }

  protected async load(id = this.messageId()): Promise<void> {
    this.message.set(undefined);
    this.error.set(null);
    this.showImages.set(false);
    try {
      const message = await firstValueFrom(this.api.getMessage(id));
      if (id !== this.messageId()) return;
      this.message.set(message);
      if (!message.seen) this.seen.emit(true);
    } catch (err) {
      this.message.set(null);
      this.error.set(errorMessage(err, 'Could not load the message'));
    }
  }

  protected list(addrs: { name?: string; email: string }[] | undefined): string {
    return addrList(addrs);
  }

  protected full(addrs: { name?: string; email: string }[] | undefined): string {
    return (addrs ?? []).map(addrFull).join(', ');
  }

  protected date(message: Message): string {
    return longDate(message.sentAt || message.receivedAt);
  }

  protected size(bytes: number): string {
    return fileSize(bytes);
  }

  protected download(attachment: Attachment): string {
    return apiUrl(blobUrl(attachment.blobId, attachment.name, attachment.type));
  }

  protected raw(message: Message): string {
    return apiUrl(rawUrl(message.id));
  }

  protected move(folder: Folder): void {
    this.movePicker.set(false);
    this.moved.emit(folder);
  }
}

/**
 * The HTML (or the plain text, as <pre>) as a standalone document for the
 * sandboxed iframe. DOMPurify strips scripts, event handlers and forms;
 * remote images are rewritten to a data: placeholder until allowed, which
 * also blocks tracking pixels. Inline images (cid:) are left alone: the
 * API does not serve them yet, so they show as broken rather than leaking.
 */
function buildDocument(message: Message, allowImages: boolean): string {
  let body: string;
  if (message.htmlBody) {
    body = DOMPurify.sanitize(message.htmlBody, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: [
        'form',
        'input',
        'button',
        'select',
        'textarea',
        'iframe',
        'object',
        'embed',
        'meta',
        'link',
        'base',
      ],
      FORBID_ATTR: ['srcset', 'ping', 'formaction'],
      ALLOW_UNKNOWN_PROTOCOLS: false,
    });
    if (!allowImages) {
      body = body
        .replace(
          /(<img\b[^>]*?\s)src\s*=\s*(["']?)https?:[^"'\s>]*\2/gi,
          '$1data-blocked-src=$2$2 src=""',
        )
        .replace(/url\(\s*["']?https?:[^)]*\)/gi, 'none');
    }
  } else {
    body = `<pre>${escapeHtml(message.textBody || '')}</pre>`;
  }
  const csp = allowImages
    ? "default-src 'none'; img-src https: http: data: cid:; style-src 'unsafe-inline'; font-src 'none';"
    : "default-src 'none'; img-src data:; style-src 'unsafe-inline';";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
    body{margin:0;padding:16px;font:14px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif;color:#14171f;background:#fff;word-wrap:break-word;overflow-wrap:anywhere}
    pre{white-space:pre-wrap;font:inherit;margin:0}
    img{max-width:100%;height:auto}
    img[data-blocked-src]{display:inline-block;min-width:16px;min-height:16px;background:#eef0f4;border:1px dashed #c6cad2}
    blockquote{border-left:3px solid #e2e5ea;margin:8px 0;padding-left:12px;color:#5c6370}
    a{color:#0043ce}
    table{max-width:100%}
  </style></head><body>${body}</body></html>`;
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}
