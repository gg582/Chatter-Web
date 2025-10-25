#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: deploy/install.sh [options]

Build the Chatter web dashboard and optionally install a systemd service.

Options:
  --systemd            Install and start the systemd service after building
  --no-systemd         Skip systemd installation (default)
  --service-name NAME  Override the systemd unit name (default: chatter-frontend)
  --user USER          Set the service user when installing with systemd (default: www-data)
  --group GROUP        Set the service group when installing with systemd (default: www-data)
  --port PORT          Set the PORT environment variable for the service (default: 8081)
  --node PATH          Explicit path to the Node.js executable
  --prefix PATH        Destination directory for the compiled assets (default: /opt/chatter-web)
  --help               Show this message
USAGE
}

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)

if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
  echo "Error: install.sh must be run from within the repository." >&2
  exit 1
fi

INSTALL_SERVICE=0
SERVICE_NAME="chatter-frontend"
SERVICE_USER="www-data"
SERVICE_GROUP="www-data"
SERVICE_PORT="8081"
NODE_BIN=""
INSTALL_PREFIX="/opt/chatter-web"

ensure_prefix_permissions() {
  if [[ $EUID -eq 0 ]]; then
    return
  fi

  local target="$1"
  local probe="$target"

  while [[ ! -d "$probe" ]]; do
    local parent
    parent=$(dirname -- "$probe")
    if [[ "$parent" == "$probe" ]]; then
      break
    fi
    probe="$parent"
  done

  if [[ ! -w "$probe" || ! -x "$probe" ]]; then
    echo "Error: insufficient permissions to write to $target. Re-run with sudo or choose a writable --prefix." >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --systemd)
      INSTALL_SERVICE=1
      ;;
    --no-systemd)
      INSTALL_SERVICE=0
      ;;
    --service-name)
      shift || { echo "Missing value for --service-name" >&2; exit 1; }
      SERVICE_NAME="$1"
      ;;
    --user)
      shift || { echo "Missing value for --user" >&2; exit 1; }
      SERVICE_USER="$1"
      ;;
    --group)
      shift || { echo "Missing value for --group" >&2; exit 1; }
      SERVICE_GROUP="$1"
      ;;
    --port)
      shift || { echo "Missing value for --port" >&2; exit 1; }
      SERVICE_PORT="$1"
      ;;
    --node)
      shift || { echo "Missing value for --node" >&2; exit 1; }
      NODE_BIN="$1"
      ;;
    --prefix)
      shift || { echo "Missing value for --prefix" >&2; exit 1; }
      INSTALL_PREFIX="$1"
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ -z "$INSTALL_PREFIX" ]]; then
  echo "Error: installation prefix cannot be empty." >&2
  exit 1
fi

if [[ "$INSTALL_PREFIX" == "/" ]]; then
  echo "Error: refusing to install into the filesystem root." >&2
  exit 1
fi

if (( INSTALL_SERVICE )) && [[ $EUID -ne 0 ]]; then
  echo "Error: --systemd requires root privileges." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required to build the project." >&2
  exit 1
fi

cd "$PROJECT_ROOT"

echo "Installing dependencies..."
npm install

echo "Building the project..."
npm run build

echo "Build completed. Artifacts available in dist/."

echo "Copying build output to $INSTALL_PREFIX..."
ensure_prefix_permissions "$INSTALL_PREFIX"
rm -rf "$INSTALL_PREFIX"
mkdir -p "$INSTALL_PREFIX"
cp -a "$PROJECT_ROOT/dist/." "$INSTALL_PREFIX/"

echo "Install location prepared at $INSTALL_PREFIX."

if (( INSTALL_SERVICE )); then
  if [[ -z "$NODE_BIN" ]]; then
    NODE_BIN=$(command -v node || true)
  fi

  if [[ -z "$NODE_BIN" ]]; then
    echo "Error: Unable to determine node executable path. Provide one with --node." >&2
    exit 1
  fi

  if [[ "$PROJECT_ROOT" == *" "* ]]; then
    echo "Warning: repository path contains spaces; adjust the generated unit manually if systemd rejects ExecStart." >&2
  fi

  SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"

  echo "Setting ownership of $INSTALL_PREFIX to $SERVICE_USER:$SERVICE_GROUP..."
  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_PREFIX"

  START_SCRIPT="$INSTALL_PREFIX/server.js"

  if [[ ! -f "$START_SCRIPT" ]]; then
    echo "Error: $START_SCRIPT is missing after installation." >&2
    exit 1
  fi

  /bin/bash -c "cat > \"$SERVICE_PATH\" <<EOF2
[Unit]
Description=Chatter BBS web control deck
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_PREFIX
ExecStart=\"$NODE_BIN\" \"$START_SCRIPT\"
Restart=on-failure
Environment=PORT=$SERVICE_PORT
User=$SERVICE_USER
Group=$SERVICE_GROUP

[Install]
WantedBy=multi-user.target
EOF2"

  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"

  echo "Systemd unit installed at $SERVICE_PATH and started."
  echo "Use 'systemctl restart $SERVICE_NAME' after rebuilding."
else
  echo "Artifacts staged in $INSTALL_PREFIX. Run deploy/install.sh --systemd as root to install the service."
fi
