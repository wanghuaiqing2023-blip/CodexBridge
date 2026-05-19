# Foreground and Background Thread Implementation Plan

This document is the implementation plan for `foreground-background-thread-design.md`.

The purpose is to keep the code work aligned with the agreed design:

- keep `/threads` provider-global
- do not add `ScopeSessionMembership`
- use `BridgeSession` as the local Bridge record for provider threads
- keep `PlatformBinding` as the foreground binding
- let one Weixin scope have multiple running turns after handoff
- keep background progress silent
- do not support background turn recovery after process restart

## 1. Implementation Strategy

Implement in small steps. Each step should preserve existing command behavior unless the step explicitly introduces Phase 2 behavior.

Recommended order:

1. Add tests that lock the current Phase 1 behavior.
2. Refactor `ActiveTurnRegistry` to support `bridgeSessionId` keyed records while preserving scope-based compatibility methods.
3. Add foreground/background query helpers.
4. Extend `/status` to show background running targets.
5. Implement `/new` foreground handoff.
6. Implement `/threads open <target>` promotion/handoff.
7. Implement `/threads stop <target>`.
8. Implement `/threads allow <target>`.
9. Verify background delivery behavior.

Do not combine all steps in one patch unless the intermediate state cannot compile.

## 2. Non-Goals

Do not implement:

- `ScopeSessionMembership`
- scope-owned `/threads`
- provider-global `/threads` filtering
- new `/threads` foreground/background labels in Phase 2
- background progress streaming
- periodic background "still running" notifications
- background turn recovery after process restart
- Codex Rust source changes
- multiple real Weixin chat windows

## 3. State Model Changes

### 3.1 Current Problem

Current `ActiveTurnRegistry` is effectively keyed by scope:

```text
scopeKey -> ActiveTurnRecord
```

That prevents one Weixin scope from having more than one running turn.

### 3.2 Target Model

Phase 2 should key running turn state primarily by `bridgeSessionId`:

```text
bridgeSessionId -> ActiveTurnRecord
```

Each record still keeps `scopeRef`:

```ts
interface ActiveTurnRecord {
  scopeRef: PlatformScopeRef;
  bridgeSessionId: string;
  providerProfileId: string | null;
  threadId: string | null;
  turnId: string | null;
  visibility: 'foreground' | 'background';
  interruptRequested: boolean;
  interruptDispatched: boolean;
  pendingApprovals: ProviderApprovalRequest[];
  artifactDelivery: TurnArtifactDeliveryState | null;
  createdAt: number;
  updatedAt: number;
}
```

Interpretation:

```text
bridgeSessionId decides which thread is running.
scopeRef decides where notifications go and which scope controls the turn.
visibility decides whether progress is foreground-streamed or background-silent.
```

### 3.3 Compatibility Requirement

Keep existing scope-oriented methods as compatibility wrappers where possible:

```ts
resolveScopeTurn(scopeRef)
beginScopeTurn(scopeRef, initial)
updateScopeTurn(scopeRef, updates)
requestInterrupt(scopeRef)
endScopeTurn(scopeRef)
```

Their foreground semantics should remain:

```text
scope method = operate on the foreground running turn for that scope
```

Add explicit session-oriented methods:

```ts
resolveTurnByBridgeSessionId(bridgeSessionId)
beginSessionTurn(scopeRef, bridgeSessionId, initial)
updateSessionTurn(bridgeSessionId, updates)
endSessionTurn(bridgeSessionId)
listScopeTurns(scopeRef)
listBackgroundTurns(scopeRef, foregroundBridgeSessionId)
resolveForegroundTurn(scopeRef, foregroundBridgeSessionId)
```

Exact names may differ, but the API must make foreground versus background explicit.

## 4. Coordinator Behavior

### 4.1 Foreground Resolution

Foreground running turn is:

```text
PlatformBinding(scopeRef) -> BridgeSession
ActiveTurnRegistry[BridgeSession.id]
```

`/stop`, `/allow`, ordinary-message busy checks, and foreground delivery should use this foreground resolution.

### 4.2 Background Resolution

Background running turns for a scope are:

```text
ActiveTurnRecord.scopeRef == scopeRef
and ActiveTurnRecord.bridgeSessionId != current foreground BridgeSession.id
```

Do not derive background state from `/threads` output.

### 4.3 `/new`

If foreground is idle:

```text
existing behavior
create new provider thread
create BridgeSession
bind PlatformBinding to new session
```

If foreground is running:

```text
mark current foreground ActiveTurnRecord visibility = background
create new provider thread
create BridgeSession
bind PlatformBinding to new session
send visible handoff receipt
```

The old turn must keep running. Its ordinary progress must stop streaming to Weixin.

### 4.4 `/threads open <target>`

Keep provider-global target resolution.

If target has no local `BridgeSession`:

```text
read provider thread
create BridgeSession
```

If current foreground is running:

```text
mark current foreground turn background
```

If target is background running:

