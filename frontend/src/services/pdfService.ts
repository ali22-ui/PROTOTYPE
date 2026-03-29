import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PdfFieldCoordinate } from '@/types';

export interface FilledPdfResult {
  blob: Blob;
  blobUrl: string;
  bytes: Uint8Array;
}

const DEBUG_MODE = true;
const DEBUG_MARKER_SIZE = 4;

const ensureTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value : `${value}/`;

const normalizeTemplatePath = (filePath: string): string => {
  const withoutLeadingSlash = filePath.replace(/^\/+/, '');
  const withoutPdfPrefix = withoutLeadingSlash.replace(/^pdf\//i, '');
  const encoded = withoutPdfPrefix
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `pdf/${encoded}`;
};

const resolveTemplateUrl = (filePath: string): string => {
  const baseUrl = ensureTrailingSlash(import.meta.env.BASE_URL || '/');
  const normalizedTemplatePath = normalizeTemplatePath(filePath);
  return `${baseUrl}${normalizedTemplatePath}`;
};

const toRenderableText = (value: unknown): string => {
  if (typeof value === 'boolean') {
    return value ? 'X' : '';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
};

export const loadTemplate = async (filePath: string): Promise<ArrayBuffer> => {
  const templateUrl = resolveTemplateUrl(filePath);
  const response = await fetch(templateUrl);

  if (!response.ok) {
    throw new Error(`Failed to load template: ${templateUrl}`);
  }

  return response.arrayBuffer();
};

export const fillPDF = async (
  templateBytes: ArrayBuffer,
  data: object,
  coordinateMap: Partial<Record<string, PdfFieldCoordinate>>,
): Promise<FilledPdfResult> => {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const normalizedData = data as Record<string, unknown>;

  for (const [field, coordinate] of Object.entries(coordinateMap)) {
    if (!coordinate) {
      continue;
    }

    const value = normalizedData[field];
    const text = toRenderableText(value);
    if (!text) {
      continue;
    }

    const page = pages[coordinate.page];
    if (!page) {
      continue;
    }

    const drawSize = coordinate.size ?? 10;
    const lineHeight = coordinate.lineHeight ?? drawSize + 2;

    if (DEBUG_MODE) {
      page.drawRectangle({
        x: coordinate.x - 1,
        y: coordinate.y - 1,
        width: DEBUG_MARKER_SIZE,
        height: DEBUG_MARKER_SIZE,
        color: rgb(0.92, 0.12, 0.12),
        borderColor: rgb(0.72, 0.08, 0.08),
        borderWidth: 0.5,
        opacity: 0.9,
      });
    }

    page.drawText(text, {
      x: coordinate.x,
      y: coordinate.y,
      size: drawSize,
      maxWidth: coordinate.maxWidth,
      lineHeight,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const bytes = await pdfDoc.save();
  const normalizedBytes = Uint8Array.from(bytes);
  const blob = new Blob([normalizedBytes], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);

  return {
    bytes: normalizedBytes,
    blob,
    blobUrl,
  };
};

export const revokePdfUrl = (blobUrl: string | null | undefined): void => {
  if (!blobUrl) {
    return;
  }

  URL.revokeObjectURL(blobUrl);
};

export const triggerPdfDownload = (blob: Blob, fileName: string): void => {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
};
