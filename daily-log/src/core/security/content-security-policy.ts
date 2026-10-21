/**
 * The Content Security Policy for one request. Scripts run only with the
 * request's nonce, which Next adds to its own inline scripts when the proxy puts
 * this policy on the request. Outside production, React needs eval for its
 * debugging tools.
 */
export function contentSecurityPolicy(nonce: string, allowEval: boolean): string {
    return [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${allowEval ? " 'unsafe-eval'" : ""}`,
        "connect-src 'self'",
        "object-src 'none'",
    ].join("; ");
}
