import "server-only";

/**
 * The document parsers that the extraction child (extract-sandbox.ts) imports
 * from node_modules at run time. These loaders are never called by the server
 * itself: referencing them is what makes the deployment's file tracing ship
 * the packages, with their dependencies, alongside the routes that process
 * materials. pdf.js's worker file, which pdf.js loads through a computed
 * path, is added to those routes in next.config.ts (outputFileTracingIncludes).
 */
export const PARSER_MODULES = {
  pdf: () => import("pdf-parse"),
  // pdf.js polyfills DOMMatrix, ImageData and Path2D from it in Node and fails to load without it.
  pdfCanvas: () => import("@napi-rs/canvas"),
  docx: () => import("mammoth"),
  // Word equations are rewritten as text before mammoth reads the file.
  docxZip: () => import("jszip"),
  docxXml: () => import("@xmldom/xmldom"),
  doc: () => import("word-extractor"),
} as const;
