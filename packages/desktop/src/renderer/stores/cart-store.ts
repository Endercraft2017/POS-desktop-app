import { create } from "zustand";
import type { Cart } from "@pos/core/types";
import {
  createEmptyCart,
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
  applyCartDiscount,
  clearCart,
} from "@pos/core/services";
import type { DiscountType } from "@pos/core/types";

type CartStore = {
  cart: Cart;
  defaultTaxRate: number;
  // Customer name for the current order. Lives in the store (not local state)
  // so the ChatPanel agent can read and update it from anywhere.
  customerName: string;
  setDefaultTaxRate: (rate: number) => void;
  setCustomerName: (name: string) => void;
  addItem: (product: { id: string; name: string; price: number }, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  applyDiscount: (type: DiscountType, value: number) => void;
  clear: () => void;
};

export const useCartStore = create<CartStore>((set) => ({
  cart: createEmptyCart(),
  defaultTaxRate: 0,
  customerName: "",
  setDefaultTaxRate: (rate) => set({ defaultTaxRate: rate }),
  setCustomerName: (name) => set({ customerName: name }),
  addItem: (product, quantity = 1) =>
    set((state) => ({
      cart: addItemToCart(state.cart, product, quantity, state.defaultTaxRate),
    })),
  updateQuantity: (productId, quantity) =>
    set((state) => ({
      cart: updateItemQuantity(state.cart, productId, quantity, state.defaultTaxRate),
    })),
  removeItem: (productId) =>
    set((state) => ({
      cart: removeItemFromCart(state.cart, productId),
    })),
  applyDiscount: (type, value) =>
    set((state) => ({
      cart: applyCartDiscount(state.cart, type, value),
    })),
  clear: () => set({ cart: clearCart(), customerName: "" }),
}));
