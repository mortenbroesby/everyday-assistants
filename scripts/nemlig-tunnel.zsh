#!/bin/zsh
set -euo pipefail

readonly service_label="com.mortenbroesby.nemlig-tunnel"
readonly auth0_service_label="com.mortenbroesby.nemlig-auth0-tunnel"
readonly script_path="${0:A}"
readonly repo_root="${script_path:h:h}"
readonly config_dir="${HOME}/.config/tunnel-client"
readonly key_file="${config_dir}/nemlig-runtime-key"
readonly profile_file="${config_dir}/nemlig-local.yaml"
readonly auth0_profile_file="${config_dir}/nemlig-auth0-local.yaml"
readonly auth0_env_file="${HOME}/.config/nemlig-assistant/http-auth.env"
readonly agent_file="${HOME}/Library/LaunchAgents/${service_label}.plist"
readonly auth0_agent_file="${HOME}/Library/LaunchAgents/${auth0_service_label}.plist"
readonly log_dir="${HOME}/Library/Logs/nemlig-tunnel"
readonly auth0_log_dir="${HOME}/Library/Logs/nemlig-auth0-tunnel"
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

configure_profile_key_ref() {
  local selected_profile="$1"
  require_file "$selected_profile"
  local file_ref="  api_key: \"file:${key_file}\""

  if grep -Eq '^  api_key: "?env:CONTROL_PLANE_API_KEY"?$' "$selected_profile"; then
    sed -i '' "s|^  api_key: \"\{0,1\}env:CONTROL_PLANE_API_KEY\"\{0,1\}$|${file_ref}|" "$selected_profile"
  fi
  grep -Fqx "$file_ref" "$selected_profile" ||
    fail "$selected_profile has an unexpected control_plane.api_key reference"
  chmod 600 "$selected_profile"
}

run_tunnel() {
  check_key
  require_file "$profile_file"
  exec tunnel-client run \
    --profile nemlig-local \
    --control-plane.api-key "file:${key_file}"
}

run_auth0_tunnel() {
  check_key
  require_file "$auth0_profile_file"
  require_file "$auth0_env_file"
  [[ "$(stat -f '%Lp' "$auth0_env_file")" == "600" ]] ||
    fail "$auth0_env_file must have mode 600"
  set -a
  source "$auth0_env_file"
  set +a
  export NEMLIG_MCP_REVISION="$(git -C "$repo_root" rev-parse HEAD)"

  node "$repo_root/apps/nemlig-assistant/dist/http.js" &
  local http_pid=$!
  trap "kill $http_pid 2>/dev/null || true" EXIT INT TERM
  local attempt
  for attempt in {1..50}; do
    curl -fsS http://127.0.0.1:3333/readyz >/dev/null 2>&1 && break
    kill -0 "$http_pid" 2>/dev/null || return 1
    sleep 0.2
  done
  curl -fsS http://127.0.0.1:3333/readyz >/dev/null ||
    fail "Auth0-backed MCP server did not become ready within 10 seconds"

  tunnel-client run --profile nemlig-auth0-local \
    --control-plane.api-key "file:${key_file}" &
  local tunnel_pid=$!
  trap "kill $http_pid $tunnel_pid 2>/dev/null || true" EXIT INT TERM
  while kill -0 "$http_pid" 2>/dev/null && kill -0 "$tunnel_pid" 2>/dev/null; do
    sleep 2
  done
  return 1
}

