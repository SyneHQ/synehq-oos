export class StoreError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "STORE_ERROR",
  ) {
    super(message);
  }
}

export function unauthorized(): never {
  throw new StoreError(401, "Sign in to continue.", "UNAUTHORIZED");
}
