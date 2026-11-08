import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DitherShader } from '../login/dither-shader';

/**
 * The page around the links the API emails (mailbox password, invitation):
 * the sign-in page's colours with the form in the middle.
 */
@Component({
  selector: 'amelu-token-frame',
  imports: [DitherShader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative flex min-h-dvh flex-col items-center bg-[#171d25] px-6 py-12 text-[#dedee3] [color-scheme:dark]',
  },
  template: `
    <!-- The sign-in page's dither, faint and fading out towards the form. -->
    <div class="pointer-events-none fixed inset-0 opacity-25 [mask-image:linear-gradient(to_top,black,rgba(0,0,0,0.3)_35%,transparent_65%)]" aria-hidden="true">
      <amelu-dither-shader colorBack="rgba(0,0,0,0)" colorFront="#0051fe" shape="warp" type="4x4" [size]="2" [speed]="0.3" />
    </div>
    <div class="relative m-auto flex w-full max-w-[420px] flex-col py-6">
      <!-- amelu-icon.png is flat blue on transparent: brightness-0 invert turns it white. -->
      <img src="/amelu-icon.png" alt="Amelu" class="mb-10 h-10 w-auto self-start brightness-0 invert" />
      <ng-content />
    </div>
    <img src="/ordnary-mark-blue.png" alt="Ordnary" class="relative mt-6 size-6 brightness-0 invert" />
  `,
})
export class TokenFrame {}

/** Shared classes for the forms on these pages. */
export const tokenUi = {
  mark: 'mb-5 inline-flex size-10 items-center justify-center rounded-full',
  title: 'text-[22px] font-semibold tracking-[-0.2px]',
  text: 'mt-1.5 text-[14px] leading-relaxed text-[#a4a4ac]',
  label: 'mb-1.5 block text-[13px] font-medium',
  input:
    'h-11 w-full rounded-lg border border-white/10 bg-[#14191f] px-3 text-[14px] text-[#dedee3] outline-none transition-colors hover:border-white/20 focus:border-[#4d84ff] focus:ring-2 focus:ring-[#4d84ff]/25',
  button:
    'mt-6 flex h-11 w-full cursor-pointer items-center justify-center rounded-full bg-[#0051fe] text-[14px] font-medium text-white transition-colors hover:bg-[#1a62ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d84ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#171d25] disabled:cursor-default disabled:opacity-70',
  error: 'mt-6 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[13px] text-bad',
  info: 'mt-6 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px]',
};
