// Just enough of next/server for the route handlers to run in the browser.

/** A request built by the demo; plain Headers allow Host and Origin, unlike a fetch Request. */
export class NextRequest {
    readonly headers: Headers;
    readonly nextUrl: URL;

    constructor(
        url: URL,
        readonly method: string,
        private readonly body: unknown,
    ) {
        this.nextUrl = url;
        this.headers = new Headers({ host: url.host, origin: url.origin });
    }

    get url(): string {
        return this.nextUrl.href;
    }

    async json(): Promise<unknown> {
        if (this.body === undefined) throw new SyntaxError("No body.");
        return structuredClone(this.body);
    }
}

export class NextResponse extends Response {
    readonly cookies = { set: () => undefined };

    static override json(body: unknown, init?: ResponseInit): NextResponse {
        return new NextResponse(JSON.stringify(body), {
            ...init,
            headers: { "content-type": "application/json", ...init?.headers },
        });
    }
}
