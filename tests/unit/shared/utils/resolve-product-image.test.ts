import { resolveProductImageUrl } from "../../../../src/shared/utils/resolve-product-image";
import { getStorageProvider } from "../../../../src/shared/storage/storage.factory";

jest.mock("../../../../src/shared/storage/storage.factory", () => ({
  getStorageProvider: jest.fn(),
}));

const getStorageProviderMock = getStorageProvider as jest.Mock;

const makeProvider = (publicUrl: (key: string) => string) => ({
  name: "local" as const,
  getPresignedUploadUrl: jest.fn(),
  getPublicUrl: jest.fn(publicUrl),
  objectExists: jest.fn(),
  inspectImage: jest.fn(),
  listObjects: jest.fn(),
  deleteObject: jest.fn(),
  deletePrefix: jest.fn(),
});

describe("resolveProductImageUrl", () => {
  const updatedAt = new Date("2026-01-01T00:00:00.000Z");
  const bust = `?v=${encodeURIComponent(updatedAt.toISOString())}`;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("imageKey + updatedAt -> URL pública + ?v=", () => {
    getStorageProviderMock.mockReturnValue(makeProvider((key) => `https://cdn.test/${key}`));

    const url = resolveProductImageUrl({ imageKey: "products/tablets/tablet-tcl.png", updatedAt });

    expect(getStorageProviderMock).toHaveBeenCalled();
    expect(url).toBe(`https://cdn.test/products/tablets/tablet-tcl.png${bust}`);
  });

  it("imageKey sin updatedAt -> URL sin ?v=", () => {
    getStorageProviderMock.mockReturnValue(makeProvider((key) => `https://cdn.test/${key}`));

    const url = resolveProductImageUrl({ imageKey: "products/tablets/tablet-tcl.png", updatedAt: undefined });

    expect(url).toBe("https://cdn.test/products/tablets/tablet-tcl.png");
  });

  it("imageKey + getPublicUrl() falla -> null", () => {
    getStorageProviderMock.mockReturnValue(
      makeProvider(() => {
        throw new Error("Invalid storage key");
      }),
    );

    const url = resolveProductImageUrl({ imageKey: "../escape.webp", updatedAt });

    expect(url).toBeNull();
  });

  it("https://... -> URL + ?v=", () => {
    const url = resolveProductImageUrl({ image: "https://example.com/arroz.png", updatedAt });

    expect(getStorageProviderMock).not.toHaveBeenCalled();
    expect(url).toBe(`https://example.com/arroz.png${bust}`);
  });

  it("https://...?foo=1 -> URL + &v=", () => {
    const url = resolveProductImageUrl({ image: "https://example.com/arroz.png?foo=1", updatedAt });

    expect(url).toBe(`https://example.com/arroz.png?foo=1&v=${encodeURIComponent(updatedAt.toISOString())}`);
  });

  it("/uploads/... -> URL + ?v=", () => {
    const url = resolveProductImageUrl({ image: "/uploads/products/example.png", updatedAt });

    expect(url).toBe(`/uploads/products/example.png${bust}`);
  });

  it("null/undefined -> null", () => {
    expect(resolveProductImageUrl({ image: undefined, imageKey: undefined, updatedAt })).toBeNull();
    expect(resolveProductImageUrl({ image: undefined, imageKey: undefined, updatedAt: undefined })).toBeNull();
    expect(resolveProductImageUrl({} as never)).toBeNull();
  });

  it('products/... sin imageKey -> null (no reintroduce bug legacy)', () => {
    const url = resolveProductImageUrl({ image: "products/tablets/tablet-tcl.png", updatedAt });

    expect(getStorageProviderMock).not.toHaveBeenCalled();
    expect(url).toBeNull();
  });
});
