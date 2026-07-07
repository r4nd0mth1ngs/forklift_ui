//! The bridge to the `forklift` CLI.
//!
//! Forklift ships a stable, versioned machine interface (`--json`, see the repo's
//! docs/MACHINE_INTERFACE.md): every command emits exactly one envelope with a stable
//! `ok`/`error.code` shape. That contract is the *only* thing this GUI couples to — we
//! never link `forklift-core` or touch the on-disk format. This module is deliberately
//! tiny: it locates the binary, runs a subcommand in a chosen warehouse, and hands the
//! parsed envelope (or a structured error) back to the frontend. All command-specific
//! typing lives in the TypeScript `api.ts` layer, not here.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;

/// Cache of the auto-resolved binary (path + source), so per-command resolution doesn't
/// re-probe every candidate. Cleared and recomputed by `detect_binary` (force refresh).
static AUTO_BINARY: Mutex<Option<(PathBuf, String)>> = Mutex::new(None);

/// A classified failure, mirroring forklift's own error envelope so the UI can branch on
/// a stable `code` (e.g. `not_a_warehouse`, `conflict`, `diverged`) instead of prose.
#[derive(Debug, Serialize)]
pub struct ForkliftError {
    pub code: String,
    pub message: String,
    pub next_step: Option<String>,
}

impl ForkliftError {
    fn new(code: &str, message: impl Into<String>, next_step: Option<String>) -> Self {
        ForkliftError { code: code.into(), message: message.into(), next_step }
    }

    /// A GUI-side failure that never reached (or came back malformed from) forklift.
    fn local(message: impl Into<String>) -> Self {
        ForkliftError::new("gui", message, None)
    }
}

/// Where the forklift binary was found and what version it reports.
#[derive(Debug, Serialize)]
pub struct BinaryInfo {
    pub path: String,
    pub version: String,
    pub source: String,
}

/// Resolve the forklift binary. An explicit override (UI settings) or `FORKLIFT_BIN` always
/// wins; otherwise the newest forklift found across the known install locations is used and
/// cached — so after a `self-update` installs a newer binary, the GUI points at it
/// automatically (`force` recomputes; e.g. after an update).
fn resolve_binary(bin_override: &Option<String>, force: bool) -> (PathBuf, String) {
    if let Some(explicit) = bin_override.as_ref().filter(|value| !value.trim().is_empty()) {
        return (PathBuf::from(explicit), "override".into());
    }

    if let Ok(from_env) = std::env::var("FORKLIFT_BIN") {
        if !from_env.trim().is_empty() {
            return (PathBuf::from(from_env), "env".into());
        }
    }

    let mut cache = AUTO_BINARY.lock().expect("auto-binary cache poisoned");
    if force {
        *cache = None;
    }
    cache.get_or_insert_with(detect_best_binary).clone()
}

/// The candidate forklift locations, in tie-break order: the sibling dev build first (so a
/// developer's working copy wins on an equal version), then real installs, then bare PATH.
fn candidate_binaries() -> Vec<(PathBuf, String)> {
    let mut candidates: Vec<(PathBuf, String)> = Vec::new();

    // Sibling dev build: this crate is <workspace>/forklift-gui/src-tauri; the VCS it wraps
    // is <workspace>/forklift.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(workspace) = manifest_dir.parent().and_then(|gui| gui.parent()) {
        for profile in ["release", "debug"] {
            candidates.push((
                workspace.join("forklift").join("target").join(profile).join("forklift"),
                format!("dev-{profile}"),
            ));
        }
    }

    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        candidates.push((home.join(".local/bin/forklift"), "installed".into()));
        candidates.push((home.join(".cargo/bin/forklift"), "cargo".into()));
    }
    candidates.push((PathBuf::from("/opt/homebrew/bin/forklift"), "homebrew".into()));
    candidates.push((PathBuf::from("/usr/local/bin/forklift"), "homebrew".into()));
    candidates.push((PathBuf::from("forklift"), "path".into())); // whatever PATH resolves

    candidates
}

