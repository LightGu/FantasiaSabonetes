import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

function getSupabaseSecretKey() {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  // Projetos novos disponibilizam as secret keys como um objeto JSON.
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secretKeys) return null;
  try {
    const parsed = JSON.parse(secretKeys);
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
}

async function validSignature(
  request: Request,
  queryDataId: string,
  bodyDataId: string,
  secret: string,
) {
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(
    signature.split(",").map((part) => part.trim().split("=", 2)),
  );
  if (!parts.ts || !parts.v1) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  // O simulador e os diferentes produtos do Mercado Pago variam entre usar o
  // data.id da URL ou do corpo e omitir pares ausentes. Todas as variantes
  // continuam exigindo um HMAC válido com a chave secreta.
  const ids = [...new Set([queryDataId, bodyDataId, ""].map((id) => id.toLowerCase()))];
  const requestIds = [...new Set([requestId, ""] )];
  for (const id of ids) {
    for (const currentRequestId of requestIds) {
      const manifest = `${id ? `id:${id};` : ""}${
        currentRequestId ? `request-id:${currentRequestId};` : ""
      }ts:${parts.ts};`;
      const calculated = hex(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)),
      );
      if (safeEqual(calculated, parts.v1)) return true;
    }
  }
  return false;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Aceita os nomes já cadastrados no projeto e os nomes padronizados.
  const accessToken = (Deno.env.get("MercadoPago") ??
    Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN"))?.trim();
  const webhookSecret = (Deno.env.get("WEBHOOK") ??
    Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET"))?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = getSupabaseSecretKey();
  if (!accessToken || !webhookSecret || !supabaseUrl || !serviceKey) {
    console.error("Webhook secrets are not configured");
    return json({ error: "Server configuration error" }, 500);
  }

  const url = new URL(request.url);
  const body = await request.json().catch(() => ({}));
  const queryDataId = String(
    url.searchParams.get("data.id") ?? url.searchParams.get("data_id") ?? "",
  );
  const dataId = String(
    queryDataId || body?.data?.id || "",
  );
  const topic = String(url.searchParams.get("type") ?? body?.type ?? "");

  const bodyDataId = String(body?.data?.id ?? "");
  if (!(await validSignature(request, queryDataId, bodyDataId, webhookSecret))) {
    console.warn("Invalid Mercado Pago webhook signature");
    return json({ error: "Invalid signature" }, 401);
  }

  // O simulador do painel envia esta order ilustrativa, que não existe na API.
  // A assinatura já foi validada, então respondemos 200 apenas para confirmar a URL.
  const isDashboardSimulation = dataId === "123456" &&
    body?.data?.external_reference === "ext_ref_1234";
  if (isDashboardSimulation) {
    return json({ received: true, simulation: true });
  }

  // Consulta a API novamente: o corpo do webhook nunca é usado como prova de pagamento.
  const isOrder = ["order", "orders"].includes(topic.toLowerCase()) ||
    dataId.toUpperCase().startsWith("ORD");
  const resourceUrl = isOrder
    ? `https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`
    : `https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`;
  const mercadoPagoResponse = await fetch(resourceUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!mercadoPagoResponse.ok) {
    console.error("Mercado Pago lookup failed", mercadoPagoResponse.status);
    return json({ error: "Could not verify payment" }, 502);
  }

  const resource = await mercadoPagoResponse.json();
  const payment = isOrder ? resource?.transactions?.payments?.[0] : resource;
  const status = String(payment?.status ?? resource?.status ?? "").toLowerCase();
  const approved = ["approved", "processed", "accredited"].includes(status);
  const externalReference = String(resource?.external_reference ?? "");
  const amount = Number(
    payment?.amount ?? resource?.total_amount ?? resource?.transaction_amount,
  );
  const paymentId = String(payment?.id ?? dataId);
  const providerOrderId = String(isOrder ? resource?.id ?? dataId : resource?.order?.id ?? "");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const eventId = String(body?.id ?? request.headers.get("x-request-id") ?? crypto.randomUUID());
  const { error: eventError } = await supabase.from("payment_events").upsert(
    {
      provider: "mercado_pago",
      provider_event_id: eventId,
      event_type: String(body?.action ?? topic ?? "unknown"),
      payload: body,
    },
    { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
  );
  if (eventError) console.error("Could not store webhook audit event", eventError);

  // Eventos pendentes também recebem 200; o Mercado Pago notificará novas mudanças.
  if (!approved) return json({ received: true, payment_status: status });
  if (!externalReference || !Number.isFinite(amount)) {
    return json({ error: "Payment is missing order reference or amount" }, 422);
  }

  const { data: processed, error } = await supabase.rpc("confirm_order_payment", {
    target_order_id: externalReference,
    payment_provider: "mercado_pago",
    external_payment_id: paymentId,
    external_order_id: providerOrderId,
    paid_amount: amount,
    provider_payload: resource,
  });
  if (error) {
    console.error("Could not confirm order", error);
    return json({ error: "Could not confirm order" }, 500);
  }

  await supabase.from("payment_events").update({
    processed: true,
    processed_at: new Date().toISOString(),
  }).eq("provider", "mercado_pago").eq("provider_event_id", eventId);

  return json({ received: true, order_updated: processed });
});
