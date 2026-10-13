// Form and button class sets in the ordnary-console style, shared by every page.
export const UI = {
  label: 'block text-[13px] font-medium',
  hint: 'mt-1 text-[12px] text-muted',
  input:
    'mt-1.5 h-9 w-full rounded-md border border-line bg-transparent px-2.5 text-[13px] outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30',
  textarea:
    'mt-1.5 w-full rounded-md border border-line bg-transparent px-2.5 py-2 text-[13px] leading-relaxed outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30',
  primary:
    'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent/80 disabled:cursor-default disabled:opacity-50',
  outline:
    'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 text-[13px] font-medium hover:bg-bg disabled:cursor-default disabled:opacity-50',
  ghost:
    'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted hover:bg-bg hover:text-ink disabled:cursor-default disabled:opacity-50',
  iconButton:
    'inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink disabled:cursor-default disabled:opacity-50',
  danger:
    'inline-flex h-8 cursor-pointer items-center rounded-md bg-bad px-3 text-[13px] font-medium text-white hover:brightness-110 disabled:cursor-default disabled:opacity-50',
  card: 'rounded-lg border border-line bg-surface',
  sectionTitle: 'mb-3 text-[14px] font-bold',
} as const;
