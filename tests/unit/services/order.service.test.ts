import * as orderService from "../../../src/modules/orders/services/order.service";
import { NotFoundError } from "../../../src/shared/errors/not-found.error";
import { InvalidDataError } from "../../../src/shared/errors/invalid-data.error";
import { InsufficientStockError } from "../../../src/shared/errors/insufficient-stock.error";
import { makeOrder, ORDER_ID } from "../factories/order.factory";
import { makeCart } from "../factories/cart.factory";
import { makeProduct, PRODUCT_ID } from "../factories/product.factory";
import { makeAddress } from "../factories/address.factory";
import { makeInventory } from "../factories/inventory.factory";
import { USER_ID, makeUser } from "../factories/user.factory";
import { getStorageProvider } from "../../../src/shared/storage/storage.factory";

const SECOND_PRODUCT_ID = "64b0000000000000000000a2";

jest.mock("../../../src/modules/orders/repositories/order.repository", () =>
  require("../mocks/repositories").mockOrderRepository
);
jest.mock("../../../src/modules/cart/repositories/cart.repository", () =>
  require("../mocks/repositories").mockCartRepository
);
jest.mock("../../../src/modules/products/repositories/product.repository", () =>
  require("../mocks/repositories").mockProductRepository
);
jest.mock("../../../src/modules/addresses/repositories/address.repository", () =>
  require("../mocks/repositories").mockAddressRepository
);
jest.mock("../../../src/modules/inventory/services/inventory.service", () =>
  require("../mocks/repositories").mockInventoryService
);
jest.mock("../../../src/modules/users/repositories/user.repository", () =>
  require("../mocks/repositories").mockUserRepository
);
jest.mock("../../../src/shared/storage/storage.factory", () => ({
  getStorageProvider: jest.fn(),
}));

import {
  mockOrderRepository,
  mockCartRepository,
  mockProductRepository,
  mockAddressRepository,
  mockInventoryService,
  mockUserRepository,
} from "../mocks/repositories";

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

const { id: _id, userId: _userId, isDefault: _isDefault, ...shippingAddress } = makeAddress();

