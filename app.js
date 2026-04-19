/**
 * @fileoverview Main application entry point.
 * Mounts components, binds DOM events, orchestrates all modules.
 * @module app
 */

import { appState } from './store.js';
import { compileRegex, extractAlphabet } from './compiler.js';
import { compileCFG } from './parser.js';
import { validateCuts, pumpString, checkMembership, getSegments } from './validator.js';
import { Timeline } from './timeline.js';
import { buildProof, STEP_COLORS } from './proof.js';
import { copyLatex, copyMarkdownToClipboard, downloadLatex, downloadMarkdown } from './export.js';
import { LANGUAGE_TEMPLATES, getTemplatesForMode } from './languages.js';

// ═══════════════════════════════════════════════
// DOM REFERENCES
// ═══════════════════════════════════════════════

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
  // Header
  btnModeRegular: $('#btn-mode-regular'),
  btnModeCFL: $('#btn-mode-cfl'),
  btnThemeToggle: $('#btn-theme-toggle'),
  btnSidebarToggle: $('#btn-sidebar-toggle'),

  // Spec
  templateInput: $('#template-input'),
  templateDropdown: $('#template-dropdown'),
  specInput: $('#spec-input'),
  specLabel: $('#spec-label'),
  specHelp: $('#spec-help'),
  inputP: $('#input-p'),
  inputW: $('#input-w'),
  btnCompile: $('#btn-compile'),
  compileText: $('#compile-text'),
  compileStatus: $('#compile-status'),
  errorBanner: $('#error-banner'),

  // Timeline
  timelineContainer: $('#timeline-container'),
  timelineTitle: $('#timeline-title'),

  // Constraints
  constraintDashboard: $('#constraint-dashboard'),

  // Pumping
  pumpSlider: $('#pump-slider'),
  pumpILabel: $('#pump-i-label'),
  btnPumpMinus: $('#btn-pump-minus'),
  btnPumpPlus: $('#btn-pump-plus'),
  pumpResult: $('#pump-result'),

  // Refuter
  refuterToggle: $('#refuter-toggle'),
  refuterBody: $('#refuter-body'),
  btnRefuterStart: $('#btn-refuter-start'),
  btnRefuterCancel: $('#btn-refuter-cancel'),
  refuterProgressBar: $('#refuter-progress-bar'),
  refuterProgressFill: $('#refuter-progress-fill'),
  refuterStatus: $('#refuter-status'),
  refuterResults: $('#refuter-results'),

  // Proof
  proofToggle: $('#proof-toggle'),
  proofBody: $('#proof-body'),
  proofTree: $('#proof-tree'),
  btnCopyLatex: $('#btn-copy-latex'),
  btnCopyMd: $('#btn-copy-md'),
  btnDownloadTex: $('#btn-download-tex'),
  btnDownloadMd: $('#btn-download-md'),

  // Sidebar
  sidebar: $('#sidebar'),
  sidebarOverlay: $('#sidebar-overlay'),
  theoryTitle: $('#theory-title'),
  quantifierBlock: $('#quantifier-block'),
  colorLegend: $('#color-legend'),

  // Main pane (for scrolling)
  mainPane: $('#main-pane'),
};

// ═══════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════

/** @type {Timeline|null} */
let timeline = null;

/** @type {Worker|null} */
let worker = null;

/**
 * Initialize the application.
 */
function init() {
  // Detect system theme
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedTheme = localStorage.getItem('lemmalab-theme');
  const theme = savedTheme || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  appState.update({ theme });
  updateThemeButton(theme);

  // Initialize timeline
  timeline = new Timeline(DOM.timelineContainer);

  // Populate template dropdown
  populateTemplateDropdown();

  // Bind all event listeners
  bindEvents();

  // Subscribe to state changes for UI updates
  subscribeToStateChanges();

  // Render initial UI
  updateSidebar();
  renderConstraintDashboard();
  renderProofTree();
  updatePumpResult();
}

