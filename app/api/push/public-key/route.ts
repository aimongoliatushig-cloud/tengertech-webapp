import { getPublicVapidKey, isPushConfigured } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    enabled: isPushConfigured(),
    publicKey: getPublicVapidKey(),
  });
}
