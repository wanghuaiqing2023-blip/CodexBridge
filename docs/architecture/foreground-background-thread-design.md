# Foreground and Background Thread Design

## 1. Purpose

CodexBridge's first production target is a single Weixin chat entry connected to Codex. In the current ClawBot/iLink setup, a user may only have one real Weixin private chat with the bot, and the bot may not be joinable into group chats. Therefore, CodexBridge cannot rely on multiple real Weixin conversations to expose multiple Codex work streams.

The agreed design is:

```text
One real Weixin scope
  -> one user-visible foreground thread
  -> zero or more background running threads
```

The user should be able to know which thread is currently foreground, but should not need a separate command family such as `/bg` or `/attach` to use the product. Existing commands should carry the model:

- `/status` shows the current foreground thread and background summary.
- `/threads` keeps the current provider-global thread directory behavior.
- `/new` creates a new foreground thread.
- `/threads open <target>` makes the target thread foreground, including background running threads.
- `/goal`, `/stop`, and `/allow` default to the foreground thread.

## 2. Definitions

### Weixin scope

A Weixin scope is the Bridge's normalized identifier for one Weixin-side conversation boundary:

```ts
{
  platform: 'weixin',
  externalScopeId: string
}
```

In the current ClawBot private-chat deployment, the user effectively has one practical Weixin scope.

### Bridge session

A `BridgeSession` is CodexBridge's local wrapper around a provider thread:

```text
BridgeSession
  -> providerProfileId
  -> codexThreadId
  -> cwd/title/settings
```

It is the local object Bridge commands should bind to, list, switch, and use for provider calls.

### Foreground thread

The foreground thread is the current default target for a Weixin scope.

Existing `PlatformBinding` should represent this:

```text
PlatformBinding(platform, externalScopeId) -> bridgeSessionId
```

This means `PlatformBinding` is not a generic ownership table. It is the current foreground binding.

### Provider-global thread directory

Codex app-server is the source of truth for real Codex threads. The `/threads` command must continue to show the current provider's global thread directory, including threads that were created in Codex app UI or other Codex entry points.

Provider-global visibility does not imply a separate Bridge ownership record.

### Bridge-recognized thread

A Bridge-recognized thread is a Codex provider thread that has a local `BridgeSession`.

`BridgeSession` is created or reused when CodexBridge creates a new provider thread, opens a provider-global thread, or otherwise needs to bind local Bridge state to a provider thread.

### Background running thread

A background running thread is derived state:

```text
has a running turn tracked by CodexBridge
and is associated with this scope's runtime delivery context
and is not this scope's PlatformBinding foreground session
```

The system should not persist `foreground` or `background` as competing permanent roles. Foreground is represented by `PlatformBinding`; background is computed from running turn state plus the current foreground binding.

## 3. User Model

The product should preserve this user mental model:

```text
I am always talking to the current foreground conversation.
If I open a new conversation while the old one is still running,
the old work continues in the background and will notify me when done.
```

The user may inspect foreground/background state through existing commands, but normal use does not require learning a new background-task command set.

## 4. Command Semantics

### Ordinary message

An ordinary message targets the current foreground thread.

If the foreground thread is already running, ordinary messages should not silently create a new thread. The safest behavior is to return a visible message explaining that the current foreground is busy and suggesting `/new`, `/stop`, or the relevant thread command.

### `/status`

`/status` should show:

- current foreground thread id/session id
- provider profile
- cwd/title when available
- foreground state: idle/running/waiting approval/interrupted
- number of background running threads
- compact background summary when useful

Example:

```text
Foreground:
- thread: abc
- status: running

Background:
- 2 running threads
```

### `/threads`

`/threads` must keep provider-global listing behavior.

The current `/threads` display should not be changed in Phase 2. It remains a provider-global thread directory, not a background task panel.

`/status` is the primary command for showing foreground/background running state. If a later phase adds labels to `/threads`, it should only label states CodexBridge can confirm and must not guess.

