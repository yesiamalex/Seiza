/**
 * Lines of `text` that fit `maxWidth` on a canvas, for anything Seiza
 * draws on one: boards and notes, the VR menus, a world's signs. English
 * breaks between words; Japanese, which has no spaces, between any two
 * characters, except that a line never starts with closing punctuation
 * (。、」) or a small kana. A word longer than a line is left whole.
 */
const CJK = /[　-鿿＀-￯]/;
/** Characters that mustn't begin a line (a short kinsoku list). */
const NO_LINE_START = /^[、。,.!?!?」』)\])}ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々・:;]/;

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  // Words with their spaces, and Japanese one character at a time.
  const tokens = text.split(/(\s+)/).flatMap((t) => (CJK.test(t) ? splitCjk(t) : [t]));
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const test = line + token;
    if (ctx.measureText(test).width > maxWidth && line.trim() && !NO_LINE_START.test(token)) {
      lines.push(line.trim());
      line = token.trimStart();
    } else {
      line = test;
    }
  }
  if (line.trim() || lines.length === 0) lines.push(line.trim());
  return lines;
}

/** "Seiza正座です" → "Seiza", "正", "座", "で", "す": Latin runs stay whole. */
function splitCjk(text: string): string[] {
  const out: string[] = [];
  let latin = "";
  for (const ch of text) {
    if (CJK.test(ch)) {
      if (latin) out.push(latin);
      latin = "";
      out.push(ch);
    } else latin += ch;
  }
  if (latin) out.push(latin);
  return out;
}

/** Draws `text` wrapped to `maxWidth` from (x, y) and returns the y after
 *  the last line. */
export function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  for (const line of wrapLines(ctx, text, maxWidth)) {
    if (line) ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}
