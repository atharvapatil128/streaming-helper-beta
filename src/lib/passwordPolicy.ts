export const MIN_PASSWORD_LENGTH = 10;

export const PASSWORD_REQUIREMENTS =
  `At least ${MIN_PASSWORD_LENGTH} characters with an uppercase letter, ` +
  'a lowercase letter, a number, and a symbol.';

const ALLOWED_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include a lowercase letter.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include a number.';
  }
  if (![...password].some((character) => ALLOWED_SYMBOLS.includes(character))) {
    return 'Password must include a symbol.';
  }
  return null;
}
