# LemmaLab

**An interactive proof arena for the Pumping Lemma.**

LemmaLab is a production-grade, zero-dependency web application that teaches and simulates the Pumping Lemma for both Regular Languages and Context-Free Languages. Built entirely in pure HTML5, CSS3, and ES2022+ JavaScript.

---

## ✨ Features

### Regular Pumping Lemma Mode
- Input a formal language via regular expression
- Set pumping length *p* and enter candidate string *w*
- **Drag** cut-handles on an interactive SVG timeline to define *w = xyz*
- Real-time constraint validation (|y| ≥ 1, |xy| ≤ p)
- Pump the string with slider (i = 0–8) and see live membership results
- **Auto-Refuter**: searches for counterexample strings that defeat ALL valid decompositions
- Formal proof tree with LaTeX/Markdown export

### Context-Free Pumping Lemma Mode
- Input a CFG in BNF format
- **Four** draggable cut-handles for *w = uvxyz* decomposition
- CYK membership algorithm via Chomsky Normal Form conversion
- Constraint validation (|vy| ≥ 1, |vxy| ≤ p)
- Same Auto-Refuter and proof tree as Regular mode

### Educational Features
- Collapsible theory sidebar with formal quantifier structure
- Color-coded segments matching formal variable names
- Tooltips explaining constraint violations
- 14 built-in language templates (Regular + CFL + irregular examples)

---

## 🏗️ Architecture

```
lemma-lab/
├── index.html      # Semantic HTML5 shell
├── styles.css      # Design system (90+ CSS custom properties)
├── app.js          # Application orchestrator
├── store.js        # Reactive state store (PubSub)
├── compiler.js     # Regex → NFA (Thompson) → DFA → Minimized DFA (Hopcroft)
├── parser.js       # CFG → CNF → CYK membership
├── validator.js    # Constraint checking + pumping logic
├── timeline.js     # SVG timeline + drag handles
├── worker.js       # Web Worker: bounded counterexample search
├── proof.js        # Proof tree + LaTeX/Markdown serialization
├── export.js       # Blob download + clipboard utilities
├── languages.js    # 14 built-in language templates
├── vercel.json     # Deployment configuration
└── README.md       # This file
```

### Algorithm Pipeline

#### Regular Languages
1. **Lexer** → tokenize regex pattern
2. **Parser** → recursive descent → AST
3. **Thompson NFA** → ε-NFA from AST
4. **Subset Construction** → NFA → DFA
5. **Hopcroft Minimization** → minimized DFA
6. **Membership** → run DFA on input string

#### Context-Free Languages
1. **CFG Parser** → BNF text → production rules
2. **CNF Conversion**:
   - Add new start symbol
   - Eliminate ε-productions (nullable detection via fixed-point)
   - Eliminate unit productions (transitive closure)
   - Binarize long rules
   - Separate terminals in mixed rules
3. **CYK Algorithm** → O(n³) dynamic programming membership test

---

## 🎨 Design

- **Typography**: Inter (UI) + JetBrains Mono (code/formulas)
- **Color System**: 30+ semantic design tokens with full dark mode
- **Animations**: Constraint pulse, shake on violation, staggered proof steps, smooth drag
- **Responsive**: Two-column grid (≥1024px), single column + drawer (640–1024px), mobile-first (<640px)
- **Accessibility**: ARIA roles, keyboard navigation for cut handles, ≥4.5:1 contrast ratios

---

## 🚀 Deployment

### Local Development
```bash
npx serve .
# or
python -m http.server 8000
```

### Vercel
```bash
vercel --prod
```

No build step required. Files are served statically.

---

## 📚 Theory Background

### The Pumping Lemma for Regular Languages

**Statement**: If *L* is a regular language, then there exists a constant *p* ≥ 1 (the pumping length) such that for every string *w* ∈ *L* with |*w*| ≥ *p*, there exists a decomposition *w* = *xyz* satisfying:
1. |*y*| ≥ 1
2. |*xy*| ≤ *p*
3. For all *i* ≥ 0: *xy^i z* ∈ *L*

**Contrapositive (for proofs)**: If for every *p* ≥ 1, there exists a string *w* ∈ *L* with |*w*| ≥ *p* such that for every decomposition *w* = *xyz* satisfying conditions 1 and 2, there exists an *i* ≥ 0 where *xy^i z* ∉ *L*, then *L* is **not** regular.

### The Pumping Lemma for Context-Free Languages

**Statement**: If *L* is context-free, then there exists *p* ≥ 1 such that for every *w* ∈ *L* with |*w*| ≥ *p*, there exists a decomposition *w* = *uvxyz* satisfying:
1. |*vy*| ≥ 1
2. |*vxy*| ≤ *p*
3. For all *i* ≥ 0: *uv^i xy^i z* ∈ *L*

---

## 🔧 Technical Notes

- **Zero dependencies**: No npm packages, no build tools, no frameworks
- **ES2022+**: Uses private class fields (#), optional chaining, structuredClone
- **Web Worker**: Auto-Refuter runs in a separate thread with inlined compilation logic
- **Performance targets**: DFA compilation <100ms, CYK for length-30 strings <200ms, timeline renders <16ms

---

## 📄 License

MIT License

---

*Built for academic excellence. Suitable for deployment, grading, and conference demonstrations.*