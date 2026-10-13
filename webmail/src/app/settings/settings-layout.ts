import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'amelu-settings-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="mx-auto w-full max-w-2xl px-5 py-6">
      <h1 class="text-[22px] font-bold tracking-[-0.4px]">Settings</h1>
      <nav class="mt-4 flex gap-1 border-b border-line" aria-label="Settings">
        <a
          routerLink="/settings"
          routerLinkActive="border-accent text-ink"
          [routerLinkActiveOptions]="{ exact: true }"
          [class]="tab"
          >Name and signature</a
        >
        <a routerLink="/settings/vacation" routerLinkActive="border-accent text-ink" [class]="tab"
          >Out of office</a
        >
        <a routerLink="/settings/password" routerLinkActive="border-accent text-ink" [class]="tab"
          >Password</a
        >
      </nav>
      <div class="pt-5"><router-outlet /></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 flex-1 overflow-y-auto' },
})
export class SettingsLayout {
  protected readonly tab =
    '-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-muted hover:text-ink';
}
