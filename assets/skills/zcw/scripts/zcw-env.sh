#!/bin/bash
# ZCW script locator — source this file to export paths to bundled scripts.
#
# Usage:
#   . /path/to/zcw/scripts/zcw-env.sh
#
# This file is sourced by workflow snippets. Do not set global shell options here.

_zcw_env_source="${BASH_SOURCE[0]:-$0}"
_zcw_script_dir="$(cd "$(dirname "$_zcw_env_source")" && pwd -P)"
_zcw_env_sourced=0
(return 0 2>/dev/null) && _zcw_env_sourced=1

export ZCW_GUARD="${ZCW_GUARD:-${_zcw_script_dir}/zcw-guard.sh}"
export ZCW_STATE="${ZCW_STATE:-${_zcw_script_dir}/zcw-state.sh}"
export ZCW_HANDOFF="${ZCW_HANDOFF:-${_zcw_script_dir}/zcw-handoff.sh}"
export ZCW_ARCHIVE="${ZCW_ARCHIVE:-${_zcw_script_dir}/zcw-archive.sh}"
export ZCW_YAML_VALIDATE="${ZCW_YAML_VALIDATE:-${_zcw_script_dir}/zcw-yaml-validate.sh}"

_zcw_bash_is_usable() {
  local _zcw_bash_candidate="$1"
  if [ -z "$_zcw_bash_candidate" ]; then
    return 1
  fi
  case "$_zcw_bash_candidate" in
    */Windows/System32/bash.exe|*/windows/system32/bash.exe|*\\Windows\\System32\\bash.exe|*\\windows\\system32\\bash.exe)
      return 1
      ;;
  esac
  "$_zcw_bash_candidate" -lc 'printf zcw-bash-ok' >/dev/null 2>&1
}

_zcw_resolve_bash() {
  local _zcw_bash_candidate

  if _zcw_bash_is_usable "${ZCW_BASH:-}"; then
    printf '%s\n' "$ZCW_BASH"
    return 0
  fi

  if _zcw_bash_is_usable "${BASH:-}"; then
    printf '%s\n' "$BASH"
    return 0
  fi

  _zcw_bash_candidate="$(command -v sh 2>/dev/null | awk '{ sub(/\/sh(\.exe)?$/, "/bash.exe"); print }')"
  if _zcw_bash_is_usable "$_zcw_bash_candidate"; then
    printf '%s\n' "$_zcw_bash_candidate"
    return 0
  fi

  _zcw_bash_candidate="$(command -v bash 2>/dev/null || true)"
  if _zcw_bash_is_usable "$_zcw_bash_candidate"; then
    printf '%s\n' "$_zcw_bash_candidate"
    return 0
  fi

  return 1
}

ZCW_BASH="$(_zcw_resolve_bash || true)"
export ZCW_BASH

_zcw_env_fail() {
  echo "ERROR: ZCW scripts not found. Ensure the zcw skill is installed completely." >&2
  echo "Expected path pattern: */zcw/scripts/zcw-*.sh under project or platform skill directories" >&2
}

_zcw_bash_fail() {
  echo "ERROR: usable bash not found. Install Git Bash or set ZCW_BASH to a working bash executable." >&2
  echo "Windows WSL launcher bash.exe is not supported for ZCW scripts." >&2
}

_zcw_env_abort() {
  local _zcw_env_was_sourced="$_zcw_env_sourced"
  unset _zcw_env_source _zcw_script_dir _zcw_script _zcw_env_missing _zcw_env_sourced
  unset _zcw_bash_candidate
  unset -f _zcw_env_fail _zcw_bash_fail _zcw_bash_is_usable _zcw_resolve_bash
  if [ "$_zcw_env_was_sourced" -eq 1 ]; then
    unset -f _zcw_env_abort
    return 1
  fi
  exit 1
}

_zcw_env_missing=0
if [ -z "$ZCW_BASH" ]; then
  _zcw_bash_fail
  _zcw_env_missing=1
fi
for _zcw_script in \
  "$ZCW_GUARD" \
  "$ZCW_STATE" \
  "$ZCW_HANDOFF" \
  "$ZCW_ARCHIVE" \
  "$ZCW_YAML_VALIDATE"; do
  if [ ! -f "$_zcw_script" ]; then
    _zcw_env_fail
    _zcw_env_missing=1
    break
  fi
done

if [ "$_zcw_env_missing" -ne 0 ]; then
  _zcw_env_abort
else
  unset _zcw_env_source _zcw_script_dir _zcw_script _zcw_env_missing _zcw_env_sourced
  unset _zcw_bash_candidate
  unset -f _zcw_env_fail _zcw_bash_fail _zcw_bash_is_usable _zcw_resolve_bash _zcw_env_abort
fi
