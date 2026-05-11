import { getSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    proofId: string;
  }>;
};

type ProofImageRecord = {
  id: number;
  name: string | false;
  image_1920: string | false;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { proofId } = await context.params;
  const numericId = Number(proofId);

  if (!Number.isFinite(numericId) || numericId <= 0) {
    return new Response("Invalid proof id", { status: 400 });
  }

  const records = await executeOdooKw<ProofImageRecord[]>(
    "mfo.proof.image",
    "search_read",
    [[["id", "=", numericId]]],
    {
      fields: ["name", "image_1920"],
      limit: 1,
    },
    {
      login: session.login,
      password: session.password,
    },
  ).catch(() => []);
  const proof = records[0];

  if (!proof?.image_1920) {
    return new Response("Proof image not found", { status: 404 });
  }

  const body = Buffer.from(proof.image_1920, "base64");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        proof.name || `proof-${numericId}.jpg`,
      )}`,
    },
  });
}