write_agent() {
  local mode="${1:-stdio}"
  local selected_label="$service_label"
  local selected_profile="$profile_file"
  local selected_agent="$agent_file"
  local selected_log_dir="$log_dir"
  local run_command="run"
  if [[ "$mode" == "auth0" ]]; then
    selected_label="$auth0_service_label"
    selected_profile="$auth0_profile_file"
    selected_agent="$auth0_agent_file"
    selected_log_dir="$auth0_log_dir"
    run_command="run-auth0"
    require_file "$auth0_env_file"
  fi
  check_key
  configure_profile_key_ref "$selected_profile"

  local tunnel_bin node_bin gh_bin runtime_path temp_file plist_buddy
  tunnel_bin="$(command -v tunnel-client)" || fail "tunnel-client is not on PATH"
  node_bin="$(command -v node)" || fail "node is not on PATH"
  gh_bin="$(command -v gh)" || fail "gh is not on PATH"
  runtime_path="${tunnel_bin:h}:${node_bin:h}:${gh_bin:h}:/usr/bin:/bin:/usr/sbin:/sbin"
  plist_buddy="/usr/libexec/PlistBuddy"

  mkdir -p "${selected_agent:h}" "$selected_log_dir"
  temp_file="$(mktemp "${TMPDIR:-/tmp}/nemlig-tunnel.XXXXXX.plist")"
  trap "rm -f '$temp_file'" EXIT

  plutil -create xml1 "$temp_file"
  "$plist_buddy" -c "Add :Label string $selected_label" "$temp_file"
  "$plist_buddy" -c "Add :ProgramArguments array" "$temp_file"
  "$plist_buddy" -c "Add :ProgramArguments:0 string $script_path" "$temp_file"
  "$plist_buddy" -c "Add :ProgramArguments:1 string $run_command" "$temp_file"
  "$plist_buddy" -c "Add :WorkingDirectory string $repo_root" "$temp_file"
  "$plist_buddy" -c "Add :EnvironmentVariables dict" "$temp_file"
  "$plist_buddy" -c "Add :EnvironmentVariables:HOME string ${HOME}" "$temp_file"
  "$plist_buddy" -c "Add :EnvironmentVariables:PATH string $runtime_path" "$temp_file"
  "$plist_buddy" -c "Add :RunAtLoad bool true" "$temp_file"
  "$plist_buddy" -c "Add :KeepAlive bool true" "$temp_file"
  "$plist_buddy" -c "Add :ThrottleInterval integer 10" "$temp_file"
  "$plist_buddy" -c "Add :ProcessType string Background" "$temp_file"
  "$plist_buddy" -c "Add :StandardOutPath string $selected_log_dir/stdout.log" "$temp_file"
  "$plist_buddy" -c "Add :StandardErrorPath string $selected_log_dir/stderr.log" "$temp_file"
  plutil -lint "$temp_file" >/dev/null

  install -m 600 "$temp_file" "$selected_agent"
  launchctl bootout "$launch_domain/$selected_label" 2>/dev/null || true
  local attempt
  for attempt in {1..10}; do
    launchctl print "$launch_domain/$selected_label" >/dev/null 2>&1 || break
    sleep 1
  done
  launchctl print "$launch_domain/$selected_label" >/dev/null 2>&1 &&
    fail "tunnel service did not stop within 10 seconds"
  launchctl bootstrap "$launch_domain" "$selected_agent"
  launchctl kickstart -k "$launch_domain/$selected_label"
}

install_service() {
  write_agent
  print -- "Nemlig tunnel installed and managed by launchd."
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
  install_service
}

restart() {
  check_key
  require_file "$agent_file"
  cd "$repo_root"
  pnpm --filter nemlig-assistant build
  write_agent

  local attempt
  for attempt in {1..45}; do
    if tunnel-client health --port 8080 --require-control-plane-poll >/dev/null 2>&1; then
      tunnel-client health --port 8080 --require-control-plane-poll
      return
    fi
    sleep 1
  done
  tunnel-client health --port 8080 --require-control-plane-poll ||
    fail "tunnel did not become ready within 45 seconds"
}

status() {
  launchctl print "$launch_domain/$service_label" >/dev/null ||
    fail "service is not installed; run: pnpm nemlig:tunnel:enroll"
  tunnel-client health --port 8080 --require-control-plane-poll
}

stop() {
  launchctl bootout "$launch_domain/$service_label"
}

auth0_install() {
  write_agent auth0
  print -- "Auth0-backed Nemlig tunnel installed and managed by launchd."
}

auth0_restart() {
  cd "$repo_root"
  pnpm --filter nemlig-assistant build
  write_agent auth0
  local attempt
  for attempt in {1..45}; do
    if curl -fsS http://127.0.0.1:3333/readyz >/dev/null 2>&1 &&
      tunnel-client health --port 8081 --require-control-plane-poll >/dev/null 2>&1; then
      tunnel-client health --port 8081 --require-control-plane-poll
      return
    fi
    sleep 1
  done
  fail "Auth0-backed tunnel did not become ready within 45 seconds"
}

auth0_status() {
  launchctl print "$launch_domain/$auth0_service_label" >/dev/null ||
    fail "service is not installed; run: pnpm nemlig:tunnel:auth0:install"
  curl -fsS http://127.0.0.1:3333/readyz
  print
  tunnel-client health --port 8081 --require-control-plane-poll
}

auth0_stop() {
  launchctl bootout "$launch_domain/$auth0_service_label"
}

case "${1:-}" in
  enroll) enroll ;;
  install) install_service ;;
  restart) restart ;;
  status) status ;;
  stop) stop ;;
  run) run_tunnel ;;
  auth0-install) auth0_install ;;
  auth0-restart) auth0_restart ;;
  auth0-status) auth0_status ;;
  auth0-stop) auth0_stop ;;
  run-auth0) run_auth0_tunnel ;;
  *) fail "usage: $0 {enroll|install|restart|status|stop|run|auth0-install|auth0-restart|auth0-status|auth0-stop|run-auth0}" ;;
esac
