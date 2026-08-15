export function createPkce(): { verifier: string; challenge: string };
export function createOAuthState(): string;
export function hashOAuthState(state: string): string;
export function encryptSecret(value: string, secret: string): string;
export function decryptSecret(payload: string, secret: string): string;
export function safeEqual(left: unknown, right: unknown): boolean;
export function buildAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string;
