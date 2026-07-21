import { Builder, type BuilderConfig } from "@client/components/builder";
import { h, render } from "preact";

export function init() {
  const mount = document.getElementById("builder-root");
  if (!mount) return;
  let config: BuilderConfig;
  try {
    config = JSON.parse(mount.dataset.config ?? "{}") as BuilderConfig;
  } catch {
    return;
  }
  render(h(Builder, config), mount);
}
