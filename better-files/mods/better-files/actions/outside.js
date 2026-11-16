// The world outside Herdr: code editors, the file manager and the clipboard. This computer
// only: a path on another machine means nothing to an app here.
import { appHome, exec, knownAgents, readTextFile, setShared, shared, window } from "herdr";
import { EDITORS, parentOf } from "../files/model.js";

const FOUND = "better-files.editors";
const ERROR = "better-files.error";

const macos = () => (window()?.platform ?? "macos") === "macos";

// A shell word as itself, quotes and all, for the probe below.
const shellWord = (text) => `'${String(text).replace(/'/g, `'\\''`)}'`;

// One probe for every command, so a missing editor costs no process.
const probeOf = (commands) =>
  commands
    .map((c) => `command -v ${shellWord(c)} >/dev/null 2>&1 && printf '%s\\n' ${shellWord(c)}`)
    .join("; ");

// `settings.editors` adds either a bare ID (an app ID on macOS, a command on Linux) or a
// whole `{ name, bundle, command }`, as the README shows.
const added = (settings, onMacos) =>
  (Array.isArray(settings) ? settings : [])
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const bundle = entry.bundle ?? (onMacos ? entry.id : null);
        const command = entry.command ?? (onMacos ? null : entry.id);
        return bundle || command
          ? { name: entry.name ?? bundle ?? command, bundle: bundle ?? null, command: command ?? null }
          : null;
      }
      const id = String(entry ?? "").trim();
      if (!id) return null;
      return onMacos ? { name: id, bundle: id } : { name: id, command: id };
    })
    .filter(Boolean);

export const foundEditors = () => shared(FOUND) ?? [];

// What to call the folder's own app: Finder is macOS only.
export const fileManagerName = () => (macos() ? "Finder" : "file manager");

export const outsideMethods = {
  // macOS: one lookup per app ID, done once, since Spotlight knows apps wherever they're
  // installed. Linux: one probe on PATH, since there are no app IDs to look up.
  findEditors(cx, extra = []) {
    if (window()?.platform === "windows") return;
    const onMacos = macos();
    const editors = [...EDITORS, ...added(extra, onMacos)];
    cx.spawn(async (cx) => {
      if (onMacos) {
        const found = [];
        for (const editor of editors) {
          if (!editor.bundle) continue;
          const r = await exec(
            "mdfind",
            [`kMDItemCFBundleIdentifier == '${String(editor.bundle).replace(/'/g, "")}'`],
            {},
          ).catch(() => null);
          if (r?.code === 0 && r.stdout.trim()) found.push(editor);
        }
        setShared(FOUND, found);
      } else {
        const commands = editors.map((editor) => editor.command).filter(Boolean);
        const r = await exec("sh", ["-c", probeOf(commands)], {}).catch(() => null);
        const onPath = new Set(
          String(r?.code === 0 ? r.stdout : "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        );
        setShared(FOUND, editors.filter((editor) => editor.command && onPath.has(editor.command)));
      }
      cx.notify();
    });
  },

  // Show diff is only offered where Better Changes can answer it.
  findBetterChanges(cx) {
    cx.spawn(async (cx) => {
      const manifest = await readTextFile(`${appHome()}/mods/better-changes/mod.json`).catch(
        () => null,
      );
      setShared("better-files.has-changes", Boolean(manifest));
      cx.notify();
    });
  },

  findNewAgents(on, cx) {
    cx.spawn(async (cx) => {
      try {
        const known = await knownAgents({ on: on ?? null });
        setShared(
          "better-files.new-agents",
          known.filter((a) => a.installed).map((a) => ({ key: a.key, name: a.name, run: a.run })),
        );
      } catch {
        setShared("better-files.new-agents", []);
      }
      cx.notify();
    });
  },

  async launch(command, args, what) {
    const r = await exec(command, args, {}).catch((e) => ({ code: 1, stderr: String(e) }));
    if (r.code !== 0) setShared(ERROR, `Could not ${what}: ${r.stderr?.trim() || "it failed"}`);
    else setShared(ERROR, null);
  },

  openInEditor(editor, path) {
    const what = `open it in ${editor.name}`;
    const bundle = macos() ? editor.bundle : null;
    return bundle
      ? this.launch("open", ["-b", bundle, path], what)
      : this.launch(editor.command, [path], what);
  },

  openWithDefault(path) {
    return macos() ? this.launch("open", [path], "open it") : this.launch("xdg-open", [path], "open it");
  },

  // A file manager can only be shown a folder: there's no way to select the file in it.
  revealInFileManager(path) {
    return macos()
      ? this.launch("open", ["-R", path], "show it in Finder")
      : this.launch("xdg-open", [parentOf(path)], "show it in the file manager");
  },
};
