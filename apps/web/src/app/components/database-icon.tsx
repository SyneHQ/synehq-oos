import { applicationPath } from "../../paths";
import type { DatabaseEngine } from "@synehq-oos/explorer-contracts";
import { databaseDefinition } from "./database-catalog";

export function DatabaseIcon({
  engine,
  size = 24,
  className = "",
}: {
  engine: DatabaseEngine;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`database-brand-icon ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        src={applicationPath(databaseDefinition(engine).logo)}
        alt=""
        width={size}
        height={size}
        draggable={false}
      />
    </span>
  );
}
