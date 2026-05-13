import { loadCurrentUserProfileImageUrl } from "@/lib/current-user-profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const imageUrl = await loadCurrentUserProfileImageUrl().catch(() => "");

  return Response.json(
    { imageUrl },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
