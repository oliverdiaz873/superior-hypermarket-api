import request from "supertest";
import app from "../../../src/app";
import { OfferModel } from "../../../src/modules/offers/models/offer.model";
import { createTestProduct } from "../helpers/product.helper";
import { createTestOffer } from "../helpers/offer.helper";
import { createAuthHeaders, createAuthToken } from "../helpers/auth.helper";
import { createTestAdmin } from "../helpers/user.helper";
import type { User } from "../../../src/types";

describe("E2E: /api/offers visibilidad pÃºblica (F2)", () => {
  let admin: User;
  let adminHeaders: { Authorization: string };

  beforeEach(async () => {
    admin = await createTestAdmin();
    adminHeaders = createAuthHeaders(createAuthToken(admin));
  });

  it("solo devuelve ofertas de productos pÃºblicamente visibles (status + isAvailable)", async () => {
    const visible = await createTestProduct({ name: "Oferta Visible", status: "active", isAvailable: true });
    const hiddenInactive = await createTestProduct({ name: "Oferta Inactiva", status: "inactive", isAvailable: false });

    await createTestOffer(visible.id);
    await createTestOffer(hiddenInactive.id);

    const res = await request(app).get("/api/offers");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const ids = res.body.data.map((o: { id: string }) => o.id);
    expect(ids).toContain(visible.id);
    expect(ids).not.toContain(hiddenInactive.id);
  });

  it("un draft de producto no aparece en ofertas; al activarlo sÃ­", async () => {
    const draft = await createTestProduct({ name: "Draft Oferta", status: "inactive", isAvailable: false });
    await createTestOffer(draft.id);

    const hidden = await request(app).get("/api/offers");
    expect(hidden.body.data.map((o: { id: string }) => o.id)).not.toContain(draft.id);

    await request(app)
      .patch(`/api/products/${draft.id}`)
      .set(adminHeaders)
      .send({ status: "active", isAvailable: true })
      .expect(200);

    const shown = await request(app).get("/api/offers");
    expect(shown.body.data.map((o: { id: string }) => o.id)).toContain(draft.id);
  });

  it("estado inconsistente inactive + isAvailable:true no aparece en ofertas", async () => {
    const product = await createTestProduct({ name: "Inconsistente", status: "inactive", isAvailable: true });
    await createTestOffer(product.id);

    const res = await request(app).get("/api/offers");

    expect(res.body.data.map((o: { id: string }) => o.id)).not.toContain(product.id);
  });

  it("producto activo pero no disponible (isAvailable:false) no aparece en ofertas", async () => {
    const product = await createTestProduct({ name: "Activo No Disponible", status: "active", isAvailable: false });
    await createTestOffer(product.id);

    const res = await request(app).get("/api/offers");

    expect(res.status).toBe(200);
    expect(res.body.data.map((o: { id: string }) => o.id)).not.toContain(product.id);
  });

  it("shape del contrato F2: sin priceLabel, sin claves internas, imagen pÃºblica", async () => {
    const product = await createTestProduct({ name: "Oferta Shape", status: "active", isAvailable: true });
    await createTestOffer(product.id);

    const res = await request(app).get("/api/offers");
    const item = res.body.data.find((o: { id: string }) => o.id === product.id);

    expect(item).toBeDefined();
    expect(item).toMatchObject({
      name: "Oferta Shape",
      price: 80,
      originalPrice: 100,
      discountPrice: 80,
      discountPercentage: 20,
      categoryId: "cat_granos",
    });
    expect(item.image).toContain("https://example.com/arroz.png");
    expect(item).not.toHaveProperty("priceLabel");
    expect(item).not.toHaveProperty("translations");
    expect(item).not.toHaveProperty("imageKey");
    expect(item).not.toHaveProperty("imageThumbnailKey");
    expect(item).not.toHaveProperty("__v");
  });

  it("?lang localiza name y no expone translations", async () => {
    const product = await createTestProduct({
      name: "Oferta Lang",
      status: "active",
      isAvailable: true,
      translations: { en: { name: "Lang Offer", description: "EN" } },
    });
    await createTestOffer(product.id);

    const res = await request(app).get("/api/offers").query({ lang: "en" });
    const item = res.body.data.find((o: { id: string }) => o.id === product.id);

    expect(item).toBeDefined();
    expect(item.name).toBe("Lang Offer");
    expect(item).not.toHaveProperty("translations");
  });

  it("productos huÃ©rfanos (oferta sin producto) se excluyen en silencio", async () => {
    await OfferModel.create({
      productId: "prod_inexistente",
      originalPrice: 100,
      discountPrice: 80,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      isActive: true,
    });

    const visible = await createTestProduct({ name: "Oferta Real", status: "active", isAvailable: true });
    await createTestOffer(visible.id);

    const res = await request(app).get("/api/offers");
    expect(res.status).toBe(200);
    expect(res.body.data.map((o: { id: string }) => o.id)).toEqual([visible.id]);
  });
});
