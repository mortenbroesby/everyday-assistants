#!/bin/zsh
set -euo pipefail

readonly service_label="com.mortenbroesby.nemlig-tunnel"
readonly script_path="${0:A}"
readonly repo_root="${script_path:h:h}"
readonly config_dir="${HOME}/.config/tunnel-client"
readonly key_file="${config_dir}/nemlig-runtime-key"
readonly profile_file="${config_dir}/nemlig-local.yaml"
readonly agent_file="${HOME}/Library/LaunchAgents/${service_label}.plist"
readonly log_dir="${HOME}/Library/Logs/nemlig-tunnel"
readonly launch_domain="gui/$(id -u)"

fail() {
  print -u2 -- "nemlig-tunnel: $*"
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "missing $1"
}

check_key() {
  require_file "$key_file"
  [[ "$(stat -f '%Lp' "$key_file")" == "600" ]] ||
    fail "$key_file must have mode 600"
}

run_tunnel() {
  check_key
  require_file "$profile_file"
  exec tunnel-client run \
    --profile nemlig-local \
    --control-plane.api-key "file:${key_file}"
}

write_agent() {
  check_key
  require_file "$profile_file"

  local tunnel_bin node_bin runtime_path temp_file plist_buddy
  tunnel_bin="$(command -v tunnel-client)" || fail "tunnel-client is not on PATH"
  node_bin="$(command -v node)" || fail "node is not on PATH"
  runtime_path="${tunnel_bin:h}:${node_bin:h}:/usr/bin:/bin:/usr/sbin:/sbin"
  plist_buddy="/usr/libexec/PlistBuddy"

  mkdir -p "${agent_file:h}" "$log_dir"
  temp_file="$(mktemp "${TMPDIR:-/tmp}/nemlig-tunnel.XXXXXX.plist")"
  trap "rm -f '$temp_file'" EXIT

  plutil -create xml1 "$temp_file"
  "$plist_buddy" -c "Add :Label string $service_label" "$temp_file"
  "$plist_buddy" -c "Add :ProgramArguments array" "$temp_file"
  "$plist_buddy" -c "Add :ProgramArguments:0 string $script_path" "$temp_file"
  "$plist_buddy" -c "Add :ProgramArguments:1 string run" "$temp_file"
  "$plist_buddy" -c "Add :WorkingDirectory string $repo_root" "$temp_file"
  "$plist_buddy" -c "Add :EnvironmentVariables dict" "$temp_file"
  "$plist_buddy" -c "Add :EnvironmentVariables:PATH string $runtime_path" "$temp_file"
  "$plist_buddy" -c "Add :RunAtLoad bool true" "$temp_file"
  "$plist_buddy" -c "Add :KeepAlive bool true" "$temp_file"
  "$plist_buddy" -c "Add :ThrottleInterval integer 10" "$temp_file"
  "$plist_buddy" -c "Add :ProcessType string Background" "$temp_file"
  "$plist_buddy" -c "Add :StandardOutPath string $log_dir/stdout.log" "$temp_file"
  "$plist_buddy" -c "Add :StandardErrorPath string $log_dir/stderr.log" "$temp_file"
  plutil -lint "$temp_file" >/dev/null

  install -m 600 "$temp_file" "$agent_file"
  launchctl bootout "$launch_domain/$service_label" 2>/dev/null || true
  launchctl bootstrap "$launch_domain" "$agent_file"
  launchctl kickstart -k "$launch_domain/$service_label"
}

enroll() {
  [[ -t 0 ]] || fail "enroll must run in an interactive terminal"
  local runtime_key
  read -rs "runtime_key?Tunnel runtime API key: "
  print
  [[ -n "$runtime_key" ]] || fail "runtime key cannot be empty"

  mkdir -p "$config_dir"
  chmod 700 "$config_dir"
  umask 077
  print -rn -- "$runtime_key" > "$key_file"
  unset runtime_key
  chmod 600 "$key_file"
  write_agent
  print -- "Nemlig tunnel enrolled and managed by launchd."
}

restart() {
  check_key
  require_file "$agent_file"
  cd "$repo_root"
  pnpm --filter nemlig-shopper build
  launchctl kickstart -k "$launch_domain/$service_label"

  local attempt
  for attempt in {1..15}; do
    if tunnel-client health --port 8080 --require-control-plane-poll >/dev/null 2>&1; then
      tunnel-client health --port 8080 --require-control-plane-poll
      return
    fi
    sleep 1
  done
  tunnel-client health --port 8080 --require-control-plane-poll ||
    fail "tunnel did not become ready within 15 seconds"
}

status() {
  launchctl print "$launch_domain/$service_label" >/dev/null ||
    fail "service is not installed; run: pnpm nemlig:tunnel:enroll"
  tunnel-client health --port 8080 --require-control-plane-poll
}

stop() {
  launchctl bootout "$launch_domain/$service_label"
}

case "${1:-}" in
  enroll) enroll ;;
  restart) restart ;;
  status) status ;;
  stop) stop ;;
  run) run_tunnel ;;
  *) fail "usage: $0 {enroll|restart|status|stop|run}" ;;
esac