Possible future labels:

```text
1. [foreground] abc CodexBridge debugging
2. [background running] def repository test analysis
3. [idle] ghi design notes
```

The list source is the provider's global thread list. `BridgeSession`, `PlatformBinding`, `ActiveTurnRegistry`, and `ThreadMetadata` are used to resolve the current foreground and manage local Bridge state, but Phase 2 should not require `/threads` output changes.

### `/new`

`/new` creates a new foreground thread.

If the current foreground is idle:

```text
create new thread
bind it as foreground
```

If the current foreground is running:

```text
handoff current foreground running turn to background
create new thread
bind new thread as foreground
send visible confirmation
```

The old running thread must not be interrupted merely because `/new` was issued.

### `/threads open <target>`

`/threads open <target>` always means "make this thread the current foreground thread".

If the target thread is idle:

```text
bind target thread as foreground
```

If the target thread is background running:

```text
promote target thread to foreground
deliver its later progress/final/approval through foreground rules
```

If the previous foreground is running, it is handed off to background. If the previous foreground is idle, it simply stops being foreground.

The user should not need a separate mental model for "opening" idle threads versus running background threads. The command selects the current foreground thread; CodexBridge handles the internal state transition.

`/threads open <target>` may open any provider-global thread visible in the current provider profile. If no local `BridgeSession` exists for the target provider thread, CodexBridge creates one, then binds it as the foreground through `PlatformBinding`.

### `/goal`

`/goal` targets the foreground thread.

It should not implicitly operate on background threads. It also must not trigger foreground handoff.

This rule is intentional because `/goal` changes the long-running objective of the currently selected thread. If CodexBridge automatically handed off the old foreground and then applied `/goal` to a different thread, the user could reasonably believe the goal was set on the original conversation while the system actually modified another one.

If the foreground thread is busy, `/goal` should return a clear foreground-busy response. The user can then choose to wait, use `/stop`, or explicitly create/switch to another foreground thread before setting a goal.

### `/stop`

`/stop` targets the foreground running turn only.

It must not stop background running threads by accident. Future background control should be added under `/threads`, for example:

```text
/threads stop <target>
```

### `/allow`

`/allow` defaults to foreground approvals.

Background approvals should use explicit thread-scoped control:

```text
/threads allow <target>
```

`/allow` must not approve a background turn implicitly.

## 5. Internal State Model

### Foreground binding

Use existing `PlatformBinding`:

```ts
interface PlatformBinding {
  platform: string;
  externalScopeId: string;
  bridgeSessionId: string;
  updatedAt: number;
}
```

Interpretation:

```text
This scope's foreground BridgeSession is bridgeSessionId.
```

### Bridge-recognized provider thread

Do not add `ScopeSessionMembership` in the current design.

Use existing `BridgeSession` as the local record that a provider thread has been opened, created, or recognized by CodexBridge:

```ts
interface BridgeSession {
  id: string;
  providerProfileId: string;
  codexThreadId: string;
  cwd: string | null;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}
```

Interpretation:

```text
BridgeSession means Bridge has local state for this provider thread.
It does not mean the thread is exclusively owned by a Weixin scope.
```

### Running turn state

Current `ActiveTurnRegistry` is scope-oriented. Foreground handoff requires running turn identity to survive after `PlatformBinding` moves to a new foreground session.

The running state must be able to answer:

```text
Which session/thread/turn is running?
Which scope is currently responsible for delivery and control?
Is it currently foreground or background for that scope?
Where should completion notification be sent?
```

The minimum record shape should include:

```ts
{
  scopeRef: PlatformScopeRef;
  bridgeSessionId: string;
  providerProfileId: string;
  threadId: string;
  turnId: string | null;
  visibility: 'foreground' | 'background';
  pendingApprovals: ProviderApprovalRequest[];
  interruptRequested: boolean;
  createdAt: number;
  updatedAt: number;
}
```

