/**
 * Local text extraction for imported courses. Runs entirely in the browser.
 *  - PDF  : pdf.js (only PDFs that actually contain text)
 *  - DOCX : mammoth
 *  - PPTX : JSZip + slide XML parsing
 *  - Images: no OCR available locally — the image is kept, text can be added by hand.
 */
import type { CourseType, ExtractionStatus } from "@/domain/types";

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export interface ExtractionResult {
  type: CourseType;
  text: string;
  status: ExtractionStatus;
  message: string | null;
}

export const EXTRACTION_FAILED_MESSAGE =
  "Impossible d'extraire automatiquement le texte. Le document a été conservé. Vous pouvez ajouter le texte manuellement.";

export function detectCourseType(file: File): CourseType {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  if (name.endsWith(".pdf") || mime === "application/pdf") return "PDF";
  if (name.endsWith(".docx") || mime.includes("wordprocessingml")) return "DOCX";
  if (name.endsWith(".pptx") || mime.includes("presentationml")) return "PPTX";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/.test(name)) return "IMAGE";
  return "OTHER";
}

/** "Derivation_cours_1.pdf" -> "Derivation cours 1" */
export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function fileFingerprint(file: File): string {
  return `${file.name.toLowerCase()}|${file.size}`;
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let pageText = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        pageText += item.str;
        pageText += item.hasEOL ? "\n" : " ";
      }
      pages.push(pageText.trim());
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages.filter((p) => p.length > 0).join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

async function extractPptx(file: File): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const slides: string[] = [];
  for (const [index, name] of slideFiles.entries()) {
    const xml = await zip.file(name)!.async("string");
    // Each <a:p> is a paragraph; <a:t> holds text runs.
    const paragraphs = Array.from(xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)).map((m) =>
      Array.from(m[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
        .map((t) => decodeXml(t[1]))
        .join(""),
    );
    const text = paragraphs.filter((p) => p.trim().length > 0).join("\n");
    if (text.trim()) slides.push(`— Diapositive ${index + 1} —\n${text}`);
  }
  return slides.join("\n\n");
}

export async function extractText(file: File): Promise<ExtractionResult> {
  const type = detectCourseType(file);
  if (type === "IMAGE") {
    return {
      type,
      text: "",
      status: "NOT_APPLICABLE",
      message:
        "Aucune reconnaissance de texte (OCR) n'est disponible localement. L'image est conservée : tu peux coller ou écrire le texte du cours.",
    };
  }
  if (type === "OTHER") {
    return { type, text: "", status: "NOT_APPLICABLE", message: "Format non pris en charge pour l'extraction. Le fichier est conservé." };
  }
  try {
    const raw = type === "PDF" ? await extractPdf(file) : type === "DOCX" ? await extractDocx(file) : await extractPptx(file);
    const text = cleanText(raw);
    if (!text) {
      return {
        type,
        text: "",
        status: "EMPTY",
        message:
          "Le document ne contient pas de texte extractible (probablement un scan). Le document a été conservé. Vous pouvez ajouter le texte manuellement.",
      };
    }
    return { type, text, status: "OK", message: null };
  } catch (error) {
    console.error("extraction failed", error);
    return { type, text: "", status: "FAILED", message: EXTRACTION_FAILED_MESSAGE };
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
