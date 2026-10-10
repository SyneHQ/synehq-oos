export function normalizeBasePath(value: string | undefined): "" | "/synehq" {
  if (value === undefined || value === "") return "";
  if (value === "/synehq") return value;
  throw new Error("The application base path must be empty or /synehq.");
}

export function applicationPath(
  path: string,
  basePath = normalizeBasePath(process.env.NEXT_PUBLIC_OOS_BASE_PATH),
): string {
  const pathname = path.split(/[?#]/, 1)[0];
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\0\r\n]/.test(path) ||
    /%(?:2e|2f|5c)/i.test(pathname) ||
    pathname.split("/").some((part) => part === "." || part === "..")
  )
    throw new Error("Use an absolute path inside the application.");
  return `${basePath}${path}`;
}

export function stripBasePath(
  path: string,
  basePath = normalizeBasePath(process.env.NEXT_PUBLIC_OOS_BASE_PATH),
): string | null {
  if (!basePath) return path;
  if (path === basePath) return "/";
  return path.startsWith(`${basePath}/`) ? path.slice(basePath.length) : null;
}
