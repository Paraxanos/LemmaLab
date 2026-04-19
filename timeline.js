/**
 * @fileoverview SVG Timeline rendering with PointerEvent drag-handle logic.
 * Renders the string decomposition, segment coloring, drag handles,
 * constraint badges, and pumped string preview.
 * @module timeline
 */

import { appState } from './store.js';
import { pumpString, getSegments, validateCuts } from './validator.js';

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════

const CHAR_WIDTH = 32;
const CHAR_HEIGHT = 40;
const HANDLE_RADIUS = 8;
const TIMELINE_PADDING_X = 24;
const TIMELINE_PADDING_Y = 16;
const LABEL_HEIGHT = 24;
const BADGE_HEIGHT = 28;
const PUMPED_ROW_GAP = 20;
const PUMPED_CHAR_WIDTH = 24;
const PUMPED_CHAR_HEIGHT = 30;

/** Segment colors per mode */
const REGULAR_COLORS = {
  x: { fill: '#3B5BDB22', stroke: '#3B5BDB', label: 'x' },
  y: { fill: '#2F9E4422', stroke: '#2F9E44', label: 'y' },
  z: { fill: '#86868622', stroke: '#868686', label: 'z' }
};

const CFL_COLORS = {
  u: { fill: '#3B5BDB22', stroke: '#3B5BDB', label: 'u' },
  v: { fill: '#7048E822', stroke: '#7048E8', label: 'v' },
  x: { fill: '#E8590C22', stroke: '#E8590C', label: 'x' },
  y: { fill: '#2F9E4422', stroke: '#2F9E44', label: 'y' },
  z: { fill: '#86868622', stroke: '#868686', label: 'z' }
};

// ═══════════════════════════════════════════════
// SVG HELPERS
// ═══════════════════════════════════════════════

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an SVG element with attributes.
 * @param {string} tag
 * @param {Object<string, string|number>} attrs
 * @returns {SVGElement}
 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

// ═══════════════════════════════════════════════
// TIMELINE CLASS
// ═══════════════════════════════════════════════

/**
 * Manages the SVG timeline rendering and interaction.
 */
export class Timeline {
  /** @type {HTMLDivElement} */
  #container;

  /** @type {SVGSVGElement} */
  #svg;

  /** @type {number|null} - Index of the handle currently being dragged */
  #draggingHandle = null;

  /** @type {Function} */
  #unsubscribe = null;

  /** @type {number} - RAF id for batching */
  #rafId = 0;

  /** @type {boolean} */
  #needsRender = false;

