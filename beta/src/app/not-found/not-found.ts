import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { UI } from '../ui';

/** Any path this app doesn't have (yet), shown inside the normal shell. */
@Component({
  selector: 'amelu-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex justify-center px-2 pt-10 mobile:pt-20' },
})
export class NotFound {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly ui = UI;

  protected readonly links = [
    { path: '/domains', label: 'Email domains', hint: 'Your domains and their mailboxes' },
    { path: '/account', label: 'My account', hint: 'Profile, appearance and API keys' },
    { path: '/status', label: 'Service status', hint: 'Whether everything is running' },
  ];

  // The wildcard route keeps this component when you go from one unknown
  // path to another, so the path has to follow navigation.
  protected readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected back(): void {
    this.location.back();
  }
}
