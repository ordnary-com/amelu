import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../page-header/page-header';
import { UI } from '../ui';

const CONTACT_URL = 'https://ordnary.com/contact';

/** The current dashboard's /support. */
@Component({
  selector: 'amelu-support',
  imports: [PageHeader, RouterLink],
  template: `
    <amelu-page-header title="Contact Support">
      Get help with your Amelu account, domains, DNS, or mail delivery.
    </amelu-page-header>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div class="space-y-6">
        <section>
          <h2 [class]="ui.sectionTitle">Contact us</h2>
          <div [class]="ui.card + ' p-4'">
            <p class="text-[13px] leading-relaxed">
              Reach us through the
              <a [href]="contactUrl" target="_blank" rel="noreferrer" class="text-link hover:underline">Ordnary contact page</a>.
              Include the affected domain, the approximate time of the problem, and any error message or bounce you
              received.
            </p>
            <a [href]="contactUrl" target="_blank" rel="noreferrer" [class]="ui.primary + ' mt-4'">Go to contact page</a>
          </div>
        </section>

        <section>
          <h2 [class]="ui.sectionTitle">What to include</h2>
          <ul [class]="ui.card + ' overflow-hidden text-[13px]'">
            @for (item of checklist; track item.title) {
              <li class="border-b border-line px-4 py-3 last:border-b-0">
                <div class="text-[14px] font-medium">{{ item.title }}</div>
                <div class="mt-0.5 text-[12px] text-muted">{{ item.text }}</div>
              </li>
            }
          </ul>
        </section>
      </div>

      <aside class="space-y-6">
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Known incidents</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Check Service Status first: if something is already down, we're on it.
          </p>
          <a routerLink="/status" class="mt-3 inline-block text-[13px] font-medium text-link hover:underline">
            View Service Status
          </a>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">Report abuse</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">
            Report spam or abuse coming from an Amelu domain through the same contact page.
          </p>
          <a
            [href]="contactUrl"
            target="_blank"
            rel="noreferrer"
            class="mt-3 inline-block text-[13px] font-medium text-link hover:underline"
          >
            Open contact page
          </a>
        </section>
        <section [class]="ui.card + ' p-4'">
          <h2 class="text-[14px] font-bold">What's new</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-muted">Recent changes to Amelu are listed in the changelog.</p>
          <a routerLink="/changelog" class="mt-3 inline-block text-[13px] font-medium text-link hover:underline">
            View changelog
          </a>
        </section>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class Support {
  protected readonly ui = UI;
  protected readonly contactUrl = CONTACT_URL;
  protected readonly checklist = [
    { title: 'The affected domain', text: 'And the mailbox or address, if the problem is limited to one.' },
    { title: 'When it happened', text: 'The approximate time, including your time zone.' },
    { title: 'What you saw', text: 'Any error message, or the full bounce message you received.' },
  ];
}