```text
mark target turn foreground
bind PlatformBinding to target BridgeSession
resume foreground delivery for later progress/final/approval
```

If target is idle:

```text
bind PlatformBinding to target BridgeSession
```

The switch must be atomic at the Coordinator level: no user-visible window with two foreground turns.

## 5. Commands

### 5.1 `/status`

Phase 2 must show background running targets.

Example:

```text
Foreground:
1. [running] <title or short id>
   thread: <short id>
   stop: /stop

Background:
1. [running] <title or short id>
   thread: <short id>
   stop: /threads stop <short id>
   open: /threads open <short id>

2. [waiting approval] <title or short id>
   thread: <short id>
   allow: /threads allow <short id>
   stop: /threads stop <short id>
   open: /threads open <short id>
```

Targets should prefer stable short thread ids. Do not rely on provider-global `/threads` list indices.

### 5.2 `/stop`

`/stop` stops only the foreground running turn.

It must not stop background turns.

### 5.3 `/threads stop <target>`

Stops a specific background running turn.

Rules:

- target must resolve to a running background turn
- if target is foreground, tell the user to use `/stop`
- if target is not running, return visible no-op
- if target cannot be resolved, return visible error

### 5.4 `/allow`

`/allow` approves only the foreground pending approval.

It must not approve background turns.

### 5.5 `/threads allow <target>`

Approves a specific background pending approval.

Rules:

- target must resolve to a running background turn
- target must have a pending approval
- if target is foreground, tell the user to use `/allow`
- if target has no pending approval, return visible no-op
- if target cannot be resolved, return visible error

### 5.6 `/threads`

Do not change `/threads` output as part of Phase 2.

It remains provider-global and should not become the background task panel.

## 6. Delivery Rules

Foreground turn:

- stream ordinary progress according to existing policy
- send approval prompts normally
- send final normally
- keep typing behavior according to existing policy

Background turn:

- do not stream ordinary progress
- do not send periodic "still running" summaries
- do not send typing keepalive
- send compact completion notification
- send compact failure notification
- send compact interruption notification
- send compact approval notification with `/threads allow <target>`

Terminal notification shape:

```text
Background task completed
thread: <Codex title, otherwise short id>
summary: <first 300-500 chars of final>
view: /threads open <stable thread id>
```

Failure/interruption must also include `view`.

## 7. Restart Behavior

Do not persist `ActiveTurnRegistry`.

Do not recover background running turns after process restart.

After restart:

```text
ActiveTurnRegistry is empty.
Foreground/background running state is lost.
Codex provider threads remain visible through provider-global /threads.
Users may reopen threads manually.
```

Do not reattach listeners, replay events, or backfill terminal notifications.

## 8. Files Likely To Change

Expected code files:

- `src/core/active_turn_registry.ts`
- `src/core/bridge_coordinator.ts`
- `src/core/bridge_session_service.ts` only if helper methods are needed
- `src/i18n/index.ts`
- runtime tests under `test/core/` and `test/runtime/`

Files that should not change for this work:

- `codex/`
- Codex Rust source
- provider-global `/threads` provider list behavior unless required for target resolution bug fixes

## 9. Test Plan

Add focused tests before broad tests.

### 9.1 ActiveTurnRegistry

Cover:

- multiple running turns for one scope
- foreground turn resolution by current `bridgeSessionId`
- background list resolution
- session-keyed update/end
- compatibility scope methods still operate on foreground

### 9.2 Coordinator

Cover:

- `/new` while foreground running hands old turn to background and creates new foreground
- `/threads open <background>` promotes background to foreground
- `/stop` affects only foreground
- `/threads stop <target>` affects only target background turn
- `/allow` affects only foreground approval
- `/threads allow <target>` affects only target background approval
- `/status` lists background targets with copyable commands
- `/threads` remains provider-global and does not become scope-owned

### 9.3 Runtime Delivery

Cover:

- background progress is not sent to Weixin
- background terminal notification is sent
- background approval notification is sent
- foreground promoted from background resumes foreground delivery

### 9.4 Regression Commands

Run targeted tests first:

```text
node ./scripts/test.mjs test/core/bridge_coordinator.test.ts test/runtime/weixin_bridge_runtime.test.ts
```

Then run the repo's normal test command:

```text
npm test
```

Do not run:

- `codex/` Rust tests
- `npm run codex-native-api:test`
- `npm run codex-gateway:test`
- `npm run mission-control:test`

unless the implementation unexpectedly touches those areas.

## 10. Implementation Guardrails

- Keep each patch small enough to review.
- Preserve existing public command behavior until the step intentionally changes it.
- Do not add `ScopeSessionMembership`.
- Do not change `/threads` provider-global semantics.
- Do not let background progress stream to Weixin.
- Do not make `/stop` global.
- Do not make `/allow` approve background implicitly.
- Do not persist runtime turn state.
- Prefer explicit helper methods over ad hoc registry scans in Coordinator logic.
