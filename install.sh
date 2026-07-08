#!/bin/sh
# Forklift GUI installer — macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/r4nd0mth1ngs/forklift_ui/main/install.sh | sh
#
# Installs the desktop app and exposes a `forklift-gui` launcher on your PATH:
#   • macOS  — drops forklift-gui.app into /Applications (or ~/Applications) and
#              installs a `forklift-gui` shim that runs `open -a` on it.
#   • Linux  — installs the portable AppImage as `forklift-gui` (and a .desktop
#              entry, best effort, so it shows up in your app launcher).
#
# Environment overrides:
#   FORKLIFT_GUI_VERSION      install a specific tag, e.g. v0.1.4 (default: latest release)
#   FORKLIFT_GUI_INSTALL_DIR  where to put the `forklift-gui` command (default: ~/.local/bin)
#   FORKLIFT_GUI_APP_DIR      macOS only: where to put the .app  (default: /Applications)
#   FORKLIFT_GUI_REPO         GitHub repo slug                   (default: r4nd0mth1ngs/forklift_ui)
#   FORKLIFT_GUI_BASE_URL     full base URL for the assets (mirrors / air-gapped setups);
#                             overrides FORKLIFT_GUI_REPO. On Linux the asset filename
#                             embeds the version, so pair it with FORKLIFT_GUI_VERSION
#                             there (the installer never calls the GitHub API when it is
#                             set). macOS needs neither — its app.tar.gz is unversioned.
set -eu

REPO="${FORKLIFT_GUI_REPO:-r4nd0mth1ngs/forklift_ui}"
VERSION="${FORKLIFT_GUI_VERSION:-latest}"
INSTALL_DIR="${FORKLIFT_GUI_INSTALL_DIR:-$HOME/.local/bin}"
APP_DIR="${FORKLIFT_GUI_APP_DIR:-/Applications}"

say() { printf '%s\n' "$*"; }
err() { printf 'install.sh: error: %s\n' "$*" >&2; exit 1; }

# ── detect platform ─────────────────────────────────────────────
os=$(uname -s)
case "$os" in
    Darwin) platform="macos" ;;
    Linux)  platform="linux" ;;
    *) err "unsupported OS: $os — on Windows use install.ps1" ;;
esac

# ── where the release assets live ───────────────────────────────
if [ -n "${FORKLIFT_GUI_BASE_URL:-}" ]; then
    base="$FORKLIFT_GUI_BASE_URL"
elif [ "$VERSION" = "latest" ]; then
    base="https://github.com/${REPO}/releases/latest/download"
else
    tag="$VERSION"; case "$tag" in v*) ;; *) tag="v$tag" ;; esac
    base="https://github.com/${REPO}/releases/download/${tag}"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

fetch() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$1" -O "$2"
    else
        err "need curl or wget"
    fi
}

fetch_stdout() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$1"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- "$1"
    else
        err "need curl or wget"
    fi
}

# The AppImage / installer filenames embed the version (e.g. ..._0.1.4_amd64.AppImage),
# so resolve the numeric version from the release tag when installing "latest".
resolve_num() {
    if [ "$VERSION" != "latest" ]; then
        printf '%s\n' "${VERSION#v}"
        return
    fi
    # With a mirror/air-gapped base URL there is no GitHub API to ask, and the
    # versioned filename needs a number — so require an explicit version there.
    if [ -n "${FORKLIFT_GUI_BASE_URL:-}" ]; then
        err "FORKLIFT_GUI_BASE_URL is set but FORKLIFT_GUI_VERSION is not — the Linux asset filename embeds the version, so set FORKLIFT_GUI_VERSION too (e.g. v0.1.4)"
    fi
    api="https://api.github.com/repos/${REPO}/releases/latest"
    num=$(fetch_stdout "$api" \
        | sed -n 's/.*"tag_name" *: *"\([^"]*\)".*/\1/p' | head -n1)
    [ -n "$num" ] || err "could not resolve the latest release — set FORKLIFT_GUI_VERSION"
    printf '%s\n' "${num#v}"
}