/// Run `<bin> version --json` and return its parsed (major, minor, patch), or `None` if the
/// binary is missing or unusable.
fn probe_version(bin: &Path) -> Option<(u64, u64, u64)> {
    let output = Command::new(bin).arg("version").arg("--json").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let value: Value = serde_json::from_slice(&output.stdout).ok()?;
    let version = value.get("data")?.get("version")?.as_str()?;
    let mut parts = version.split(['.', '-', '+']).map(|p| p.parse::<u64>().unwrap_or(0));
    Some((parts.next().unwrap_or(0), parts.next().unwrap_or(0), parts.next().unwrap_or(0)))
}

/// Probe every candidate location and pick the highest-versioned working forklift. Ties keep
/// the earlier candidate (the dev build). Falls back to bare `forklift` if none respond.
fn detect_best_binary() -> (PathBuf, String) {
    let mut best: Option<(PathBuf, String, (u64, u64, u64))> = None;

    for (path, source) in candidate_binaries() {
        // Explicit paths must exist; the bare "forklift" (PATH lookup) is probed directly.
        if source != "path" && !path.is_file() {
            continue;
        }
        if let Some(version) = probe_version(&path) {
            let better = best.as_ref().map_or(true, |(_, _, best_version)| version > *best_version);
            if better {
                best = Some((path, source, version));
            }
        }
    }

    match best {
        Some((path, source, _)) => (path, source),
        None => (PathBuf::from("forklift"), "path".into()),
    }
}

/// Run a forklift subcommand and hand back raw captured output plus the exit status. An
/// optional passphrase is passed through the environment (`FORKLIFT_KEY_PASSPHRASE`), the
/// same escape hatch the CLI honors for unlocking / protecting a signing key without a
/// terminal prompt. Harmless for commands that don't sign.
fn invoke(
    bin: &Path,
    warehouse: Option<&str>,
    args: &[String],
    passphrase: Option<&str>,
) -> Result<std::process::Output, ForkliftError> {
    let mut command = Command::new(bin);
    command.args(args);
    if let Some(dir) = warehouse.filter(|value| !value.is_empty()) {
        command.current_dir(dir);
    }
    if let Some(secret) = passphrase.filter(|value| !value.is_empty()) {
        command.env("FORKLIFT_KEY_PASSPHRASE", secret);
    }
    command.output().map_err(|error| {
        ForkliftError::local(format!(
            "Could not run the forklift binary at \"{}\": {error}. Set the path in Settings.",
            bin.display()
        ))
    })
}

