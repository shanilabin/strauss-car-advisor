import type { components } from "./schema";

type Source = components["schemas"]["Source"];
type ConfigSummary = components["schemas"]["ConfigSummary"];
type CatalogCar = components["schemas"]["CatalogCar"];
type Occupation = components["schemas"]["Occupation"];

export type SourceLookup = {
  config?: ConfigSummary | null;
  catalog?: CatalogCar[] | null;
  occupations?: Occupation[] | null;
};

/**
 * Resolve a Source.ref to the configured value as returned by the API.
 * Never invents values — returns null when the path cannot be read from the payload.
 */
export function resolveSourceValue(
  source: Source,
  lookup: SourceLookup,
): string | number | boolean | null {
  if (source.kind === "VALUE_OF_USE_DB") {
    return null;
  }

  const ref = source.ref;
  if (ref.startsWith("rules.")) {
    return walkRulesPath(lookup.config?.rules ?? null, ref.slice("rules.".length));
  }
  if (ref.startsWith("catalog[")) {
    return walkCatalogRef(ref, lookup.catalog ?? null);
  }
  if (ref.startsWith("occupations[")) {
    return walkOccupationRef(ref, lookup.occupations ?? null);
  }
  return null;
}

/** Find a Source for a ComparisonCard / OptionResult field name. */
export function findSourceByField(
  sources: Source[] | undefined,
  field: string,
): Source | undefined {
  return sources?.find((s) => s.field === field);
}

/**
 * Match a waterfall step key to a source field
 * (e.g. electric_refund ↔ electric_refund_net).
 */
export function findSourceForWaterfallKey(
  sources: Source[] | undefined,
  stepKey: string,
): Source | undefined {
  if (!sources) return undefined;
  const direct = sources.find((s) => s.field === stepKey);
  if (direct) return direct;
  const withNet = sources.find((s) => s.field === `${stepKey}_net`);
  if (withNet) return withNet;
  return sources.find((s) => s.field.replace(/_net$/, "") === stepKey);
}

function walkRulesPath(
  rules: { [key: string]: unknown } | null,
  path: string,
): string | number | boolean | null {
  if (!rules) return null;
  const segments = tokenizePath(path);
  let current: unknown = rules;
  for (const segment of segments) {
    if (current == null) return null;
    if (typeof segment === "string") {
      if (typeof current !== "object" || Array.isArray(current)) return null;
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    // bracket key: array find by id/code, or object key
    if (Array.isArray(current)) {
      const match = current.find((item) => {
        if (item == null || typeof item !== "object") return false;
        const row = item as Record<string, unknown>;
        return row.code === segment.key || row.id === segment.key || row.name === segment.key;
      });
      current = match;
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment.key];
      continue;
    }
    return null;
  }
  return asDisplayPrimitive(current);
}

function walkCatalogRef(
  ref: string,
  catalog: CatalogCar[] | null,
): string | number | boolean | null {
  if (!catalog) return null;
  const parsed = parseIndexedRef(ref, "catalog");
  if (!parsed) return null;
  const car = catalog.find((c) => c.id === parsed.id);
  if (!car) return null;
  if (!parsed.prop) return car.id;
  const value = readCamelOrSnake(car as unknown as Record<string, unknown>, parsed.prop);
  return asDisplayPrimitive(value);
}

function walkOccupationRef(
  ref: string,
  occupations: Occupation[] | null,
): string | number | boolean | null {
  if (!occupations) return null;
  const parsed = parseIndexedRef(ref, "occupations");
  if (!parsed) return null;
  const occupation = occupations.find((o) => o.name === parsed.id);
  if (!occupation) return null;
  if (!parsed.prop) return occupation.name;
  const value = readCamelOrSnake(
    occupation as unknown as Record<string, unknown>,
    parsed.prop,
  );
  return asDisplayPrimitive(value);
}

function parseIndexedRef(
  ref: string,
  root: "catalog" | "occupations",
): { id: string; prop: string | null } | null {
  const re = new RegExp(`^${root}\\[([^\\]]+)\\](?:\\.(.+))?$`);
  const match = ref.match(re);
  if (!match) return null;
  return { id: match[1] ?? "", prop: match[2] ?? null };
}

type PathSegment = string | { key: string };

function tokenizePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const re = /([^.\[\]]+)|\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[1]) segments.push(m[1]);
    else if (m[2] != null) segments.push({ key: m[2] });
  }
  return segments;
}

/** Map camelCase config property names to snake_case OpenAPI fields. */
function readCamelOrSnake(
  obj: Record<string, unknown>,
  prop: string,
): unknown {
  if (prop in obj) return obj[prop];
  const snake = camelToSnake(prop);
  if (snake in obj) return obj[snake];
  return undefined;
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

function asDisplayPrimitive(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}