The exact implementation may evolve from `ActiveTurnRegistry`, but the important change is that running state cannot be keyed only by scope once one scope can have multiple running threads.

Phase 2 should key running turn state primarily by `bridgeSessionId`. Each turn record must still keep `scopeRef` as the delivery/control owner.

```text
bridgeSessionId decides which thread is running.
scopeRef decides where notifications are delivered and which scope can control the turn.
```

## 6. Foreground Handoff

Foreground handoff is the central operation.

Input:

```text
scopeRef
current foreground active turn
next foreground session
```

Operation:

```text
1. Confirm current foreground has a running turn.
2. Mark that running turn as background.
3. Keep its delivery/control scopeRef.
4. Bind the next session as PlatformBinding foreground.
5. Ensure progress from the old turn no longer streams as foreground output.
6. On old turn completion, failure, or interruption, send one compact notification.
```

Handoff must not:

- interrupt the old turn
- lose the old turn's pending cleanup
- let old progress pollute the new foreground conversation
- make `/stop` target the old background turn

## 7. Delivery Rules

Foreground running turn:

- progress may stream to Weixin according to existing delivery policy
- final answer is delivered normally
- approvals are surfaced normally

Background running turn:

- ordinary progress should not stream
- periodic "still running" summaries should not be sent
- typing keepalive should not run for it
- completion sends a compact notification
- failure sends a compact notification
- interruption sends a compact notification
- approval sends a compact notification and can be handled through `/threads allow <target>`

Background terminal notifications should include enough identity for the user to connect the event to `/threads` and reopen the thread.

The `thread:` display value should prefer the Codex title. If no title is available, use a short stable thread id. A future user-defined alias may be supported, but it is not required for the initial design.

Completion:

```text
Background task completed
thread: <Codex title, otherwise short id>
summary: <300-500 char final preview>
view: /threads open <index or stable thread id>
```

Failure:

```text
Background task failed
thread: <Codex title, otherwise short id>
reason: <error preview>
view: /threads open <index or stable thread id>
```

Interruption:

```text
Background task interrupted
thread: <Codex title, otherwise short id>
reason: <interrupt reason, if available>
view: /threads open <index or stable thread id>
```

The `view` line should prefer a stable thread selector when available. If a temporary list index is used, the notification should also include a short thread id so the user has a stable fallback.

## 8. Pre-Implementation Decisions

These decisions are fixed before implementation starts. They are intended to keep the staged changes small and prevent later semantic churn.

### 8.1 Background completion notification boundary

When a background thread completes, Weixin should receive a compact terminal notification, not the full final answer.

Recommended shape:

```text
Background task completed
thread: <Codex title, otherwise short id>
summary: <first 300-500 chars of final>
view: /threads open <stable thread id or list index>
```

The full final remains attached to the thread. The foreground conversation should not be polluted by a long background result.

### 8.2 Background failure and interruption notifications

Failure and interruption use the same compact-notification rule and must include a way to reopen the thread.

Failure:

```text
Background task failed
thread: <Codex title, otherwise short id>
reason: <error preview>
view: /threads open <stable thread id or list index>
```

Interruption:

```text
Background task interrupted
thread: <Codex title, otherwise short id>
reason: <interrupt reason, if available>
view: /threads open <stable thread id or list index>
```

The `view` line is required for all background terminal states: completed, failed, and interrupted.

### 8.3 Approval phase boundary

Phase 2 should not make `/allow` approve background threads implicitly.

`/allow` remains foreground-only. Phase 2 should support explicit background approval with:

```text
/threads allow <target>
```

The target should be a stable short thread id or another explicit target shown by `/status`. If the target has no pending approval, CodexBridge must return a visible no-op response.

`/status` should show waiting background approvals with copyable commands:

```text
Background:
1. [waiting approval] <title or short id>
   thread: <short id>
/threads allow <target>
```

### 8.4 `/goal` background behavior

`/goal` always targets the current foreground thread.

