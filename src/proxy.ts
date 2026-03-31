import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/unsubscribe(.*)",
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
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
