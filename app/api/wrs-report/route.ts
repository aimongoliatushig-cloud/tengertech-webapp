import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { fetchWrsDailyReport } from "@/lib/wrs-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      {
        error: "Нэвтэрсэн хэрэглэгч шаардлагатай байна.",
      },
      {
        status: 401,
      },
    );
  }

  let date = "";

  try {
    const body = (await request.json()) as {
      date?: string;
    };
    date = String(body.date ?? "").trim();
  } catch {
    return NextResponse.json(
      {
        error: "Хүсэлтийн бүтэц буруу байна.",
      },
      {
        status: 400,
      },
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      {
        error: "Огноогоо YYYY-MM-DD форматаар илгээнэ үү.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const report = await fetchWrsDailyReport(date);
    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "WRS тайлан татах үед алдаа гарлаа.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
