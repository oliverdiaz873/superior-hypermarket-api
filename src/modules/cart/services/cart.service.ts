import * as cartRepository from "../repositories/cart.repository";
import * as productRepository from "../../products/repositories/product.repository";
import * as offerRepository from "../../offers/repositories/offer.repository";
import { NotFoundError } from "../../../shared/errors/not-found.error";
import { InvalidDataError } from "../../../shared/errors/invalid-data.error";
import { resolveProductImageUrl } from "../../../shared/utils/resolve-product-image";
import type { CartItem, CartItemStored, CartResponse, Product } from "../../../types";

const computeDiscountPercentage = (originalPrice: number, discountPrice: number): number =>
  originalPrice > 0 ? Math.round(((originalPrice - discountPrice) / originalPrice) * 100) : 0;

type PriceSnapshot = {
  unitPrice: number;
  originalPrice?: number;
  discountPercentage?: number;
};

/** Snapshot de precio/oferta resuelto SOLO en backend (nunca del cliente). */
const buildSnapshot = async (product: Product): Promise<PriceSnapshot> => {
  const offer = await offerRepository.findActiveByProductId(product.id, new Date());
  if (offer) {
    return {
      unitPrice: offer.discountPrice,
      originalPrice: offer.originalPrice,
      discountPercentage: computeDiscountPercentage(offer.originalPrice, offer.discountPrice),
    };
  }
  return { unitPrice: product.price };
};

const resolveItem = async (item: CartItemStored): Promise<CartItem | null> => {
  const product = await productRepository.findById(item.productId);
  if (!product) return null;

  // El snapshot del item es autoritativo; para items legacy (sin snapshot) se
  // resuelve la oferta viva (server-side).
  const { unitPrice: storedUnitPrice, originalPrice: storedOriginalPrice, discountPercentage: storedDiscountPercentage } = item;
  let unitPrice: number;
  let originalPrice: number | undefined;
  let discountPercentage: number | undefined;
  if (storedUnitPrice !== undefined) {
    unitPrice = storedUnitPrice;
    originalPrice = storedOriginalPrice;
    discountPercentage = storedDiscountPercentage;
  } else {
    const snapshot = await buildSnapshot(product);
    unitPrice = snapshot.unitPrice;
    originalPrice = snapshot.originalPrice;
    discountPercentage = snapshot.discountPercentage;
  }

  return {
    productId: item.productId,
    name: product.name,
    price: unitPrice,
    unitPrice,
    originalPrice,
    discountPercentage,
    isOffer: originalPrice !== undefined && originalPrice > unitPrice,
    quantity: item.quantity,
    image: resolveProductImageUrl(product) ?? "",
    unit: product.unit,
    unitQuantity: product.unitQuantity,
  };
};

export const getCart = async (userId: string): Promise<CartResponse> => {
  let cart = await cartRepository.findByUserId(userId);
  if (!cart) {
    cart = await cartRepository.createCart(userId);
  }

  const resolvedItems = (await Promise.all(cart.items.map(resolveItem))).filter(Boolean) as CartItem[];
  const totalItems = resolvedItems.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = resolvedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  return {
    items: resolvedItems,
    totalItems,
    subtotal,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
};

export const addItem = async (userId: string, productId: string, quantity: number): Promise<CartResponse> => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InvalidDataError("Quantity must be a positive integer");
  }

  const product = await productRepository.findById(productId);
  if (!product) {
    throw new NotFoundError("Product not found");
  }
  if (!product.isAvailable) {
    throw new InvalidDataError("Product is not available");
  }

  const snapshot = await buildSnapshot(product);

  const cart = await cartRepository.findByUserId(userId);
  if (!cart) {
    await cartRepository.createCart(userId);
  }

  await cartRepository.addItem(userId, productId, quantity, snapshot);
  return getCart(userId);
};

export const updateItem = async (userId: string, productId: string, quantity: number): Promise<CartResponse> => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InvalidDataError("Quantity must be a positive integer");
  }

  const product = await productRepository.findById(productId);
  if (!product) {
    throw new NotFoundError("Product not found");
  }
  if (!product.isAvailable) {
    throw new InvalidDataError("Product is not available");
  }

  const snapshot = await buildSnapshot(product);

  const cart = await cartRepository.findByUserId(userId);
  if (!cart) {
    throw new NotFoundError("Cart not found");
  }

  const updated = await cartRepository.updateItem(userId, productId, quantity, snapshot);
  if (!updated) {
    throw new NotFoundError("Cart item not found");
  }

  return getCart(userId);
};

export const removeItem = async (userId: string, productId: string): Promise<CartResponse> => {
  const cart = await cartRepository.findByUserId(userId);
  if (!cart) {
    throw new NotFoundError("Cart not found");
  }

  const updated = await cartRepository.removeItem(userId, productId);
  if (!updated) {
    throw new NotFoundError("Cart item not found");
  }

  return getCart(userId);
};

export const clearCart = async (userId: string): Promise<CartResponse> => {
  const cart = await cartRepository.findByUserId(userId);
  if (!cart) {
    await cartRepository.createCart(userId);
  }

  await cartRepository.clearCart(userId);
  return getCart(userId);
};

/**
 * Merge guest→server (server-wins). Acumula cantidades del carrito local sobre
 * el carrito del usuario y descarta ghost/unavailable. Los precios/ofertas los
 * decide exclusivamente el backend.
 */
export const mergeCart = async (
  userId: string,
  items?: Array<{ productId?: string; quantity?: number }>
): Promise<CartResponse> => {
  if (!Array.isArray(items)) {
    throw new InvalidDataError("items must be an array");
  }

  const toMerge: CartItemStored[] = [];
  for (const input of items) {
    const productId = input?.productId;
    const quantity = input?.quantity;
    if (typeof productId !== "string" || !productId) continue;
    if (quantity === undefined || !Number.isInteger(quantity) || quantity < 1) {
      throw new InvalidDataError("Quantity must be a positive integer");
    }

    const product = await productRepository.findById(productId);
    if (!product || !product.isAvailable) continue; // ghost/unavailable → se descartan

    const snapshot = await buildSnapshot(product);
    toMerge.push({ productId, quantity, ...snapshot });
  }

  const cart = await cartRepository.findByUserId(userId);
  if (!cart) {
    await cartRepository.createCart(userId);
  }

  await cartRepository.mergeItems(userId, toMerge);
  return getCart(userId);
};
