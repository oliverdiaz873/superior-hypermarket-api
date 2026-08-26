import * as productService from "../../../src/modules/products/services/product.service";
import { NotFoundError } from "../../../src/shared/errors/not-found.error";
import { InvalidDataError } from "../../../src/shared/errors/invalid-data.error";
import { ConflictError } from "../../../src/shared/errors/conflict.error";
import { makeProduct, PRODUCT_ID } from "../factories/product.factory";
import { makeCategory, CATEGORY_ID } from "../factories/category.factory";
import { makeBrand, BRAND_ID } from "../factories/brand.factory";
import { getStorageProvider } from "../../../src/shared/storage/storage.factory";

jest.mock("../../../src/modules/products/repositories/product.repository", () =>
  require("../mocks/repositories").mockProductRepository
);
jest.mock("../../../src/modules/categories/repositories/category.repository", () =>
  require("../mocks/repositories").mockCategoryRepository
);
jest.mock("../../../src/modules/brands/repositories/brand.repository", () =>
  require("../mocks/repositories").mockBrandRepository
);
jest.mock("../../../src/modules/inventory/services/inventory.service", () =>
  require("../mocks/repositories").mockInventoryService
);
jest.mock("../../../src/shared/storage/storage.factory", () => ({
  getStorageProvider: jest.fn(),
}));

