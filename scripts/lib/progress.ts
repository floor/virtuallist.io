// scripts/lib/progress.ts — Terminal progress bar for benchmark scripts

const BAR_WIDTH = 30;
const COLORS = {
  green: "\x1b[32m",
  dim: "\x1b[2m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
};

export interface ProgressBar {
  update(opts: { current: number; label: string; phase: string }): void;
  succeed(message: string): void;
  fail(message: string): void;
  done(summary: string): void;
}

export function createProgress(total: number): ProgressBar {
  const startTime = Date.now();
  const completionTimes: number[] = [];
  const WINDOW = 6;

  function formatTime(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m${String(s % 60).padStart(2, "0")}s`;
  }

  function estimateRemaining(current: number): string {
    if (completionTimes.length < 2) return "?";
    const recent = completionTimes.slice(-WINDOW);
    const windowDuration = recent[recent.length - 1]! - recent[0]!;
    const windowItems = recent.length - 1;
    const perItem = windowDuration / windowItems;
    const remaining = perItem * (total - current);
    return `~${formatTime(remaining)}`;
  }

  function renderBar(current: number): string {
    const ratio = Math.min(current / total, 1);
    const filled = Math.round(BAR_WIDTH * ratio);
    const empty = BAR_WIDTH - filled;
    return (
      `${COLORS.green}${"█".repeat(filled)}${COLORS.dim}${"░".repeat(empty)}${COLORS.reset}`
    );
  }

  function clearLine(): void {
    process.stdout.write("\x1b[2K\r");
  }

  return {
    update({ current, label, phase }) {
      clearLine();
      const bar = renderBar(current);
      const elapsed = formatTime(Date.now() - startTime);
      const eta = estimateRemaining(current);
      const counter = `${COLORS.bold}${current}${COLORS.reset}/${total}`;
      const phaseText = phase ? `  ${COLORS.dim}${phase}${COLORS.reset}` : "";
      process.stdout.write(
        `  ${bar}  ${counter}  ${COLORS.cyan}${label}${COLORS.reset}${phaseText}  ${COLORS.dim}${elapsed} / ${eta}${COLORS.reset}`,
      );
    },

    succeed(message: string) {
      completionTimes.push(Date.now());
      clearLine();
      console.log(`  ${COLORS.green}✓${COLORS.reset} ${message}`);
    },

    fail(message: string) {
      completionTimes.push(Date.now());
      clearLine();
      console.log(`  ${COLORS.red}✗${COLORS.reset} ${message}`);
    },

    done(summary: string) {
      clearLine();
      const elapsed = formatTime(Date.now() - startTime);
      console.log(`\n  ${COLORS.bold}${summary}${COLORS.reset}  ${COLORS.dim}(${elapsed})${COLORS.reset}\n`);
    },
  };
}