// ═══════════════════════════════════════════════
// EVENT BINDING
// ═══════════════════════════════════════════════

function bindEvents() {
  // Mode toggle
  DOM.btnModeRegular.addEventListener('click', () => setMode('REGULAR'));
  DOM.btnModeCFL.addEventListener('click', () => setMode('CFL'));

  // Theme toggle
  DOM.btnThemeToggle.addEventListener('click', toggleTheme);

  // Sidebar toggle
  DOM.btnSidebarToggle.addEventListener('click', toggleSidebar);
  DOM.sidebarOverlay.addEventListener('click', () => closeSidebar());

  // Template selector
  DOM.templateInput.addEventListener('click', () => {
    DOM.templateDropdown.classList.toggle('open');
    DOM.templateInput.setAttribute('aria-expanded',
      DOM.templateDropdown.classList.contains('open'));
  });
  DOM.templateInput.addEventListener('focus', () => {
    DOM.templateDropdown.classList.add('open');
    DOM.templateInput.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#template-selector')) {
      DOM.templateDropdown.classList.remove('open');
      DOM.templateInput.setAttribute('aria-expanded', 'false');
    }
  });

  // Compile button
  DOM.btnCompile.addEventListener('click', compileLanguage);

  // Input changes
  DOM.inputP.addEventListener('change', () => {
    const p = Math.max(1, Math.min(20, parseInt(DOM.inputP.value) || 2));
    DOM.inputP.value = p;
    appState.update({ p });
  });

  DOM.inputW.addEventListener('input', () => {
    const w = DOM.inputW.value;
    appState.update({ w });
    initializeCuts(w);
  });

  // Pumping slider
  DOM.pumpSlider.addEventListener('input', () => {
    const i = parseInt(DOM.pumpSlider.value);
    appState.update({ i });
  });

  DOM.btnPumpMinus.addEventListener('click', () => {
    const current = parseInt(DOM.pumpSlider.value);
    if (current > 0) {
      DOM.pumpSlider.value = current - 1;
      appState.update({ i: current - 1 });
    }
  });

  DOM.btnPumpPlus.addEventListener('click', () => {
    const current = parseInt(DOM.pumpSlider.value);
    if (current < 8) {
      DOM.pumpSlider.value = current + 1;
      appState.update({ i: current + 1 });
    }
  });

  // Refuter
  DOM.refuterToggle.addEventListener('click', () => toggleCollapsible('refuter'));
  DOM.btnRefuterStart.addEventListener('click', startRefuter);
  DOM.btnRefuterCancel.addEventListener('click', cancelRefuter);

  // Proof
  DOM.proofToggle.addEventListener('click', () => toggleCollapsible('proof'));

  // Export buttons
  DOM.btnCopyLatex.addEventListener('click', () => {
    const state = appState.state;
    copyLatex(state.proof, DOM.btnCopyLatex);
  });
  DOM.btnCopyMd.addEventListener('click', () => {
    const state = appState.state;
    copyMarkdownToClipboard(state.proof, DOM.btnCopyMd);
  });
  DOM.btnDownloadTex.addEventListener('click', () => {
    const state = appState.state;
    downloadLatex(state.proof, DOM.btnDownloadTex);
  });
  DOM.btnDownloadMd.addEventListener('click', () => {
    const state = appState.state;
    downloadMarkdown(state.proof, DOM.btnDownloadMd);
  });
}

// ═══════════════════════════════════════════════
// STATE SUBSCRIPTIONS
// ═══════════════════════════════════════════════

