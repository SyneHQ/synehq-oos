/** Tailwind color aliases used by the extracted Cloud grid and its menus. */
const color = (token: string) => `rgb(from var(--probe-${token}) r g b / <alpha-value>)`;

export const gridColors = {
  border: color("border-primary"),
  input: color("border-control"),
  ring: color("focus-ring"),
  background: color("surface-page"),
  foreground: color("text-primary"),
  primary: { DEFAULT: color("accent"), foreground: color("text-on-accent") },
  secondary: { DEFAULT: color("surface-sunken"), foreground: color("text-primary") },
  destructive: { DEFAULT: color("critical-solid"), foreground: color("critical-solid-fg") },
  muted: { DEFAULT: color("surface-sunken"), foreground: color("text-secondary") },
  accent: { DEFAULT: color("accent-subtle"), foreground: color("text-primary") },
  popover: { DEFAULT: color("surface-overlay"), foreground: color("text-primary") },
  card: { DEFAULT: color("surface-raised"), foreground: color("text-primary") },
  probe: {
    accent: color("accent"),
    "accent-muted": color("accent-muted"),
    "critical-fg": color("critical-fg"),
    "success-fg": color("success-fg"),
    "text-link": color("text-link"),
    "warning-bg": color("warning-bg"),
  },
};
