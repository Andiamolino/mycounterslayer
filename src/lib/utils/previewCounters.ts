// A manual "Preview counters" choice. trayId null = applies to every tray (PDF capture, debug URL).
export interface ShowCountersChoice {
  trayId: string | null;
  value: boolean;
}

// Defensive: a tray-bound choice only counts for that tray; otherwise Auto applies (on for standee trays).
export function resolveShowCounters(
  choice: ShowCountersChoice | null,
  selectedTrayId: string | undefined,
  selectedIsStandee: boolean
): boolean {
  if (choice && (choice.trayId === null || choice.trayId === selectedTrayId)) return choice.value;
  return selectedIsStandee;
}

// A tray-bound choice is dropped as soon as another tray is selected (coming back means Auto again).
// Returns the same object when nothing changes so a state write in an effect does not loop.
export function dropChoiceForOtherTray(
  choice: ShowCountersChoice | null,
  selectedTrayId: string | undefined
): ShowCountersChoice | null {
  if (choice && choice.trayId !== null && choice.trayId !== selectedTrayId) return null;
  return choice;
}

// Forces the counters on for every tray (PDF capture, debug URL).
export function countersOnForAllTrays(): ShowCountersChoice {
  return { trayId: null, value: true };
}
