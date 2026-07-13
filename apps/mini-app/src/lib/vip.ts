export function normalizeVipInput(rawInput: string): string | null {
  const input = rawInput.trim();

  if (!input) {
    return null;
  }

  if (/^-?\d{5,20}$/.test(input)) {
    return input;
  }

  const usernameFromUrl = input.match(/^(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]{5,32})\/?$/);
  if (usernameFromUrl) {
    return `@${usernameFromUrl[1]}`;
  }

  const username = input.match(/^@?([a-zA-Z0-9_]{5,32})$/);
  if (username && /[a-zA-Z_]/.test(username[1])) {
    return `@${username[1]}`;
  }

  const phone = input.replace(/[\s().-]/g, "");
  if (/^\+\d{7,15}$/.test(phone)) {
    return phone;
  }

  return null;
}