import {
  mockProductRepository,
  mockCategoryRepository,
  mockBrandRepository,
  mockInventoryService,
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

const imageKeyOf = (suffix: string): string => `products/${PRODUCT_ID}/${suffix}.webp`;

describe("product.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getStorageProviderMock.mockReturnValue(storageProviderMock);
  });

  describe("getAll", () => {
    it("retorna todos los productos", async () => {
      const products = [makeProduct()];
      mockProductRepository.findAll.mockResolvedValue(products);

      const result = await productService.getAll();

      expect(mockProductRepository.findAll).toHaveBeenCalledTimes(1);
      expect(result[0].image).toContain("https://example.com/arroz.png");
      expect(result[0].image).toContain("?v=");
    });

    it("omite los productos no disponibles en la lista pública (F1)", async () => {
      mockProductRepository.findAll.mockResolvedValue([
        makeProduct(),
        makeProduct({ id: "64b0000000000000000000a2", isAvailable: false, status: "inactive" }),
      ]);

      const result = await productService.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(PRODUCT_ID);
    });
  });

  describe("getPage", () => {
    it("normaliza la consulta y delega en findPage", async () => {
      const products = [makeProduct()];
      mockProductRepository.findPage.mockResolvedValue({
        items: products,
        total: 1,
        pagination: { page: 2, limit: 10, total: 1, pages: 1 },
      });

      const result = await productService.getPage({
        page: "2",
        limit: "10",
        q: "arroz",
        category: "Granos",
        status: "active",
        sortBy: "name",
        sortOrder: "asc",
      });

      expect(mockProductRepository.findPage).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        q: "arroz",
        category: "Granos",
        brand: undefined,
        status: "active",
        isAvailable: true,
        sortBy: "name",
        sortOrder: "asc",
      });
      expect(result.data[0].image).toContain("https://example.com/arroz.png");
      expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, pages: 1 });
    });

    it("aplica defaults cuando faltan page, limit y sort", async () => {
      mockProductRepository.findPage.mockResolvedValue({
        items: [],
        total: 0,
        pagination: { page: 1, limit: 50, total: 0, pages: 1 },
      });

      await productService.getPage({});

      expect(mockProductRepository.findPage).toHaveBeenCalledWith({
        page: 1,
        limit: 50,
        q: undefined,
        category: undefined,
        brand: undefined,
        status: "active",
        isAvailable: true,
        sortBy: undefined,
        sortOrder: "desc",
      });
    });

    it("propaga ?featured=true como filtro featured al repositorio", async () => {
      mockProductRepository.findPage.mockResolvedValue({
        items: [],
        total: 0,
        pagination: { page: 1, limit: 50, total: 0, pages: 1 },
      });

      await productService.getPage({ featured: "true" });

      expect(mockProductRepository.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ featured: true })
      );
    });

    it("deja featured sin filtrar cuando no viene ?featured=true", async () => {
      mockProductRepository.findPage.mockResolvedValue({
        items: [],
        total: 0,
        pagination: { page: 1, limit: 50, total: 0, pages: 1 },
      });

      await productService.getPage({});

      const call = mockProductRepository.findPage.mock.calls[0][0];
      expect(call.featured).toBeUndefined();
    });

    it("resuelve ?lang=en en el paginado y nunca expone translations", async () => {
      const products = [
        makeProduct({ translations: { en: { name: "Rice 1kg", description: "White rice" } } }),
      ];
      mockProductRepository.findPage.mockResolvedValue({
        items: products,
        total: 1,
        pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      });

      const result = await productService.getPage({ lang: "en" });

      expect(result.data[0].name).toBe("Rice 1kg");
      expect(result.data[0].description).toBe("White rice");
      expect(result.data[0]).not.toHaveProperty("translations");
    });

    it("getPage con lang ausente o inválido devuelve root (ES)", async () => {
      const products = [makeProduct({ translations: { en: { name: "Rice 1kg" } } })];
      mockProductRepository.findPage.mockResolvedValue({
        items: products,
        total: 1,
        pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      });

      const noLang = await productService.getPage({});
      expect(noLang.data[0].name).toBe("Arroz 1kg");

      const invalidLang = await productService.getPage({ lang: "es-es" });
      expect(invalidLang.data[0].name).toBe("Arroz 1kg");
    });

    it("no amplía el catálogo hacia ?status=inactive: responde vacío sin consultar", async () => {
      const result = await productService.getPage({ status: "inactive" });

      expect(mockProductRepository.findPage).not.toHaveBeenCalled();
      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it("descarta valores inválidos de page, limit, status y sortBy", async () => {
      mockProductRepository.findPage.mockResolvedValue({
        items: [],
        total: 0,
        pagination: { page: 1, limit: 50, total: 0, pages: 1 },
      });

      await productService.getPage({
        page: "abc",
        limit: "100000",
        status: "hacked",
        sortBy: "evil",
        sortOrder: "sideways",
      });

      expect(mockProductRepository.findPage).toHaveBeenCalledWith({
        page: 1,
        limit: 100,
        q: undefined,
        category: undefined,
        brand: undefined,
        status: "active",
        isAvailable: true,
        sortBy: undefined,
        sortOrder: "desc",
      });
    });
  });

  describe("getById", () => {
    it("retorna el producto si existe", async () => {
      const product = makeProduct();
      mockProductRepository.findById.mockResolvedValue(product);

      const result = await productService.getById(PRODUCT_ID);

      expect(mockProductRepository.findById).toHaveBeenCalledWith(PRODUCT_ID);
      expect(result.image).toContain("https://example.com/arroz.png");
      expect(result.image).toContain("?v=");
    });

    it("lanza NotFoundError si el producto no existe", async () => {
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(productService.getById(PRODUCT_ID)).rejects.toThrow(NotFoundError);
      await expect(productService.getById(PRODUCT_ID)).rejects.toThrow("Product not found");
    });

    it("lanza NotFoundError si el producto no está disponible públicamente (F1)", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct({ isAvailable: false, status: "inactive" }));

      await expect(productService.getById(PRODUCT_ID)).rejects.toThrow(NotFoundError);
      await expect(productService.getById(PRODUCT_ID)).rejects.toThrow("Product not found");
    });

    it("lanza NotFoundError si el producto está inactive aunque isAvailable sea true (gate conjunto)", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct({ isAvailable: true, status: "inactive" }));

      await expect(productService.getById(PRODUCT_ID)).rejects.toThrow(NotFoundError);
    });
  });

  describe("create", () => {
    const base = { name: "Arroz 1kg", price: 89.5, categoryId: CATEGORY_ID };

    it("crea el producto draft con sku generado y crea inventario en cascada", async () => {
      mockCategoryRepository.findById.mockResolvedValue(makeCategory());
      mockProductRepository.create.mockResolvedValue(makeProduct());
      mockInventoryService.createForProduct.mockResolvedValue({ productId: PRODUCT_ID, stock: 0 });

      const result = await productService.create({ ...base, stock: 15, minStock: 5 });

      expect(mockProductRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(String),
          sku: expect.stringContaining("arroz-1kg"),
          name: "Arroz 1kg",
          categoryId: CATEGORY_ID,
          category: { name: "Bebidas", slug: "bebidas" },
          status: "inactive",
          isAvailable: false,
          featured: false,
        })
      );
      expect(mockProductRepository.create.mock.calls[0][0].image).toBeUndefined();
      expect(mockInventoryService.createForProduct).toHaveBeenCalledWith({
        productId: PRODUCT_ID,
        stock: 15,
        minStock: 5,
      });
      expect(result.image).toContain("https://example.com/arroz.png");
      expect(result.image).toContain("?v=");
    });

    it("crea un draft sin imagen (status inactive, isAvailable false)", async () => {
      mockCategoryRepository.findById.mockResolvedValue(makeCategory());
      mockProductRepository.create.mockResolvedValue(makeProduct({ image: undefined }));
      mockInventoryService.createForProduct.mockResolvedValue({ productId: PRODUCT_ID, stock: 0 });

      const result = await productService.create({ name: "Producto sin imagen", price: 10, categoryId: CATEGORY_ID });

      const createArg = mockProductRepository.create.mock.calls[0][0];
      expect(createArg).toMatchObject({
        name: "Producto sin imagen",
        status: "inactive",
        isAvailable: false,
      });
      expect(createArg.image).toBeUndefined();
      expect(result.image).toBeNull();
    });

    it("usa el sku provisto y resuelve el embed de marca", async () => {
      mockCategoryRepository.findById.mockResolvedValue(makeCategory());
      mockBrandRepository.findById.mockResolvedValue(makeBrand());
      mockProductRepository.create.mockResolvedValue(makeProduct({ brandId: BRAND_ID, brand: { name: "Coca-Cola", slug: "coca-cola" } }));

      await productService.create({ ...base, sku: "SKU-ALFA", brandId: BRAND_ID });

      expect(mockProductRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: "SKU-ALFA",
          brandId: BRAND_ID,
          brand: { name: "Coca-Cola", slug: "coca-cola" },
        })
      );
    });

    it("lanza InvalidDataError si falta el nombre", async () => {
      await expect(productService.create({ ...base, name: "" })).rejects.toThrow(InvalidDataError);
      expect(mockProductRepository.create).not.toHaveBeenCalled();
    });

    it("lanza InvalidDataError si el precio es negativo", async () => {
      await expect(productService.create({ ...base, price: -1 })).rejects.toThrow(InvalidDataError);
    });

    it("lanza InvalidDataError si las traducciones tienen name vacío", async () => {
      await expect(
        productService.create({ ...base, translations: { es: { name: "  " } } })
      ).rejects.toThrow(InvalidDataError);
    });

    it("permite translations.es y translations.en en el contrato de creación (F4 no redefine POST)", async () => {
      mockCategoryRepository.findById.mockResolvedValue(makeCategory());
      mockProductRepository.findBySku.mockResolvedValue(null);
      mockProductRepository.create.mockResolvedValue(makeProduct());

      await productService.create({
        ...base,
        translations: {
          es: { name: "Leche Entera", description: "Leche entera pasteurizada." },
          en: { name: "Whole Milk", description: "Pasteurized whole milk." },
        },
      });

      expect(mockProductRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          translations: {
            es: { name: "Leche Entera", description: "Leche entera pasteurizada." },
            en: { name: "Whole Milk", description: "Pasteurized whole milk." },
          },
        })
      );
    });

    it("permite solo translations.es en la creación", async () => {
      mockCategoryRepository.findById.mockResolvedValue(makeCategory());
      mockProductRepository.findBySku.mockResolvedValue(null);
      mockProductRepository.create.mockResolvedValue(makeProduct());

      await productService.create({ ...base, translations: { es: { name: "Leche Entera" } } });

      expect(mockProductRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ translations: { es: { name: "Leche Entera" } } })
      );
    });

    it("lanza NotFoundError si la categoría no existe", async () => {
      mockCategoryRepository.findById.mockResolvedValue(null);

      await expect(productService.create(base)).rejects.toThrow(NotFoundError);
      await expect(productService.create(base)).rejects.toThrow("Category not found");
      expect(mockProductRepository.create).not.toHaveBeenCalled();
    });

    it("lanza NotFoundError si la marca no existe", async () => {
      mockCategoryRepository.findById.mockResolvedValue(makeCategory());
      mockBrandRepository.findById.mockResolvedValue(null);

      await expect(productService.create({ ...base, brandId: BRAND_ID })).rejects.toThrow(NotFoundError);
      await expect(productService.create({ ...base, brandId: BRAND_ID })).rejects.toThrow("Brand not found");
    });

    it("lanza ConflictError si el sku ya existe", async () => {
      mockCategoryRepository.findById.mockResolvedValue(makeCategory());
      mockProductRepository.findBySku.mockResolvedValue(makeProduct());

      await expect(productService.create({ ...base, sku: "SKU-ALFA" })).rejects.toThrow(ConflictError);
      await expect(productService.create({ ...base, sku: "SKU-ALFA" })).rejects.toThrow(
        "Product sku already exists: SKU-ALFA"
      );
      expect(mockProductRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("updateById", () => {
    it("actualiza los campos permitidos", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockProductRepository.updateById.mockResolvedValue(makeProduct({ name: "Arroz Premium" }));

      const result = await productService.updateById(PRODUCT_ID, { name: "Arroz Premium" });

      expect(mockProductRepository.updateById).toHaveBeenCalledWith(
        PRODUCT_ID,
        expect.objectContaining({ name: "Arroz Premium", updatedAt: expect.any(Date) }),
        { unset: [] }
      );
      expect(result.name).toBe("Arroz Premium");
      expect(result.image).toContain("https://example.com/arroz.png");
    });

    it("lanza NotFoundError si el producto no existe", async () => {
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(productService.updateById(PRODUCT_ID, { name: "X" })).rejects.toThrow(NotFoundError);
    });

    it("lanza InvalidDataError si el nombre queda vacío", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      await expect(productService.updateById(PRODUCT_ID, { name: "  " })).rejects.toThrow(InvalidDataError);
    });

    it("lanza ConflictError si el sku ya pertenece a otro producto", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockProductRepository.findBySku.mockResolvedValue(makeProduct({ id: "otro-id", sku: "SKU-ALFA" }));

      await expect(productService.updateById(PRODUCT_ID, { sku: "SKU-ALFA" })).rejects.toThrow(ConflictError);
    });

    it("re-sincroniza el embed de categoría al cambiar categoryId", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockCategoryRepository.findById.mockResolvedValue(makeCategory({ name: "Granos", slug: "granos" }));
      mockProductRepository.updateById.mockResolvedValue(
        makeProduct({ categoryId: CATEGORY_ID, category: { name: "Granos", slug: "granos" } })
      );

      await productService.updateById(PRODUCT_ID, { categoryId: CATEGORY_ID });

      expect(mockProductRepository.updateById).toHaveBeenCalledWith(
        PRODUCT_ID,
        expect.objectContaining({ categoryId: CATEGORY_ID, category: { name: "Granos", slug: "granos" } }),
        { unset: [] }
      );
    });

    it("quita la marca cuando brandId es null", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct({ brandId: BRAND_ID, brand: { name: "Coca-Cola", slug: "coca-cola" } }));
      mockProductRepository.updateById.mockResolvedValue(makeProduct({ brandId: undefined, brand: undefined }));

      await productService.updateById(PRODUCT_ID, { brandId: null });

      expect(mockProductRepository.updateById).toHaveBeenCalledWith(
        PRODUCT_ID,
        expect.objectContaining({ updatedAt: expect.any(Date) }),
        { unset: ["brandId", "brand"] }
      );
    });

    it("actualiza el flag featured cuando viene en el PATCH", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct({ featured: false }));
      mockProductRepository.updateById.mockResolvedValue(makeProduct({ featured: true }));

      const result = await productService.updateById(PRODUCT_ID, { featured: true });

      expect(mockProductRepository.updateById).toHaveBeenCalledWith(
        PRODUCT_ID,
        expect.objectContaining({ featured: true, updatedAt: expect.any(Date) }),
        { unset: [] }
      );
      expect(result.featured).toBe(true);
    });
  });

  describe("remove", () => {
    it("soft-borra el producto conservando el inventario", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockProductRepository.softDeleteById.mockResolvedValue(true);

      await expect(productService.remove(PRODUCT_ID)).resolves.toBeUndefined();

      expect(mockProductRepository.softDeleteById).toHaveBeenCalledWith(PRODUCT_ID);
      expect(mockInventoryService.removeByProductId).not.toHaveBeenCalled();
    });

    it("lanza NotFoundError si el producto no existe", async () => {
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(productService.remove(PRODUCT_ID)).rejects.toThrow(NotFoundError);
      expect(mockProductRepository.softDeleteById).not.toHaveBeenCalled();
    });
  });

  describe("restore", () => {
    it("restaura el producto soft-borrado", async () => {
      mockProductRepository.restoreById.mockResolvedValue(true);

      await expect(productService.restore(PRODUCT_ID)).resolves.toBeUndefined();
      expect(mockProductRepository.restoreById).toHaveBeenCalledWith(PRODUCT_ID);
    });

    it("lanza NotFoundError si el producto no existe (ni siquiera borrado)", async () => {
      mockProductRepository.restoreById.mockResolvedValue(false);

      await expect(productService.restore(PRODUCT_ID)).rejects.toThrow(NotFoundError);
    });
  });

  describe("getById con lang (F1)", () => {
    it("resuelve translations[lang] con fallback a la raíz", async () => {
      mockProductRepository.findById.mockResolvedValue(
        makeProduct({
          name: "Arroz",
          description: "Arroz blanco",
          translations: { es: { name: "Arroz (ES)" }, en: { name: "Rice", description: "White rice" } },
        })
      );

      const result = await productService.getById(PRODUCT_ID, "en");
      expect(result.name).toBe("Rice");
      expect(result.description).toBe("White rice");

      const resultEs = await productService.getById(PRODUCT_ID, "es");
      expect(resultEs.name).toBe("Arroz (ES)");
      expect(resultEs.description).toBe("Arroz blanco");
    });

    it("con lang ausente o inválido devuelve root (ES)", async () => {
      mockProductRepository.findById.mockResolvedValue(
        makeProduct({
          translations: { en: { name: "Rice", description: "White rice" } },
        })
      );

      const noLang = await productService.getById(PRODUCT_ID);
      expect(noLang.name).toBe("Arroz 1kg");
      expect(noLang.description).toBe("Arroz blanco premium");

      const invalidLang = await productService.getById(PRODUCT_ID, "fr");
      expect(invalidLang.name).toBe("Arroz 1kg");
      expect(invalidLang.description).toBe("Arroz blanco premium");
    });

    it("no expone imageKey ni translations en la respuesta pública", async () => {
      mockProductRepository.findById.mockResolvedValue(
        makeProduct({
          imageKey: imageKeyOf("a81f23"),
          translations: { es: { name: "X" } },
        })
      );

      const result = await productService.getById(PRODUCT_ID);

      expect(result).not.toHaveProperty("imageKey");
      expect(result).not.toHaveProperty("translations");
      expect(storageProviderMock.getPublicUrl).toHaveBeenCalledWith(imageKeyOf("a81f23"));
      expect(result.image).toContain("?v=");
    });
  });

  describe("updateById con imageKey (flujo F1)", () => {
    it("confirma la imagen nueva y borra la anterior tras actualizar Mongo", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct({ imageKey: imageKeyOf("old") }));
      mockProductRepository.updateById.mockResolvedValue(makeProduct({ imageKey: imageKeyOf("new") }));
      storageProviderMock.inspectImage.mockResolvedValue({ exists: true, validContentType: true });

      await productService.updateById(PRODUCT_ID, { imageKey: imageKeyOf("new") });

      expect(mockProductRepository.updateById).toHaveBeenCalledWith(
        PRODUCT_ID,
        expect.objectContaining({
          imageKey: imageKeyOf("new"),
        }),
        { unset: ["image"] }
      );
      expect(storageProviderMock.deleteObject).toHaveBeenCalledWith(imageKeyOf("old"));
    });

    it("expone a la imagen vigente y no borra si es la misma key", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct({ imageKey: imageKeyOf("same") }));
      mockProductRepository.updateById.mockResolvedValue(makeProduct({ imageKey: imageKeyOf("same") }));
      storageProviderMock.inspectImage.mockResolvedValue({ exists: true, validContentType: true });

      await productService.updateById(PRODUCT_ID, { imageKey: imageKeyOf("same") });

      expect(storageProviderMock.deleteObject).not.toHaveBeenCalled();
    });

    it("si Mongo falla, conserva la imagen anterior y no borra nada (rollback lógico)", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct({ imageKey: imageKeyOf("old") }));
      storageProviderMock.inspectImage.mockResolvedValue({ exists: true, validContentType: true });
      mockProductRepository.updateById.mockRejectedValue(new Error("mongo down"));

      await expect(productService.updateById(PRODUCT_ID, { imageKey: imageKeyOf("new") })).rejects.toThrow("mongo down");
      expect(storageProviderMock.deleteObject).not.toHaveBeenCalled();
    });

    it("rechaza una imageKey que no pertenezca al producto", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      await expect(productService.updateById(PRODUCT_ID, { imageKey: "products/other-id/a.webp" })).rejects.toThrow(
        InvalidDataError
      );
      expect(mockProductRepository.updateById).not.toHaveBeenCalled();
    });

    it("rechaza una imageKey insegura", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      await expect(productService.updateById(PRODUCT_ID, { imageKey: "../escape.webp" })).rejects.toThrow(
        InvalidDataError
      );
      expect(mockProductRepository.updateById).not.toHaveBeenCalled();
    });

    it("lanza NotFoundError si el objeto no existe en storage", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      storageProviderMock.inspectImage.mockResolvedValue({ exists: false, validContentType: false });

      await expect(productService.updateById(PRODUCT_ID, { imageKey: imageKeyOf("missing") })).rejects.toThrow(NotFoundError);
      expect(mockProductRepository.updateById).not.toHaveBeenCalled();
    });

    it("lanza InvalidDataError si el objeto no es una imagen válida", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      storageProviderMock.inspectImage.mockResolvedValue({ exists: true, validContentType: false });

      await expect(productService.updateById(PRODUCT_ID, { imageKey: imageKeyOf("bad") })).rejects.toThrow(InvalidDataError);
      expect(mockProductRepository.updateById).not.toHaveBeenCalled();
    });
  });

  describe("F4: updateById con translations (merge por lengua)", () => {
    it("merge no destructivo: conserva en.name al actualizar solo en.description", async () => {
      mockProductRepository.findById.mockResolvedValue(
        makeProduct({
          translations: { en: { name: "Rice", description: "EN old" } },
        })
      );
      mockProductRepository.updateById.mockResolvedValue(
        makeProduct({
          translations: { en: { name: "Ground", description: "EN new" } },
        })
      );

      const result = await productService.updateById(PRODUCT_ID, {
        translations: { en: { description: "EN new" } },
      });

      expect(mockProductRepository.updateById).toHaveBeenCalledWith(
        PRODUCT_ID,
expect.objectContaining({
      translations: { en: { name: "Rice", description: "EN new" } },
    }),
    expect.anything()
      );
      expect(result).not.toHaveProperty("translations");
    });

    it("rechaza translations.es (idioma no administrable en este contrato)", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      await expect(
        productService.updateById(PRODUCT_ID, { translations: { es: { name: "X" } } } as never)
      ).rejects.toThrow(InvalidDataError);
      expect(mockProductRepository.updateById).not.toHaveBeenCalled();
    });

    it("rechaza un idioma desconocido", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      await expect(
        productService.updateById(PRODUCT_ID, { translations: { fr: { name: "X" } } } as never)
      ).rejects.toThrow(InvalidDataError);
      expect(mockProductRepository.updateById).not.toHaveBeenCalled();
    });

    it("rechaza en.name vacío en update", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());

      await expect(
        productService.updateById(PRODUCT_ID, { translations: { en: { name: "  " } } })
      ).rejects.toThrow(InvalidDataError);
      expect(mockProductRepository.updateById).not.toHaveBeenCalled();
    });
  });

  describe("F4: updateAdminById devuelve el boundary administrativo", () => {
    it("expone translations e imageKey y conserva root tras editar", async () => {
      mockProductRepository.findById.mockResolvedValue(
        makeProduct({ name: "Arroz", translations: { en: { name: "Rice" } } })
      );
      mockProductRepository.updateById.mockResolvedValue(
        makeProduct({ name: "Arroz Premium", translations: { en: { name: "Premium Rice", description: "D" } } })
      );

      const result = await productService.updateAdminById(PRODUCT_ID, {
        name: "Arroz Premium",
        translations: { en: { description: "D" } },
      });

      expect(result.name).toBe("Arroz Premium");
      expect(result.translations).toEqual({ en: { name: "Premium Rice", description: "D" } });
    });

    it("404 cuando el producto no existe", async () => {
      mockProductRepository.findById.mockResolvedValue(null);

      await expect(productService.updateAdminById(PRODUCT_ID, {})).rejects.toThrow(NotFoundError);
    });
  });

  describe("F4: getAdminPage con featured", () => {
    it("propaga ?featured=true al repositorio conservando el filtro admin", async () => {
      mockProductRepository.findPage.mockResolvedValue({
        items: [],
        total: 0,
        pagination: { page: 1, limit: 50, total: 0, pages: 1 },
      });

      await productService.getAdminPage({ featured: "true" });

      expect(mockProductRepository.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ featured: true })
      );
    });

    it("devuelve el boundary admin con featured cuando el repo lo reporta", async () => {
      const product = makeProduct({ featured: true });
      mockProductRepository.findPage.mockResolvedValue({
        items: [product],
        total: 1,
        pagination: { page: 1, limit: 50, total: 1, pages: 1 },
      });

      const result = await productService.getAdminPage({});

      expect(result.data[0].featured).toBe(true);
      expect(result.data[0]).toMatchObject({ id: product.id, name: product.name });
    });
  });

  describe("remove conserva storage e inventario (E6.1.1)", () => {
    it("soft-borra el producto sin tocar inventario ni prefijo de imágenes", async () => {
      mockProductRepository.findById.mockResolvedValue(makeProduct());
      mockProductRepository.softDeleteById.mockResolvedValue(true);

      await productService.remove(PRODUCT_ID);

      expect(mockProductRepository.softDeleteById).toHaveBeenCalledWith(PRODUCT_ID);
      expect(mockInventoryService.removeByProductId).not.toHaveBeenCalled();
      expect(storageProviderMock.deletePrefix).not.toHaveBeenCalled();
    });
  });
});
