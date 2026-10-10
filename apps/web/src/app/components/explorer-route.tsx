"use client";

import { applicationPath } from "../../paths";

import { useEffect, useState } from "react";
import { Spinner } from "@synehq-oos/ui";
import { Brand } from "./brand";
import { readExplorerLocation, type ExplorerLocation } from "./explorer-location";
import { Workspace } from "./workspace";

export function ExplorerRoute() {
  const [route, setRoute] = useState<ExplorerLocation | null | undefined>(undefined);
  useEffect(() => {
    setRoute(readExplorerLocation(window.location));
  }, []);
  if (route === undefined)
    return (
      <div className="boot-screen">
        <Brand />
        <Spinner label="Opening your workspace" />
        <p>Opening your workspace...</p>
      </div>
    );
  if (route === null)
    return (
      <div className="boot-screen">
        <Brand />
        <p>Select a saved connection to open the explorer.</p>
        <a href={applicationPath("/connections/")}>Back to connections</a>
      </div>
    );
  return <Workspace connectionId={route.connectionId} initialView={route.initialView} />;
}
