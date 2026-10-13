import { Addr } from './api';

/** "Name" when there is one, the address otherwise. */
export function addrLabel(addr: Addr): string {
  return addr.name?.trim() || addr.email;
}

/** "Name <email>" for the compose fields. */
export function addrFull(addr: Addr): string {
  return addr.name?.trim() ? `${addr.name.trim()} <${addr.email}>` : addr.email;
}

export function addrList(list: Addr[] | undefined): string {
  return (list ?? []).map(addrLabel).join(', ');
}

/** Time for today, day and month for this year, the full date otherwise. */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (date.getFullYear() === now.getFullYear())
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function longDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Parses "a@b.c, Name <d@e.f>" into addresses; anything without an @ is dropped. */
export function parseAddrs(input: string): Addr[] {
  const out: Addr[] = [];
  for (const part of input.split(/[,;\n]+/)) {
    const raw = part.trim();
    if (!raw) continue;
    const angle = raw.match(/^(.*?)\s*<([^<>]+@[^<>]+)>$/);
    if (angle) {
      const name = angle[1].replace(/^"|"$/g, '').trim();
      out.push(name ? { name, email: angle[2].trim() } : { email: angle[2].trim() });
    } else if (raw.includes('@')) {
      out.push({ email: raw });
    }
  }
  return out;
}

/** Quotes a plain-text body for a reply or forward. */
export function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}
