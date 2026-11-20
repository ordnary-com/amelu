// Setup steps the API can't see, remembered per browser for the home
// checklist. Losing them (private window, cleared storage) only shows a
// step as not done yet.
const KEY = 'amelu.setup';

export type SetupFlag = 'device' | 'dismissed';

function read(): Partial<Record<SetupFlag, boolean>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function setupFlags(): Partial<Record<SetupFlag, boolean>> {
  return read();
}

export function markSetupStep(flag: SetupFlag): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [flag]: true }));
  } catch {
    // Not remembered; the checklist just keeps showing the step.
  }
}
