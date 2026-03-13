// src/server/pages/methodology.ts
// Methodology page renderer — detailed documentation of how benchmarks work.
//
// Renders:
//   /methodology → Static documentation page explaining benchmark methodology
//
// Covers:
//   - What is measured (4 metrics)
//   - How measurements are taken (phases, isolation, GC barriers)
//   - Fairness guarantees (randomized order, identical templates)
//   - Scroll speed testing (7 progressive speeds)
//   - Stress testing (CPU burn simulation)
//   - Memory measurement (retry strategy, heap snapshots)
//   - Crowdsourced data collection
//   - Limitations and caveats

import { SITE } from "../config";
import { renderShell } from "../shell";

// =============================================================================
// Cache
// =============================================================================

let cachedHtml: string | null = null;

export function clearMethodologyCache(): void {
  cachedHtml = null;
}

// =============================================================================
// Content
// =============================================================================

function buildContent(): string {
  return `
    <div class="meth">
      <header class="meth__header">
        <h1 class="meth__title">Methodology</h1>
        <p class="meth__subtitle">
          How virtuallist.io measures virtual list performance — what we test,
          how we test it, and why you can trust the results.
        </p>
      </header>

      <!-- ── Overview ──────────────────────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">Overview</h2>
        <p class="meth__text">
          Every benchmark on virtuallist.io runs <strong>live in your browser</strong>.
          There are no pre-recorded results, no synthetic scores, and no simulated environments.
          Each library creates real DOM elements, scrolls them programmatically, and has its
          frame times, render latency, and memory usage measured with native browser APIs.
        </p>
        <p class="meth__text">
          All libraries are treated as equals — no library gets special treatment in the
          measurement pipeline, DOM template, or display order. The same infrastructure
          benchmarks every library, from load to teardown.
        </p>
      </section>

      <!-- ── 4 Metrics ─────────────────────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">What We Measure</h2>
        <p class="meth__text">
          Every benchmark run produces four core metrics, chosen to capture the
          most important aspects of virtual list performance:
        </p>

        <div class="meth__metrics-grid">
          <div class="meth__metric-card">
            <div class="meth__metric-icon">⚡</div>
            <h3 class="meth__metric-name">Initial Render</h3>
            <p class="meth__metric-unit">Milliseconds · Lower is better</p>
            <p class="meth__metric-desc">
              Time from library instantiation to first paint. Measured as the
              median of 5 iterations using <code>performance.mark/measure</code>
              for DevTools integration. Each iteration creates a fresh instance
              and waits for the next animation frame.
            </p>
          </div>

          <div class="meth__metric-card">
            <div class="meth__metric-icon">🧠</div>
            <h3 class="meth__metric-name">Memory Usage</h3>
            <p class="meth__metric-unit">Megabytes · Lower is better</p>
            <p class="meth__metric-desc">
              JS heap delta after rendering the list. Uses Chrome's
              <code>performance.memory.usedJSHeapSize</code> API with up to 10
              measurement attempts. Negative deltas (GC artifacts) are rejected;
              the median of valid readings is reported. Not available in Firefox.
            </p>
          </div>

          <div class="meth__metric-card">
            <div class="meth__metric-icon">📊</div>
            <h3 class="meth__metric-name">Scroll FPS</h3>
            <p class="meth__metric-unit">Frames per second · Higher is better</p>
            <p class="meth__metric-desc">
              Sustained scroll performance measured over 2 seconds per speed level.
              A <code>requestAnimationFrame</code> paint counter records frame delivery
              times while a high-frequency <code>setTimeout</code> scroll driver advances
              <code>scrollTop</code> at a constant pixels-per-second rate. Median FPS is computed
              from recorded frame intervals.
            </p>
          </div>

          <div class="meth__metric-card">
            <div class="meth__metric-icon">🎯</div>
            <h3 class="meth__metric-name">P95 Frame Time</h3>
            <p class="meth__metric-unit">Milliseconds · Lower is better</p>
            <p class="meth__metric-desc">
              The 95th percentile frame time during scroll — a measure of consistency
              and jank. While median FPS shows average throughput, P95 reveals
              the worst-case stutters that users actually feel. Computed from
              the same frame time array as FPS.
            </p>
          </div>
        </div>
      </section>

      <!-- ── Three-Phase Architecture ──────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">Three-Phase Measurement</h2>
        <p class="meth__text">
          Each benchmark run executes three isolated phases to prevent
          cross-contamination between measurements:
        </p>

        <div class="meth__phases">
          <div class="meth__phase">
            <div class="meth__phase-number">1</div>
            <div class="meth__phase-content">
              <h3 class="meth__phase-title">Timing Phase</h3>
              <p class="meth__phase-desc">
                The library is instantiated and destroyed 5 times. Each iteration
                is timed with <code>performance.mark/measure</code>. The median
                duration is reported as the render time. The container is cleaned
                and GC is triggered between iterations.
              </p>
            </div>
          </div>

          <div class="meth__phase">
            <div class="meth__phase-number">2</div>
            <div class="meth__phase-content">
              <h3 class="meth__phase-title">Memory Phase</h3>
              <p class="meth__phase-desc">
                Completely separate from timing. The heap is aggressively settled
                (3 cycles of <code>gc()</code> + 150ms + 5 frames), a baseline
                snapshot is taken, the library is instantiated, a gentle GC
                reclaims transient allocations, and a second snapshot is taken.
                Up to 10 attempts are made; negative deltas are discarded.
              </p>
            </div>
          </div>

          <div class="meth__phase">
            <div class="meth__phase-number">3</div>
            <div class="meth__phase-content">
              <h3 class="meth__phase-title">Scroll Phase</h3>
              <p class="meth__phase-desc">
                The instance from the last memory attempt is reused (it's still mounted).
                A dual-loop architecture drives the scroll: a <code>setTimeout(0)</code>
                loop updates <code>scrollTop</code> ~250 times/sec for smooth sub-pixel
                scrolling, while a <code>requestAnimationFrame</code> loop records frame
                delivery times. Each of 7 speed levels runs for 2 seconds with
                bidirectional scrolling (bouncing at edges).
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Fairness Guarantees ───────────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">Fairness Guarantees</h2>
        <p class="meth__text">
          Several mechanisms ensure no library gets an unfair advantage:
        </p>

        <div class="meth__list">
          <div class="meth__list-item">
            <strong>Randomized Execution Order</strong>
            <span>A coin flip decides which library runs first in each comparison, eliminating JIT warmth bias and GC bleed-through from one library to another.</span>
          </div>
          <div class="meth__list-item">
            <strong>GC Barriers</strong>
            <span><code>tryGC()</code> + <code>waitFrames(5)</code> is called between library runs to flush residual garbage from the previous measurement.</span>
          </div>
          <div class="meth__list-item">
            <strong>Identical DOM Templates</strong>
            <span>Every library renders the exact same 7-element DOM structure per item: avatar, content wrapper, title, subtitle, meta wrapper, badge, and timestamp.</span>
          </div>
          <div class="meth__list-item">
            <strong>Same Container Dimensions</strong>
            <span>All libraries render into the same-sized container (600px height) with the same item height (48px), ensuring identical viewport and overscan conditions.</span>
          </div>
          <div class="meth__list-item">
            <strong>Fresh Container Per Run</strong>
            <span>A new container element is created for each benchmark run. No leftover DOM, state, or event listeners from previous runs.</span>
          </div>
          <div class="meth__list-item">
            <strong>Consistent Overscan</strong>
            <span>All libraries use an overscan of 5 items (where configurable) to ensure they render the same number of off-screen elements.</span>
          </div>
        </div>
      </section>

      <!-- ── Scroll Speed Testing ──────────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">7 Scroll Speeds</h2>
        <p class="meth__text">
          Testing at a single scroll speed can miss performance cliffs — a library
          might be perfect at casual speeds but fall apart under aggressive scrolling.
          Each benchmark tests at 7 progressive speeds:
        </p>

        <div class="meth__table-wrapper">
          <table class="meth__table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Speed</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>0.1×</td>
                <td>720 px/s</td>
                <td>Crawl — pure baseline overhead measurement</td>
              </tr>
              <tr>
                <td>0.25×</td>
                <td>1,800 px/s</td>
                <td>Gentle browsing — minimal DOM recycling</td>
              </tr>
              <tr>
                <td>0.5×</td>
                <td>3,600 px/s</td>
                <td>Casual scrolling — light recycling</td>
              </tr>
              <tr>
                <td>1×</td>
                <td>7,200 px/s</td>
                <td>Normal scroll speed — baseline reference</td>
              </tr>
              <tr>
                <td>2×</td>
                <td>14,400 px/s</td>
                <td>Fast flick — aggressive touch/wheel gesture</td>
              </tr>
              <tr>
                <td>3×</td>
                <td>21,600 px/s</td>
                <td>Aggressive scroll — heavy DOM churn</td>
              </tr>
              <tr>
                <td>5×</td>
                <td>36,000 px/s</td>
                <td>Extreme stress test — maximum pressure</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="meth__text meth__text--note">
          All speeds are multiples of the base speed (7,200 px/s ≈ 2.5 items/frame at 60fps
          with 48px items). Time-based scrolling ensures consistent speed regardless of
          monitor refresh rate.
        </p>
      </section>

      <!-- ── Stress Testing ────────────────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">CPU Stress Testing</h2>
        <p class="meth__text">
          In real applications, the virtual list isn't the only thing running.
          State management, rendering other components, network handling, and
          business logic all compete for the same frame budget. The stress
          parameter simulates this by burning a configurable amount of CPU
          time in each <code>requestAnimationFrame</code> callback:
        </p>

        <div class="meth__table-wrapper">
          <table class="meth__table">
            <thead>
              <tr>
                <th>Level</th>
                <th>CPU Burn</th>
                <th>Remaining Budget (120Hz)</th>
                <th>Use Case</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>None</td>
                <td>0 ms</td>
                <td>8.33 ms</td>
                <td>Isolated library performance</td>
              </tr>
              <tr>
                <td>Light</td>
                <td>3 ms</td>
                <td>5.33 ms</td>
                <td>Simple app with some overhead</td>
              </tr>
              <tr>
                <td>Medium</td>
                <td>5 ms</td>
                <td>3.33 ms</td>
                <td>Moderate app complexity</td>
              </tr>
              <tr>
                <td>Heavy</td>
                <td>7 ms</td>
                <td>1.33 ms</td>
                <td>Complex app — separates fast from slow libraries</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="meth__text">
          The burn uses a tight busy-wait loop with <code>performance.now()</code>
          as the exit condition. Because it runs inside the rAF callback, it directly
          competes with the library's own rendering for frame budget — the more CPU
          the stress burns, the less time the library has to complete its work.
        </p>
      </section>

      <!-- ── Memory Measurement Details ────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">Memory Measurement</h2>
        <p class="meth__text">
          Memory measurement is the most challenging metric to get right. The
          JavaScript heap is a moving target — garbage collection can reclaim
          memory at any time, and transient allocations from the measurement
          infrastructure itself can pollute readings.
        </p>

        <h3 class="meth__subsection-title">Strategy</h3>
        <div class="meth__list">
          <div class="meth__list-item">
            <strong>Aggressive Heap Settling</strong>
            <span>Before taking the baseline snapshot, 3 cycles of <code>gc()</code> + 150ms + 5 animation frames flush accumulated garbage from previous phases.</span>
          </div>
          <div class="meth__list-item">
            <strong>Delta Measurement</strong>
            <span>The metric is the difference between <code>usedJSHeapSize</code> before and after creating the component — not the absolute value.</span>
          </div>
          <div class="meth__list-item">
            <strong>Negative Delta Rejection</strong>
            <span>If GC reclaims more old garbage than the component allocated, the delta is negative — this is an artifact, not real data. These readings are discarded.</span>
          </div>
          <div class="meth__list-item">
            <strong>Multiple Attempts</strong>
            <span>Up to 10 measurements are taken. The median of valid (positive) readings is reported. This dramatically reduces the chance of reporting "—" (unavailable).</span>
          </div>
          <div class="meth__list-item">
            <strong>Gentle Post-Create GC</strong>
            <span>After creating the component but before the "after" snapshot, a light GC pass reclaims transient allocations (createElement temporaries) without destroying the component itself.</span>
          </div>
        </div>

        <h3 class="meth__subsection-title">Limitations</h3>
        <p class="meth__text">
          Memory measurement requires Chrome with the <code>performance.memory</code> API.
          Firefox, Safari, and other browsers will show "—" for memory metrics.
          For the most accurate readings, launch Chrome with
          <code>--enable-precise-memory-info</code>.
        </p>
      </section>

      <!-- ── Dual-Loop Scroll Architecture ─────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">Scroll Architecture</h2>
        <p class="meth__text">
          The scroll measurement uses a dual-loop design to separate concerns
          and ensure accurate timing:
        </p>

        <div class="meth__diagram">
          <div class="meth__diagram-box">
            <div class="meth__diagram-label">Loop 1 — Paint Counter</div>
            <p><code>requestAnimationFrame</code></p>
            <p>Records frame delivery timestamps.<br>Burns CPU stress budget here.<br>Computes FPS and frame times.</p>
          </div>
          <div class="meth__diagram-separator">+</div>
          <div class="meth__diagram-box">
            <div class="meth__diagram-label">Loop 2 — Scroll Driver</div>
            <p><code>setTimeout(fn, 0)</code></p>
            <p>Advances scrollTop at constant px/s.<br>~250 updates/sec in Chrome.<br>Time-based, not frame-based.</p>
          </div>
        </div>

        <p class="meth__text">
          This separation matters because coupling scroll updates to
          <code>requestAnimationFrame</code> produces visible stepping at slow scroll
          speeds — 60 scroll updates/sec doesn't look smooth at 720 px/s.
          The high-frequency <code>setTimeout</code> driver provides ~250 updates/sec,
          yielding sub-pixel-smooth movement at all speeds.
        </p>
      </section>

      <!-- ── Crowdsourced Data ─────────────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">Crowdsourced Results</h2>
        <p class="meth__text">
          Every benchmark run is automatically persisted to a SQLite database
          via a fire-and-forget <code>POST /api/benchmarks</code> request. This
          happens transparently — it never blocks the UI or affects the
          benchmark itself.
        </p>

        <h3 class="meth__subsection-title">What's Collected</h3>
        <div class="meth__list">
          <div class="meth__list-item">
            <strong>Metrics</strong>
            <span>All 4 metric values with units, ratings, and "better" direction.</span>
          </div>
          <div class="meth__list-item">
            <strong>Library Info</strong>
            <span>Library slug and version (where detectable).</span>
          </div>
          <div class="meth__list-item">
            <strong>Environment</strong>
            <span>User agent, CPU core count, device memory, screen dimensions.</span>
          </div>
          <div class="meth__list-item">
            <strong>Configuration</strong>
            <span>Item count, stress level, and scroll speed used for the run.</span>
          </div>
        </div>

        <h3 class="meth__subsection-title">What's NOT Collected</h3>
        <p class="meth__text">
          No IP addresses are stored. No cookies are set. No tracking scripts
          are loaded. No personally identifiable information is collected.
          The data is used solely for aggregated performance statistics.
        </p>

        <h3 class="meth__subsection-title">Confidence Levels</h3>
        <p class="meth__text">
          Aggregated results display a confidence indicator based on sample count:
        </p>
        <div class="meth__list">
          <div class="meth__list-item">
            <strong>🟢 High confidence</strong>
            <span>20 or more runs — statistically meaningful.</span>
          </div>
          <div class="meth__list-item">
            <strong>🟡 Moderate confidence</strong>
            <span>5–19 runs — directionally useful but may shift with more data.</span>
          </div>
          <div class="meth__list-item">
            <strong>⚪ Low confidence</strong>
            <span>Fewer than 5 runs — treat as preliminary.</span>
          </div>
        </div>
      </section>

      <!-- ── Limitations ───────────────────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">Limitations</h2>
        <p class="meth__text">
          These benchmarks test <strong>core virtualization performance</strong> only.
          They are intentionally focused and do not attempt to measure every
          possible use case.
        </p>

        <h3 class="meth__subsection-title">Not Tested</h3>
        <div class="meth__list">
          <div class="meth__list-item">
            <strong>Complex templates</strong>
            <span>Rich content with images, nested components, or heavy layout — all items use a simple 7-element template.</span>
          </div>
          <div class="meth__list-item">
            <strong>Variable heights</strong>
            <span>All items are fixed at 48px. Variable-height virtualization is a different performance challenge.</span>
          </div>
          <div class="meth__list-item">
            <strong>User interactions</strong>
            <span>Click handlers, selection state, hover effects, and input elements are not included.</span>
          </div>
          <div class="meth__list-item">
            <strong>Mobile devices</strong>
            <span>Benchmarks are designed for desktop browsers. Mobile performance characteristics differ significantly.</span>
          </div>
          <div class="meth__list-item">
            <strong>Server-side rendering</strong>
            <span>All benchmarks run client-side. SSR compatibility and hydration performance are not measured.</span>
          </div>
        </div>

        <h3 class="meth__subsection-title">Partially Addressed</h3>
        <div class="meth__list">
          <div class="meth__list-item">
            <strong>Real-world application overhead</strong>
            <span>The stress parameter simulates CPU contention but doesn't replicate actual application complexity.</span>
          </div>
          <div class="meth__list-item">
            <strong>Bundle size</strong>
            <span>Listed in library metadata but not measured as part of the runtime benchmark.</span>
          </div>
        </div>

        <p class="meth__text">
          These constraints are intentional — by isolating library performance
          from external factors, the benchmarks produce consistent, reproducible
          results that are meaningful for library-to-library comparison.
        </p>
      </section>

      <!-- ── Browser Requirements ──────────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">Browser Requirements</h2>
        <div class="meth__list">
          <div class="meth__list-item">
            <strong>Chrome (recommended)</strong>
            <span>Full metrics including memory. Best accuracy with <code>--enable-precise-memory-info</code> flag.</span>
          </div>
          <div class="meth__list-item">
            <strong>Firefox</strong>
            <span>Render time and scroll FPS work. Memory metrics show "—" (API not available).</span>
          </div>
          <div class="meth__list-item">
            <strong>Safari</strong>
            <span>Render time and scroll FPS work. Memory metrics show "—" (API not available).</span>
          </div>
          <div class="meth__list-item">
            <strong>Edge</strong>
            <span>Same as Chrome (Chromium-based). Full metrics available.</span>
          </div>
        </div>
      </section>

      <!-- ── Contributing ──────────────────────────────────────────────── -->
      <section class="meth__section">
        <h2 class="meth__section-title">Contributing</h2>
        <p class="meth__text">
          virtuallist.io is open source. Library authors, maintainers, and
          community members are welcome to:
        </p>
        <div class="meth__list">
          <div class="meth__list-item">
            <strong>Add new libraries</strong>
            <span>Create a benchmark adapter in <code>benchmarks/libraries/</code> and add an entry to the registry.</span>
          </div>
          <div class="meth__list-item">
            <strong>Report methodology issues</strong>
            <span>If you find a measurement flaw, bias, or inaccuracy, please open a GitHub issue.</span>
          </div>
          <div class="meth__list-item">
            <strong>Improve fairness</strong>
            <span>PRs that improve measurement accuracy, reduce bias, or add validation are always welcome.</span>
          </div>
          <div class="meth__list-item">
            <strong>Run benchmarks</strong>
            <span>The simplest contribution: visit the site, run some benchmarks, and let the crowdsourced data grow.</span>
          </div>
        </div>
        <p class="meth__text">
          <a href="https://github.com/floor/virtuallist.io" class="meth__link" target="_blank" rel="noopener noreferrer">
            View the source on GitHub →
          </a>
        </p>
      </section>
    </div>`;
}

