import {
  getExternalData,
  listExternalData,
  upsertExternalData,
} from "@/lib/server/externalData";
import { ensureRothPackageEnv } from "@/lib/db/loadPackageEnv";
import { DATASET_META } from "@/lib/externalData/meta";
import {
  isExternalDataKey,
  type ExternalDataKey,
} from "@/lib/externalData/types";
import {
  validateDatasetData,
  validateMeta,
  yearFromData,
} from "@/lib/externalData/validate";

const CACHE_CONTROL = "public, max-age=86400";

function adminAuthorized(req: Request): boolean {
  ensureRothPackageEnv();
  const token = process.env.EXTERNAL_DATA_ADMIN_TOKEN;
  if (!token) return false;
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return header.slice("Bearer ".length) === token;
}

/** List all keys, or return one full document when `?key=` is set. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keyParam = searchParams.get("key");

  if (keyParam) {
    if (!isExternalDataKey(keyParam)) {
      return Response.json({ error: "Unknown key" }, { status: 400 });
    }
    const record = await getExternalData(keyParam);
    if (!record) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(
      { record },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }

  const items = await listExternalData();
  return Response.json(
    { items },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}

/**
 * Upsert one dataset. Requires `Authorization: Bearer ${EXTERNAL_DATA_ADMIN_TOKEN}`.
 * Body: { key, data, meta?, updatedBy?, allowRateChange? }
 */
export async function PUT(req: Request) {
  if (!adminAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Expected object body" }, { status: 400 });
  }

  const {
    key: keyRaw,
    data,
    meta: metaRaw,
    updatedBy,
    allowRateChange,
  } = body as Record<string, unknown>;

  if (!isExternalDataKey(keyRaw)) {
    return Response.json({ error: "Invalid or missing key" }, { status: 400 });
  }
  const key: ExternalDataKey = keyRaw;

  const validated = validateDatasetData(key, data, {
    allowRateChange: allowRateChange === true,
  });
  if (!validated.ok) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  let meta = DATASET_META[key];
  if (metaRaw !== undefined) {
    const metaResult = validateMeta(metaRaw);
    if (!metaResult.ok) {
      return Response.json({ error: metaResult.error }, { status: 400 });
    }
    meta = metaResult.value;
  }

  const year = yearFromData(key, validated.value);
  if (year == null) {
    return Response.json(
      { error: "Could not determine year from data" },
      { status: 400 },
    );
  }

  const record = await upsertExternalData({
    key,
    year,
    data: validated.value,
    meta,
    updatedBy: typeof updatedBy === "string" ? updatedBy : undefined,
  });

  return Response.json({ record });
}
