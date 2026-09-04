import * as cartService from "../../../src/modules/cart/services/cart.service";
import { NotFoundError } from "../../../src/shared/errors/not-found.error";
import { InvalidDataError } from "../../../src/shared/errors/invalid-data.error";
import { makeCart } from "../factories/cart.factory";
import { makeProduct, PRODUCT_ID } from "../factories/product.factory";
import { makeOffer } from "../factories/offer.factory";
import { USER_ID } from "../factories/user.factory";

jest.mock("../../../src/modules/cart/repositories/cart.repository", () =>
  require("../mocks/repositories").mockCartRepository
);
jest.mock("../../../src/modules/products/repositories/product.repository", () =>
  require("../mocks/repositories").mockProductRepository
);
jest.mock("../../../src/modules/offers/repositories/offer.repository", () =>
  require("../mocks/repositories").mockOfferRepository
);
jest.mock("../../../src/shared/storage/storage.factory", () => ({
  getStorageProvider: jest.fn(),
}));

import {
  mockCartRepository,
  mockProductRepository,
  mockOfferRepository,
} from "../mocks/repositories";
import { getStorageProvider } from "../../../src/shared/storage/storage.factory";

const getStorageProviderMock = getStorageProvider as jest.Mock;
const storageProviderMock = {
  name: "local",
  getPresignedUploadUrl: jest.fn(),
  getPublicUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
  objectExists: jest.fn(),
  inspectImage: jest.fn(),
  listObjects: jest.fn(),
  deleteObject: jest.fn(),
  deletePrefix: jest.fn(),
};

