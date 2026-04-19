/**
 * @fileoverview Reactive state store for LemmaLab.
 * Implements a PubSub pattern with ES2022 private class fields.
 * This is the single source of truth for all application state.
 * @module store
 */

/**
 * @typedef {'REGULAR'|'CFL'} Mode
 * @typedef {'light'|'dark'} Theme
 * @typedef {'REGEX'|'CFG'} SpecType
 * @typedef {'DFA'|'CYK'} CompiledType
 * @typedef {'idle'|'running'|'done'|'cancelled'} RefuterStatus
 */

/**
 * @typedef {Object} AppState
 * @property {Mode} mode
 * @property {Theme} theme
 * @property {{ source: string, type: SpecType }} spec
 * @property {null|{ type: CompiledType, accepts: Function, meta: Object }} compiled
 * @property {number} p
 * @property {string} w
 * @property {number[]} cuts
 * @property {number} i
 * @property {{ yNonEmpty: boolean, xyBoundedByP: boolean, vyNonEmpty?: boolean, vxyBoundedByP?: boolean, wiInLanguage: boolean|null }} constraints
 * @property {{ status: RefuterStatus, results: Array }} refuter
 * @property {Array} proof
 */

/** Default initial state */
const DEFAULT_STATE = {
  mode: 'REGULAR',
  theme: 'light',
  spec: { source: '', type: 'REGEX' },
  compiled: null,
  p: 2,
  w: '',
  cuts: [0, 0],
  i: 1,
  constraints: {
    yNonEmpty: false,
    xyBoundedByP: false,
    wiInLanguage: null
  },
  refuter: { status: 'idle', results: [] },
  proof: []
};

/**
 * Reactive state store using PubSub pattern.
 * Uses ES2022 private class fields for encapsulation.
 */
class Store {
  /** @type {AppState} */
  #state;

  /** @type {Set<Function>} */
  #listeners = new Set();

  /**
   * @param {Partial<AppState>} [initialState]
   */
  constructor(initialState = {}) {
    this.#state = { ...structuredClone(DEFAULT_STATE), ...initialState };
  }

  /**
   * Returns a shallow copy of the current state.
   * @returns {AppState}
   */
  get state() {
    return { ...this.#state };
  }

  /**
   * Shallow-merges a patch into state and notifies all listeners.
   * @param {Partial<AppState>} patch - The partial state to merge.
   */
  update(patch) {
    const prev = { ...this.#state };
    for (const key of Object.keys(patch)) {
      if (patch[key] !== null && typeof patch[key] === 'object' && !Array.isArray(patch[key]) && typeof this.#state[key] === 'object' && this.#state[key] !== null) {
        this.#state[key] = { ...this.#state[key], ...patch[key] };
      } else {
        this.#state[key] = patch[key];
      }
    }
    for (const fn of this.#listeners) {
      try {
        fn(this.#state, prev);
      } catch (e) {
        console.error('[Store] Listener error:', e);
      }
    }
  }

  /**
   * Subscribe to state changes.
   * @param {(state: AppState, prev: AppState) => void} fn
   * @returns {() => void} Unsubscribe function.
   */
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /**
   * Create a derived value that auto-updates when dependencies change.
   * @template T
   * @param {(state: AppState) => T} selectorFn - Computes derived value from state.
   * @param {(value: T) => void} callback - Called when derived value changes.
   * @returns {() => void} Unsubscribe function.
   */
  derived(selectorFn, callback) {
    let currentValue = selectorFn(this.#state);
    callback(currentValue);
    return this.subscribe((state) => {
      const newValue = selectorFn(state);
      if (!shallowEqual(currentValue, newValue)) {
        currentValue = newValue;
        callback(newValue);
      }
    });
  }
}

/**
 * Shallow equality check for derived value comparison.
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function shallowEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k => a[k] === b[k]);
}

/** Global application state instance */
export const appState = new Store();
export { Store };
