import * as offerService from "../../../src/modules/offers/services/offer.service";
import { NotFoundError } from "../../../src/shared/errors/not-found.error";
import { InvalidDataError } from "../../../src/shared/errors/invalid-data.error";
import { makeOffer, OFFER_ID } from "../factories/offer.factory";
import { makeProduct, PRODUCT_ID } from "../factories/product.factory";

jest.mock("../../../src/modules/offers/repositories/offer.repository", () =>
  require("../mocks/repositories").mockOfferRepository
);
jest.mock("../../../src/modules/products/repositories/product.repository", () =>
  require("../mocks/repositories").mockProductRepository
);

import { mockOfferRepository, mockProductRepository } from "../mocks/repositories";

describe("offer.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAll", () => {
    it("usa findAllActive para devolver solo ofertas vigentes", async () => {
      const offer = makeOffer();
      mockOfferRepository.findAllActive.mockResolvedValue([offer]);
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      const result = await offerService.getAll();

      expect(mockOfferRepository.findAllActive).toHaveBeenCalledWith(expect.any(Date));
      expect(mockOfferRepository.findAll).not.toHaveBeenCalled();
      expect(result).toEqual([
        expect.objectContaining({
          id: PRODUCT_ID,
          name: "Arroz 1kg",
          price: 80,
          originalPrice: 100,
          discountPrice: 80,
          discountPercentage: 20,
          image: expect.stringContaining("https://example.com/arroz.png"),
          categoryId: "64b0000000000000000000c1",
        }),
      ]);
      expect(result[0]).not.toHaveProperty("priceLabel");
      expect(result[0]).not.toHaveProperty("translations");
      expect(result[0]).not.toHaveProperty("imageKey");
    });

    it("omite ofertas cuyo producto ya no existe", async () => {
      mockOfferRepository.findAllActive.mockResolvedValue([makeOffer()]);
      mockProductRepository.findById.mockResolvedValue(null);

      const result = await offerService.getAll();

      expect(result).toEqual([]);
    });

    it("omite ofertas cuyo producto no es públicamente visible", async () => {
      mockOfferRepository.findAllActive.mockResolvedValue([makeOffer()]);
      mockProductRepository.findById.mockResolvedValue(makeProduct({ status: "inactive", isAvailable: false }));

      const result = await offerService.getAll();

      expect(result).toEqual([]);
    });

    it("omite ofertas de productos inactivos aunque estén disponibles", async () => {
      mockOfferRepository.findAllActive.mockResolvedValue([makeOffer()]);
      mockProductRepository.findById.mockResolvedValue(makeProduct({ status: "inactive", isAvailable: true }));

      const result = await offerService.getAll();

      expect(result).toEqual([]);
    });

    it("omite ofertas de productos activos pero no disponibles (isAvailable:false)", async () => {
      mockOfferRepository.findAllActive.mockResolvedValue([makeOffer()]);
      mockProductRepository.findById.mockResolvedValue(makeProduct({ status: "active", isAvailable: false }));

      const result = await offerService.getAll();

      expect(result).toEqual([]);
      expect(mockOfferRepository.findAllActive).toHaveBeenCalled();
    });

    it("respeta ?lang en el nombre con fallback al idioma raíz", async () => {
      mockOfferRepository.findAllActive.mockResolvedValue([makeOffer()]);
      mockProductRepository.findById.mockResolvedValue(
        makeProduct({ translations: { en: { name: "Rice 1kg", description: "EN" } } })
      );

      const en = await offerService.getAll("en");
      expect(en[0]).toMatchObject({ name: "Rice 1kg" });
      expect(en[0]).not.toHaveProperty("translations");

      const es = await offerService.getAll("es");
      expect(es[0]).toMatchObject({ name: "Arroz 1kg" });

      const porDefecto = await offerService.getAll();
      expect(porDefecto[0]).toMatchObject({ name: "Arroz 1kg" });
    });
  });

  describe("create", () => {
    it("crea la oferta con fechas válidas", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockOfferRepository.create.mockResolvedValue(makeOffer());

      const result = await offerService.create({
        productId: PRODUCT_ID,
        originalPrice: 100,
        discountPrice: 80,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
      });

      expect(mockOfferRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: PRODUCT_ID,
          originalPrice: 100,
          discountPrice: 80,
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          isActive: true,
        })
      );
      expect(result).toEqual(makeOffer());
    });

    it("lanza NotFoundError si el producto no existe", async () => {
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(
        offerService.create({ productId: PRODUCT_ID, originalPrice: 100, discountPrice: 80 })
      ).rejects.toThrow(NotFoundError);
      await expect(
        offerService.create({ productId: PRODUCT_ID, originalPrice: 100, discountPrice: 80 })
      ).rejects.toThrow("Product not found");
      expect(mockOfferRepository.create).not.toHaveBeenCalled();
    });

    it("lanza InvalidDataError si discountPrice no es menor a originalPrice", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      await expect(
        offerService.create({ productId: PRODUCT_ID, originalPrice: 100, discountPrice: 100 })
      ).rejects.toThrow(InvalidDataError);
      await expect(
        offerService.create({ productId: PRODUCT_ID, originalPrice: 100, discountPrice: 100 })
      ).rejects.toThrow("discountPrice must be less than originalPrice");
    });

    it("lanza InvalidDataError si startDate es posterior a endDate", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      await expect(
        offerService.create({
          productId: PRODUCT_ID,
          originalPrice: 100,
          discountPrice: 80,
          startDate: new Date("2026-12-31"),
          endDate: new Date("2026-01-01"),
        })
      ).rejects.toThrow(InvalidDataError);
      await expect(
        offerService.create({
          productId: PRODUCT_ID,
          originalPrice: 100,
          discountPrice: 80,
          startDate: new Date("2026-12-31"),
          endDate: new Date("2026-01-01"),
        })
      ).rejects.toThrow("startDate must be before or equal to endDate");
    });
  });

  describe("updateById", () => {
    it("actualiza los campos de la oferta", async () => {
      mockOfferRepository.findById.mockResolvedValue(makeOffer());
      mockOfferRepository.updateById.mockResolvedValue(makeOffer({ discountPrice: 70 }));

      const result = await offerService.updateById(OFFER_ID, { discountPrice: 70 });

      expect(mockOfferRepository.updateById).toHaveBeenCalledWith(
        OFFER_ID,
        expect.objectContaining({ discountPrice: 70, updatedAt: expect.any(Date) })
      );
      expect(result).toEqual(makeOffer({ discountPrice: 70 }));
    });

    it("lanza NotFoundError si no existe", async () => {
      mockOfferRepository.findById.mockResolvedValue(null);

      await expect(offerService.updateById(OFFER_ID, { isActive: false })).rejects.toThrow(NotFoundError);
    });

    it("lanza NotFoundError si el nuevo producto no existe", async () => {
      mockOfferRepository.findById.mockResolvedValue(makeOffer());
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(offerService.updateById(OFFER_ID, { productId: "inexistente" })).rejects.toThrow(NotFoundError);
    });

    it("lanza InvalidDataError si discountPrice iguala o supera originalPrice", async () => {
      mockOfferRepository.findById.mockResolvedValue(makeOffer());

      await expect(offerService.updateById(OFFER_ID, { discountPrice: 100 })).rejects.toThrow(InvalidDataError);
    });

    it("lanza InvalidDataError si las fechas quedan invertidas", async () => {
      mockOfferRepository.findById.mockResolvedValue(makeOffer({ endDate: new Date("2026-01-01") }));

      await expect(offerService.updateById(OFFER_ID, { startDate: new Date("2026-06-01") })).rejects.toThrow(
        InvalidDataError
      );
    });

    it("permite limpiar endDate con null", async () => {
      mockOfferRepository.findById.mockResolvedValue(makeOffer());
      mockOfferRepository.updateById.mockResolvedValue(makeOffer({ endDate: undefined }));

      await offerService.updateById(OFFER_ID, { endDate: null });

      expect(mockOfferRepository.updateById).toHaveBeenCalledWith(
        OFFER_ID,
        expect.objectContaining({ endDate: null, updatedAt: expect.any(Date) })
      );
    });
  });

  describe("remove", () => {
    it("soft-borra la oferta si existe", async () => {
      mockOfferRepository.findById.mockResolvedValue(makeOffer());
      mockOfferRepository.softDeleteById.mockResolvedValue(true);

      await expect(offerService.remove(OFFER_ID)).resolves.toBeUndefined();
      expect(mockOfferRepository.softDeleteById).toHaveBeenCalledWith(OFFER_ID);
    });

    it("lanza NotFoundError si no existe", async () => {
      mockOfferRepository.findById.mockResolvedValue(null);

      await expect(offerService.remove(OFFER_ID)).rejects.toThrow(NotFoundError);
      expect(mockOfferRepository.softDeleteById).not.toHaveBeenCalled();
    });
  });

  describe("restore", () => {
    it("restaura la oferta soft-borrada", async () => {
      mockOfferRepository.restoreById.mockResolvedValue(true);

      await expect(offerService.restore(OFFER_ID)).resolves.toBeUndefined();
      expect(mockOfferRepository.restoreById).toHaveBeenCalledWith(OFFER_ID);
    });

    it("lanza NotFoundError si la oferta no existe (ni siquiera borrada)", async () => {
      mockOfferRepository.restoreById.mockResolvedValue(false);

      await expect(offerService.restore(OFFER_ID)).rejects.toThrow(NotFoundError);
    });
  });
});
