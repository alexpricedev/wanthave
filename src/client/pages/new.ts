import { Builder, type BuilderConfig } from "@client/components/builder";
import { h, render } from "preact";

// Onboarding banner dismiss/show state is managed inside Builder (see
// builder.tsx) so it can stay in sync with the two-step phase flow.

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