If the foreground thread is running, `/goal` should return a foreground-busy response. CodexBridge must not automatically hand off the old foreground and then set the goal on another thread, because `/goal` changes the long-running state of the currently selected conversation.

### 8.5 Ordinary message while foreground is running

An ordinary message must not silently create a new thread when the foreground is running.

The visible response should explain that the current foreground is still running and suggest explicit choices:

```text
The current foreground thread is still running. Wait for it to finish, use /stop, or use /new to start a new foreground thread.
```

### 8.6 `/new` handoff receipt

`/new` may hand off a running foreground thread to background and create a new foreground thread.

When that happens, Weixin must receive an explicit receipt:

```text
Started a new foreground thread. The previous task is still running in the background and will notify you when it finishes.
```

This receipt is part of the command contract, not debug output.

### 8.7 Thread list ordering and selectors

`/threads` should keep the current provider-global display behavior in Phase 2.

Phase 2 should not add required foreground/background labels to `/threads`, and it should not turn `/threads` into a background task panel. Background running targets should be discoverable through `/status`.

Selectors for background control should not rely on volatile provider-global list indices. `/status` should show short stable thread ids and copyable commands for background turns.

For display labels, prefer the Codex title. If no title is available, fall back to the short stable thread id.

### 8.8 Documentation before code

The design document should be committed before implementation begins. This gives Phase 1, Phase 2, and Phase 3 a stable review baseline and keeps code review focused on whether the implementation matches the agreed model.

### 8.9 Opening a running background thread

`/threads open <target>` may target a background running thread. In that case the target becomes foreground and its subsequent progress, final answer, and approval prompts use foreground delivery rules.

The foreground switch must be atomic per scope:

- there must never be two foreground threads for the same scope
- the previous foreground must not lose running-turn tracking during handoff
- the promoted background turn must be registered as the foreground active turn before user-visible streaming resumes

### 8.10 No membership table unless multiple scopes become real

Do not add `ScopeSessionMembership` in the current design.

The current product has one practical Weixin scope and `/threads` must remain provider-global. Under these constraints, a membership table adds repository, migration, join, and leave complexity without solving a current product problem.

If multiple real scopes become a product requirement later, scope membership can be reconsidered as a separate design. Until then:

- provider-global visibility never creates a membership row
- `/threads open <target>` creates or reuses `BridgeSession` and updates `PlatformBinding`
- foreground/background state is derived from `PlatformBinding` plus running turn state

### 8.11 No artificial background concurrency cap

CodexBridge should not add an artificial per-scope limit on background running threads in the initial foreground/background design.

Concurrency should be constrained only by real system limits: provider behavior, Codex app-server behavior, process resources, approval safety, and platform delivery reliability. If production evidence shows that an explicit cap is necessary, it should be introduced later as a documented operational policy with clear user-facing messages.

### 8.12 Phase 1 behavior boundary

Phase 1 should not add a new ownership or membership data model. It may expose minimal debug or `/status` visibility needed to inspect existing state, but it must not change normal command behavior.

In particular, Phase 1 must not introduce foreground handoff. `/new` and `/threads open <target>` should keep their existing runtime semantics until Phase 2 implements handoff deliberately.

### 8.13 Background control commands in Phase 2

Phase 2 must provide an explicit way to control background turns:

```text
/stop
  stop the current foreground running turn only

/threads stop <target>
  stop a specific background running turn

/threads allow <target>
  approve a specific background running turn's pending approval
```

`/status` must list background running targets with copyable control commands:

