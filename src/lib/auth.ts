import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Require authenticated user. Returns userId or a 401 response.
 * Use in API routes as a defense-in-depth check alongside middleware.
 */
export async function requireAuth(): Promise<
  { userId: string; error?: never } | { userId?: never; error: NextResponse }
> {
  const { userId } = await auth();
  if (!userId) {
    return {
      error: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }
  return { userId };
}
