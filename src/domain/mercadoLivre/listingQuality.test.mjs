import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMercadoLivreFamilyTitle,
  evaluateListingContent,
  extractYoutubeVideoId,
  orderListingPictureUrls,
} from "./listingQuality.js";

test("prioriza a melhor foto da mesma cor sem misturar outras cores", () => {
  const pictures = orderListingPictureUrls({
    variantImages: ["https://cdn.example/CM1027S-AZ-1-scaled.jpg"],
    productImages: [
      "https://cdn.example/perfil-canetas.jpg",
      "https://cdn.example/CM1027S-PR.jpg",
      "https://cdn.example/CM1027S-AZ-1-scaled.jpg",
      "https://cdn.example/CM10207S-AZ.jpg",
    ],
    variantAttributes: { Cor: "Azul" },
  });
  assert.equal(pictures[0], "https://cdn.example/CM10207S-AZ.jpg");
  assert.equal(pictures[1], "https://cdn.example/CM1027S-AZ-1-scaled.jpg");
  assert.equal(pictures[2], "https://cdn.example/perfil-canetas.jpg");
  assert.ok(!pictures.some((url) => url.includes("-PR.")));
});

test("mantem imagem propria principal quando nao ha pai da mesma cor", () => {
  assert.deepEqual(orderListingPictureUrls({
    variantImages: ["https://cdn.example/azul.jpg"],
    productImages: ["https://cdn.example/perfil.jpg", "https://cdn.example/preto-PT.jpg"],
    variantAttributes: { Cor: "Azul" },
  }), ["https://cdn.example/azul.jpg", "https://cdn.example/perfil.jpg"]);
});

test("extrai id de video dos formatos usados pelo fornecedor", () => {
  assert.equal(extractYoutubeVideoId("https://youtube.com/embed/aQ0YfDOdUzA?feature=share"), "aQ0YfDOdUzA");
  assert.equal(extractYoutubeVideoId("https://youtu.be/aQ0YfDOdUzA"), "aQ0YfDOdUzA");
  assert.equal(extractYoutubeVideoId("https://youtube.com/watch?v=aQ0YfDOdUzA"), "aQ0YfDOdUzA");
  assert.equal(extractYoutubeVideoId("invalido"), null);
});

test("gera titulo comercial com reserva para atributos da variacao", () => {
  const title = buildMercadoLivreFamilyTitle({
    title: "Caneta Esferografica Metalica de Aluminio",
    unitsPerPack: 200,
    description: "Produto para personalizacao a laser",
  });
  assert.ok(title.length >= 30);
  assert.ok(title.length <= 44);
  assert.ok(!title.includes("SCX"));
});

test("prontidao interna bloqueia menos de duas fotos sem fingir nota oficial", () => {
  const readiness = evaluateListingContent({ familyName: "Kit 50 Garrafas Aluminio Personalizadas", pictures: [{ source: "a" }], mainPictureAccepted: true });
  assert.equal(readiness.checks.find((item) => item.id === "pictures")?.blocking, true);
  assert.match(readiness.label, /nao e a nota oficial/);
});
