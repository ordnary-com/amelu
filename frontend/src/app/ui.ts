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

  // Panels: a bordered card with a title bar over a faint grey body (well).
  panel: 'overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.05)]',
  panelHeader: 'flex h-11 items-center justify-between gap-3 border-b border-line px-4',
  panelTitle: 'text-[15px] font-medium',
  well: 'bg-well p-4',

  // Settings cards (account pages): a title bar with an action icon, label-over-value
  // fields and grey notes with an info icon.
  setCard: 'overflow-hidden rounded border border-line bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.05)]',
  setHeader: 'flex h-11 items-center justify-between gap-3 border-b border-line px-5',
  setTitle: 'text-[15px] font-medium',
  setAction: '-mr-1.5 inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-ink',
  setNote: 'flex gap-2.5 bg-well px-5 py-4 text-[14px] leading-relaxed',
  // A choice as a card: tinted with a light accent border when picked.
  choice: 'relative cursor-pointer rounded border shadow-[0_1px_3px_rgb(0_0_0/0.06)] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40',
  choiceOn: 'border-accent/40 bg-accent/10',
  choiceOff: 'border-line bg-surface hover:border-accent/30',

  // Tables: a white bordered box on a panel's grey body, medium headers (sortable
  // ones as a button with arrows), rows split by lines.
  tableWrap: 'overflow-x-auto rounded-md border border-line bg-surface',
  table: 'w-full text-left text-[13px]',
  th: 'h-9 px-4 font-medium whitespace-nowrap',
  thSort: 'inline-flex cursor-pointer items-center gap-1.5 font-medium hover:text-link',
  tr: 'border-t border-line',
  td: 'px-4 py-2.5 align-middle',
  // A row's second line under its link, like an id.
  tdSub: 'mt-0.5 flex items-center gap-1.5 text-[12px] text-muted',
} as const;