  /**
   * @param {HTMLDivElement} container - The container div for the timeline.
   */
  constructor(container) {
    this.#container = container;
    this.#svg = svgEl('svg', {
      class: 'timeline-svg',
      role: 'img',
      'aria-label': 'String decomposition timeline'
    });
    this.#container.appendChild(this.#svg);

    // Subscribe to state changes
    this.#unsubscribe = appState.subscribe(() => {
      this.#scheduleRender();
    });

    // Initial render
    this.render();
  }

  /** Schedule a render on the next animation frame. */
  #scheduleRender() {
    if (!this.#needsRender) {
      this.#needsRender = true;
      this.#rafId = requestAnimationFrame(() => {
        this.#needsRender = false;
        this.render();
      });
    }
  }

  /**
   * Full render: clears SVG and rebuilds from current state.
   */
  render() {
    const state = appState.state;
    const { w, cuts, mode, p, i } = state;

    // Clear SVG
    while (this.#svg.firstChild) {
      this.#svg.removeChild(this.#svg.firstChild);
    }

    if (!w || w.length === 0) {
      this.#renderEmptyState();
      return;
    }

    const n = w.length;
    const totalWidth = n * CHAR_WIDTH + TIMELINE_PADDING_X * 2;
    const totalHeight = LABEL_HEIGHT + CHAR_HEIGHT + BADGE_HEIGHT + PUMPED_ROW_GAP + PUMPED_CHAR_HEIGHT + BADGE_HEIGHT + TIMELINE_PADDING_Y * 2;

    this.#svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    this.#svg.setAttribute('width', Math.min(totalWidth, this.#container.clientWidth || 800));
    this.#svg.setAttribute('height', totalHeight);

    const colors = mode === 'REGULAR' ? REGULAR_COLORS : CFL_COLORS;
    const segmentNames = mode === 'REGULAR' ? ['x', 'y', 'z'] : ['u', 'v', 'x', 'y', 'z'];

    // Compute segment boundaries
    const boundaries = this.#computeBoundaries(w, cuts, mode);

    // 1. Render segment backgrounds
    const rowY = TIMELINE_PADDING_Y + LABEL_HEIGHT;
    for (const seg of boundaries) {
      if (seg.length === 0) continue;
      const color = colors[seg.name];
      const rect = svgEl('rect', {
        x: TIMELINE_PADDING_X + seg.start * CHAR_WIDTH,
        y: rowY,
        width: seg.length * CHAR_WIDTH,
        height: CHAR_HEIGHT,
        fill: color.fill,
        stroke: color.stroke,
        'stroke-width': 1.5,
        rx: 4
      });
      this.#svg.appendChild(rect);
    }

    // 2. Render character cells
    for (let ci = 0; ci < n; ci++) {
      const cx = TIMELINE_PADDING_X + ci * CHAR_WIDTH + CHAR_WIDTH / 2;
      const cy = rowY + CHAR_HEIGHT / 2;
      const text = svgEl('text', {
        x: cx,
        y: cy + 5,
        'text-anchor': 'middle',
        'font-family': "'JetBrains Mono', 'Fira Code', monospace",
        'font-size': 16,
        fill: 'var(--color-text-primary)',
        'pointer-events': 'none'
      });
      text.textContent = w[ci];
      this.#svg.appendChild(text);
    }

    // 3. Render segment length badges below
    const badgeY = rowY + CHAR_HEIGHT + 6;
    for (const seg of boundaries) {
      const bx = TIMELINE_PADDING_X + seg.start * CHAR_WIDTH + (seg.length * CHAR_WIDTH) / 2;
      const badge = svgEl('text', {
        x: bx,
        y: badgeY + 14,
        'text-anchor': 'middle',
        'font-family': "'Inter', system-ui, sans-serif",
        'font-size': 11,
        fill: colors[seg.name].stroke,
        'font-weight': 600
      });
      badge.textContent = `|${seg.name}|=${seg.length}`;
      this.#svg.appendChild(badge);
    }

    // 4. Render cut handles
    const handlePositions = mode === 'REGULAR'
      ? [cuts[0], cuts[1]]
      : [cuts[0], cuts[1], cuts[2], cuts[3]];

    const handleLabels = mode === 'REGULAR'
      ? ['cut₁', 'cut₂']
      : ['cut₁', 'cut₂', 'cut₃', 'cut₄'];

    for (let hi = 0; hi < handlePositions.length; hi++) {
      const hx = TIMELINE_PADDING_X + handlePositions[hi] * CHAR_WIDTH;
      const handleGroup = svgEl('g', {
        class: 'timeline-handle',
        'data-handle': hi,
        tabindex: 0,
        role: 'slider',
        'aria-label': `${handleLabels[hi]} at position ${handlePositions[hi]}`,
        'aria-valuemin': 0,
        'aria-valuemax': n,
        'aria-valuenow': handlePositions[hi]
      });

      // Vertical line
      const line = svgEl('line', {
        x1: hx, y1: rowY - 4,
        x2: hx, y2: rowY + CHAR_HEIGHT + 4,
        stroke: 'var(--color-accent-primary)',
        'stroke-width': 2,
        'stroke-dasharray': '4 2'
      });
      handleGroup.appendChild(line);

      // Draggable circle
      const circle = svgEl('circle', {
        cx: hx,
        cy: rowY - 8,
        r: HANDLE_RADIUS,
        fill: 'var(--color-accent-primary)',
        stroke: 'var(--color-surface)',
        'stroke-width': 2,
        cursor: 'grab',
        class: 'handle-circle'
      });
      handleGroup.appendChild(circle);

      // Handle label above
      const label = svgEl('text', {
        x: hx,
        y: TIMELINE_PADDING_Y,
        'text-anchor': 'middle',
        'font-family': "'Inter', system-ui, sans-serif",
        'font-size': 10,
        fill: 'var(--color-text-secondary)',
        'pointer-events': 'none'
      });
      label.textContent = `${handleLabels[hi]}=${handlePositions[hi]}`;
      handleGroup.appendChild(label);

      this.#svg.appendChild(handleGroup);

      // Bind pointer events
      this.#bindHandleEvents(handleGroup, hi);
    }

    // 5. Render pumped string preview
    const pumpedStr = pumpString(w, cuts, i, mode);
    this.#renderPumpedString(pumpedStr, w, cuts, i, mode, rowY + CHAR_HEIGHT + BADGE_HEIGHT + PUMPED_ROW_GAP, totalWidth);

    // 6. Validate and add constraint indicators
    this.#renderConstraintIndicators(boundaries, mode, cuts, p);
  }

  /**
   * Compute segment boundaries from cuts.
   * @param {string} w
   * @param {number[]} cuts
   * @param {'REGULAR'|'CFL'} mode
   * @returns {{ name: string, start: number, length: number }[]}
   */
  #computeBoundaries(w, cuts, mode) {
    const n = w.length;
    if (mode === 'REGULAR') {
      const [c1, c2] = cuts;
      return [
        { name: 'x', start: 0, length: c1 },
        { name: 'y', start: c1, length: c2 - c1 },
        { name: 'z', start: c2, length: n - c2 }
      ];
    } else {
      const [c1, c2, c3, c4] = cuts;
      return [
        { name: 'u', start: 0, length: c1 },
        { name: 'v', start: c1, length: c2 - c1 },
        { name: 'x', start: c2, length: c3 - c2 },
        { name: 'y', start: c3, length: c4 - c3 },
        { name: 'z', start: c4, length: n - c4 }
      ];
    }
  }

  /**
   * Render the pumped string w_i below the main timeline.
   */
  #renderPumpedString(pumpedStr, w, cuts, i, mode, startY, totalWidth) {
    if (pumpedStr.length === 0) {
      const emptyText = svgEl('text', {
        x: TIMELINE_PADDING_X,
        y: startY + 18,
        'font-family': "'Inter', system-ui, sans-serif",
        'font-size': 12,
        fill: 'var(--color-text-muted)',
        'font-style': 'italic'
      });
      emptyText.textContent = `w${subscript(i)} = ε (empty string)`;
      this.#svg.appendChild(emptyText);
      return;
    }

    // Label
    const label = svgEl('text', {
      x: TIMELINE_PADDING_X - 2,
      y: startY - 4,
      'font-family': "'Inter', system-ui, sans-serif",
      'font-size': 11,
      fill: 'var(--color-text-secondary)',
      'font-weight': 600
    });
    label.textContent = `w${subscript(i)} (|w${subscript(i)}| = ${pumpedStr.length})`;
    this.#svg.appendChild(label);

    // Render characters of pumped string (smaller scale)
    const maxVisible = Math.floor((totalWidth - TIMELINE_PADDING_X * 2) / PUMPED_CHAR_WIDTH);
    const display = pumpedStr.length > maxVisible ? pumpedStr.substring(0, maxVisible) : pumpedStr;

    for (let ci = 0; ci < display.length; ci++) {
      const cx = TIMELINE_PADDING_X + ci * PUMPED_CHAR_WIDTH + PUMPED_CHAR_WIDTH / 2;

      // Background rect
      const segColor = this.#getPumpedCharColor(ci, w, cuts, i, mode);
      const rect = svgEl('rect', {
        x: TIMELINE_PADDING_X + ci * PUMPED_CHAR_WIDTH,
        y: startY,
        width: PUMPED_CHAR_WIDTH,
        height: PUMPED_CHAR_HEIGHT,
        fill: segColor,
        rx: 2,
        opacity: 0.5
      });
      this.#svg.appendChild(rect);

      const text = svgEl('text', {
        x: cx,
        y: startY + PUMPED_CHAR_HEIGHT / 2 + 4,
        'text-anchor': 'middle',
        'font-family': "'JetBrains Mono', monospace",
        'font-size': 13,
        fill: 'var(--color-text-primary)',
        'pointer-events': 'none'
      });
      text.textContent = display[ci];
      this.#svg.appendChild(text);
    }

    if (pumpedStr.length > maxVisible) {
      const ellipsis = svgEl('text', {
        x: TIMELINE_PADDING_X + maxVisible * PUMPED_CHAR_WIDTH + 6,
        y: startY + PUMPED_CHAR_HEIGHT / 2 + 4,
        'font-family': "'Inter', sans-serif",
        'font-size': 13,
        fill: 'var(--color-text-muted)'
      });
      ellipsis.textContent = '…';
      this.#svg.appendChild(ellipsis);
    }
  }

  /**
   * Determine the background color for a character in the pumped string.
   */
  #getPumpedCharColor(charIdx, w, cuts, i, mode) {
    if (mode === 'REGULAR') {
      const [c1, c2] = cuts;
      const xLen = c1;
      const yLen = c2 - c1;
      const yRepeatedLen = yLen * i;

      if (charIdx < xLen) return '#3B5BDB33';
      if (charIdx < xLen + yRepeatedLen) return '#2F9E4444';
      return '#86868633';
    } else {
      const [c1, c2, c3, c4] = cuts;
      const uLen = c1;
      const vLen = c2 - c1;
      const xLen = c3 - c2;
      const yLen = c4 - c3;

      let pos = charIdx;
      if (pos < uLen) return '#3B5BDB33';
      pos -= uLen;
      if (pos < vLen * i) return '#7048E844';
      pos -= vLen * i;
      if (pos < xLen) return '#E8590C33';
      pos -= xLen;
      if (pos < yLen * i) return '#2F9E4444';
      return '#86868633';
    }
  }

  /**
   * Render validation constraint visual indicators.
   */
  #renderConstraintIndicators(boundaries, mode, cuts, p) {
    const validation = validateCuts(appState.state.w, cuts, p, mode);
    // Constraint indicators are rendered in the DOM dashboard, not in SVG
    // But we can add visual feedback on the SVG itself
    if (!validation.valid) {
      // Add a subtle red border around the SVG
      this.#svg.style.outline = '2px solid var(--color-accent-danger)';
      this.#svg.style.outlineOffset = '-2px';
    } else {
      this.#svg.style.outline = '2px solid var(--color-accent-success)';
      this.#svg.style.outlineOffset = '-2px';
    }
  }

  /**
   * Bind pointer events to a drag handle.
   * @param {SVGGElement} handleGroup
   * @param {number} handleIndex
   */
  #bindHandleEvents(handleGroup, handleIndex) {
    const state = appState.state;
    const n = state.w.length;

    handleGroup.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.#draggingHandle = handleIndex;
      handleGroup.setPointerCapture(e.pointerId);
      handleGroup.querySelector('.handle-circle')?.setAttribute('cursor', 'grabbing');
    });

    handleGroup.addEventListener('pointermove', (e) => {
      if (this.#draggingHandle !== handleIndex) return;

      const svgRect = this.#svg.getBoundingClientRect();
      const viewBox = this.#svg.viewBox.baseVal;
      const scaleX = viewBox.width / svgRect.width;
      const localX = (e.clientX - svgRect.left) * scaleX;

      // Snap to character boundary
      let charPos = Math.round((localX - TIMELINE_PADDING_X) / CHAR_WIDTH);
      charPos = Math.max(0, Math.min(n, charPos));

      // Update cuts in state (respecting ordering constraints)
      const cuts = [...appState.state.cuts];
      cuts[handleIndex] = charPos;

      // Enforce ordering: each cut must be ≤ the next
      const mode = appState.state.mode;
      const numHandles = mode === 'REGULAR' ? 2 : 4;

      for (let j = handleIndex - 1; j >= 0; j--) {
        if (cuts[j] > cuts[handleIndex]) cuts[j] = cuts[handleIndex];
      }
      for (let j = handleIndex + 1; j < numHandles; j++) {
        if (cuts[j] < cuts[handleIndex]) cuts[j] = cuts[handleIndex];
      }

      appState.update({ cuts });
    });

    handleGroup.addEventListener('pointerup', (e) => {
      this.#draggingHandle = null;
      handleGroup.releasePointerCapture(e.pointerId);
      handleGroup.querySelector('.handle-circle')?.setAttribute('cursor', 'grab');
    });

    // Keyboard support
    handleGroup.addEventListener('keydown', (e) => {
      const cuts = [...appState.state.cuts];
      const mode = appState.state.mode;
      const numHandles = mode === 'REGULAR' ? 2 : 4;
      let changed = false;

      if (e.key === 'ArrowRight' && cuts[handleIndex] < n) {
        cuts[handleIndex]++;
        // Push subsequent handles if needed
        for (let j = handleIndex + 1; j < numHandles; j++) {
          if (cuts[j] < cuts[handleIndex]) cuts[j] = cuts[handleIndex];
        }
        changed = true;
      } else if (e.key === 'ArrowLeft' && cuts[handleIndex] > 0) {
        cuts[handleIndex]--;
        // Pull previous handles if needed
        for (let j = handleIndex - 1; j >= 0; j--) {
          if (cuts[j] > cuts[handleIndex]) cuts[j] = cuts[handleIndex];
        }
        changed = true;
      }

      if (changed) {
        e.preventDefault();
        appState.update({ cuts });
      }
    });
  }

  /**
   * Render an empty state placeholder.
   */
  #renderEmptyState() {
    this.#svg.setAttribute('viewBox', '0 0 600 120');
    this.#svg.setAttribute('width', '100%');
    this.#svg.setAttribute('height', 120);

    const text = svgEl('text', {
      x: 300,
      y: 60,
      'text-anchor': 'middle',
      'font-family': "'Inter', system-ui, sans-serif",
      'font-size': 14,
      fill: 'var(--color-text-muted)',
      'font-style': 'italic'
    });
    text.textContent = 'Enter a string w above to visualize the decomposition';
    this.#svg.appendChild(text);

    this.#svg.style.outline = 'none';
  }

  /**
   * Cleanup subscriptions and event listeners.
   */
  destroy() {
    if (this.#unsubscribe) this.#unsubscribe();
    cancelAnimationFrame(this.#rafId);
  }
}

/**
 * Create Unicode subscript for a number.
 * @param {number} n
 * @returns {string}
 */
function subscript(n) {
  const subs = '₀₁₂₃₄₅₆₇₈₉';
  return String(n).split('').map(d => subs[parseInt(d)] || d).join('');
}
