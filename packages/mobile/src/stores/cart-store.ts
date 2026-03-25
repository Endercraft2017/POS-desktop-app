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
  setDefaultTaxRate: (rate: number) => void;
  addItem: (product: { id: string; name: string; price: number }) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  applyDiscount: (type: DiscountType, value: number) => void;
  clear: () => void;
};

export const useCartStore = create<CartStore>((set, get) => ({
  cart: createEmptyCart(),
  defaultTaxRate: 0,

  setDefaultTaxRate: (rate) => set({ defaultTaxRate: rate }),

  addItem: (product) =>
    set((state) => ({
      cart: addItemToCart(state.cart, product, 1, state.defaultTaxRate),
    })),

  updateQuantity: (productId, quantity) =>
    set((state) => ({
      cart: updateItemQuantity(
        state.cart,
        productId,
        quantity,
        state.defaultTaxRate
      ),
    })),

  removeItem: (productId) =>
    set((state) => ({
      cart: removeItemFromCart(state.cart, productId),
    })),

  applyDiscount: (type, value) =>
    set((state) => ({
      cart: applyCartDiscount(state.cart, type, value),
    })),

  clear: () => set({ cart: clearCart() }),
}));
