import { NextResponse } from "next/server";

import { buildDestroyedSessionCookieHeader } from "@/lib/auth";
import { isAllowedPostOrigin } from "@/lib/auth-guard";
import { buildPublicUrl } from "@/lib/request-url";

function destroySession(request: Request) {
  const response = NextResponse.redirect(buildPublicUrl(request, "/login"), {
    status: 303,
  });
  response.headers.append("Set-Cookie", buildDestroyedSessionCookieHeader());
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Clear-Site-Data", '"cache"');
  return response;
}

export async function GET() {
  return NextResponse.json(
    { error: "Гарах үйлдлийг зөвхөн POST хүсэлтээр гүйцэтгэнэ." },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}

export async function POST(request: Request) {
  if (!isAllowedPostOrigin(request)) {
    return NextResponse.json({ error: "Хүсэлтийн эх сурвалж буруу байна." }, { status: 403 });
  }

  return destroySession(request);
}
