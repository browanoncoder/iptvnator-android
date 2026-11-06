/** Minimal stand-ins for the browser objects the shell reads. */
export interface Recorded {
    url: string;
    headers: Record<string, string>;
}

export function installHttpMock(reply: (url: string) => { status: number; data: unknown } | Error): Recorded[] {
    const calls: Recorded[] = [];
    const request = async (options: { url: string; headers: Record<string, string> }) => {
        calls.push({ url: options.url, headers: options.headers });
        const result = reply(options.url);
        if (result instanceof Error) throw result;
        return result;
    };
    (globalThis as unknown as { window: unknown }).window = { Capacitor: { Plugins: { CapacitorHttp: { request } } } };
    return calls;
}

export function fakeDoc(selectors: string[]): Pick<Document, 'querySelector'> {
    return {
        querySelector: ((query: string) =>
            query.split(',').some((part) => selectors.includes(part.trim())) ? ({ hidden: false } as unknown as Element) : null) as Document['querySelector'],
    };
}
