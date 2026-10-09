#!/bin/sh
set -eu

# Prepare only the dedicated OOS slice. All database work remains in the container.
if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' "Run this command with sudo on the Docker host." >&2
  exit 1
fi
if [ "$#" -ne 1 ]; then
  printf '%s\n' "Usage: run-container.sh IMAGE" >&2
  exit 1
fi
case "$1" in -*) exit 1 ;; esac
oos_image=$1
oos_script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
oos_port=${OOS_PORT:-3100}
case "$oos_port" in
  ''|*[!0-9]*|??????*)
    printf '%s\n' "OOS_PORT must be an integer from 1 through 65535." >&2
    exit 1
    ;;
esac
if [ "$oos_port" -lt 1 ] || [ "$oos_port" -gt 65535 ]; then
  printf '%s\n' "OOS_PORT must be an integer from 1 through 65535." >&2
  exit 1
fi
oos_origin=${AUTH_URL:-http://localhost:$oos_port}
if [ "$(docker info --format '{{.CgroupDriver}} {{.CgroupVersion}}')" != "systemd 2" ]; then
  printf '%s\n' "This launcher requires Docker with the systemd cgroup v2 driver." >&2
  exit 1
fi
if docker container inspect synehq-oos >/dev/null 2>&1; then
  printf '%s\n' "The synehq-oos container already exists. Stop and replace it through the upgrade procedure." >&2
  exit 1
fi

oos_unit=/etc/systemd/system/syneoss.slice
oos_helper_dir=/usr/local/libexec/synehq-oos
oos_helper=$oos_helper_dir/prepare-cgroup.sh
oos_delegation_unit=/etc/systemd/system/syneoss-delegation.service
oos_temporary=$(mktemp)
trap 'rm -f "$oos_temporary"' EXIT HUP INT TERM
cat > "$oos_temporary" <<'UNIT'
[Unit]
Description=SyneHQ OOS container and query limits

[Slice]
MemoryMax=768M
MemorySwapMax=0
CPUQuota=200%
CPUQuotaPeriodSec=100ms
TasksMax=256
UNIT

install_matching() {
  oos_source=$1
  oos_target=$2
  oos_mode=$3
  if [ -L "$oos_target" ]; then
    printf '%s\n' "An installation path is a symbolic link. Review it before running this launcher." >&2
    exit 1
  fi
  if [ -e "$oos_target" ]; then
    if [ ! -f "$oos_target" ] || \
       [ "$(stat -c '%u:%g:%a' "$oos_target")" != "0:0:$oos_mode" ] || \
       ! cmp -s "$oos_source" "$oos_target"; then
      printf '%s\n' "An installed OOS helper or unit differs from this version. Review it before running this launcher." >&2
      exit 1
    fi
  else
    install -o 0 -g 0 -m "$oos_mode" "$oos_source" "$oos_target"
  fi
}

if [ -e "$oos_helper_dir" ] || [ -L "$oos_helper_dir" ]; then
  if [ ! -d "$oos_helper_dir" ] || [ -L "$oos_helper_dir" ] || \
     [ "$(stat -c '%u:%g:%a' "$oos_helper_dir")" != "0:0:700" ]; then
    printf '%s\n' "The OOS helper directory must be private and owned by root." >&2
    exit 1
  fi
else
  install -d -o 0 -g 0 -m 700 "$oos_helper_dir"
fi
install_matching "$oos_temporary" "$oos_unit" 644
install_matching "$oos_script_dir/prepare-cgroup.sh" "$oos_helper" 700
install_matching "$oos_script_dir/syneoss-delegation.service" "$oos_delegation_unit" 644
systemctl daemon-reload
systemctl enable syneoss-delegation.service
systemctl start syneoss-delegation.service
# An active oneshot unit does not run again. Check custody on every manual launch.
"$oos_helper"
oos_cgroup=/sys/fs/cgroup/syneoss.slice

docker run -d --name synehq-oos --restart unless-stopped \
  --cgroup-parent=syneoss.slice --cgroupns=host \
  --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  --security-opt="seccomp=$oos_script_dir/seccomp.json" \
  --stop-timeout=90 --pids-limit=256 --memory=768m --memory-swap=768m --cpus=2 \
  --tmpfs=/tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777 \
  --mount=type=volume,source=synehq-oos-data,target=/data \
  --mount="type=bind,source=$oos_cgroup/jobs,target=/run/kelvo-cgroup" \
  -p "127.0.0.1:$oos_port:3100" -e "AUTH_URL=$oos_origin" \
  "$oos_image"
