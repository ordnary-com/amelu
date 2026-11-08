// What a receiving server's rejection most likely means, in plain words.
// The server's own wording stays visible next to it.
const HINTS: [RegExp, string][] = [
  [/does ?n.t exist|not found|unknown user|user unknown|no such (user|mailbox)|invalid recipient|5\.1\.1|recipient rejected/i, "The address doesn't exist. Check it for typos."],
  [/mailbox (is )?full|over ?quota|quota exceeded|5\.2\.2|insufficient storage/i, "The recipient's mailbox is full."],
  [/\bspf\b/i, "The receiver couldn't confirm the SPF record. Check this domain's DNS page."],
  [/dmarc/i, "The message failed the receiver's DMARC check. Check this domain's DNS page."],
  [/black ?list|block ?list|blocked|spamhaus|reputation|s3140|banned/i, "The receiver is blocking the sending server for now. We take blocked servers out of rotation."],
  [/spam|policy|content|suspicious/i, 'The receiver thought the message looked like spam.'],
  [/rate|too many|try again later|throttl/i, 'The receiver asked to slow down. The message is tried again.'],
];

export function reasonHint(text: string): string | null {
  return HINTS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
