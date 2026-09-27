/**
 * Live build id for deploy auto-reload. Must not be cached so open tabs
 * always see the currently deployed value.
 */
export async function GET() {
  const buildId =
    process.env.NEXT_PUBLIC_BUILD_ID ||
    process.env.BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "unknown";

  return Response.json(
    { buildId },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
