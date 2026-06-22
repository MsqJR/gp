import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
    matcher: [
        /*
         * Match all paths except for:
         * 1. /api routes
         * 2. /_next (Next.js internals)
         * 3. /_static (inside /public)
         * 4. all root files inside /public (e.g. favicon.ico)
         */
        '/((?!api/|_next/|_static/|favicon.ico|sitemap.xml|robots.txt).*)',
    ],
};

export default function middleware(req: NextRequest) {
    const url = req.nextUrl;

    // Get hostname from request
    const hostname = req.headers.get('host') || 'localhost:3000';

    // Define the base domain (e.g. medify.com)
    // For localhost development, it's typically localhost:3000
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000';

    // If we're on the root domain, don't rewrite
    // Also ignore simple localhost without subdomains
    if (hostname === rootDomain || hostname === 'localhost' || hostname === '127.0.0.1:3000') {
        return NextResponse.next();
    }

    // Extract subdomain
    const subdomain = hostname.replace(`.${rootDomain}`, '');

    // If subdomain somehow matches the original hostname, it means no subdomain was found (e.g., standard localhost call)
    if (subdomain === hostname) {
        return NextResponse.next();
    }

    // Exclude system paths from subdomain rewriting
    const path = url.pathname;
    if (
        path.startsWith('/dashboard') ||
        path.startsWith('/login') ||
        path.startsWith('/signup') ||
        path.startsWith('/templates') ||
        path.startsWith('/forgot-password') ||
        path.startsWith('/reset-password')
    ) {
        return NextResponse.next();
    }

    // Rewrite to our dynamic subdomain route
    return NextResponse.rewrite(new URL(`/${subdomain}${url.pathname}${url.search}`, req.url));
}
