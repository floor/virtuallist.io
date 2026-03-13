# Memory Measurement: What the Numbers Actually Mean

The memory metric on this site measures something specific and honest. Understanding what it includes — and why — prevents misreading the results.

---

## What is being measured

The memory metric is the **heap delta**: the difference in JS heap usage between two snapshots.

1. **Baseline snapshot** — taken after the previous instance has been destroyed and the browser's garbage collector has run several settle cycles
2. **Post-mount snapshot** — taken after the library has mounted and rendered its first visible rows

The delta is the net memory the library allocated to go from "nothing" to "running list, ready to scroll".

---

## What the delta includes at large item counts

At 1M items, the delta includes:

**The library's internal engine structures.** Virtual list engines that support variable-height items typically maintain a prefix-sum array over all item heights so they can answer "what is the scroll offset of item N?" in O(log n) time. For 1M items, this array alone is 8 MB (`Float64Array` of length 1,000,001). This is a real, unavoidable cost of the library being usable.

**Internal state proportional to item count.** Some libraries initialise position caches, row maps, or reactive stores that scale with the total number of items, not just the visible window. These costs appear here.

**The items array itself, if it was not already in the heap.** The benchmark pre-builds the items array before the baseline snapshot — it is a module-level cached value and survives GC. In most runs this cancels out of the delta. On the first run of a session the array may not yet be in the heap and its allocation will appear in the delta. Subsequent runs with the same item count show a stable number.

---

## What the delta does not include

**Framework runtime overhead.** React, Vue, SolidJS, and Svelte are all bundled into the same script and loaded before any benchmark runs. Their runtime memory is already in the heap at baseline time and does not appear in any library's delta. Only the marginal cost of using a framework adapter (hook instances, reactive signals, component state) is captured.

**Visible DOM nodes.** Regardless of item count, every library renders approximately the same number of DOM nodes — only the visible rows plus overscan. The DOM cost is effectively constant across all item counts and all libraries.

---

## Why "cold allocation" is the right thing to measure

An alternative methodology would warm the library up first and then measure the steady-state heap size. That approach answers "how much memory does this library use after a page has been open for a while?" — a valid question, but not this site's question.

This site measures **the cost of mounting the library from scratch**, which is what actually happens when a user navigates to a page that contains a virtual list. The memory cost of initialisation is part of the library's real-world cost, and excluding it would make fast-initialising libraries look identical to slow-initialising ones.

---

## How to read the numbers correctly

**Small item counts (10K, 100K):** Differences between libraries are primarily explained by framework overhead — reactive proxy wrapping, component state, hook instances. Libraries with heavier reactivity models allocate more here.

**Large item counts (1M):** Differences are primarily explained by the library's internal data structures. A library that pre-computes positions or offsets for all items will show a much higher delta than one that computes on demand. Neither approach is wrong — the trade-off is between memory at mount time and CPU at scroll time.

**A very low delta at 1M items** typically means the library computes positions lazily (on scroll, not at mount), and does not pre-allocate anything proportional to total count. This is efficient for memory but may incur per-frame computation cost instead.

**A high delta at 1M items** typically means the library built a full index upfront. This costs memory once at mount but can make scroll position lookups faster.

The scroll FPS and P95 frame time metrics are where the runtime trade-off appears. A library with a high memory delta but a low P95 frame time has traded startup memory for runtime speed. Whether that trade-off is correct depends on the application.

---

## Negative deltas

Occasionally the measurement returns a negative delta and is discarded. This happens when the GC, triggered during the settle phase, reclaims more old garbage from earlier phases than the new library allocates. The measurement infrastructure retries up to five times and takes the median of valid (non-negative) samples. If no valid samples are collected the memory cell shows `—`.

---

## Summary

| What it measures | What it excludes |
|---|---|
| Library engine structures | Framework runtime |
| Reactive adapter overhead | Visible DOM nodes |
| Per-item index structures (if any) | Previously cached items array |
| First-mount allocation cost | Steady-state post-GC heap |