<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Critical business rules (curation, stock, commission, entitlements) live in Postgres functions + RLS; UI never enforces them alone — because the spec forbids frontend-only gating.
- One global catalog (`cards`) imported by `scripts/import-catalog.ts`; listings and price observations reference it and carry variant fields — never duplicate cards per market.
- Public catalog reads go through `src/lib/catalog.functions.ts` (server publishable client) so pages SSR for SEO.
- Demo price rows use `source='demo'` (UI shows a "Dados demonstrativos" badge; delete with `delete from price_observations where source='demo'`); `price_observations` is only reachable via security-definer functions (`get_price_history`, `get_card_trends`).
- Seller reputation/reviews: reviews only via `submit_review` (buyer + delivered item) and `reply_review` (owner, once); public seller data only through `get_public_seller`/`list_public_sellers`, since `sellers` holds private documents.

- Seller trust is calculated by get_seller_trust/get_seller_reputation for every surface; only live paid orders and buyer-confirmed deliveries count, preventing sandbox reputation inflation.
- Order item monetary/identity fields are immutable; sellers ship and buyers confirm receipt through validated database transitions.
- Ordinary signup assigns buyer only; initial administrator must be explicitly provisioned by a trusted operator to avoid registration-order privilege escalation.
- Marketplace media uses a private bucket, seller-folder policies and short-lived signed URLs; never store expiring URLs as profile values.
- Collections are owner-scoped; support messages are visible only to the requester and administrators, with no automatic refund promise.
- Financial dashboards use database-calculated live-paid totals, excluding test and unpaid orders.

- Order lifecycle (reservation expiry, cancel, disputes, payouts, balances) runs only through security-definer functions; trusted functions set `app.system` to bypass item-integrity triggers — never expose that bypass to clients.
