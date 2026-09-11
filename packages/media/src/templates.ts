import { fontFamilyFor } from "./fonts.js";
import { el, img, type SNode, type Style } from "./nodes.js";
import type { RenderInput } from "./types.js";

export interface TemplateContext {
  width: number;
  height: number;
  input: RenderInput;
  /** data: URI, already fetched + capped, or null when unavailable */
  imageDataUri: string | null;
}

/** Builds the full satori element tree (as a plain object, cast to `ReactNode` at the call site). */
export function buildScene(ctx: TemplateContext): SNode {
  const { input } = ctx;
  const rtl = input.brand.direction === "rtl";
  const scale = ctx.width / 1080;
  const pad = Math.round(72 * scale);

  const outer: Style = {
    display: "flex",
    flexDirection: "column",
    width: `${ctx.width}px`,
    height: `${ctx.height}px`,
    position: "relative",
    backgroundColor: input.brand.background,
    color: input.brand.text,
    fontFamily: fontFamilyFor(input.brand.direction, input.brand.fontFamily),
    direction: rtl ? "rtl" : "ltr",
    overflow: "hidden",
  };

  const body = TEMPLATE_BUILDERS[input.template](ctx, { scale, pad, rtl });
  // Brand assets (avatar/banner) render the business identity themselves; the floating name pill
  // that every other template gets would be redundant clutter on a small square logo or a banner
  // that already spells the name out.
  const showBusinessTag = input.template !== "avatar" && input.template !== "banner";
  return el("div", outer, [body, ...(showBusinessTag ? [businessTag(ctx, { scale, pad, rtl })] : [])]);
}

function businessTag(ctx: TemplateContext, o: Vars): SNode {
  const { input } = ctx;
  return el(
    "div",
    {
      position: "absolute",
      top: `${Math.round(o.pad * 0.55)}px`,
      ...(o.rtl ? { right: `${o.pad}px` } : { left: `${o.pad}px` }),
      display: "flex",
      alignItems: "center",
      padding: `${Math.round(10 * o.scale)}px ${Math.round(20 * o.scale)}px`,
      backgroundColor: input.brand.accent,
      color: input.brand.background,
      borderRadius: `${Math.round(999 * o.scale)}px`,
      fontSize: `${Math.round(22 * o.scale)}px`,
      fontWeight: 700,
    },
    input.businessName,
  );
}

interface Vars {
  scale: number;
  pad: number;
  rtl: boolean;
}

function headlineNode(ctx: TemplateContext, o: Vars, fontSize = 72, color?: string): SNode {
  return el(
    "div",
    {
      display: "flex",
      fontSize: `${Math.round(fontSize * o.scale)}px`,
      fontWeight: 800,
      lineHeight: 1.08,
      color: color ?? ctx.input.brand.text,
      textAlign: o.rtl ? "right" : "left",
      whiteSpace: "pre-wrap",
    },
    ctx.input.headline,
  );
}

function subheadlineNode(ctx: TemplateContext, o: Vars, fontSize = 36): SNode | null {
  if (!ctx.input.subheadline) return null;
  return el(
    "div",
    {
      display: "flex",
      fontSize: `${Math.round(fontSize * o.scale)}px`,
      fontWeight: 500,
      color: ctx.input.brand.secondary,
      textAlign: o.rtl ? "right" : "left",
    },
    ctx.input.subheadline,
  );
}

function bodyNode(ctx: TemplateContext, o: Vars, fontSize = 28): SNode | null {
  if (!ctx.input.body) return null;
  return el(
    "div",
    {
      display: "flex",
      fontSize: `${Math.round(fontSize * o.scale)}px`,
      fontWeight: 400,
      lineHeight: 1.4,
      color: ctx.input.brand.text,
      textAlign: o.rtl ? "right" : "left",
      opacity: 0.92,
    },
    ctx.input.body,
  );
}

function ctaNode(ctx: TemplateContext, o: Vars): SNode | null {
  if (!ctx.input.cta) return null;
  return el(
    "div",
    {
      display: "flex",
      alignSelf: o.rtl ? "flex-end" : "flex-start",
      padding: `${Math.round(18 * o.scale)}px ${Math.round(36 * o.scale)}px`,
      backgroundColor: ctx.input.brand.primary,
      color: ctx.input.brand.background,
      borderRadius: `${Math.round(14 * o.scale)}px`,
      fontSize: `${Math.round(30 * o.scale)}px`,
      fontWeight: 700,
    },
    ctx.input.cta,
  );
}

function productImage(ctx: TemplateContext, style: Style): SNode | null {
  if (!ctx.imageDataUri) return null;
  return img(ctx.imageDataUri, { display: "flex", objectFit: "cover", ...style });
}

function textStack(nodes: Array<SNode | null>, gap: number, rtl: boolean): SNode {
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      gap: `${gap}px`,
      alignItems: rtl ? "flex-end" : "flex-start",
    },
    nodes.filter((n): n is SNode => n !== null),
  );
}

