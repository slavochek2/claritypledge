# Evals for the pipeline gates (P1246)

`claude plugin eval` runs these against the repo's skills, with a no-plugin
baseline arm (`--ablation with-without`), to answer one question the gates
themselves cannot: **do the skill files actually change agent behaviour?**

The gates in `scripts/` are deterministic and bind regardless. These cases cover
the layer above them — whether an agent reading `ship.md` / `create-spec.md`
does the right thing *before* a gate has to refuse it. A skill that scores the
same with and without the plugin is not earning its place, which is the
measurement P1246's Risks table defers to evals rather than to opinion.

## Status: authored, NOT yet enforcing

`claude plugin eval` is gated behind **early access** and is not enabled on this
account. Verified 2026-09-08 on CLI 2.1.263, with the exit code read directly
rather than through a pipe:

    $ claude plugin eval . ; echo $?
    `plugin eval` is currently in early access
    1

It fails closed, which is the right direction — but it means a naive merge check
would be RED on every skill change for a reason unrelated to the change, and a
check that always fails is a check people learn to route around.

So `.github/workflows/plugin-eval.yml` distinguishes the two failures it can see:

* output matches the early-access refusal -> `::warning::` "not enforced", job
  passes. The capability is missing; the change is not at fault.
* anything else -> the eval genuinely ran and scored below threshold -> job fails.

It also asserts that results were actually written when the eval did run, so a
future silent no-op cannot masquerade as a pass.

To enable: turn on early access for the account, then add the Anthropic API key
as a repository secret (the workflow's `env:` block names it). The workflow flips
from warning to enforcing at threshold 1.0 with no further edits.
