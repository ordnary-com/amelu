import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { BUILD_INFO } from '../build-info';
import { API_ORIGIN } from '../config';

interface Edge {
  colo: string;
  country: string;
  http: string;
  tls: string;
}

/**
 * Build and connection details at the bottom of the sign-in page and the
 * dashboard, handy when someone reports a problem. The edge details come from
 * /cdn-cgi/trace, which the edge network answers on every proxied hostname;
 * locally there is none.
 */
@Component({
  selector: 'amelu-tech-info',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block text-center text-[11px] text-muted/60' },
  template: `
    <a
      [attr.href]="build.commitUrl || null"
      target="_blank"
      rel="noopener"
      class="transition-colors hover:text-muted"
      [title]="'Commit ' + build.commit + ' on ' + build.branch"
    >
      Amelu {{ build.version }} ({{ build.commit }}{{ build.dirty ? '+dev' : '' }}, {{ build.builtAt | date: 'd MMM y' }})
      ·
      @if (edge(); as e) {
        Edge {{ e.colo }}{{ e.country ? ', ' + e.country : '' }}, {{ e.http }}, {{ e.tls }}
      } @else {
        Local development
      }
      ·
      @switch (api().state) {
        @case ('checking') {
          API checking
        }
        @case ('ok') {
          API {{ api().ms }} ms
        }
        @default {
          API unreachable
        }
      }
    </a>
  `,
})
export class TechInfo {
  protected readonly build = BUILD_INFO;
  protected readonly edge = signal<Edge | null>(null);
  protected readonly api = signal<{ state: 'checking' | 'ok' | 'down'; ms?: number }>({ state: 'checking' });

  constructor() {
    void this.loadEdge();
    void this.checkApi();
  }

  private async loadEdge(): Promise<void> {
    try {
      const res = await fetch('/cdn-cgi/trace', { cache: 'no-store' });
      const fields = new Map(
        (await res.text())
          .split('\n')
          .map((line) => line.split('=') as [string, string])
          .filter(([key, value]) => key && value),
      );
      const colo = fields.get('colo');
      if (!res.ok || !colo) return;
      this.edge.set({
        colo,
        country: fields.get('loc') ?? '',
        http: (fields.get('http') ?? '').toUpperCase(),
        tls: (fields.get('tls') ?? '').replace('TLSv', 'TLS '),
      });
    } catch {
      // No edge in front of this host; the template says so.
    }
  }

  private async checkApi(): Promise<void> {
    const started = performance.now();
    try {
      const res = await fetch(`${API_ORIGIN}/api/healthz`, { cache: 'no-store' });
      this.api.set(res.ok ? { state: 'ok', ms: Math.round(performance.now() - started) } : { state: 'down' });
    } catch {
      this.api.set({ state: 'down' });
    }
  }
}
