import css from "vlist/styles" with { type: "text" };
import { injectStyles } from "../runner.js";

export function setupVlistStyles() {
  injectStyles("vlist", css);
}
