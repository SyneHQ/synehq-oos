export function formatPageCount(value: number): string {
  if (value >= 1000000000) {
    return (value / 1000000000).toFixed(1) + "B";
  } else if (value >= 1000000) {
    return (value / 1000000).toFixed(1) + "M";
  } else if (value >= 1000) {
    return (value / 1000).toFixed(1) + "K";
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}