// =============================================================================
// Public API
// =============================================================================

export function renderMethodologyPage(): Response {
  if (!cachedHtml) {
    const content = buildContent();

    cachedHtml = renderShell({
      title: "Methodology — virtuallist.io",
      description:
        "How virtuallist.io measures virtual list performance. " +
        "Detailed documentation of the benchmark methodology: three-phase measurement, " +
        "randomized execution, 7 scroll speeds, CPU stress testing, and crowdsourced data collection.",
      url: `${SITE}/methodology`,
      content,
      activeNav: "methodology",
      extraHead: `<style>${METHODOLOGY_CSS}</style>`,
    });
  }

  return new Response(cachedHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, must-revalidate",
    },
  });
}

// =============================================================================
// Page-specific CSS
// =============================================================================

const METHODOLOGY_CSS = `
/* ── Methodology Page ───────────────────────────────────────────────────── */
.meth {
  max-width: 800px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 3rem;
}

.meth__header {
  margin-bottom: 3rem;
}
.meth__title {
  font-size: clamp(2rem, 4vw, 2.75rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--text);
  margin-bottom: 0.75rem;
}
.meth__subtitle {
  font-size: 1.1rem;
  color: var(--text-secondary);
  line-height: 1.7;
  max-width: 600px;
}

/* ── Sections ───────────────────────────────────────────────────────────── */
.meth__section {
  margin-bottom: 3rem;
}
.meth__section-title {
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-subtle);
}
.meth__subsection-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}
.meth__text {
  font-size: 0.95rem;
  color: var(--text-secondary);
  line-height: 1.8;
  margin-bottom: 0.75rem;
}
.meth__text strong {
  color: var(--text);
  font-weight: 600;
}
.meth__text code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.85em;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  background: var(--bg-elevated);
  color: var(--accent);
}
.meth__text--note {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-style: italic;
  margin-top: 0.5rem;
}
.meth__link {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
  transition: color var(--transition);
}
.meth__link:hover {
  color: var(--accent-dim);
}

/* ── Metrics Grid ───────────────────────────────────────────────────────── */
.meth__metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}
.meth__metric-card {
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.meth__metric-icon {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}
.meth__metric-name {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.15rem;
}
.meth__metric-unit {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}
.meth__metric-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
.meth__metric-desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.82em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: var(--bg);
  color: var(--accent);
}

/* ── Phases ──────────────────────────────────────────────────────────────── */
.meth__phases {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1rem;
}
.meth__phase {
  display: flex;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.meth__phase-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--accent-glow);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.9rem;
  flex-shrink: 0;
}
.meth__phase-content {
  flex: 1;
}
.meth__phase-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.3rem;
}
.meth__phase-desc {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.6;
}
.meth__phase-desc code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.82em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: var(--bg);
  color: var(--accent);
}

/* ── List Items ─────────────────────────────────────────────────────────── */
.meth__list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.75rem 0;
}
.meth__list-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
}
.meth__list-item strong {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
}
.meth__list-item span {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.5;
}
.meth__list-item code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.82em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: var(--bg);
  color: var(--accent);
}

/* ── Table ──────────────────────────────────────────────────────────────── */
.meth__table-wrapper {
  overflow-x: auto;
  margin: 1rem 0;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-subtle);
}
.meth__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.meth__table th {
  text-align: left;
  padding: 0.65rem 1rem;
  background: var(--bg-surface);
  color: var(--text-muted);
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px solid var(--border-subtle);
}
.meth__table td {
  padding: 0.6rem 1rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);
}
.meth__table tr:last-child td {
  border-bottom: none;
}
.meth__table td:first-child {
  color: var(--text);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.meth__table tbody tr:hover {
  background: var(--bg-hover);
}

/* ── Diagram ────────────────────────────────────────────────────────────── */
.meth__diagram {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1.25rem 0;
}
.meth__diagram-box {
  flex: 1;
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  text-align: center;
}
.meth__diagram-box p {
  font-size: 0.82rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-top: 0.3rem;
}
.meth__diagram-box code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.82em;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  background: var(--bg);
  color: var(--accent);
}
.meth__diagram-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}
.meth__diagram-separator {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .meth {
    padding: 1.5rem 1rem 2.5rem;
  }
  .meth__metrics-grid {
    grid-template-columns: 1fr;
  }
  .meth__diagram {
    flex-direction: column;
    gap: 0.5rem;
  }
  .meth__diagram-separator {
    transform: rotate(90deg);
  }
  .meth__phase {
    flex-direction: column;
    gap: 0.5rem;
  }
  .meth__table {
    font-size: 0.78rem;
  }
  .meth__table th,
  .meth__table td {
    padding: 0.5rem 0.75rem;
  }
}
`.trim();
