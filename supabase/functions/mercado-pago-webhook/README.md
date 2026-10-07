# Mercado Pago webhook

Secrets usados no projeto Supabase atual:

- `MercadoPago` — Access Token do Mercado Pago
- `WEBHOOK` — assinatura secreta do webhook

A função também aceita, por compatibilidade, os nomes padronizados
`MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET`.

Deploy sem validação JWT, pois a chamada vem dos servidores do Mercado Pago:

```bash
supabase functions deploy mercado-pago-webhook --no-verify-jwt
```

URL resultante:

```text
https://SEU-PROJECT-REF.supabase.co/functions/v1/mercado-pago-webhook
```

Cadastre essa URL em Mercado Pago > Suas integrações > Fantasia > Webhooks e
marque somente `Order (Mercado Pago)`, que é o evento da API nova. Não marque
`Pagamentos (legacy)`. Copie a assinatura secreta gerada pelo Mercado Pago para
o secret `MERCADO_PAGO_WEBHOOK_SECRET` no Supabase.
