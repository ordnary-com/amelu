import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { renderSVG } from 'uqr';

/**
 * A QR code of a link, so a phone can open what's on screen here. Drawn in
 * the page's ink colour on the surface, so it follows the theme.
 */
@Component({
  selector: 'amelu-phone-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<span class="block aspect-square w-full rounded-md bg-white p-2 [&_svg]:size-full" role="img" [attr.aria-label]="label()" [innerHTML]="svg()"></span>`,
})
export class PhoneQr {
  private readonly sanitizer = inject(DomSanitizer);
  readonly url = input.required<string>();
  readonly label = input('QR code');
  // Black on white keeps it scannable in dark mode too.
  protected readonly svg = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(renderSVG(this.url(), { border: 1, ecc: 'M', whiteColor: '#ffffff', blackColor: '#000000' })),
  );
}