function announcement(ctx: TemplateContext, o: Vars): SNode {
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      width: "100%",
      height: "100%",
      padding: `${o.pad}px`,
      backgroundImage: `linear-gradient(135deg, ${ctx.input.brand.background} 55%, ${ctx.input.brand.primary}22 100%)`,
    },
    [
      el("div", { display: "flex", height: `${Math.round(96 * o.scale)}px` }, null),
      textStack(
        [headlineNode(ctx, o), subheadlineNode(ctx, o), bodyNode(ctx, o, 26)],
        Math.round(20 * o.scale),
        o.rtl,
      ),
      ctaNode(ctx, o),
    ],
  );
}

function quote(ctx: TemplateContext, o: Vars): SNode {
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      width: "100%",
      height: "100%",
      padding: `${o.pad}px`,
      textAlign: "center",
      gap: `${Math.round(28 * o.scale)}px`,
    },
    [
      el(
        "div",
        {
          display: "flex",
          fontSize: `${Math.round(140 * o.scale)}px`,
          color: ctx.input.brand.primary,
          lineHeight: 1,
        },
        "“",
      ),
      el(
        "div",
        {
          display: "flex",
          fontSize: `${Math.round(52 * o.scale)}px`,
          fontWeight: 700,
          lineHeight: 1.25,
          textAlign: "center",
          color: ctx.input.brand.text,
        },
        ctx.input.headline,
      ),
      ctx.input.subheadline
        ? el(
            "div",
            { display: "flex", fontSize: `${Math.round(30 * o.scale)}px`, color: ctx.input.brand.secondary },
            `— ${ctx.input.subheadline}`,
          )
        : null,
    ].filter((n): n is SNode => n !== null),
  );
}

function feature(ctx: TemplateContext, o: Vars): SNode {
  const textCol = el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      flex: 1,
      gap: `${Math.round(24 * o.scale)}px`,
      padding: `${o.pad}px`,
    },
    [
      textStack(
        [headlineNode(ctx, o, 60), subheadlineNode(ctx, o), bodyNode(ctx, o)],
        Math.round(18 * o.scale),
        o.rtl,
      ),
      ctaNode(ctx, o),
    ],
  );
  const imageCol = el(
    "div",
    {
      display: "flex",
      flex: 1,
      backgroundColor: `${ctx.input.brand.primary}18`,
      alignItems: "center",
      justifyContent: "center",
    },
    productImage(ctx, { width: "100%", height: "100%" }) ??
      el(
        "div",
        { display: "flex", fontSize: `${Math.round(28 * o.scale)}px`, color: ctx.input.brand.secondary },
        ctx.input.businessName,
      ),
  );
  const children = o.rtl ? [imageCol, textCol] : [textCol, imageCol];
  return el("div", { display: "flex", flexDirection: "row", width: "100%", height: "100%" }, children);
}

function beforeAfter(ctx: TemplateContext, o: Vars): SNode {
  const panel = (label: string, tone: string, content: SNode | null) =>
    el(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: tone,
        position: "relative",
        padding: `${Math.round(o.pad * 0.6)}px`,
      },
      [
        content ?? el("div", { display: "flex" }, null),
        el(
          "div",
          {
            display: "flex",
            marginTop: `${Math.round(16 * o.scale)}px`,
            fontSize: `${Math.round(26 * o.scale)}px`,
            fontWeight: 700,
            color: ctx.input.brand.background,
            backgroundColor: `${ctx.input.brand.text}99`,
            padding: `${Math.round(6 * o.scale)}px ${Math.round(16 * o.scale)}px`,
            borderRadius: `${Math.round(8 * o.scale)}px`,
            alignSelf: "flex-start",
          },
          label,
        ),
      ],
    );

  return el("div", { display: "flex", flexDirection: "column", width: "100%", height: "100%" }, [
    el("div", { display: "flex", padding: `${o.pad}px ${o.pad}px 0 ${o.pad}px` }, headlineNode(ctx, o, 52)),
    el(
      "div",
      { display: "flex", flex: 1, flexDirection: "row", marginTop: `${Math.round(24 * o.scale)}px` },
      [
        panel("Before", `${ctx.input.brand.text}14`, null),
        panel(
          "After",
          `${ctx.input.brand.primary}22`,
          productImage(ctx, { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }),
        ),
      ],
    ),
  ]);
}

function stat(ctx: TemplateContext, o: Vars): SNode {
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      padding: `${o.pad}px`,
      gap: `${Math.round(16 * o.scale)}px`,
      textAlign: "center",
    },
    [
      el(
        "div",
        {
          display: "flex",
          fontSize: `${Math.round(160 * o.scale)}px`,
          fontWeight: 800,
          color: ctx.input.brand.primary,
          lineHeight: 1,
        },
        ctx.input.stat ?? ctx.input.headline,
      ),
      el(
        "div",
        {
          display: "flex",
          fontSize: `${Math.round(44 * o.scale)}px`,
          fontWeight: 700,
          color: ctx.input.brand.text,
        },
        ctx.input.stat ? ctx.input.headline : "",
      ),
      subheadlineNode(ctx, o) ?? el("div", { display: "flex" }, null),
    ],
  );
}

