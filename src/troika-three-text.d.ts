// The one troika-three-text call Seiza makes (src/main.tsx); the package
// ships no types of its own.
declare module "troika-three-text" {
  export function configureTextBuilder(config: { useWorker?: boolean; sdfGlyphSize?: number; defaultFontURL?: string | null }): void;
}
