/**
 * Minimal JSX-less element tree for satori. Satori's public type signature wants a React `ReactNode`,
 * but at runtime it only ever inspects `.type` / `.props.style` / `.props.children` (and `.props.src`
 * for `img`), so we build plain objects with that shape and cast at the call site instead of pulling in
 * a JSX runtime.
 */
export type Style = Record<string, string | number | undefined>;

export interface SNode {
  type: "div" | "span" | "img";
  props: {
    style?: Style;
    src?: string;
    children?: SNode | string | Array<SNode | string>;
    [key: string]: unknown;
  };
}

type Child = SNode | string | null | undefined | false;

export function el(type: SNode["type"], style: Style = {}, children?: Child | Child[]): SNode {
  const flat = Array.isArray(children) ? children : children === undefined ? [] : [children];
  const kids = flat.filter((c): c is SNode | string => c !== null && c !== undefined && c !== false);
  return {
    type,
    props: {
      style,
      ...(kids.length > 0 ? { children: kids.length === 1 ? (kids[0] as SNode | string) : kids } : {}),
    },
  };
}

export function img(src: string, style: Style = {}): SNode {
  return { type: "img", props: { src, style } };
}
