/**
 * Password-protected (adult) live channels, as a MAG box handles them.
 *
 * Stalker portals mark such channels `censored`. The TV client ignores the
 * flag, so the embedded backend:
 *  - shows a 🔒 in front of the channel's name (lists, guide, search),
 *  - makes the client always ask the portal for a stream link for it, and
 *  - holds that request until the account's parental PIN is entered
 *    (the profile's `parent_password`, 0000 when the portal sends none).
 * A correct PIN unlocks the portal's locked channels until the app closes.
 * Movies and series are not affected.
 */
export const LOCK_MARK = '🔒 ';
export const DEFAULT_PIN = '0000';

type Row = Record<string, unknown>;

export function isLockedRow(row: Row): boolean {
    return row['censored'] === 1 || row['censored'] === '1' || row['censored'] === true;
}

interface Marked {
    readonly payload: unknown;
    readonly lockedCmds: readonly string[];
}

/** Marks the locked rows of a channel list answer ({ js: { data: [...] } }); returns a new answer. */
export function markLockedChannels(payload: unknown): Marked {
    const js = (payload as { js?: { data?: unknown } } | null)?.js;
    if (!js || !Array.isArray(js.data)) return { payload, lockedCmds: [] };
    const lockedCmds: string[] = [];
    const data = (js.data as Row[]).map((row) => {
        if (!row || typeof row !== 'object' || !isLockedRow(row)) return row;
        if (typeof row['cmd'] === 'string') lockedCmds.push(row['cmd']);
        const name = String(row['name'] ?? '');
        return {
            ...row,
            name: name.startsWith(LOCK_MARK) ? name : `${LOCK_MARK}${name}`,
            // A direct link would skip create_link, and with it the PIN.
            use_http_tmp_link: '1',
        };
    });
    if (!lockedCmds.length) return { payload, lockedCmds };
    return { payload: { ...(payload as object), js: { ...js, data } }, lockedCmds };
}

/** The account's parental PIN from a get_profile answer. */
export function portalPin(profile: unknown): string {
    const value = (profile as { js?: { parent_password?: unknown } } | null)?.js?.parent_password;
    return value === undefined || value === null || String(value).trim() === '' ? DEFAULT_PIN : String(value).trim();
}

export function createChannelLocks() {
    const locked = new Map<string, Set<string>>();
    const unlocked = new Set<string>();
    return {
        remember(portal: string, cmds: readonly string[]): void {
            if (!cmds.length) return;
            locked.set(portal, new Set([...(locked.get(portal) ?? []), ...cmds]));
        },
        needsPin(portal: string, cmd: string): boolean {
            return !unlocked.has(portal) && !!locked.get(portal)?.has(cmd);
        },
        unlock(portal: string): void {
            unlocked.add(portal);
        },
    };
}