describe("order.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getStorageProviderMock.mockReturnValue(storageProviderMock);
  });

  describe("create", () => {
    it("lanza NotFoundError si el carrito no existe", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(null);

      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow(NotFoundError);
      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow("Cart not found");
    });

    it("lanza InvalidDataError si el carrito está vacío", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart({ items: [] }));

      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow(InvalidDataError);
      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow("Cart is empty");
    });

    it("lanza NotFoundError si la dirección no existe", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockAddressRepository.findById.mockResolvedValue(null);

      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow(NotFoundError);
      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow("Address not found");
    });

    it("lanza NotFoundError si la dirección es de otro usuario", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockAddressRepository.findById.mockResolvedValue(makeAddress({ userId: "otro-usuario" }));

      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow(NotFoundError);
    });

    it("lanza NotFoundError si un producto del carrito ya no existe", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockAddressRepository.findById.mockResolvedValue(makeAddress());
      mockProductRepository.findByIds.mockResolvedValue([]);

      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow(NotFoundError);
      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow("Product not found");
    });

    it("lanza InsufficientStockError si no hay stock disponible", async () => {
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockAddressRepository.findById.mockResolvedValue(makeAddress());
      mockProductRepository.findByIds.mockResolvedValue([makeProduct()]);
      mockOrderRepository.create.mockResolvedValue(makeOrder());
      mockInventoryService.reserveForOrder.mockRejectedValue(new InsufficientStockError("Insufficient stock for product Arroz 1kg"));

      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow(InsufficientStockError);
      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow("Insufficient stock");
    });

    it("crea la orden, reserva stock y limpia el carrito", async () => {
      const order = makeOrder();
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockAddressRepository.findById.mockResolvedValue(makeAddress());
      mockProductRepository.findByIds.mockResolvedValue([makeProduct()]);
      mockInventoryService.reserveForOrder.mockResolvedValue(undefined);
      mockOrderRepository.create.mockResolvedValue(order);
      mockCartRepository.clearCart.mockResolvedValue(true);

      const result = await orderService.create(USER_ID, "address-id", "it-key");

      expect(mockOrderRepository.create).toHaveBeenCalledWith(
        USER_ID,
        expect.arrayContaining([
          expect.objectContaining({
            productId: PRODUCT_ID,
            name: "Arroz 1kg",
            price: 89.5,
            image: expect.stringContaining("https://example.com/arroz.png"),
            unit: "kg",
            unitQuantity: 1,
            quantity: 2,
          }),
        ]),
        2,
        179,
        shippingAddress,
        USER_ID,
        "it-key",
        expect.stringMatching(/^HM-\d{8}-[A-F0-9]{6}$/)
      );
      const createdImage = (mockOrderRepository.create.mock.calls[0][1] as Array<{ image: string }>)[0].image;
      expect(createdImage).toContain("?v=");
      expect(mockInventoryService.reserveForOrder).toHaveBeenCalledWith(
        [{ productId: PRODUCT_ID, quantity: 2, name: "Arroz 1kg" }],
        order.id,
        USER_ID
      );
      expect(mockCartRepository.clearCart).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual({
        id: order.id,
        userId: order.userId,
        items: order.items,
        shippingAddress: order.shippingAddress,
        totalItems: order.totalItems,
        subtotal: order.subtotal,
        status: order.status,
        paymentStatus: order.paymentStatus,
        statusHistory: order.statusHistory,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      });
    });

    it("usa el snapshot de precio del carrito (descuento server-side) para el total", async () => {
      const order = makeOrder({ items: [{ productId: PRODUCT_ID, name: "Arroz 1kg", price: 80, image: "https://example.com/arroz.png", quantity: 2 }], subtotal: 160 });
      mockCartRepository.findByUserId.mockResolvedValue(
        makeCart({ items: [{ productId: PRODUCT_ID, quantity: 2, unitPrice: 80, originalPrice: 100, discountPercentage: 20 }] })
      );
      mockAddressRepository.findById.mockResolvedValue(makeAddress());
      mockProductRepository.findByIds.mockResolvedValue([makeProduct()]);
      mockInventoryService.reserveForOrder.mockResolvedValue(undefined);
      mockOrderRepository.create.mockResolvedValue(order);
      mockCartRepository.clearCart.mockResolvedValue(true);

      await orderService.create(USER_ID, "address-id", "it-key");

      expect(mockOrderRepository.create).toHaveBeenCalledWith(
        USER_ID,
        expect.arrayContaining([
          expect.objectContaining({
            productId: PRODUCT_ID,
            price: 80,
            originalPrice: 100,
            discountPercentage: 20,
            image: expect.stringContaining("https://example.com/arroz.png"),
            quantity: 2,
          }),
        ]),
        2,
        160,
        shippingAddress,
        USER_ID,
        "it-key",
        expect.stringMatching(/^HM-\d{8}-[A-F0-9]{6}$/)
      );
    });

    it("resuelve imageKey a URL pública para OrderItem (fix 0012)", async () => {
      const order = makeOrder();
      mockCartRepository.findByUserId.mockResolvedValue(makeCart());
      mockAddressRepository.findById.mockResolvedValue(makeAddress());
      mockProductRepository.findByIds.mockResolvedValue([
        makeProduct({ image: undefined, imageKey: "products/tablets/tablet-tcl.png" }),
      ]);
      mockInventoryService.reserveForOrder.mockResolvedValue(undefined);
      mockOrderRepository.create.mockResolvedValue(order);
      mockCartRepository.clearCart.mockResolvedValue(true);

      await orderService.create(USER_ID, "address-id", "it-key");

      expect(storageProviderMock.getPublicUrl).toHaveBeenCalledWith("products/tablets/tablet-tcl.png");
      const createdImage = (mockOrderRepository.create.mock.calls[0][1] as Array<{ image: string }>)[0].image;
      expect(createdImage).toBe(`https://cdn.test/products/tablets/tablet-tcl.png?v=${encodeURIComponent(new Date("2026-01-01T00:00:00.000Z").toISOString())}`);
    });

    it("hace rollback liberando reservas y eliminando la orden si falla la reserva", async () => {
      const order = makeOrder({
        items: [
          { productId: PRODUCT_ID, name: "Arroz 1kg", price: 89.5, image: "https://example.com/arroz.png", quantity: 2 },
          { productId: SECOND_PRODUCT_ID, name: "Aceite 1L", price: 15, image: "https://example.com/aceite.png", quantity: 1 },
        ],
      });
      const cart = makeCart({
        items: [{ productId: PRODUCT_ID, quantity: 2 }, { productId: SECOND_PRODUCT_ID, quantity: 1 }],
      });
      mockCartRepository.findByUserId.mockResolvedValue(cart);
      mockAddressRepository.findById.mockResolvedValue(makeAddress());
      mockProductRepository.findByIds.mockResolvedValue([
        makeProduct(),
        makeProduct({ id: SECOND_PRODUCT_ID, name: "Aceite 1L", price: 15, image: "https://example.com/aceite.png" }),
      ]);
      mockInventoryService.reserveForOrder.mockRejectedValue(new InsufficientStockError("stock"));
      mockOrderRepository.create.mockResolvedValue(order);
      mockOrderRepository.deleteById.mockResolvedValue(true);

      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow(InsufficientStockError);

      expect(mockInventoryService.reserveForOrder).toHaveBeenCalledWith(
        [
          { productId: PRODUCT_ID, quantity: 2, name: "Arroz 1kg" },
          { productId: SECOND_PRODUCT_ID, quantity: 1, name: "Aceite 1L" },
        ],
        order.id,
        USER_ID
      );
      expect(mockOrderRepository.deleteById).toHaveBeenCalledWith(ORDER_ID);
      expect(mockCartRepository.clearCart).not.toHaveBeenCalled();
    });

    it("lanza InvalidDataError si falta idempotencyKey", async () => {
      await expect(orderService.create(USER_ID, "address-id")).rejects.toThrow(InvalidDataError);
      await expect(orderService.create(USER_ID, "address-id")).rejects.toThrow("idempotencyKey is required");
    });

    it("devuelve la orden existente si la clave ya fue usada (idempotencia)", async () => {
      const existing = makeOrder();
      mockOrderRepository.findByUserAndIdempotencyKey.mockResolvedValue(existing);

      const result = await orderService.create(USER_ID, "address-id", "it-key");

      expect(mockOrderRepository.findByUserAndIdempotencyKey).toHaveBeenCalledWith(USER_ID, "it-key");
      expect(mockCartRepository.findByUserId).not.toHaveBeenCalled();
      expect(mockOrderRepository.create).not.toHaveBeenCalled();
      expect(result.id).toBe(ORDER_ID);
    });

    it("retorna la orden concurrente si el insert choca con el índice único", async () => {
      const concurrent = makeOrder();
      const duplicateError = new Error("dup key");
      Object.assign(duplicateError, { name: "MongoServerError", code: 11000 });
      mockOrderRepository.findByUserAndIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValueOnce(concurrent);
      mockOrderRepository.create.mockRejectedValue(duplicateError);

      const result = await orderService.create(USER_ID, "address-id", "it-key");

      expect(mockOrderRepository.findByUserAndIdempotencyKey).toHaveBeenCalledTimes(2);
      expect(result.id).toBe(concurrent.id);
    });

    it("no relanza como idempotente un error distinto de 11000", async () => {
      mockOrderRepository.findByUserAndIdempotencyKey.mockResolvedValue(null);
      mockOrderRepository.create.mockRejectedValue(new Error("boom"));

      await expect(orderService.create(USER_ID, "address-id", "it-key")).rejects.toThrow("boom");
    });
  });

  describe("pay", () => {
    it("lanza NotFoundError si la orden no existe", async () => {
      mockOrderRepository.findById.mockResolvedValue(null);

      await expect(orderService.pay(USER_ID, ORDER_ID)).rejects.toThrow(NotFoundError);
    });

    it("lanza NotFoundError si la orden es de otro usuario", async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ userId: "otro-usuario" }));

      await expect(orderService.pay(USER_ID, ORDER_ID)).rejects.toThrow(NotFoundError);
    });

    it("transiciona pending -> paid", async () => {
      const paid = makeOrder({ paymentStatus: "paid" });
      mockOrderRepository.findById.mockResolvedValue(makeOrder());
      mockOrderRepository.updatePaymentStatus.mockResolvedValue(paid);

      const result = await orderService.pay(USER_ID, ORDER_ID);

      expect(mockOrderRepository.updatePaymentStatus).toHaveBeenCalledWith(ORDER_ID, "pending", "paid");
      expect(result.paymentStatus).toBe("paid");
    });

    it("lanza InvalidDataError si no se puede pagar (paid -> paid)", async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ paymentStatus: "paid" }));

      await expect(orderService.pay(USER_ID, ORDER_ID)).rejects.toThrow(InvalidDataError);
    });
  });

  describe("findByUser", () => {
    it("retorna las órdenes del usuario", async () => {
      const orders = [makeOrder()];
      mockOrderRepository.findByUserId.mockResolvedValue(orders);

      const result = await orderService.findByUser(USER_ID);

      expect(mockOrderRepository.findByUserId).toHaveBeenCalledWith(USER_ID);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: ORDER_ID, status: "pending", totalItems: 2, subtotal: 179 });
    });
  });

  describe("findById", () => {
    it("lanza NotFoundError si la orden no existe", async () => {
      mockOrderRepository.findById.mockResolvedValue(null);

      await expect(orderService.findById(USER_ID, ORDER_ID)).rejects.toThrow(NotFoundError);
    });

    it("lanza NotFoundError si la orden es de otro usuario", async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder());

      await expect(orderService.findById("otro-usuario", ORDER_ID)).rejects.toThrow(NotFoundError);
    });

    it("retorna la orden del propio usuario", async () => {
      const order = makeOrder();
      mockOrderRepository.findById.mockResolvedValue(order);

      const result = await orderService.findById(USER_ID, ORDER_ID);

      expect(mockOrderRepository.findById).toHaveBeenCalledWith(ORDER_ID);
      expect(result).toMatchObject({ id: ORDER_ID, status: "pending" });
      expect(result).toHaveProperty("userId", USER_ID);
      expect(result).toHaveProperty("statusHistory");
    });
  });

  describe("updateStatus", () => {
    it("lanza NotFoundError si la orden no existe", async () => {
      mockOrderRepository.findById.mockResolvedValue(null);

      await expect(orderService.updateStatus(USER_ID, ORDER_ID, "processing")).rejects.toThrow(NotFoundError);
    });

    it("lanza NotFoundError si la orden es de otro usuario", async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder());

      await expect(orderService.updateStatus("otro-usuario", ORDER_ID, "processing")).rejects.toThrow(NotFoundError);
    });

    it("lanza InvalidDataError si la transición no está permitida", async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder());

      await expect(orderService.updateStatus(USER_ID, ORDER_ID, "completed")).rejects.toThrow(InvalidDataError);
      await expect(orderService.updateStatus(USER_ID, ORDER_ID, "completed")).rejects.toThrow(
        "Cannot transition from pending to completed"
      );
    });

    it("rechaza al customer transicionar pending → processing", async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder());

      await expect(orderService.updateStatus(USER_ID, ORDER_ID, "processing")).rejects.toThrow(InvalidDataError);
      await expect(orderService.updateStatus(USER_ID, ORDER_ID, "processing")).rejects.toThrow(
        "Cannot transition from pending to processing"
      );
      expect(mockOrderRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("libera la reserva de los items al cancelar (customer)", async () => {
      const cancelled = makeOrder({ status: "cancelled" });
      mockOrderRepository.findById.mockResolvedValue(makeOrder());
      mockOrderRepository.updateStatus.mockResolvedValue(cancelled);
      mockInventoryService.releaseReservation.mockResolvedValue(undefined);

      const result = await orderService.updateStatus(USER_ID, ORDER_ID, "cancelled");

      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(
        ORDER_ID,
        "pending",
        "cancelled",
        expect.objectContaining({ status: "cancelled", by: USER_ID })
      );
      expect(mockInventoryService.releaseReservation).toHaveBeenCalledWith(PRODUCT_ID, 2, ORDER_ID, USER_ID);
      expect(result).toMatchObject({ status: "cancelled" });
    });

    it("retorna la orden actual si la actualización concurrente devuelve null", async () => {
      const original = makeOrder();
      const current = makeOrder({ status: "cancelled" });
      mockOrderRepository.findById.mockResolvedValueOnce(original).mockResolvedValueOnce(current);
      mockOrderRepository.updateStatus.mockResolvedValue(null);

      const result = await orderService.updateStatus(USER_ID, ORDER_ID, "cancelled");

      expect(result).toMatchObject({ status: "cancelled" });
    });

    it("lanza NotFoundError si la actualización concurrente devuelve null y la orden ya no existe", async () => {
      mockOrderRepository.findById.mockResolvedValueOnce(makeOrder()).mockResolvedValueOnce(null);
      mockOrderRepository.updateStatus.mockResolvedValue(null);

      await expect(orderService.updateStatus(USER_ID, ORDER_ID, "cancelled")).rejects.toThrow(NotFoundError);
    });
  });

  describe("getPageAdmin", () => {
    it("retorna una página de órdenes con paginación", async () => {
      const orders = [makeOrder(), makeOrder({ id: "64b00000000000000000001002" })];
      const pagination = { page: 1, limit: 50, total: 2, pages: 1 };
      mockOrderRepository.findPage.mockResolvedValue({ items: orders, total: 2, pagination });
      mockUserRepository.findByIds.mockResolvedValue([makeUser()]);

      const result = await orderService.getPageAdmin({});

      expect(mockOrderRepository.findPage).toHaveBeenCalledWith({
        page: 1,
        limit: 50,
        userIds: undefined,
        orderId: undefined,
        status: undefined,
        sortBy: undefined,
        sortOrder: "desc",
      });
      expect(result.total).toBe(2);
      expect(result.pagination).toEqual(pagination);
      expect(result.items[0]).toMatchObject({ id: ORDER_ID, status: "pending" });
      expect(result.items[0]).toHaveProperty("userId");
      expect(result.items[0]).toHaveProperty("customer", {
        id: USER_ID,
        name: "Oliver Diaz",
        email: "oliver@example.com",
      });
    });

    it("filtra por q resolviendo ids de clientes y por orderId", async () => {
      mockOrderRepository.findPage.mockResolvedValue({ items: [], total: 0, pagination: { page: 1, limit: 50, total: 0, pages: 1 } });
      mockUserRepository.findIdsByNameOrEmail.mockResolvedValue([USER_ID]);

      await orderService.getPageAdmin({ q: "oliver" });

      expect(mockUserRepository.findIdsByNameOrEmail).toHaveBeenCalledWith("oliver");
      expect(mockOrderRepository.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ userIds: [USER_ID], orderId: "oliver", status: undefined })
      );
    });

    it("retorna vacío si q no coincide con clientes ni es un orderId válido", async () => {
      mockUserRepository.findIdsByNameOrEmail.mockResolvedValue([]);

      const result = await orderService.getPageAdmin({ q: "sin-resultados" });

      expect(result).toEqual({ items: [], total: 0, pagination: { page: 1, limit: 50, total: 0, pages: 1 } });
      expect(mockOrderRepository.findPage).not.toHaveBeenCalled();
    });

    it("combina customerId con los ids resueltos por q", async () => {
      mockOrderRepository.findPage.mockResolvedValue({ items: [], total: 0, pagination: { page: 1, limit: 50, total: 0, pages: 1 } });
      mockUserRepository.findIdsByNameOrEmail.mockResolvedValue([USER_ID]);
      mockUserRepository.findByIds.mockResolvedValue([]);

      await orderService.getPageAdmin({ q: "oliver", customerId: "64b00000000000000000000099" });

      expect(mockOrderRepository.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ userIds: [USER_ID, "64b00000000000000000000099"] })
      );
    });
  });

  describe("getByIdAdmin", () => {
    it("retorna la orden por id con snapshot del cliente", async () => {
      const order = makeOrder();
      mockOrderRepository.findById.mockResolvedValue(order);
      mockUserRepository.findByIds.mockResolvedValue([makeUser()]);

      const result = await orderService.getByIdAdmin(ORDER_ID);

      expect(mockOrderRepository.findById).toHaveBeenCalledWith(ORDER_ID);
      expect(mockUserRepository.findByIds).toHaveBeenCalledWith([USER_ID]);
      expect(result).toMatchObject({ id: ORDER_ID, userId: USER_ID });
      expect(result).toHaveProperty("customer", { id: USER_ID, name: "Oliver Diaz", email: "oliver@example.com" });
    });

    it("lanza NotFoundError si no existe", async () => {
      mockOrderRepository.findById.mockResolvedValue(null);

      await expect(orderService.getByIdAdmin(ORDER_ID)).rejects.toThrow(NotFoundError);
      await expect(orderService.getByIdAdmin(ORDER_ID)).rejects.toThrow("Order not found");
    });
  });

  describe("updateStatusAdmin", () => {
    it("lanza NotFoundError si la orden no existe", async () => {
      mockOrderRepository.findById.mockResolvedValue(null);

      await expect(orderService.updateStatusAdmin(ORDER_ID, "processing")).rejects.toThrow(NotFoundError);
    });

    it("lanza InvalidDataError si la transición no está permitida para admin", async () => {
      mockOrderRepository.findById.mockResolvedValue(makeOrder());

      await expect(orderService.updateStatusAdmin(ORDER_ID, "completed")).rejects.toThrow(InvalidDataError);
      await expect(orderService.updateStatusAdmin(ORDER_ID, "completed")).rejects.toThrow(
        "Cannot transition from pending to completed"
      );
      expect(mockOrderRepository.updateStatus).not.toHaveBeenCalled();
    });

    it("permite a admin pending → confirmed y registra actor y nota", async () => {
      const updated = makeOrder({ status: "confirmed" });
      mockOrderRepository.findById.mockResolvedValue(makeOrder());
      mockOrderRepository.updateStatus.mockResolvedValue(updated);
      mockUserRepository.findByIds.mockResolvedValue([makeUser()]);

      const result = await orderService.updateStatusAdmin(ORDER_ID, "confirmed", "64b000000000000000000002", "Aprobado");

      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(
        ORDER_ID,
        "pending",
        "confirmed",
        expect.objectContaining({ status: "confirmed", by: "64b000000000000000000002", note: "Aprobado" })
      );
      expect(mockInventoryService.releaseReservation).not.toHaveBeenCalled();
      expect(mockInventoryService.completeReservation).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: "confirmed" });
      expect(result).toHaveProperty("customer");
    });

    it("permite a admin processing → shipped sin tocar inventario", async () => {
      const updated = makeOrder({ status: "shipped" });
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: "processing" }));
      mockOrderRepository.updateStatus.mockResolvedValue(updated);
      mockUserRepository.findByIds.mockResolvedValue([makeUser()]);

      const result = await orderService.updateStatusAdmin(ORDER_ID, "shipped");

      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(
        ORDER_ID,
        "processing",
        "shipped",
        expect.objectContaining({ status: "shipped" })
      );
      expect(mockInventoryService.releaseReservation).not.toHaveBeenCalled();
      expect(mockInventoryService.completeReservation).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: "shipped" });
    });

    it("permite a admin shipped → completed y consume la reserva", async () => {
      const completed = makeOrder({ status: "completed" });
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: "shipped" }));
      mockOrderRepository.updateStatus.mockResolvedValue(completed);
      mockInventoryService.completeReservation.mockResolvedValue(undefined);
      mockUserRepository.findByIds.mockResolvedValue([makeUser()]);

      const result = await orderService.updateStatusAdmin(ORDER_ID, "completed");

      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(
        ORDER_ID,
        "shipped",
        "completed",
        expect.objectContaining({ status: "completed" })
      );
      expect(mockInventoryService.completeReservation).toHaveBeenCalledWith(PRODUCT_ID, 2, ORDER_ID, undefined);
      expect(result).toMatchObject({ status: "completed" });
    });

    it("permite a admin cancelar processing y libera la reserva", async () => {
      const cancelled = makeOrder({ status: "cancelled" });
      mockOrderRepository.findById.mockResolvedValue(makeOrder({ status: "processing" }));
      mockOrderRepository.updateStatus.mockResolvedValue(cancelled);
      mockInventoryService.releaseReservation.mockResolvedValue(undefined);

      const result = await orderService.updateStatusAdmin(ORDER_ID, "cancelled");

      expect(mockOrderRepository.updateStatus).toHaveBeenCalledWith(
        ORDER_ID,
        "processing",
        "cancelled",
        expect.objectContaining({ status: "cancelled" })
      );
      expect(mockInventoryService.releaseReservation).toHaveBeenCalledWith(PRODUCT_ID, 2, ORDER_ID, undefined);
      expect(result).toMatchObject({ status: "cancelled" });
    });

    it("retorna la orden actual si la actualización concurrente devuelve null", async () => {
      const original = makeOrder();
      const current = makeOrder({ status: "confirmed" });
      mockOrderRepository.findById.mockResolvedValueOnce(original).mockResolvedValueOnce(current);
      mockOrderRepository.updateStatus.mockResolvedValue(null);

      const result = await orderService.updateStatusAdmin(ORDER_ID, "confirmed");

      expect(result).toMatchObject({ status: "confirmed" });
    });
  });
});
