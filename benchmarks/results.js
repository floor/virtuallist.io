// benchmarks/results.js — Client-side interactivity for /benchmarks/results.
//
// Handles:
//   1. Filter controls (item count + stress level) — navigates with query params
//   2. Column sorting — client-side re-sort of the table rows
//
// This file is intentionally lightweight — no framework, no dependencies.
// The page is server-rendered with real data; this script only adds interactivity.

// =============================================================================
// URL Parameter Helpers
// =============================================================================

function getParam(name, fallback) {
  const url = new URL(window.location.href);
  const val = url.searchParams.get(name);
  if (val === null) return fallback;
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function navigateWithParams(params) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  window.location.href = url.toString();
}

// =============================================================================
// Filter Controls
// =============================================================================

function initFilters() {
  const currentItems = getParam("items", 10000);
  const currentStress = getParam("stress", 0);

  // Item count buttons
  const sizesContainer = document.getElementById("res-sizes");
  if (sizesContainer) {
    const buttons = sizesContainer.querySelectorAll(".ui-segmented__btn");
    buttons.forEach((btn) => {
      const count = parseInt(btn.dataset.count, 10);

      // Sync active state with URL (server may have rendered default)
      btn.classList.toggle("ui-segmented__btn--active", count === currentItems);

      btn.addEventListener("click", () => {
        if (count === currentItems) return;
        navigateWithParams({ items: count, stress: currentStress });
      });
    });
  }

  // Stress level buttons
  const stressContainer = document.getElementById("res-stress");
  if (stressContainer) {
    const buttons = stressContainer.querySelectorAll(".ui-segmented__btn");
    buttons.forEach((btn) => {
      const stress = parseInt(btn.dataset.stress, 10);

      btn.classList.toggle(
        "ui-segmented__btn--active",
        stress === currentStress,
      );

      btn.addEventListener("click", () => {
        if (stress === currentStress) return;
        navigateWithParams({ items: currentItems, stress: stress });
      });
    });
  }
}

// =============================================================================
// Column Sorting
// =============================================================================

/** Current sort state. */
let sortMetric = "Render";
let sortDirection = "asc"; // "asc" or "desc"

function initSorting() {
  const headers = document.querySelectorAll(".res-table__th--sortable");
  const tbody = document.getElementById("res-tbody");
  if (!tbody || headers.length === 0) return;

  // Read initial sorted column from the template
  headers.forEach((th) => {
    if (th.classList.contains("res-table__th--sorted")) {
      sortMetric = th.dataset.metric;
      // Higher-is-better metrics default to descending, lower-is-better to ascending
      sortDirection = th.dataset.better === "higher" ? "desc" : "asc";
    }
  });

  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const metric = th.dataset.metric;
      const better = th.dataset.better; // "lower" or "higher"

      if (metric === sortMetric) {
        // Toggle direction on re-click
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
      } else {
        // New column: default to the "good" direction
        sortMetric = metric;
        sortDirection = better === "higher" ? "desc" : "asc";
      }

      sortTable(tbody, metric, sortDirection);
      updateSortIndicators(headers, metric);
    });
  });
}

function sortTable(tbody, metric, direction) {
  const rows = Array.from(tbody.querySelectorAll(".res-table__row"));

  // Determine column index from metric name
  const colIndex = getMetricColIndex(metric);
  if (colIndex === -1) return;

  rows.sort((a, b) => {
    const aCell = a.querySelectorAll(".res-table__td--metric")[colIndex];
    const bCell = b.querySelectorAll(".res-table__td--metric")[colIndex];

    const aVal = parseFloat(aCell?.dataset.value);
    const bVal = parseFloat(bCell?.dataset.value);

    // Push null/NaN values to the bottom regardless of direction
    const aValid = Number.isFinite(aVal);
    const bValid = Number.isFinite(bVal);

    if (!aValid && !bValid) return 0;
    if (!aValid) return 1;
    if (!bValid) return -1;

    return direction === "asc" ? aVal - bVal : bVal - aVal;
  });

  // Re-render ranks and re-append
  rows.forEach((row, i) => {
    const rankCell = row.querySelector(".res-table__td--rank");
    if (rankCell) rankCell.textContent = String(i + 1);
    tbody.appendChild(row);
  });
}

function getMetricColIndex(metric) {
  const order = ["Render", "Memory", "Scroll FPS", "P95 Frame", "Jump"];
  return order.indexOf(metric);
}

function updateSortIndicators(headers, activeMetric) {
  headers.forEach((th) => {
    th.classList.toggle(
      "res-table__th--sorted",
      th.dataset.metric === activeMetric,
    );
  });
}

// =============================================================================
// Init
// =============================================================================

initFilters();
initSorting();
