import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { loadFonts } from "./fonts.js";
import { toEmbeddableImage } from "./image.js";
import { buildScene } from "./templates.js";
import { ASPECT_SIZES, type RenderInput, type RenderOutput } from "./types.js";

export async function renderTemplateImpl(input: RenderInput): Promise<RenderOutput> {
  const { width, height } = ASPECT_SIZES[input.aspect];
  const imageDataUri = await toEmbeddableImage(input.brand.imageUrl);

  const scene = buildScene({ width, height, input, imageDataUri });

  // satori's public type wants a React `ReactNode`; we build a plain object tree instead of pulling in
  // a JSX runtime (see nodes.ts) since satori only inspects `.type`/`.props` at runtime, not identity.
  const svg = await satori(scene as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: loadFonts(),
  });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  const rendered = resvg.render();
  const buffer = rendered.asPng();

  return { buffer, width: rendered.width, height: rendered.height, mimeType: "image/png" };
}
