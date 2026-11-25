import { describe, expect, it, beforeEach } from "vitest";
import { clearChannelExtensions, listChannels, registerChannel } from "@/lib/channels/registry";
import { connectChannel, disconnectChannel, resetChannelHub, syncCatalog, syncOrders } from "@/lib/channels/hub";

describe("channel hub", () => {
  beforeEach(() => {
    resetChannelHub();
    clearChannelExtensions();
  });

  it("lists the built-in Brazilian and global marketplaces", () => {
    const ids = listChannels().map((c) => c.id);
    expect(ids).toEqual(["mercado_livre", "shopee", "amazon", "magalu", "americanas", "tiktok_shop", "tcgplayer"]);
  });

  it("accepts an extra channel without replacing the built-ins", () => {
    registerChannel({
      id: "loja_parceira",
      name: "Loja parceira",
      region: "BR",
      auth: "api_key",
      env: ["PARCEIRA_API_KEY"],
      docsUrl: "https://example.com/docs",
      endpoints: { catalog: "https://example.com/products", orders: "https://example.com/orders" },
      builtin: false,
    });
    expect(listChannels().map((c) => c.id)).toContain("loja_parceira");
    expect(listChannels().filter((c) => c.id === "mercado_livre")).toHaveLength(1);
  });

  it("connects in mock mode and keeps sync idempotent", () => {
    const seller = "loja-local";
    expect(connectChannel(seller, "shopee").mode).toBe("mock");
    const first = syncCatalog(seller, "shopee");
    const second = syncCatalog(seller, "shopee");
    expect(first.catalog.count).toBe(2);
    expect(second.catalog.count).toBe(first.catalog.count);
    expect(syncOrders(seller, "shopee").orders.count).toBe(1);
    expect(disconnectChannel(seller, "shopee").status).toBe("disconnected");
  });

  it("does not sync a disconnected channel", () => {
    const result = syncOrders("loja-local", "amazon");
    expect(result.orders.state).toBe("failed");
    expect(result.orders.count).toBe(0);
  });
});
