export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-symbol" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        syne<span className="brand-hq">hq</span>
        <span className="brand-edition">OOS</span>
      </span>
    </span>
  );
}
