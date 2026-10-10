import { stripBasePath } from "../../paths";

export interface ExplorerLocation {
  connectionId: string;
  initialView: "data" | "console";
}

const connectionIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

/** Read the connection from the browser URL after the static shell mounts. */
export function readExplorerLocation(location: {
  pathname: string;
  search: string;
}): ExplorerLocation | null {
  const pathname = stripBasePath(location.pathname);
  if (pathname === null) return null;
  const path = /^\/explorer\/([^/]+)(?:\/(console))?\/?$/.exec(pathname);
  if (path) {
    let connectionId: string;
    try {
      connectionId = decodeURIComponent(path[1]);
    } catch {
      return null;
    }
    if (!connectionIdPattern.test(connectionId)) return null;
    return { connectionId, initialView: path[2] ? "console" : "data" };
  }
  if (!/^\/explorer\/?$/.test(pathname)) return null;
  const query = new URLSearchParams(location.search);
  const connectionId = query.get("connection");
  const view = query.get("view");
  if (
    query.getAll("connection").length !== 1 ||
    query.getAll("view").length > 1 ||
    !connectionId ||
    !connectionIdPattern.test(connectionId) ||
    (view !== null && view !== "data" && view !== "console")
  )
    return null;
  return { connectionId, initialView: view === "console" ? "console" : "data" };
}
