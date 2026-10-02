export const deploymentFailureReasons: ReadonlySet<string> = new Set([
  "service_acceptance_not_ready", "service_token_unavailable", "edge_acceptance_failed", "service_fixture_acceptance_failed",
  "authenticated_read_only_acceptance_failed", "owner_access_token_required", "github_repository_invalid", "source_revision_mismatch",
  "candidate_does_not_supersede_runtime", "recovery_source_invalid", "github_ci_workflow_invalid", "github_ci_invalid",
  "exact_head_ci_not_green", "github_environment_not_ready", "local_deployment_lease_unavailable", "remote_deployment_lease_unavailable",
  "remote_journal_invalid", "remote_journal_append_failed", "remote_journal_parent_invalid", "remote_deployment_lease_changed",
  "deployment_journal_invalid", "deployment_journal_oversized", "deployment_journal_write_failed", "cloudflare_deployment_drift",
  "cloudflare_upload_version_missing", "cloudflare_registry_manifest_invalid", "cloudflare_config_invalid",
  "cloudflare_runtime_binding_unsupported", "cloudflare_runtime_safety_mismatch", "cloudflare_runtime_unexpected_binding",
  "cloudflare_instances_invalid", "disabled_route_unavailable", "disabled_route_mismatch", "container_inactive_timeout",
  "container_instance_timeout", "container_image_changed_during_enable", "recovery_finalize_denied", "command_failed",
  "command_cancelled", "unexpected_failure",
]);
