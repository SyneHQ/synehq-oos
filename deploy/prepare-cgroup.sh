#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' "The cgroup preparation command requires root." >&2
  exit 1
fi
if [ "$#" -ne 0 ]; then
  printf '%s\n' "The cgroup preparation command does not accept arguments." >&2
  exit 1
fi
if [ "$(stat -f -c %T /sys/fs/cgroup)" != "cgroup2fs" ]; then
  printf '%s\n' "The Docker host must use cgroup v2." >&2
  exit 1
fi

oos_cgroup=/sys/fs/cgroup/syneoss.slice
if [ ! -d "$oos_cgroup" ] || [ -L "$oos_cgroup" ]; then
  printf '%s\n' "Start the syneoss.slice unit before preparing its job delegation." >&2
  exit 1
fi
if [ "$(cat "$oos_cgroup/memory.max")" != "805306368" ] || \
   [ "$(cat "$oos_cgroup/memory.swap.max")" != "0" ] || \
   [ "$(cat "$oos_cgroup/cpu.max")" != "200000 100000" ] || \
   [ "$(cat "$oos_cgroup/pids.max")" != "256" ]; then
  printf '%s\n' "The syneoss.slice limits do not match the installation limits." >&2
  exit 1
fi
if [ -n "$(cat "$oos_cgroup/cgroup.procs")" ]; then
  printf '%s\n' "The syneoss.slice parent must not contain processes directly." >&2
  exit 1
fi
oos_controllers=" $(cat "$oos_cgroup/cgroup.controllers") "
for oos_controller in cpu memory pids; do
  case "$oos_controllers" in
    *" $oos_controller "*) ;;
    *) printf '%s\n' "The syneoss.slice parent lacks a required controller." >&2; exit 1 ;;
  esac
done
if [ -e "$oos_cgroup/jobs" ]; then
  if [ ! -d "$oos_cgroup/jobs" ] || [ -L "$oos_cgroup/jobs" ]; then
    printf '%s\n' "The OOS job delegation path is invalid." >&2
    exit 1
  fi
  if [ -n "$(cat "$oos_cgroup/jobs/cgroup.procs")" ] || \
     [ -n "$(find "$oos_cgroup/jobs" -mindepth 1 -type d -print -quit)" ]; then
    printf '%s\n' "The OOS job delegation is not empty. Resolve retained query custody before restarting." >&2
    exit 1
  fi
fi

printf '%s' '+cpu +memory +pids' > "$oos_cgroup/cgroup.subtree_control"
if [ ! -e "$oos_cgroup/jobs" ]; then
  mkdir "$oos_cgroup/jobs"
fi
# CLONE_INTO_CGROUP requires write permission on the common ancestor's process file.
chown 65532:65532 "$oos_cgroup/cgroup.procs" "$oos_cgroup/jobs" \
  "$oos_cgroup/jobs/cgroup.procs" "$oos_cgroup/jobs/cgroup.threads" "$oos_cgroup/jobs/cgroup.subtree_control"
