import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAuthorizationUrl,
  createOAuthState,
  createPkce,
  decryptSecret,
  encryptSecret,
  hashOAuthState,
} from "./core.js";

test("gera PKCE e estado distintos", () => {
  const first = createPkce();
  const second = createPkce();
  assert.notEqual(first.verifier, second.verifier);
  assert.notEqual(first.challenge, second.challenge);
  assert.notEqual(hashOAuthState(createOAuthState()), hashOAuthState(createOAuthState()));
});

test("criptografa e autentica segredos", () => {
  const key = "uma-chave-de-teste-com-mais-de-trinta-e-dois-caracteres";
  const encrypted = encryptSecret("token-secreto", key);
  assert.notEqual(encrypted, "token-secreto");
  assert.equal(decryptSecret(encrypted, key), "token-secreto");
  assert.throws(() => decryptSecret(encrypted, `${key}-errada`));
});

test("monta autorizacao PKCE com redirect estatico", () => {
  const url = new URL(buildAuthorizationUrl({
    clientId: "123",
    redirectUri: "https://example.com/callback",
    state: "state",
    challenge: "challenge",
  }));
  assert.equal(url.origin, "https://auth.mercadolivre.com.br");
  assert.equal(url.searchParams.get("client_id"), "123");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});
