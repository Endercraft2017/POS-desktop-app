import type { Cart, CartItem, DiscountType } from "../types";

export function createEmptyCart(): Cart {
  return {
    items: [],
    subtotal: 0,
    taxAmount: 0,
    discountAmount: 0,
    total: 0,
    discountType: "none",
    discountValue: 0,
  };
}

export function addItemToCart(
  cart: Cart,
  product: { id: string; name: string; price: number },
  quantity: number = 1,
  taxRate: number = 0
): Cart {
  const existingIndex = cart.items.findIndex(
    (item) => item.productId === product.id
  );

  let newItems: CartItem[];

  if (existingIndex >= 0) {
    newItems = cart.items.map((item, i) => {
      if (i !== existingIndex) return item;
      const newQty = item.quantity + quantity;
      const itemSubtotal = item.unitPrice * newQty;
      const itemTax = itemSubtotal * taxRate;
      return {
        ...item,
        quantity: newQty,
        taxAmount: itemTax,
        total: itemSubtotal + itemTax - item.discountAmount,
      };
    });
  } else {
    const itemSubtotal = product.price * quantity;
    const itemTax = itemSubtotal * taxRate;
    const newItem: CartItem = {
      productId: product.id,
      productName: product.name,
      unitPrice: product.price,
      quantity,
      discountAmount: 0,
      taxAmount: itemTax,
      total: itemSubtotal + itemTax,
    };
    newItems = [...cart.items, newItem];
  }

  return recalculateCart({ ...cart, items: newItems });
}

export function updateItemQuantity(
  cart: Cart,
  productId: string,
  quantity: number,
  taxRate: number = 0
): Cart {
  if (quantity <= 0) {
    return removeItemFromCart(cart, productId);
  }

  const newItems = cart.items.map((item) => {
    if (item.productId !== productId) return item;
    const itemSubtotal = item.unitPrice * quantity;
    const itemTax = itemSubtotal * taxRate;
    return {
      ...item,
      quantity,
      taxAmount: itemTax,
      total: itemSubtotal + itemTax - item.discountAmount,
    };
  });

  return recalculateCart({ ...cart, items: newItems });
}

export function removeItemFromCart(cart: Cart, productId: string): Cart {
  const newItems = cart.items.filter((item) => item.productId !== productId);
  return recalculateCart({ ...cart, items: newItems });
}

export function applyCartDiscount(
  cart: Cart,
  discountType: DiscountType,
  discountValue: number
): Cart {
  return recalculateCart({ ...cart, discountType, discountValue });
}

export function clearCart(): Cart {
  return createEmptyCart();
}

function recalculateCart(cart: Cart): Cart {
  const subtotal = cart.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const taxAmount = cart.items.reduce((sum, item) => sum + item.taxAmount, 0);

  let discountAmount = 0;
  if (cart.discountType === "percentage" && cart.discountValue > 0) {
    discountAmount = subtotal * (cart.discountValue / 100);
  } else if (cart.discountType === "fixed" && cart.discountValue > 0) {
    discountAmount = Math.min(cart.discountValue, subtotal);
  }

  const total = Math.max(0, subtotal + taxAmount - discountAmount);

  return {
    ...cart,
    subtotal: roundCurrency(subtotal),
    taxAmount: roundCurrency(taxAmount),
    discountAmount: roundCurrency(discountAmount),
    total: roundCurrency(total),
  };
}

function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}
