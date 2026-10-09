export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly notSubmitted = false,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new Error("The service returned an unexpected response.");
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      typeof data.error === "string"
        ? data.error.slice(0, 500)
        : `Request failed (${response.status}).`,
      response.status,
      data.notSubmitted === true,
    );
  return data as T;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}
