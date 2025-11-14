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
  --bbs-host HOST      Set the remote BBS host for the terminal bridge (default: bbs.chatter.example)
  --bbs-port PORT      Set the remote BBS port (default: 2323 for telnet, 22 for ssh)
  --bbs-protocol MODE  Select telnet or ssh for the bridge protocol (default: telnet)
  --bbs-ssh-command CMD Remote command to run after connecting via SSH
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
BBS_HOST="bbs.chatter.example"
BBS_PROTOCOL="telnet"
BBS_PORT="2323"
BBS_PORT_SET=0
BBS_SSH_COMMAND=""

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
    --bbs-host)
      shift || { echo "Missing value for --bbs-host" >&2; exit 1; }
      BBS_HOST="$1"
      ;;
    --bbs-port)
      shift || { echo "Missing value for --bbs-port" >&2; exit 1; }
      BBS_PORT="$1"
      BBS_PORT_SET=1
      ;;
    --bbs-protocol)
      shift || { echo "Missing value for --bbs-protocol" >&2; exit 1; }
      BBS_PROTOCOL="${1,,}"
      ;;
    --bbs-ssh-command)
      shift || { echo "Missing value for --bbs-ssh-command" >&2; exit 1; }
      BBS_SSH_COMMAND="$1"
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

if [[ -z "${INSTALL_PREFIX// /}" ]]; then
  echo "Error: installation prefix cannot be empty or contain only spaces." >&2
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

if [[ -z "${BBS_HOST// /}" ]]; then
  echo "Error: --bbs-host cannot be empty." >&2
  exit 1
fi

BBS_PROTOCOL=${BBS_PROTOCOL,,}
if [[ "$BBS_PROTOCOL" != "telnet" && "$BBS_PROTOCOL" != "ssh" ]]; then
  echo "Error: --bbs-protocol must be either telnet or ssh." >&2
  exit 1
fi

if (( BBS_PORT_SET == 0 )); then
  if [[ "$BBS_PROTOCOL" == "ssh" ]]; then
    BBS_PORT="22"
  else
    BBS_PORT="2323"
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required to build the project." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 22 or newer is required but 'node' was not found." >&2
  exit 1
fi

NODE_VERSION_RAW=$(node -v)
NODE_VERSION_TRIMMED=${NODE_VERSION_RAW#v}
NODE_MAJOR=${NODE_VERSION_TRIMMED%%.*}
if ! [[ $NODE_MAJOR =~ ^[0-9]+$ ]]; then
  echo "Error: Unable to parse Node.js version string '$NODE_VERSION_RAW'." >&2
  exit 1
fi

if (( NODE_MAJOR < 22 )); then
  echo "Error: Node.js 22 or newer is required (detected $NODE_VERSION_RAW)." >&2
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

if [[ -n "$BBS_PORT" ]]; then
  echo "Terminal bridge target: $BBS_PROTOCOL $BBS_HOST:$BBS_PORT"
else
  echo "Terminal bridge target: $BBS_PROTOCOL $BBS_HOST"
fi

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
Environment=CHATTER_BBS_HOST=$BBS_HOST
Environment=CHATTER_BBS_PROTOCOL=$BBS_PROTOCOL
Environment=CHATTER_BBS_PORT=$BBS_PORT
EOF2"

  if [[ -n "$BBS_SSH_COMMAND" ]]; then
    echo "Environment=CHATTER_BBS_SSH_COMMAND=$BBS_SSH_COMMAND" >>"$SERVICE_PATH"
  fi

  /bin/bash -c "cat >> \"$SERVICE_PATH\" <<EOF2
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
