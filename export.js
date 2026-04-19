/**
 * @fileoverview Export utilities: Blob download, clipboard copy, formatting helpers.
 * @module export
 */

import { formatLatex, formatMarkdown } from './proof.js';

/**
 * Download a file by creating a Blob and programmatic <a> click.
 * @param {string} content - File contents.
 * @param {string} filename - Download filename.
 * @param {string} [mimeType='text/plain'] - MIME type.
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Copy text to clipboard with fallback.
 * @param {string} text
 * @returns {Promise<void>}
 */
export async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback for older browsers or insecure contexts
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch (e) {
    console.error('Clipboard copy failed:', e);
    throw new Error('Failed to copy to clipboard');
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Show a transient confirmation message on a button.
 * @param {HTMLButtonElement} button
 * @param {string} message - e.g. "Copied!" or "Downloaded!"
 * @param {number} [duration=1500] - Duration in ms.
 */
export function showButtonConfirmation(button, message, duration = 1500) {
  const originalText = button.textContent;
  const originalClass = button.className;
  button.textContent = message;
  button.classList.add('btn--confirmed');
  button.disabled = true;

  setTimeout(() => {
    button.textContent = originalText;
    button.className = originalClass;
    button.disabled = false;
  }, duration);
}

/**
 * Export proof as LaTeX and copy to clipboard.
 * @param {import('./proof.js').ProofStep[]} steps
 * @param {HTMLButtonElement} button
 */
export async function copyLatex(steps, button) {
  const latex = formatLatex(steps);
  await copyToClipboard(latex);
  showButtonConfirmation(button, '✓ Copied!');
}

/**
 * Export proof as Markdown and copy to clipboard.
 * @param {import('./proof.js').ProofStep[]} steps
 * @param {HTMLButtonElement} button
 */
export async function copyMarkdownToClipboard(steps, button) {
  const md = formatMarkdown(steps);
  await copyToClipboard(md);
  showButtonConfirmation(button, '✓ Copied!');
}

/**
 * Download proof as .tex file.
 * @param {import('./proof.js').ProofStep[]} steps
 * @param {HTMLButtonElement} button
 */
export function downloadLatex(steps, button) {
  const latex = formatLatex(steps);
  downloadFile(latex, 'pumping-lemma-proof.tex', 'application/x-tex');
  showButtonConfirmation(button, '✓ Downloaded!');
}

/**
 * Download proof as .md file.
 * @param {import('./proof.js').ProofStep[]} steps
 * @param {HTMLButtonElement} button
 */
export function downloadMarkdown(steps, button) {
  const md = formatMarkdown(steps);
  downloadFile(md, 'pumping-lemma-proof.md', 'text/markdown');
  showButtonConfirmation(button, '✓ Downloaded!');
}