```text
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

Targets should prefer stable short thread ids rather than provider-global `/threads` list indices.

### 8.14 Background progress silence

Background progress should be silent in Phase 2:

- do not stream ordinary progress
- do not send periodic "still running" summaries
- do not send typing keepalive
- do send terminal notifications
- do send approval notifications

Users inspect active background state with `/status`, or switch a background thread to foreground with `/threads open <target>`.

### 8.15 No restart recovery for background turns

CodexBridge should not support background turn recovery after process restart.

Foreground/background handoff is runtime control state. It is valid only while the CodexBridge process remains alive. If the process restarts, `ActiveTurnRegistry` is empty; CodexBridge should not try to recover background running state, reattach listeners, replay events, or backfill terminal notifications.

The underlying Codex thread remains visible through provider-global `/threads`, and the user may reopen it manually.

## 9. Phased Implementation

### Phase 1: Existing state model alignment

Goal:

```text
Clarify and test the existing state model without changing user-visible command behavior.
```

Changes:

- Keep `PlatformBinding` as foreground binding.
- Keep `/threads` provider-global.
- Do not add `ScopeSessionMembership` or a membership repository.
- Keep `BridgeSession` as the local record for provider threads Bridge has opened, created, or recognized.
- Extend `/status` or internal service methods only enough to inspect existing foreground/running state when needed.
- Do not change turn execution semantics.
- Do not introduce foreground handoff.

Success criteria:

- The current foreground session is still resolved through `PlatformBinding`.
- `/threads` continues to show provider-global Codex app-server threads.
- No existing command behavior changes.
- `/new` and `/threads open <target>` keep their existing behavior until Phase 2.

### Phase 2: Foreground handoff

Goal:

```text
Allow /new and /threads open to switch foreground while the old foreground keeps running in background.
```

Changes:

- Extend running turn tracking beyond one active turn per scope, keyed primarily by `bridgeSessionId`.
- Add a handoff operation for current foreground turns.
- Let `/new` use handoff instead of rejecting when foreground is running.
- Let `/threads open <target>` use handoff when needed.
- Suppress background progress streaming.
- Do not send periodic background progress summaries.
- Deliver compact completion/failure/interruption notification with a view hint.
- Support `/threads stop <target>` for background running turns.
- Support `/threads allow <target>` for background pending approvals.
- Show background running targets and copyable control commands in `/status`.
- Keep `/threads` provider-global and do not require new foreground/background labels there.

Success criteria:

- `/new` works while the old foreground is running.
- Old turn continues and completes.
- New foreground accepts commands/messages.
- `/stop` affects only the new/current foreground.
- `/threads stop <target>` can stop a background running turn.
- `/threads allow <target>` can approve a background pending approval.
- `/status` shows background running targets with stop/open/allow commands when applicable.
- Background completion is visible but not noisy.
- Background progress remains silent until terminal or approval notification.
- Background handoff is supported only while the CodexBridge process remains alive.

### Phase 3: Background management

Goal:

```text
Expose explicit control for background work only where necessary.
```

Possible command extensions:

```text
/threads running
/threads open <target>
```

Do not add a separate `/bg` command family unless a concrete user workflow cannot be expressed through `/threads`.

## 10. Non-Goals

This design does not attempt to:

- create multiple real Weixin chat windows
- require group chat support
- add `ScopeSessionMembership` while there is only one practical Weixin scope
- introduce `/bg` as a primary user command
- make all background progress visible
- send periodic "still running" notifications for background turns
- make `/stop` globally stop every running thread
- make `/goal` implicitly target background threads
- recover background running turn state after CodexBridge process restart

## 11. Design Invariants

- One Weixin scope has exactly one foreground binding at a time.
- One Codex thread has at most one active turn at a time.
- `/threads` remains provider-global.
- Phase 2 does not require new `/threads` foreground/background labels.
- `BridgeSession` means Bridge has local state for a provider thread; it is not a scope ownership row.
- One Weixin scope may have multiple background running threads after handoff.
- Running turn state is keyed primarily by `bridgeSessionId`; each record keeps `scopeRef` as delivery/control owner.
- Existing commands remain the primary interface.
- Background state is derived from running state plus `PlatformBinding`, not a separate permanent role on the session.
- User-visible output must identify the foreground thread clearly enough through `/status` and `/threads`.
