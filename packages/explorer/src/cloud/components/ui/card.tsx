/**
 * shadcn's Card was a strict subset of Probe's: every part takes the same
 * `className` + children + DOM props, and `CardTitle` still renders `<h3>` by
 * default, so the 32 call-sites re-export without an adapter.
 *
 * What changes on screen, deliberately: `Card` and `CardContent` are flex
 * columns instead of blocks (`CardContent` also swaps `p-6 pt-0` for Probe's
 * gap), and `CardFooter` carries a top rule and the sunken footer surface.
 * The one thing to know at a call-site: a `<Card className="flex …">` that
 * meant a *row* now gets `flex-col`, because tailwind-merge only drops a
 * direction the call-site actually names. One card does that today
 * (search-results.tsx) and it holds a single child, so nothing moved.
 *
 * Probe's own props (`interactive`, `selected`, `href`) are additive — nothing
 * here passes them.
 */
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "@synehq-oos/ui";
