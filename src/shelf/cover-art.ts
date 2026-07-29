import type { CatalogBook } from './catalog';
import { siteConfig } from './site-config';

const serif = '"Newsreader Variable", "Iowan Old Style", Georgia, serif';
const sans = '"Inter Variable", Inter, Arial, sans-serif';

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((entry, index) => {
    const clipped = index === maxLines - 1 && lines.length > maxLines ? `${entry}…` : entry;
    ctx.fillText(clipped, x, y + index * lineHeight, maxWidth);
  });
}

export function createFrontCover(book: CatalogBook) {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 288;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = book.cover;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = book.accent;
  ctx.fillRect(12, 12, 3, canvas.height - 24);
  ctx.strokeStyle = book.ink;
  ctx.globalAlpha = 0.22;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
  ctx.globalAlpha = 1;
  ctx.fillStyle = book.ink;
  ctx.font = `600 ${book.title.length > 38 ? 14 : 18}px ${serif}`;
  ctx.textBaseline = 'top';
  wrap(ctx, book.title, 24, 24, 148, 19, 6);
  ctx.font = `500 8px ${sans}`;
  ctx.fillText(book.author.toUpperCase(), 24, 148, 148);
  ctx.font = `700 7px ${sans}`;
  ctx.fillText(siteConfig.spineMark, 24, 260);
  return canvas;
}

export function createTitleDecal(_book: CatalogBook) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  return canvas;
}

export function createSpineCover(book: CatalogBook) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = book.cover;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = book.accent;
  ctx.fillRect(6, 8, 3, canvas.height - 16);
  ctx.save();
  ctx.translate(35, canvas.height - 28);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = book.ink;
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${book.shortTitle.length > 24 ? 18 : 21}px ${serif}`;
  ctx.fillText(book.shortTitle, 0, 0, 398);
  ctx.font = `500 9px ${sans}`;
  ctx.fillText(book.author, 0, 17, 350);
  ctx.restore();
  return canvas;
}

export function createBackCover(book: CatalogBook) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = book.cover;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = book.ink;
  ctx.globalAlpha = 0.86;
  ctx.font = `500 9px ${serif}`;
  ctx.textBaseline = 'top';
  wrap(ctx, book.description, 14, 18, 100, 12, 10);
  ctx.globalAlpha = 1;
  ctx.fillStyle = book.accent;
  ctx.fillRect(14, 158, 28, 2);
  ctx.fillStyle = book.ink;
  ctx.font = `700 6px ${sans}`;
  ctx.fillText(siteConfig.coverImprint, 14, 170, 100);
  return canvas;
}