/// Detect the forklift binary and its version (runs `forklift version --json`).
#[tauri::command]
pub fn detect_binary(bin_override: Option<String>) -> Result<BinaryInfo, ForkliftError> {
    // Force a fresh probe so a just-installed (e.g. self-updated) binary is picked up.
    let (bin, source) = resolve_binary(&bin_override, true);
    let output = invoke(&bin, None, &["version".into(), "--json".into()], None)?;

    if !output.status.success() {
        return Err(ForkliftError::local(format!(
            "The forklift binary at \"{}\" did not run cleanly ({}).",
            bin.display(),
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    let value: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| ForkliftError::local(format!("forklift returned non-JSON version output: {error}")))?;
    let version = value
        .get("data")
        .and_then(|data| data.get("version"))
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();

    Ok(BinaryInfo { path: bin.display().to_string(), version, source })
}

/// Run a forklift subcommand in `--json` mode and return its `data` payload. A failure
/// envelope (`ok:false`) becomes an `Err(ForkliftError)` carrying the stable code.
#[tauri::command]
pub fn run_json(
    bin_override: Option<String>,
    warehouse: Option<String>,
    mut args: Vec<String>,
    passphrase: Option<String>,
) -> Result<Value, ForkliftError> {
    let (bin, _) = resolve_binary(&bin_override, false);
    args.push("--json".into());
    let output = invoke(&bin, warehouse.as_deref(), &args, passphrase.as_deref())?;

    // Usually the whole of stdout is the envelope, but a few commands (notably self-update,
    // which re-runs the install script) print progress before it — so we extract the
    // trailing envelope rather than parsing stdout wholesale. clap usage errors (exit 2)
    // print to stderr and never produce an envelope.
    let envelope: Value = extract_envelope(&output.stdout).ok_or_else(|| {
        let stderr = String::from_utf8_lossy(&output.stderr);
        ForkliftError::local(if stderr.trim().is_empty() {
            "forklift produced no JSON output.".to_string()
        } else {
            stderr.trim().to_string()
        })
    })?;

    if envelope.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        return Ok(envelope.get("data").cloned().unwrap_or(Value::Null));
    }

    let error = envelope.get("error");
    Err(ForkliftError::new(
        error.and_then(|e| e.get("code")).and_then(Value::as_str).unwrap_or("error"),
        error.and_then(|e| e.get("message")).and_then(Value::as_str).unwrap_or("forklift reported a failure.").to_string(),
        error.and_then(|e| e.get("next_step")).and_then(Value::as_str).map(str::to_string),
    ))
}

/// Run a forklift subcommand in human (non-JSON) mode and return its stdout with ANSI
/// colour codes stripped. Used for the line-level diff view, which forklift only renders
/// in prose (`--json` diff is the changed-file *set*, by design).
#[tauri::command]
pub fn run_text(
    bin_override: Option<String>,
    warehouse: Option<String>,
    args: Vec<String>,
    passphrase: Option<String>,
) -> Result<String, ForkliftError> {
    let (bin, _) = resolve_binary(&bin_override, false);
    let output = invoke(&bin, warehouse.as_deref(), &args, passphrase.as_deref())?;

    if !output.status.success() {
        // A human-mode failure still prints a message; surface it verbatim.
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let message = if !stderr.trim().is_empty() { stderr } else { stdout };
        return Err(ForkliftError::local(message.trim().to_string()));
    }

    Ok(strip_ansi(&String::from_utf8_lossy(&output.stdout)))
}

/// Extract forklift's `--json` envelope from captured stdout. Fast path: the whole thing is
/// the envelope. Fallback: a command printed progress first (self-update re-runs the install
/// script), so scan backwards for the last `{` that parses — through end of output — into a
/// value carrying `forklift_json`. That is the envelope's opening brace; nested braces and
/// pre-envelope noise never parse cleanly to the end.
fn extract_envelope(stdout: &[u8]) -> Option<Value> {
    let text = String::from_utf8_lossy(stdout);
    let trimmed = text.trim();

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if value.get("forklift_json").is_some() {
            return Some(value);
        }
    }

    let mut starts: Vec<usize> = trimmed.match_indices('{').map(|(i, _)| i).collect();
    starts.reverse();
    for start in starts {
        if let Ok(value) = serde_json::from_str::<Value>(trimmed[start..].trim()) {
            if value.get("forklift_json").is_some() {
                return Some(value);
            }
        }
    }

    None
}

/// Remove ANSI escape sequences (`ESC [ ... <letter>`) from a string. Hand-rolled to keep
/// the dependency footprint at zero — forklift only emits simple SGR colour codes.
fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' && chars.peek() == Some(&'[') {
            chars.next(); // consume '['
            // Consume until the final byte of the sequence (a letter in @-~).
            for seq in chars.by_ref() {
                if ('@'..='~').contains(&seq) {
                    break;
                }
            }
        } else {
            out.push(ch);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_sgr_colour_codes() {
        assert_eq!(strip_ansi("\u{1b}[32m 2 + world\u{1b}[0m"), " 2 + world");
        assert_eq!(strip_ansi("plain"), "plain");
    }

    #[test]
    fn extracts_a_clean_envelope() {
        let out = br#"{"forklift_json":"1","command":"version","ok":true,"data":{"version":"0.1.2"}}"#;
        let value = extract_envelope(out).expect("clean envelope");
        assert_eq!(value.get("ok").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn extracts_envelope_after_progress_output() {
        // self-update prints the install script's output before the envelope.
        let out = b"Installing forklift 0.1.3 via the install script\xE2\x80\xA6\n\
downloading { curl progress } to /home/x/.local/bin\n\
{\n  \"forklift_json\": \"1\",\n  \"command\": \"self-update\",\n  \"ok\": true,\n  \
\"data\": { \"applied\": true, \"current\": \"0.1.2\", \"latest\": \"0.1.3\", \"update_available\": true }\n}\n";
        let value = extract_envelope(out).expect("trailing envelope");
        let data = value.get("data").unwrap();
        assert_eq!(data.get("applied").and_then(Value::as_bool), Some(true));
        assert_eq!(data.get("latest").and_then(Value::as_str), Some("0.1.3"));
    }

    #[test]
    fn no_envelope_returns_none() {
        assert!(extract_envelope(b"just some progress text, no json here").is_none());
    }

    /// A unique temp directory for a test warehouse, cleaned up on drop.
    struct TempWarehouse(PathBuf);
    impl TempWarehouse {
        fn new(tag: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("fk-gui-test-{tag}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            TempWarehouse(dir)
        }
        fn path(&self) -> String {
            self.0.display().to_string()
        }
    }
    impl Drop for TempWarehouse {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    // These exercise the real forklift binary via the sibling dev-fallback path. They are
    // the actual integration seam this GUI owns: binary resolution → envelope parse →
    // typed data / classified error. Skipped automatically if no binary is found.
    fn binary_available() -> bool {
        let (bin, _) = resolve_binary(&None, false);
        std::process::Command::new(&bin).arg("version").arg("--json").output().is_ok()
    }

    #[test]
    fn end_to_end_prepare_and_stocktake() {
        if !binary_available() {
            eprintln!("skipping: no forklift binary found");
            return;
        }
        let wh = TempWarehouse::new("loop");

        // prepare
        run_json(None, Some(wh.path()), vec!["prepare".into()], None).expect("prepare should succeed");

        // stage a file and stocktake — the changed-file set must reflect it
        std::fs::write(self_path(&wh, "readme.txt"), "hello\n").unwrap();
        run_json(None, Some(wh.path()), vec!["load".into(), ".".into()], None).expect("load should succeed");

        let data = run_json(None, Some(wh.path()), vec!["stocktake".into()], None).expect("stocktake");
        assert_eq!(data.get("pallet").and_then(Value::as_str), Some("main"));
        assert_eq!(data.get("staged_count").and_then(Value::as_u64), Some(1));

        // stack, then history has exactly one entry
        run_json(None, Some(wh.path()), vec!["stack".into(), "first".into()], None).expect("stack");
        let history = run_json(None, Some(wh.path()), vec!["history".into()], None).expect("history");
        let entries = history.get("entries").and_then(Value::as_array).unwrap();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn classifies_not_a_warehouse() {
        if !binary_available() {
            return;
        }
        let dir = TempWarehouse::new("empty");
        let error = run_json(None, Some(dir.path()), vec!["stocktake".into()], None).unwrap_err();
        assert_eq!(error.code, "not_a_warehouse");
        assert!(error.next_step.is_some(), "a classified error should carry a next step");
    }

    #[test]
    fn run_text_returns_ansi_free_diff() {
        if !binary_available() {
            return;
        }
        let wh = TempWarehouse::new("diff");
        run_json(None, Some(wh.path()), vec!["prepare".into()], None).unwrap();
        std::fs::write(self_path(&wh, "f.txt"), "a\n").unwrap();
        run_json(None, Some(wh.path()), vec!["load".into(), ".".into()], None).unwrap();
        run_json(None, Some(wh.path()), vec!["stack".into(), "c".into()], None).unwrap();
        std::fs::write(self_path(&wh, "f.txt"), "a\nb\n").unwrap();

        let diff = run_text(None, Some(wh.path()), vec!["diff".into(), "f.txt".into()], None).unwrap();
        assert!(!diff.contains('\u{1b}'), "output must be ANSI-free");
        assert!(diff.contains("f.txt"), "diff should name the file");
    }

    fn self_path(wh: &TempWarehouse, name: &str) -> PathBuf {
        wh.0.join(name)
    }
}
