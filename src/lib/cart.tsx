import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartItem = {
  listingId: string; cardId: string; cardName: string; image: string | null; storeName: string;
  condition: string; language: string; price: number; qty: number; max: number;
};

type Ctx = {
  items: CartItem[];
  add: (i: Omit<CartItem, "qty">) => void;
  setQty: (listingId: string, qty: number) => void;
  remove: (listingId: string) => void;
  clear: () => void;
};
const CartCtx = createContext<Ctx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => {
    try { setItems(JSON.parse(localStorage.getItem("cart_v2") || "[]")); } catch { /* ignore */ }
  }, []);
  const save = (next: CartItem[]) => { setItems(next); localStorage.setItem("cart_v2", JSON.stringify(next)); };
  return (
    <CartCtx.Provider value={{
      items,
      add: (i) => {
        const ex = items.find((x) => x.listingId === i.listingId);
        save(ex ? items.map((x) => x.listingId === i.listingId ? { ...x, qty: Math.min(x.max, x.qty + 1) } : x) : [...items, { ...i, qty: 1 }]);
      },
      setQty: (id, q) => save(items.map((x) => x.listingId === id ? { ...x, qty: Math.max(1, Math.min(x.max, q || 1)) } : x)),
      remove: (id) => save(items.filter((x) => x.listingId !== id)),
      clear: () => save([]),
    }}>{children}</CartCtx.Provider>
  );
}

export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("CartProvider missing");
  return c;
}
