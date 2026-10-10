"use client";

import type { ReactNode } from "react";
import { EditorAssetPath } from "@synehq-oos/explorer";
import { applicationPath } from "../../paths";

export function EditorAssets({ children }: { children: ReactNode }) {
  return (
    <EditorAssetPath.Provider value={applicationPath("/monaco/vs")}>
      {children}
    </EditorAssetPath.Provider>
  );
}