describe("cart.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getStorageProviderMock.mockReturnValue(storageProviderMock);
    mockOfferRepository.findActiveByProductId.mockResolvedValue(null);
  });

  describe("getCart", () => {
    it("retorna carrito con items resueltos, totalItems y subtotal", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      const result = await cartService.getCart(USER_ID);

      expect(mockCartRepository.findByUserId).toHaveBeenCalledWith(USER_ID);
      expect(mockCartRepository.createCart).not.toHaveBeenCalled();
      expect(result.items[0]).toMatchObject({
        productId: PRODUCT_ID,
        name: "Arroz 1kg",
        price: 89.5,
        unitPrice: 89.5,
        originalPrice: undefined,
        discountPercentage: undefined,
        isOffer: false,
        quantity: 2,
        unit: "kg",
        unitQuantity: 1,
      });
      expect(result.items[0].image).toContain("https://example.com/arroz.png");
      expect(result.items[0].image).toContain("?v=");
      expect(result.totalItems).toBe(2);
      expect(result.subtotal).toBe(179);
    });

    it("resuelve imageKey a URL pública (fix 0012: imageKey como fuente de verdad)", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockProductRepository.findById.mockResolvedValue(
        makeProduct({ image: undefined, imageKey: "products/tablets/tablet-tcl.png" })
      );

      const result = await cartService.getCart(USER_ID);

      expect(storageProviderMock.getPublicUrl).toHaveBeenCalledWith("products/tablets/tablet-tcl.png");
      expect(result.items[0].image).toBe(`https://cdn.test/products/tablets/tablet-tcl.png?v=${encodeURIComponent(new Date("2026-01-01T00:00:00.000Z").toISOString())}`);
    });

    it("retorna image vacío cuando el producto no tiene imageKey ni image pública", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockProductRepository.findById.mockResolvedValue(makeProduct({ image: undefined, imageKey: undefined }));

      const result = await cartService.getCart(USER_ID);

      expect(result.items[0].image).toBe("");
    });

    it("item legacy (sin snapshot) con oferta activa usa el precio de oferta del server", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockOfferRepository.findActiveByProductId.mockResolvedValue(makeOffer());

      const result = await cartService.getCart(USER_ID);

      expect(result.items[0]).toMatchObject({
        unitPrice: 80,
        price: 80,
        originalPrice: 100,
        discountPercentage: 20,
        isOffer: true,
      });
      expect(result.subtotal).toBe(160);
    });

    it("el snapshot persistido del item es autoritativo aunque exista una oferta viva distinta", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(
        makeCart({
          items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 70, originalPrice: 90, discountPercentage: 22 }],
        })
      );
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockOfferRepository.findActiveByProductId.mockResolvedValue(makeOffer());

      const result = await cartService.getCart(USER_ID);

      expect(result.items[0]).toMatchObject({ unitPrice: 70, originalPrice: 90, discountPercentage: 22, isOffer: true });
      expect(result.subtotal).toBe(140);
    });

    it("crea un carrito vacío si el usuario no tiene uno", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(null);
      mockCartRepository.createCart.mockResolvedValue(makeCart());

      const result = await cartService.getCart(USER_ID);

      expect(mockCartRepository.createCart).toHaveBeenCalledWith(USER_ID);
      expect(result).toBeDefined();
    });

    it("omite items cuyo producto ya no existe", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(
        makeCart({ items: [{ productId: PRODUCT_ID, quantity: 2 }, { productId: "inexistente", quantity: 1 }] })
      );
      mockProductRepository.findById.mockResolvedValue(null);

      const result = await cartService.getCart(USER_ID);

      expect(result.items).toEqual([]);
      expect(result.totalItems).toBe(0);
      expect(result.subtotal).toBe(0);
    });
  });

  describe("addItem", () => {
    it("lanza InvalidDataError si la cantidad no es entera", async () => {
      await expect(cartService.addItem(USER_ID, PRODUCT_ID, 1.5)).rejects.toThrow(InvalidDataError);
      expect(mockCartRepository.findByUserId).not.toHaveBeenCalled();
    });

    it("lanza InvalidDataError si la cantidad es menor a 1", async () => {
      await expect(cartService.addItem(USER_ID, PRODUCT_ID, 0)).rejects.toThrow(InvalidDataError);
      await expect(cartService.addItem(USER_ID, PRODUCT_ID, 0)).rejects.toThrow("Quantity must be a positive integer");
    });

    it("lanza NotFoundError si el producto no existe", async () => {
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(cartService.addItem(USER_ID, PRODUCT_ID, 1)).rejects.toThrow(NotFoundError);
      await expect(cartService.addItem(USER_ID, PRODUCT_ID, 1)).rejects.toThrow("Product not found");
    });

    it("lanza InvalidDataError si el producto no está disponible", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct({ isAvailable: false }));

      await expect(cartService.addItem(USER_ID, PRODUCT_ID, 1)).rejects.toThrow(InvalidDataError);
      await expect(cartService.addItem(USER_ID, PRODUCT_ID, 1)).rejects.toThrow("Product is not available");
    });

    it("agrega el item y retorna el carrito actualizado", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockCartRepository.findByUserId.mockResolvedValueOnce(null).mockResolvedValue(makeCart());
      mockCartRepository.createCart.mockResolvedValue(makeCart());
      mockCartRepository.addItem.mockResolvedValue(true);

      const result = await cartService.addItem(USER_ID, PRODUCT_ID, 2);

      expect(mockCartRepository.createCart).toHaveBeenCalledWith(USER_ID);
      expect(mockCartRepository.addItem).toHaveBeenCalledWith(USER_ID, PRODUCT_ID, 2, { unitPrice: 89.5 });
      expect(result.totalItems).toBe(2);
    });

    it("aplica la oferta activa al snapshot en add", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockOfferRepository.findActiveByProductId.mockResolvedValue(makeOffer());
      mockCartRepository.findByUserId.mockResolvedValueOnce(null).mockResolvedValue(
        makeCart({ items: [{ productId: PRODUCT_ID, quantity: 1, unitPrice: 80, originalPrice: 100, discountPercentage: 20 }] })
      );
      mockCartRepository.createCart.mockResolvedValue(makeCart());
      mockCartRepository.addItem.mockResolvedValue(true);

      const result = await cartService.addItem(USER_ID, PRODUCT_ID, 1);

      expect(mockCartRepository.addItem).toHaveBeenCalledWith(USER_ID, PRODUCT_ID, 1, {
        unitPrice: 80,
        originalPrice: 100,
        discountPercentage: 20,
      });
      expect(result.items[0]).toMatchObject({ unitPrice: 80, originalPrice: 100, discountPercentage: 20, isOffer: true });
    });
  });

  describe("updateItem", () => {
    it("lanza InvalidDataError si la cantidad no es entera", async () => {
      await expect(cartService.updateItem(USER_ID, PRODUCT_ID, 2.5)).rejects.toThrow(InvalidDataError);
    });

    it("lanza NotFoundError si el producto no existe", async () => {
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(cartService.updateItem(USER_ID, PRODUCT_ID, 1)).rejects.toThrow(NotFoundError);
    });

    it("lanza InvalidDataError si el producto no está disponible", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct({ isAvailable: false }));

      await expect(cartService.updateItem(USER_ID, PRODUCT_ID, 1)).rejects.toThrow(InvalidDataError);
    });

    it("lanza NotFoundError si el carrito no existe", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockCartRepository.findByUserId.mockResolvedValue(null);

      await expect(cartService.updateItem(USER_ID, PRODUCT_ID, 1)).rejects.toThrow(NotFoundError);
      await expect(cartService.updateItem(USER_ID, PRODUCT_ID, 1)).rejects.toThrow("Cart not found");
    });

    it("lanza NotFoundError si el item del carrito no existe", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockCartRepository.updateItem.mockResolvedValue(null);

      await expect(cartService.updateItem(USER_ID, PRODUCT_ID, 1)).rejects.toThrow(NotFoundError);
      await expect(cartService.updateItem(USER_ID, PRODUCT_ID, 1)).rejects.toThrow("Cart item not found");
    });

    it("actualiza el item (con snapshot) y retorna el carrito", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockCartRepository.updateItem.mockResolvedValue(makeCart());

      const result = await cartService.updateItem(USER_ID, PRODUCT_ID, 3);

      expect(mockCartRepository.updateItem).toHaveBeenCalledWith(USER_ID, PRODUCT_ID, 3, { unitPrice: 89.5 });
      expect(result.totalItems).toBe(2);
    });
  });

  describe("removeItem", () => {
    it("lanza NotFoundError si el carrito no existe", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(null);

      await expect(cartService.removeItem(USER_ID, PRODUCT_ID)).rejects.toThrow(NotFoundError);
    });

    it("lanza NotFoundError si el item del carrito no existe", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockCartRepository.removeItem.mockResolvedValue(null);

      await expect(cartService.removeItem(USER_ID, PRODUCT_ID)).rejects.toThrow(NotFoundError);
    });

    it("elimina el item y retorna el carrito", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockCartRepository.removeItem.mockResolvedValue(makeCart());
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      const result = await cartService.removeItem(USER_ID, PRODUCT_ID);

      expect(mockCartRepository.removeItem).toHaveBeenCalledWith(USER_ID, PRODUCT_ID);
      expect(result.totalItems).toBe(2);
    });
  });

  describe("clearCart", () => {
    it("limpia el carrito existente", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockCartRepository.clearCart.mockResolvedValue(true);
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      const result = await cartService.clearCart(USER_ID);

      expect(mockCartRepository.clearCart).toHaveBeenCalledWith(USER_ID);
      expect(mockCartRepository.createCart).not.toHaveBeenCalled();
      expect(result.totalItems).toBe(2);
    });

    it("crea el carrito si el usuario no tiene uno y lo limpia", async () => {
      mockCartRepository.findByUserId.mockResolvedValueOnce(null).mockResolvedValue(makeCart());
      mockCartRepository.createCart.mockResolvedValue(makeCart());
      mockCartRepository.clearCart.mockResolvedValue(true);
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      const result = await cartService.clearCart(USER_ID);

      expect(mockCartRepository.createCart).toHaveBeenCalledWith(USER_ID);
      expect(result.totalItems).toBe(2);
    });
  });

  describe("mergeCart (guest→server, server-wins)", () => {
    it("acumula cantidades y calcula el snapshot en backend", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockCartRepository.findByUserId.mockResolvedValueOnce(null).mockResolvedValue(makeCart());
      mockCartRepository.createCart.mockResolvedValue(makeCart());
      mockCartRepository.mergeItems.mockResolvedValue(makeCart());

      const result = await cartService.mergeCart(USER_ID, [{ productId: PRODUCT_ID, quantity: 2 }]);

      expect(mockCartRepository.mergeItems).toHaveBeenCalledWith(USER_ID, [
        { productId: PRODUCT_ID, quantity: 2, unitPrice: 89.5 },
      ]);
      expect(result.totalItems).toBe(2);
      expect(result.subtotal).toBe(179);
    });

    it("aplica oferta activa en el snapshot del merge", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockOfferRepository.findActiveByProductId.mockResolvedValue(makeOffer());
      mockCartRepository.findByUserId.mockResolvedValueOnce(null).mockResolvedValue(makeCart());
      mockCartRepository.createCart.mockResolvedValue(makeCart());
      mockCartRepository.mergeItems.mockResolvedValue(makeCart());

      await cartService.mergeCart(USER_ID, [{ productId: PRODUCT_ID, quantity: 1 }]);

      expect(mockCartRepository.mergeItems).toHaveBeenCalledWith(USER_ID, [
        { productId: PRODUCT_ID, quantity: 1, unitPrice: 80, originalPrice: 100, discountPercentage: 20 },
      ]);
    });

    it("descarta ghost (producto inexistente) y no disponible en el merge", async () => {
      mockProductRepository.findById
        .mockResolvedValueOnce(makeProduct())
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeProduct({ isAvailable: false }));
      mockCartRepository.findByUserId.mockResolvedValueOnce(null).mockResolvedValue(makeCart());
      mockCartRepository.createCart.mockResolvedValue(makeCart());
      mockCartRepository.mergeItems.mockResolvedValue(makeCart());

      await cartService.mergeCart(USER_ID, [
        { productId: PRODUCT_ID, quantity: 1 },
        { productId: "ghost", quantity: 1 },
        { productId: "unavailable", quantity: 1 },
      ]);

      expect(mockCartRepository.mergeItems).toHaveBeenCalledWith(USER_ID, [
        { productId: PRODUCT_ID, quantity: 1, unitPrice: 89.5 },
      ]);
    });

    it("omite items malformados (sin productId)", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockCartRepository.findByUserId.mockResolvedValueOnce(null).mockResolvedValue(makeCart());
      mockCartRepository.createCart.mockResolvedValue(makeCart());
      mockCartRepository.mergeItems.mockResolvedValue(makeCart());

      await cartService.mergeCart(USER_ID, [
        { productId: PRODUCT_ID, quantity: 1 },
        { productId: undefined, quantity: 1 },
        { quantity: 3 },
      ]);

      expect(mockCartRepository.mergeItems).toHaveBeenCalledWith(USER_ID, [
        { productId: PRODUCT_ID, quantity: 1, unitPrice: 89.5 },
      ]);
    });

    it("lanza InvalidDataError si items no es un array", async () => {
      await expect(cartService.mergeCart(USER_ID, undefined as never)).rejects.toThrow(InvalidDataError);
      await expect(cartService.mergeCart(USER_ID, undefined as never)).rejects.toThrow("items must be an array");
    });

    it("lanza InvalidDataError si alguna cantidad no es un entero positivo", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      await expect(cartService.mergeCart(USER_ID, [{ productId: PRODUCT_ID, quantity: 0 }])).rejects.toThrow(
        InvalidDataError
      );
      await expect(cartService.mergeCart(USER_ID, [{ productId: PRODUCT_ID, quantity: 1.5 }])).rejects.toThrow(
        InvalidDataError
      );
    });
  });
});