function subscribeToStateChanges() {
  appState.subscribe((state, prev) => {
    // Mode changed
    if (state.mode !== prev.mode) {
      updateModeUI(state.mode);
      updateSidebar();
      populateTemplateDropdown();
    }

    // Theme changed
    if (state.theme !== prev.theme) {
      updateThemeButton(state.theme);
    }

    // Cuts, w, i, or compiled changed → update constraints
    if (state.cuts !== prev.cuts || state.w !== prev.w ||
        state.i !== prev.i || state.compiled !== prev.compiled ||
        state.p !== prev.p) {
      updateConstraints();
      updatePumpResult();
      renderProofTree();
    }

    // Constraint changes → re-render dashboard
    if (state.constraints !== prev.constraints) {
      renderConstraintDashboard();
    }

    // Refuter status changes
    if (state.refuter !== prev.refuter) {
      updateRefuterUI();
    }

    // Proof changes
    if (state.proof !== prev.proof) {
      renderProofTreeDOM();
    }
  });
}

// ═══════════════════════════════════════════════
// MODE MANAGEMENT
// ═══════════════════════════════════════════════

/**
 * Set the pumping lemma mode.
 * @param {'REGULAR'|'CFL'} mode
 */
function setMode(mode) {
  appState.update({
    mode,
    spec: { source: '', type: mode === 'REGULAR' ? 'REGEX' : 'CFG' },
    compiled: null,
    w: '',
    cuts: mode === 'REGULAR' ? [0, 0] : [0, 0, 0, 0],
    constraints: { yNonEmpty: false, xyBoundedByP: false, wiInLanguage: null },
    proof: [],
    refuter: { status: 'idle', results: [] }
  });

  DOM.templateInput.value = '';
  DOM.specInput.value = '';
  DOM.inputW.value = '';
  DOM.compileStatus.textContent = '';
  hideError();

  // Scroll main pane to top so spec card is visible
  DOM.mainPane?.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateModeUI(mode) {
  const isRegular = mode === 'REGULAR';

  DOM.btnModeRegular.classList.toggle('active', isRegular);
  DOM.btnModeCFL.classList.toggle('active', !isRegular);
  DOM.btnModeRegular.setAttribute('aria-selected', isRegular);
  DOM.btnModeCFL.setAttribute('aria-selected', !isRegular);

  DOM.specLabel.textContent = isRegular ? 'Regular Expression' : 'Context-Free Grammar (BNF)';
  DOM.specInput.placeholder = isRegular
    ? 'e.g. (a|b)*aa(a|b)*'
    : 'e.g. S -> aSb | ε';
  DOM.specHelp.textContent = isRegular
    ? 'Enter a regular expression. Use | for alternation, * for Kleene star, + for one-or-more.'
    : 'Enter a CFG in BNF format. Each line: A -> α | β. Use ε for the empty string.';

  DOM.timelineTitle.textContent = isRegular
    ? 'String Decomposition (w = xyz)'
    : 'String Decomposition (w = uvxyz)';
}

// ═══════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════

function toggleTheme() {
  const current = appState.state.theme;
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('lemmalab-theme', next);
  appState.update({ theme: next });
}

function updateThemeButton(theme) {
  DOM.btnThemeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
  DOM.btnThemeToggle.setAttribute('aria-label',
    theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
}

// ═══════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════

function toggleSidebar() {
  DOM.sidebar.classList.toggle('open');
  DOM.sidebarOverlay.classList.toggle('visible');
}

function closeSidebar() {
  DOM.sidebar.classList.remove('open');
  DOM.sidebarOverlay.classList.remove('visible');
}

function updateSidebar() {
  const isRegular = appState.state.mode === 'REGULAR';

  DOM.theoryTitle.textContent = isRegular
    ? '📐 Pumping Lemma for Regular Languages'
    : '📐 Pumping Lemma for Context-Free Languages';

  if (isRegular) {
    DOM.quantifierBlock.innerHTML = `
      <span class="keyword keyword-forall">If</span> L is regular,<br>
      <span class="keyword keyword-exists">∃</span> p ≥ 1 (pumping length),<br>
      <span class="keyword keyword-forall">∀</span> w ∈ L with |w| ≥ p,<br>
      <span class="keyword keyword-exists">∃</span> decomposition w = xyz:<br>
      &nbsp;&nbsp;1. |y| ≥ 1<br>
      &nbsp;&nbsp;2. |xy| ≤ p<br>
      &nbsp;&nbsp;3. <span class="keyword keyword-forall">∀</span>i ≥ 0: <span class="keyword keyword-member">xy<sup>i</sup>z ∈ L</span>
    `;
    DOM.colorLegend.innerHTML = `
      <div class="color-legend-item"><div class="color-swatch" style="background:rgba(59,91,219,0.15);border-color:#3B5BDB"></div> x — prefix</div>
      <div class="color-legend-item"><div class="color-swatch" style="background:rgba(47,158,68,0.15);border-color:#2F9E44"></div> y — pumped segment</div>
      <div class="color-legend-item"><div class="color-swatch" style="background:rgba(134,142,150,0.12);border-color:#868E96"></div> z — suffix</div>
    `;
  } else {
    DOM.quantifierBlock.innerHTML = `
      <span class="keyword keyword-forall">If</span> L is context-free,<br>
      <span class="keyword keyword-exists">∃</span> p ≥ 1 (pumping length),<br>
      <span class="keyword keyword-forall">∀</span> w ∈ L with |w| ≥ p,<br>
      <span class="keyword keyword-exists">∃</span> decomposition w = uvxyz:<br>
      &nbsp;&nbsp;1. |vy| ≥ 1<br>
      &nbsp;&nbsp;2. |vxy| ≤ p<br>
      &nbsp;&nbsp;3. <span class="keyword keyword-forall">∀</span>i ≥ 0: <span class="keyword keyword-member">uv<sup>i</sup>xy<sup>i</sup>z ∈ L</span>
    `;
    DOM.colorLegend.innerHTML = `
      <div class="color-legend-item"><div class="color-swatch" style="background:rgba(59,91,219,0.15);border-color:#3B5BDB"></div> u — prefix</div>
      <div class="color-legend-item"><div class="color-swatch" style="background:rgba(112,72,232,0.15);border-color:#7048E8"></div> v — pumped prefix</div>
      <div class="color-legend-item"><div class="color-swatch" style="background:rgba(232,89,12,0.15);border-color:#E8590C"></div> x — middle</div>
      <div class="color-legend-item"><div class="color-swatch" style="background:rgba(47,158,68,0.15);border-color:#2F9E44"></div> y — pumped suffix</div>
      <div class="color-legend-item"><div class="color-swatch" style="background:rgba(134,142,150,0.12);border-color:#868E96"></div> z — suffix</div>
    `;
  }
}

// ═══════════════════════════════════════════════
// TEMPLATE SELECTOR
// ═══════════════════════════════════════════════

function populateTemplateDropdown() {
  const mode = appState.state.mode;
  const templates = getTemplatesForMode(mode);
  DOM.templateDropdown.innerHTML = '';

  for (const tmpl of templates) {
    const option = document.createElement('div');
    option.className = 'template-option';
    option.setAttribute('role', 'option');
    option.setAttribute('data-name', tmpl.name);

    let nameHTML = `<span class="template-option-name">${tmpl.name}`;
    if (tmpl.irregular) {
      nameHTML += ` <span class="badge-irregular">IRREGULAR</span>`;
    }
    nameHTML += `</span>`;

    option.innerHTML = `
      ${nameHTML}
      ${tmpl.note ? `<span class="template-option-note">${tmpl.note}</span>` : ''}
    `;

    option.addEventListener('click', () => loadTemplate(tmpl));
    DOM.templateDropdown.appendChild(option);
  }
}

/**
 * Load a language template into the UI.
 * @param {import('./languages.js').LanguageTemplate} tmpl
 */
function loadTemplate(tmpl) {
  // Set mode if different
  if (tmpl.mode !== appState.state.mode) {
    setMode(tmpl.mode);
  }

  // Fill UI
  DOM.templateInput.value = tmpl.name;
  DOM.templateDropdown.classList.remove('open');
  DOM.templateInput.setAttribute('aria-expanded', 'false');

  if (tmpl.spec) {
    DOM.specInput.value = tmpl.spec;
    appState.update({
      spec: { source: tmpl.spec, type: tmpl.type }
    });
  } else {
    DOM.specInput.value = '';
    appState.update({
      spec: { source: '', type: tmpl.type }
    });
  }

  DOM.inputP.value = tmpl.p;
  DOM.inputW.value = tmpl.example;
  appState.update({
    p: tmpl.p,
    w: tmpl.example
  });
  initializeCuts(tmpl.example);

  // Auto-compile if spec exists
  if (tmpl.spec) {
    compileLanguage();
  } else if (tmpl.irregular && tmpl.membership) {
    // For irregular languages, set up manual membership oracle
    appState.update({
      compiled: {
        type: tmpl.type === 'REGEX' ? 'DFA' : 'CYK',
        accepts: tmpl.membership,
        meta: { isManualOracle: true, alphabet: tmpl.alphabet }
      }
    });
    DOM.compileStatus.textContent = '✓ Manual membership oracle loaded';
    DOM.compileStatus.style.color = 'var(--color-accent-success)';
    updateConstraints();
  }
}

// ═══════════════════════════════════════════════
// COMPILATION
// ═══════════════════════════════════════════════

function compileLanguage() {
  const state = appState.state;
  const source = DOM.specInput.value.trim();

  if (!source) {
    showError('Please enter a language specification.');
    return;
  }

  hideError();

  // Show loading state
  DOM.compileText.innerHTML = '<span class="spinner"></span> Compiling…';
  DOM.btnCompile.disabled = true;

  // Use setTimeout to allow UI to update before potentially blocking compilation
  setTimeout(() => {
    try {
      let compiled;
      if (state.mode === 'REGULAR') {
        const result = compileRegex(source);
        compiled = {
          type: 'DFA',
          accepts: result.accepts,
          meta: result.meta
        };
        DOM.compileStatus.textContent =
          `✓ DFA: ${result.meta.minDfaStates} states (from ${result.meta.nfaStates} NFA states)`;
      } else {
        const result = compileCFG(source);
        compiled = {
          type: 'CYK',
          accepts: result.accepts,
          meta: result.meta
        };
        const ruleCount = Object.values(result.meta.cnf.rules).flat().length;
        DOM.compileStatus.textContent =
          `✓ CNF: ${Object.keys(result.meta.cnf.rules).length} nonterminals, ${ruleCount} rules`;
      }

      DOM.compileStatus.style.color = 'var(--color-accent-success)';
      appState.update({
        compiled,
        spec: { source, type: state.mode === 'REGULAR' ? 'REGEX' : 'CFG' }
      });

      updateConstraints();
    } catch (e) {
      showError(`Compilation error: ${e.message}`);
      DOM.compileStatus.textContent = '✗ Failed';
      DOM.compileStatus.style.color = 'var(--color-accent-danger)';
    } finally {
      DOM.compileText.textContent = 'Compile Language';
      DOM.btnCompile.disabled = false;
    }
  }, 20);
}

// ═══════════════════════════════════════════════
// CUT INITIALIZATION
// ═══════════════════════════════════════════════

function initializeCuts(w) {
  const state = appState.state;
  const n = w.length;
  const p = state.p;

  if (state.mode === 'REGULAR') {
    // Default: x has length 0, y has length min(1, n), z is the rest
    const yEnd = Math.min(Math.min(p, n), Math.max(1, 1));
    appState.update({ cuts: [0, Math.min(yEnd, n)] });
  } else {
    // CFL: default small decomposition
    const maxMid = Math.min(p, n);
    const vEnd = Math.min(1, maxMid);
    appState.update({ cuts: [0, vEnd, vEnd, Math.min(vEnd + 1, maxMid)] });
  }
}

// ═══════════════════════════════════════════════
// CONSTRAINTS
// ═══════════════════════════════════════════════

function updateConstraints() {
  const state = appState.state;
  const { w, cuts, p, mode, i, compiled } = state;

  if (!w || w.length === 0) {
    appState.update({
      constraints: { yNonEmpty: false, xyBoundedByP: false, wiInLanguage: null }
    });
    return;
  }

  const validation = validateCuts(w, cuts, p, mode);
  let wiInLanguage = null;

  if (compiled && validation.valid) {
    const pumpedStr = pumpString(w, cuts, i, mode);
    wiInLanguage = checkMembership(compiled, pumpedStr);
  }

  const constraints = {
    ...validation.details,
    wiInLanguage
  };

  appState.update({ constraints });
}

function renderConstraintDashboard() {
  const state = appState.state;
  const { mode, constraints, w, cuts, p, i, compiled } = state;
  const dashboard = DOM.constraintDashboard;
  dashboard.innerHTML = '';

  if (!w) {
    dashboard.innerHTML = '<div class="empty-state"><div class="empty-state-text text-muted">Enter a string to see constraints</div></div>';
    return;
  }

  const rows = [];

  if (mode === 'REGULAR') {
    const yLen = cuts[1] - cuts[0];
    const xyLen = cuts[1];

    rows.push({
      valid: constraints.yNonEmpty,
      label: '|y| ≥ 1',
      value: `|y| = ${yLen}`,
      tooltip: 'The pumped segment y must contain at least one character.'
    });
    rows.push({
      valid: constraints.xyBoundedByP,
      label: '|xy| ≤ p',
      value: `|xy| = ${xyLen}, p = ${p}`,
      tooltip: 'The prefix xy must not be longer than the pumping length p.'
    });
  } else {
    const vLen = cuts[1] - cuts[0];
    const xLen = cuts[2] - cuts[1];
    const yLen = cuts[3] - cuts[2];

    rows.push({
      valid: constraints.vyNonEmpty,
      label: '|vy| ≥ 1',
      value: `|vy| = ${vLen + yLen}`,
      tooltip: 'At least one of v or y must be non-empty.'
    });
    rows.push({
      valid: constraints.vxyBoundedByP,
      label: '|vxy| ≤ p',
      value: `|vxy| = ${vLen + xLen + yLen}, p = ${p}`,
      tooltip: 'The middle part vxy must not be longer than p.'
    });
  }

  // Membership constraint
  const pumpedStr = pumpString(w, cuts, i, mode);
  const truncated = pumpedStr.length > 20 ? pumpedStr.substring(0, 17) + '…' : pumpedStr;
  rows.push({
    valid: constraints.wiInLanguage === true ? true : constraints.wiInLanguage === false ? false : null,
    label: `w${subscript(i)} ∈ L`,
    value: compiled ? `w${subscript(i)} = ${truncated}` : 'No language compiled',
    tooltip: 'Whether the pumped string is in the language.'
  });

  for (const row of rows) {
    const el = document.createElement('div');
    el.className = `constraint-row ${row.valid === true ? 'valid' : row.valid === false ? 'invalid' : ''}`;

    const iconClass = row.valid === true ? 'valid' : row.valid === false ? 'invalid' : 'neutral';
    const icon = row.valid === true ? '✓' : row.valid === false ? '✗' : '—';

    el.innerHTML = `
      <span class="constraint-icon ${iconClass}">${icon}</span>
      <span class="constraint-label">${row.label}</span>
      <span class="constraint-value">${row.value}</span>
      <span class="constraint-info" data-tooltip="${row.tooltip}">?</span>
    `;
    dashboard.appendChild(el);
  }
}

// ═══════════════════════════════════════════════
// PUMPING
// ═══════════════════════════════════════════════

function updatePumpResult() {
  const state = appState.state;
  const { w, cuts, i, mode } = state;

  DOM.pumpILabel.textContent = `i = ${i}`;
  DOM.pumpSlider.value = i;

  if (!w || w.length === 0) {
    DOM.pumpResult.textContent = 'Enter a string to see the pumped result.';
    return;
  }

  const pumped = pumpString(w, cuts, i, mode);
  const segments = getSegments(w, cuts, mode);

  if (mode === 'REGULAR') {
    const { x, y, z } = segments;
    DOM.pumpResult.innerHTML = `<strong>w${subscript(i)}</strong> = ` +
      (x ? `<span style="color:var(--seg-x-stroke)">${esc(x)}</span>` : '') +
      `<span style="color:var(--seg-y-stroke);font-weight:700">${esc(y.repeat(i))}</span>` +
      (z ? `<span style="color:var(--seg-z-stroke)">${esc(z)}</span>` : '') +
      ` <span class="text-muted">(|w${subscript(i)}| = ${pumped.length})</span>`;
  } else {
    const { u, v, x, y, z } = segments;
    DOM.pumpResult.innerHTML = `<strong>w${subscript(i)}</strong> = ` +
      (u ? `<span style="color:#3B5BDB">${esc(u)}</span>` : '') +
      `<span style="color:#7048E8;font-weight:700">${esc(v.repeat(i))}</span>` +
      (x ? `<span style="color:#E8590C">${esc(x)}</span>` : '') +
      `<span style="color:#2F9E44;font-weight:700">${esc(y.repeat(i))}</span>` +
      (z ? `<span style="color:#868E96">${esc(z)}</span>` : '') +
      ` <span class="text-muted">(|w${subscript(i)}| = ${pumped.length})</span>`;
  }
}

// ═══════════════════════════════════════════════
// PROOF TREE
// ═══════════════════════════════════════════════

function renderProofTree() {
  const state = appState.state;
  const proof = buildProof(state);
  appState.update({ proof });
}

function renderProofTreeDOM() {
  const proof = appState.state.proof;
  DOM.proofTree.innerHTML = '';

  if (proof.length === 0) {
    DOM.proofTree.innerHTML = '<div class="empty-state"><div class="empty-state-text text-muted">Enter a string and compile a language to generate a proof.</div></div>';
    return;
  }

  for (const step of proof) {
    const el = document.createElement('div');
    el.className = 'proof-step';
    el.setAttribute('data-type', step.type);
    el.innerHTML = `
      <span class="proof-step-type">${step.type}</span>
      <div class="proof-step-content">${step.htmlSummary}</div>
    `;
    DOM.proofTree.appendChild(el);
  }
}

// ═══════════════════════════════════════════════
// AUTO-REFUTER
// ═══════════════════════════════════════════════

function startRefuter() {
  const state = appState.state;

  if (!state.compiled && !state.spec.source) {
    showError('Please compile a language first, or load an irregular template.');
    return;
  }

  hideError();

  // Terminate existing worker
  if (worker) {
    worker.terminate();
    worker = null;
  }

  // Create new worker (non-module to maximize compatibility)
  worker = new Worker('worker.js');

  appState.update({
    refuter: { status: 'running', results: [] }
  });

  worker.onmessage = (e) => {
    const msg = e.data;

    switch (msg.type) {
      case 'PROGRESS':
        DOM.refuterProgressFill.style.width = `${msg.pct}%`;
        DOM.refuterStatus.textContent = `Searching… (length ${msg.currentLen}, ${msg.stringsChecked} strings checked)`;
        break;

      case 'RESULT': {
        const current = appState.state.refuter;
        appState.update({
          refuter: { ...current, results: [...current.results, msg.counterexample] }
        });
        break;
      }

      case 'DONE':
        appState.update({
          refuter: { ...appState.state.refuter, status: 'done' }
        });
        DOM.refuterStatus.textContent = msg.cancelled
          ? `Cancelled after ${(msg.elapsed / 1000).toFixed(1)}s. Found ${msg.total} counterexample(s).`
          : `Done in ${(msg.elapsed / 1000).toFixed(1)}s. Found ${msg.total} counterexample(s).`;
        break;

      case 'ERROR':
        appState.update({
          refuter: { ...appState.state.refuter, status: 'done' }
        });
        showError(`Auto-Refuter error: ${msg.message}`);
        break;
    }
  };

  // Prepare spec for worker
  let workerSpec;
  const meta = state.compiled?.meta;

  if (meta?.isManualOracle) {
    // For manual oracles (irregular languages), robustly serialize membership function
    const tmpl = LANGUAGE_TEMPLATES.find(t => t.name === DOM.templateInput.value);
    if (tmpl && tmpl.membership) {
      let fnStr = tmpl.membership.toString();
      // Handle (s) => expr vs (s) => { return expr; } vs function(s) { ... }
      let fnBody;
      if (fnStr.includes('=>')) {
        const parts = fnStr.split('=>');
        const rhs = parts.slice(1).join('=>').trim();
        fnBody = rhs.startsWith('{') ? rhs.match(/^\{([\s\S]*)\}$/)?.[1] : `return ${rhs}`;
      } else {
        fnBody = fnStr.match(/\{([\s\S]*)\}$/)?.[1] || 'return false';
      }
      workerSpec = { type: 'MEMBERSHIP', membershipBody: fnBody };
    } else {
      showError('Cannot serialize membership function for worker.');
      return;
    }
  } else {
    // Pass the pre-compiled model (DFA or CNF rules)
    workerSpec = {
      type: state.spec.type,
      model: meta?.model
    };
  }

  const alphabet = meta?.alphabet ? meta.alphabet.split('') : ['a', 'b'];

  worker.postMessage({
    type: 'START',
    spec: workerSpec,
    p: state.p,
    alphabet: alphabet,
    maxLen: 15,
    maxResults: 3,
    mode: state.mode
  });
}

function cancelRefuter() {
  if (worker) {
    worker.postMessage({ type: 'CANCEL' });
    appState.update({
      refuter: { ...appState.state.refuter, status: 'cancelled' }
    });
  }
}

function updateRefuterUI() {
  const { status, results } = appState.state.refuter;

  // Show/hide buttons
  DOM.btnRefuterStart.classList.toggle('hidden', status === 'running');
  DOM.btnRefuterCancel.classList.toggle('hidden', status !== 'running');
  DOM.refuterProgressBar.classList.toggle('hidden', status !== 'running');

  if (status === 'running') {
    DOM.refuterProgressFill.classList.add('indeterminate');
  } else {
    DOM.refuterProgressFill.classList.remove('indeterminate');
    DOM.refuterProgressFill.style.width = '100%';
  }

  // Render results
  DOM.refuterResults.innerHTML = '';
  for (const result of results) {
    const card = document.createElement('div');
    card.className = 'refuter-result-card';
    card.innerHTML = `
      <div class="result-string">Counterexample: w = "${result.w}" (|w| = ${result.w.length})</div>
      <div class="result-explanation">${result.explanation}</div>
      <button class="btn btn-sm btn-outline load-example-btn">Load this example</button>
    `;

    card.querySelector('.load-example-btn').addEventListener('click', () => {
      DOM.inputW.value = result.w;
      appState.update({ w: result.w });
      initializeCuts(result.w);
      updateConstraints();
    });

    DOM.refuterResults.appendChild(card);
  }
}

// ═══════════════════════════════════════════════
// COLLAPSIBLE PANELS
// ═══════════════════════════════════════════════

function toggleCollapsible(name) {
  const toggle = name === 'refuter' ? DOM.refuterToggle : DOM.proofToggle;
  const body = name === 'refuter' ? DOM.refuterBody : DOM.proofBody;
  toggle.classList.toggle('open');
  body.classList.toggle('open');
}

// ═══════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════

function showError(message) {
  DOM.errorBanner.textContent = message;
  DOM.errorBanner.classList.add('visible');
}

function hideError() {
  DOM.errorBanner.classList.remove('visible');
}

// ═══════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════

function subscript(n) {
  const subs = '₀₁₂₃₄₅₆₇₈₉';
  return String(n).split('').map(d => subs[parseInt(d)] || d).join('');
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', init);
