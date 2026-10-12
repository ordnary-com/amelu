import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

/** Any path this app doesn't have (yet), shown inside the normal shell. */
@Component({
  selector: 'amelu-not-found',
  imports: [RouterLink],
  templateUrl: './not-found.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex justify-center pt-10' },
})
export class NotFound {
  private readonly router = inject(Router);

  // The wildcard route keeps this component when you go from one unknown
  // path to another, so the path has to follow navigation.
  protected readonly path = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
}
