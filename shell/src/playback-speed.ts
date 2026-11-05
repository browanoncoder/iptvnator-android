/** One playback-speed setting shared by the remote, touch gestures and the quick menu. */
import { isOnDemand } from './player-dom';

export const SPEEDS = [1, 1.25, 1.5, 2, 3] as const;

let speed: number = 1;

export function currentSpeed(): number {
    return speed;
}

export function nextSpeed(current: number): number {
    const index = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
    return SPEEDS[(index + 1) % SPEEDS.length];
}

export function setSpeed(v: HTMLVideoElement | null, rate: number): void {
    speed = rate;
    if (v && isOnDemand(v)) v.playbackRate = rate;
}

/** Keep the chosen speed across episodes; live streams always play at 1×. */
export function applySpeed(v: HTMLVideoElement): void {
    v.playbackRate = isOnDemand(v) ? speed : 1;
}
