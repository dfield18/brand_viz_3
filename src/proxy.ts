import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/marketing(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/unsubscribe(.*)",
  // Entity/overview pages are viewable by anonymous users so a free run can
  // redirect straight into the overview. The routes themselves only fetch
  // from already-public read APIs; Pro-only actions still check auth in their
  // own handlers.
  "/entity/(.*)",
  // Free-tier endpoints — anonymous users need to POST here to run a free analysis.
  // Abuse protection lives inside the handler (IP + session rate limits).
  "/api/free-run(.*)",
  // Read-only data routes — public so report self-fetch and cron work.
  // Mutation routes (jobs POST, prompts POST, subscribe POST) have their
  // own requireAuth() checks as a second layer of protection.
  "/api/overview(.*)",
  "/api/visibility(.*)",
  "/api/narrative(.*)",
  "/api/competition(.*)",
  "/api/sources(.*)",
  "/api/topics(.*)",
  "/api/recommendations(.*)",
  "/api/responses(.*)",
  "/api/response-detail(.*)",
  "/api/report(.*)",
  "/api/reports/send-email(.*)",
  "/api/competitor-alerts(.*)",
  "/api/brand-info(.*)",
  "/api/backfill(.*)",
  "/api/stripe/webhook(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files. `xml` + `txt` are
    // explicit so /sitemap.xml and /robots.txt (Next.js dynamic files
    // at src/app/sitemap.ts + robots.ts) aren't intercepted by Clerk
    // and returned as 404s to Googlebot.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