# ── checksums (best effort: skip if the release has none) ────────
have_sha=0
if command -v sha256sum >/dev/null 2>&1 || command -v shasum >/dev/null 2>&1; then
    if fetch "${base}/checksums.txt" "${tmp}/checksums.txt" 2>/dev/null; then
        have_sha=1
    fi
fi

verify() { # $1 = asset filename, already downloaded into $tmp
    [ "$have_sha" = 1 ] || return 0
    ( cd "$tmp"
      grep " $1\$" checksums.txt > "$1.sum" 2>/dev/null || exit 0
      if command -v sha256sum >/dev/null 2>&1; then
          sha256sum -c "$1.sum" >/dev/null
      else
          shasum -a 256 -c "$1.sum" >/dev/null
      fi
    ) || err "checksum verification FAILED for $1 — refusing to install"
}

link_hint() {
    case ":$PATH:" in
        *":${INSTALL_DIR}:"*) ;;
        *)
            say ""
            say "note: ${INSTALL_DIR} is not on your PATH. Add this to your shell profile:"
            say "    export PATH=\"${INSTALL_DIR}:\$PATH\""
            ;;
    esac
}

# ── macOS: .app bundle + a `forklift-gui` launcher ──────────────
install_macos() {
    asset="forklift-gui_universal.app.tar.gz"     # unversioned name, same in every release
    say "downloading ${base}/${asset}"
    fetch "${base}/${asset}" "${tmp}/${asset}" \
        || err "download failed — does a release exist? ${base}/${asset}"
    verify "$asset"

    tar -xzf "${tmp}/${asset}" -C "$tmp"
    app=$(cd "$tmp" && ls -d ./*.app 2>/dev/null | head -n1)
    [ -n "$app" ] || err "archive did not contain a .app bundle"
    app_name=$(basename "$app")

    # Prefer APP_DIR (creating it if needed); fall back to ~/Applications when we
    # can't write there (e.g. a locked-down /Applications without admin rights).
    dest_dir="$APP_DIR"
    if ! mkdir -p "$dest_dir" 2>/dev/null || [ ! -w "$dest_dir" ]; then
        dest_dir="$HOME/Applications"
        mkdir -p "$dest_dir"
    fi
    dest="${dest_dir}/${app_name}"

    rm -rf "$dest"
    mv "${tmp}/${app_name}" "$dest"
    say "installed ${dest}"

    # Expose a `forklift-gui` command that launches the app.
    mkdir -p "$INSTALL_DIR"
    cmd="${INSTALL_DIR}/forklift-gui"
    cat > "$cmd" <<EOF
#!/bin/sh
# Launch the Forklift GUI. Generated by install.sh.
exec open -a "${dest}" "\$@"
EOF
    chmod 755 "$cmd"
    say "installed ${cmd} — run 'forklift-gui' to launch"
    link_hint
}

# ── Linux: portable AppImage installed as `forklift-gui` ────────
install_linux() {
    arch=$(uname -m)
    case "$arch" in
        x86_64|amd64) ;;
        *) err "no Linux build for $arch yet (only x86_64 / amd64)" ;;
    esac

    num=$(resolve_num)
    asset="forklift-gui_${num}_amd64.AppImage"
    say "downloading ${base}/${asset}"
    fetch "${base}/${asset}" "${tmp}/${asset}" \
        || err "download failed — does a release exist? ${base}/${asset}"
    verify "$asset"

    mkdir -p "$INSTALL_DIR"
    cmd="${INSTALL_DIR}/forklift-gui"
    staged="${INSTALL_DIR}/.forklift-gui.new.$$"
    cp "${tmp}/${asset}" "$staged"
    chmod 755 "$staged"
    mv -f "$staged" "$cmd"
    say "installed ${cmd} — run 'forklift-gui' to launch"

    # Best-effort desktop entry so it appears in the application menu.
    apps="$HOME/.local/share/applications"
    if mkdir -p "$apps" 2>/dev/null; then
        cat > "${apps}/forklift-gui.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Forklift GUI
Comment=Desktop GUI for the Forklift VCS
Exec=${cmd} %U
Terminal=false
Categories=Development;RevisionControl;
EOF
    fi
    link_hint
}

case "$platform" in
    macos) install_macos ;;
    linux) install_linux ;;
esac