function plainPhoto(ctx: TemplateContext, o: Vars): SNode {
  const photo = productImage(ctx, { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 });
  const scrim = el("div", {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    backgroundImage: `linear-gradient(to top, ${ctx.input.brand.text}cc 0%, ${ctx.input.brand.text}00 55%)`,
  });
  const overlayText = el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      width: "100%",
      height: "100%",
      padding: `${o.pad}px`,
      gap: `${Math.round(16 * o.scale)}px`,
      position: "relative",
      color: ctx.input.brand.background,
    },
    [
      headlineNode(ctx, o, 56, ctx.input.brand.background),
      ctx.input.subheadline ? subheadlineNode(ctx, o, 30) : null,
      ctaNode(ctx, o),
    ],
  );

  if (!photo) {
    // No image available: fall back to a solid-brand announcement-style layout instead of a blank photo.
    return announcement(ctx, o);
  }

  return el("div", { display: "flex", width: "100%", height: "100%", position: "relative" }, [
    photo,
    scrim,
    overlayText,
  ]);
}

/** "Acme Robotics" -> "AR"; a single-word name -> its first two letters. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const [first, second] = words;
  if (!first) return "";
  if (!second) return first.slice(0, 2).toUpperCase();
  return `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase();
}

/** Square avatar/profile-picture asset: product image if we have one, else initials on the brand color. */
function avatar(ctx: TemplateContext, o: Vars): SNode {
  const { input } = ctx;
  const photo = productImage(ctx, { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 });
  if (photo) {
    return el(
      "div",
      {
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: input.brand.primary,
      },
      photo,
    );
  }
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      backgroundColor: input.brand.primary,
      gap: `${Math.round(20 * o.scale)}px`,
      padding: `${Math.round(60 * o.scale)}px`,
    },
    [
      el(
        "div",
        {
          display: "flex",
          fontSize: `${Math.round(340 * o.scale)}px`,
          fontWeight: 800,
          color: input.brand.background,
          lineHeight: 1,
        },
        initials(input.businessName),
      ),
      input.headline
        ? el(
            "div",
            {
              display: "flex",
              fontSize: `${Math.round(46 * o.scale)}px`,
              fontWeight: 600,
              color: `${input.brand.background}cc`,
              textAlign: "center",
              lineHeight: 1.2,
            },
            input.headline,
          )
        : null,
    ].filter((n): n is SNode => n !== null),
  );
}

/** Wide (3:1) profile-banner asset: business name, tagline and a small palette swatch, RTL aware. */
function banner(ctx: TemplateContext, o: Vars): SNode {
  const { input } = ctx;
  const swatch = (color: string) =>
    el("div", {
      display: "flex",
      width: `${Math.round(30 * o.scale)}px`,
      height: `${Math.round(30 * o.scale)}px`,
      borderRadius: `${Math.round(8 * o.scale)}px`,
      backgroundColor: color,
    });

  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      padding: `0 ${o.pad}px`,
      backgroundColor: input.brand.background,
      backgroundImage: `linear-gradient(${o.rtl ? "to left" : "to right"}, ${input.brand.primary}26 0%, ${input.brand.background} 65%)`,
      gap: `${Math.round(16 * o.scale)}px`,
    },
    [
      el(
        "div",
        {
          display: "flex",
          fontSize: `${Math.round(78 * o.scale)}px`,
          fontWeight: 800,
          color: input.brand.text,
          textAlign: o.rtl ? "right" : "left",
          alignSelf: o.rtl ? "flex-end" : "flex-start",
        },
        input.businessName,
      ),
      input.headline
        ? el(
            "div",
            {
              display: "flex",
              fontSize: `${Math.round(36 * o.scale)}px`,
              fontWeight: 500,
              color: input.brand.secondary,
              textAlign: o.rtl ? "right" : "left",
              alignSelf: o.rtl ? "flex-end" : "flex-start",
            },
            input.headline,
          )
        : null,
      el(
        "div",
        {
          display: "flex",
          flexDirection: "row",
          gap: `${Math.round(12 * o.scale)}px`,
          alignSelf: o.rtl ? "flex-end" : "flex-start",
        },
        [swatch(input.brand.primary), swatch(input.brand.secondary), swatch(input.brand.accent)],
      ),
    ].filter((n): n is SNode => n !== null),
  );
}

const TEMPLATE_BUILDERS: Record<RenderInput["template"], (ctx: TemplateContext, o: Vars) => SNode> = {
  announcement,
  quote,
  feature,
  before_after: beforeAfter,
  stat,
  plain_photo: plainPhoto,
  avatar,
  banner,
};
