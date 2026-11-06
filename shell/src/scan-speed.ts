/**
 * Hold-to-scan speeds, shared by the fullscreen player (player-gestures.ts)
 * and the progress bar (seek-bar.ts). Like Netflix / Prime Video, the longer
 * ← / → is held the faster it goes: a new level every 1.5 s, 1× up to 5×,
 * each level doubling how much video passes per second.
 */
export const SCAN_TIER_MS = 1500;
export const MAX_SCAN_LEVEL = 5;
const BASE_SECONDS_PER_SECOND = 20;

export interface ScanTier {
    readonly level: number;
    readonly secondsPerSecond: number;
}

export function scanTier(heldMs: number): ScanTier {
    const level = Math.min(MAX_SCAN_LEVEL, 1 + Math.floor(Math.max(0, heldMs) / SCAN_TIER_MS));
    return { level, secondsPerSecond: BASE_SECONDS_PER_SECOND * 2 ** (level - 1) };
}

export function scanLabel(direction: 1 | -1, tier: ScanTier): string {
    return `${direction > 0 ? '⏩' : '⏪'} ${tier.level}×`;
}
