import { applicationPath } from "../../paths";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly notSubmitted = false,
    readonly fieldErrors: Record<string, string> = {},
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(applicationPath(path), {
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
      data.fieldErrors && typeof data.fieldErrors === "object"
        ? Object.fromEntries(
            Object.entries(data.fieldErrors)
              .filter((entry): entry is [string, string] => typeof entry[1] === "string")
              .map(([key, value]) => [key, value.slice(0, 300)]),
          )
        : {},
      typeof data.code === "string" ? data.code.slice(0, 100) : undefined,
    );
  return data as T;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}
