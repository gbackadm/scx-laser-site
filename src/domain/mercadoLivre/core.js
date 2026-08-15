import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const TOKEN_VERSION = "v1";

export function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

export function createPkce() {
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function createOAuthState() {
  return base64Url(randomBytes(32));
}

export function hashOAuthState(state) {
  return createHash("sha256").update(state).digest("base64url");
}

function encryptionKey(secret) {
  if (!secret || secret.length < 32) {
    throw new Error("MERCADO_LIVRE_TOKEN_ENCRYPTION_KEY precisa ter ao menos 32 caracteres.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [TOKEN_VERSION, base64Url(iv), base64Url(cipher.getAuthTag()), base64Url(encrypted)].join(".");
}

export function decryptSecret(payload, secret) {
  const [version, iv, tag, encrypted] = String(payload).split(".");
  if (version !== TOKEN_VERSION || !iv || !tag || !encrypted) {
    throw new Error("Token criptografado invalido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function buildAuthorizationUrl({ clientId, redirectUri, state, challenge }) {
  const url = new URL("https://auth.mercadolivre.com.br/authorization");
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
