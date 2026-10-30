import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The page around the links the API emails (mailbox password, invitation):
 * the sign-in page's colours with the form in the middle.
 */
@Component({
  selector: 'amelu-token-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh flex-col items-center justify-center bg-[#171d25] px-6 py-12 text-[#dedee3] [color-scheme:dark]' },
  template: `
    <img src="/amelu-icon.png" alt="Amelu" class="mb-8 h-10 w-auto brightness-0 invert" />
    <div class="w-full max-w-[420px]"><ng-content /></div>
  `,
})
export class TokenFrame {}

/** Shared classes for the forms on these pages. */
export const tokenUi = {
  title: 'text-[22px] font-semibold tracking-[-0.2px]',
  text: 'mt-1.5 text-[14px] leading-relaxed text-[#a4a4ac]',
  label: 'mb-1.5 block text-[13px] font-medium',
  input:
    'h-11 w-full rounded-lg border border-white/10 bg-[#14191f] px-3 text-[14px] text-[#dedee3] outline-none focus:border-[#4d84ff]',
  button:
    'mt-6 flex h-11 w-full cursor-pointer items-center justify-center rounded-full bg-[#0051fe] text-[14px] font-medium text-white transition-colors hover:bg-[#1a62ff] disabled:cursor-default disabled:opacity-70',
  error: 'mt-6 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-[13px] text-bad',
  info: 'mt-6 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px]',
};
