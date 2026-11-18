// Form and button class sets in the ordnary-console style, shared by the settings pages.
export const UI = {
  label: 'block text-[13px] font-medium',
  hint: 'mt-1 text-[12px] text-muted',
  input:
    'mt-1.5 h-9 w-full rounded-md border border-line bg-transparent px-2.5 text-[13px] outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30',
  primary:
    'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent/80 disabled:cursor-default disabled:opacity-50',
  outline:
    'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 text-[13px] font-medium hover:bg-bg disabled:cursor-default disabled:opacity-50',
  danger:
    'inline-flex h-8 cursor-pointer items-center rounded-md bg-bad px-3 text-[13px] font-medium text-white hover:brightness-110 disabled:cursor-default disabled:opacity-50',
  // The page-level button on destructive pages; the solid danger style is kept for the final confirm.
  dangerOutline:
    'inline-flex h-8 cursor-pointer items-center rounded-md border border-bad/40 px-3 text-[13px] font-medium text-bad hover:bg-bad/5 disabled:cursor-default disabled:opacity-50',
  card: 'rounded-lg border border-line bg-surface',
  sectionTitle: 'mb-3 text-[14px] font-bold',

  // Tables: a white bordered box on the panel's grey body, bold headers (sortable
  // ones as a button with arrows), roomy rows split by lines.
  tableWrap: 'overflow-x-auto rounded-lg border border-line bg-surface',
  table: 'w-full text-left text-[15px]',
  th: 'px-7 py-4 font-medium whitespace-nowrap',
  thSort: 'inline-flex cursor-pointer items-center gap-2 font-medium hover:text-link',
  tr: 'border-t border-line',
  td: 'px-7 py-4 align-middle',
  // A row's second line under its link, like an id.
  tdSub: 'mt-0.5 flex items-center gap-1.5 text-[13px] text-muted',
} as const;
