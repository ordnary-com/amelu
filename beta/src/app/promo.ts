// The November 2026 campaign (amelu-landing /black-friday, devlog
// 2026-11-04-black-friday-codes.txt): one deal per phase, each code only valid
// in its own days. Dates are the last day of each phase, in Amsterdam time.

export interface Promo {
  name: string;
  /** Code and deal for yearly billing. */
  yearly: { code: string; deal: string };
  /** Code and deal for monthly billing. */
  monthly: { code: string; deal: string };
  /** The phase's last day, for "until 26 November". */
  lastDay: string;
}

const PHASES: (Promo & { from: string })[] = [
  {
    from: '2026-11-01',
    lastDay: '2026-11-26',
    name: 'Black Week',
    yearly: { code: 'BLACKWEEK30', deal: '30% off your first year' },
    monthly: { code: 'WEEK15', deal: '15% off your first 3 months' },
  },
  {
    from: '2026-11-27',
    lastDay: '2026-11-27',
    name: 'Black Friday',
    yearly: { code: 'BLACKFRIDAY50', deal: '50% off your first year' },
    monthly: { code: 'FRIDAY30', deal: '30% off your first 3 months' },
  },
  {
    from: '2026-11-28',
    lastDay: '2026-11-29',
    name: 'Black Friday weekend',
    yearly: { code: 'WEEKEND40', deal: '40% off your first year' },
    monthly: { code: 'WEEKEND20', deal: '20% off your first 3 months' },
  },
  {
    from: '2026-11-30',
    lastDay: '2026-11-30',
    name: 'Cyber Monday',
    yearly: { code: 'CYBER35', deal: '35% off your first year' },
    monthly: { code: 'CYBER3FREE', deal: 'your first 3 months free' },
  },
];

/** The deal running today, or null outside the campaign. */
export function activePromo(now = new Date()): Promo | null {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(now);
  return PHASES.find((p) => today >= p.from && today <= p.lastDay) ?? null;
}
