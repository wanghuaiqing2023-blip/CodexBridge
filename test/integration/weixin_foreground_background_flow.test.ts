import assert from 'node:assert/strict';
import test from 'node:test';
import { createCodexBridgeRuntime } from '../../src/runtime/bootstrap.js';
import { WeixinBridgeRuntime } from '../../src/runtime/weixin_bridge_runtime.js';

function deferred<T = void>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function waitForCondition(predicate: () => boolean, { timeoutMs = 1000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  assert.equal(predicate(), true);
}

function makeProviderProfile(id = 'fake-default') {
  const now = Date.now();
  return {
    id,
    providerKind: 'fake-codex',
    displayName: 'Fake Codex',
    config: {},
    createdAt: now,
    updatedAt: now,
  };
}

class ControllableFakeProvider {
  kind = 'fake-codex';
  displayName = 'Fake Codex';
  threadCounter = 0;
  baseTime = Date.now();
  clock = 0;
  threads = new Map<string, any>();
  longTurns = new Map<string, any>();
  approvalTurns = new Map<string, any>();
  startTurnCalls: any[] = [];
  interruptTurnCalls: any[] = [];
  respondToApprovalCalls: any[] = [];

  nextUpdatedAt() {
    this.clock += 1;
    return this.baseTime + this.clock;
  }

  defineLongTurn(inputText: string, outputText: string) {
    const release = deferred<void>();
    const started = deferred<void>();
    const control = {
      inputText,
      outputText,
      release,
      started,
      turnId: null as string | null,
      threadId: null as string | null,
    };
    this.longTurns.set(inputText, control);
    return control;
  }

  defineApprovalTurn(inputText: string) {
    const started = deferred<void>();
    const approved = deferred<void>();
    const control = {
      inputText,
      started,
      approved,
      requestId: `${inputText}-approval`,
      turnId: null as string | null,
      threadId: null as string | null,
    };
    this.approvalTurns.set(inputText, control);
    return control;
  }

  async startThread({ providerProfile, cwd, title }: any) {
    this.threadCounter += 1;
    const thread = {
      threadId: `${providerProfile.id}-thread-${this.threadCounter}`,
      cwd: cwd ?? 'C:\\work',
      title: title ?? `Fake thread ${this.threadCounter}`,
      updatedAt: this.nextUpdatedAt(),
      preview: '',
      turns: [],
    };
    this.threads.set(thread.threadId, thread);
    return thread;
  }

  async resumeThread({ threadId }: any) {
    return this.threads.get(threadId) ?? null;
  }

  async readThread({ threadId, includeTurns = false }: any) {
    const thread = this.threads.get(threadId) ?? null;
    if (!thread) {
      return null;
    }
    return {
      ...thread,
      turns: includeTurns ? thread.turns : [],
    };
  }

  async listThreads() {
    return {
      items: [...this.threads.values()].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)),
      nextCursor: null,
    };
  }

  async startTurn({ providerProfile, bridgeSession, inputText, onTurnStarted, onProgress, onApprovalRequest }: any) {
    this.startTurnCalls.push({ providerProfile, bridgeSession, inputText });
    const thread = this.threads.get(bridgeSession.codexThreadId);
    if (!thread) {
      throw new Error(`thread not found: ${bridgeSession.codexThreadId}`);
    }
    const turnId = `${bridgeSession.codexThreadId}-turn-${thread.turns.length + 1}`;
    const turn = {
      id: turnId,
      status: 'running',
      error: null,
      items: [
        { role: 'user', text: inputText, type: 'message', phase: 'final' },
      ],
    };
    thread.turns = [...thread.turns, turn];
    thread.preview = inputText;
    thread.updatedAt = this.nextUpdatedAt();
    await onTurnStarted?.({ threadId: bridgeSession.codexThreadId, turnId });

    const longControl = this.longTurns.get(inputText);
    if (longControl) {
      longControl.threadId = bridgeSession.codexThreadId;
      longControl.turnId = turnId;
      longControl.started.resolve();
      await longControl.release.promise;
      await onProgress?.({
        text: `background progress: ${longControl.outputText}`,
        delta: `background progress: ${longControl.outputText}`,
        outputKind: 'commentary',
      });
      this.completeTurn(bridgeSession.codexThreadId, turnId, longControl.outputText);
      return {
        outputText: longControl.outputText,
        outputState: 'complete',
        finalSource: 'thread_items',
        turnId,
        threadId: bridgeSession.codexThreadId,
        title: bridgeSession.title,
      };
    }

    const approvalControl = this.approvalTurns.get(inputText);
    if (approvalControl) {
      approvalControl.threadId = bridgeSession.codexThreadId;
      approvalControl.turnId = turnId;
      approvalControl.started.resolve();
      await onApprovalRequest?.({
        requestId: approvalControl.requestId,
        kind: 'command',
        threadId: bridgeSession.codexThreadId,
        turnId,
        itemId: `${turnId}-approval-item`,
        reason: 'Need approval',
        command: 'npm test',
        cwd: bridgeSession.cwd,
        availableDecisionKeys: ['accept', 'decline'],
      });
      await approvalControl.approved.promise;
      const outputText = `approved background result: ${inputText}`;
      this.completeTurn(bridgeSession.codexThreadId, turnId, outputText);
      return {
        outputText,
        outputState: 'complete',
        finalSource: 'thread_items',
        turnId,
        threadId: bridgeSession.codexThreadId,
        title: bridgeSession.title,
      };
    }

    const outputText = `foreground result: ${inputText}`;
    this.completeTurn(bridgeSession.codexThreadId, turnId, outputText);
    return {
      outputText,
      outputState: 'complete',
      finalSource: 'thread_items',
      turnId,
      threadId: bridgeSession.codexThreadId,
      title: bridgeSession.title,
    };
  }

  completeTurn(threadId: string, turnId: string, outputText: string) {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }
    thread.turns = thread.turns.map((turn: any) => turn.id === turnId
      ? {
        ...turn,
        status: 'complete',
        items: [
          ...turn.items,
          { role: 'assistant', text: outputText, type: 'message', phase: 'final' },
        ],
      }
      : turn);
    thread.updatedAt = this.nextUpdatedAt();
  }

  async interruptTurn({ threadId, turnId }: any) {
    this.interruptTurnCalls.push({ threadId, turnId });
    const thread = this.threads.get(threadId);
    if (!thread) {
      return;
    }
    thread.turns = thread.turns.map((turn: any) => turn.id === turnId
      ? { ...turn, status: 'interrupted', error: null }
      : turn);
  }

  async respondToApproval({ request, option }: any) {
    this.respondToApprovalCalls.push({ request, option });
    for (const control of this.approvalTurns.values()) {
      if (control.requestId === request.requestId) {
        control.approved.resolve();
      }
    }
  }
}

function makeHarness() {
  const provider = new ControllableFakeProvider();
  const profile = makeProviderProfile();
  const app = createCodexBridgeRuntime({
    providerPlugins: [provider],
    providerProfiles: [profile],
    defaultProviderProfileId: profile.id,
    defaultCwd: 'C:\\work',
  });
  const sent: Array<{ scope: string; content: string }> = [];
  const runtime = new WeixinBridgeRuntime({
    platformPlugin: {
      async start() {},
      async stop() {},
      async pollOnce() {
        return { syncCursor: null, events: [] };
      },
      async sendText({ externalScopeId, content }: any) {
        sent.push({ scope: externalScopeId, content });
        return {
          success: true,
          deliveredCount: 1,
          deliveredText: content,
          failedIndex: null,
          failedText: '',
          error: '',
        };
      },
      async sendTyping() {},
      async sendMedia() {
        throw new Error('sendMedia is not expected in foreground/background integration tests');
      },
    },
    bridgeCoordinator: app.services.bridgeCoordinator,
    automationJobs: app.services.automationJobs,
    agentJobs: app.services.agentJobs,
    previewSoftTargetBytes: 1,
    previewIntervalMs: 0,
    typingKeepaliveMs: 60_000,
    inboundAttachmentMergeWindowMs: 0,
    automationPollMs: 60_000,
    internalThreadCleanupMs: 0,
  });
  return { app, provider, runtime, sent };
}

function wx(text: string, scope = 'wxid_integration') {
  return {
    platform: 'weixin',
    externalScopeId: scope,
    text,
  };
}

test('weixin foreground/background integration: /new handoff lets foreground continue while background completes quietly', async () => {
  const { provider, runtime, sent } = makeHarness();
  const background = provider.defineLongTurn('long background task', 'background final answer');

  const first = await runtime.dispatchInboundEvent(wx('long background task'));
  assert.equal(first.type, 'scheduled');
  await background.started.promise;

  await runtime.dispatchInboundEvent(wx('/new'));
  await runtime.dispatchInboundEvent(wx('foreground quick task'));

  await waitForCondition(() => sent.some((entry) => entry.content.includes('foreground result: foreground quick task')));
  assert.equal(sent.some((entry) => entry.content.includes('background progress:')), false);

  background.release.resolve();
  await runtime.waitForIdle();

  const allText = sent.map((entry) => entry.content).join('\n---\n');
  assert.match(allText, /已将之前的进行中回复转入后台/);
  assert.match(allText, /foreground result: foreground quick task/);
  assert.match(allText, /后台任务已完成/);
  assert.match(allText, /摘要：background final answer/);
  assert.doesNotMatch(allText, /background progress:/);
});

test('weixin foreground/background integration: /threads open promotes a running background turn back to foreground delivery', async () => {
  const { app, provider, runtime, sent } = makeHarness();
  const background = provider.defineLongTurn('promotable long task', 'promoted final answer');

  await runtime.dispatchInboundEvent(wx('promotable long task'));
  await background.started.promise;
  await runtime.dispatchInboundEvent(wx('/new'));

  const scopeRef = { platform: 'weixin', externalScopeId: 'wxid_integration' };
  const backgroundTurn = app.services.activeTurns.listScopeTurns(scopeRef)
    .find((turn: any) => turn.visibility === 'background');
  assert.ok(backgroundTurn?.threadId);

  await runtime.dispatchInboundEvent(wx('/status'));
  assert.ok(sent.some((entry) => entry.content.includes('/threads open B1')));
  await runtime.dispatchInboundEvent(wx('/threads open B1'));
  background.release.resolve();
  await runtime.waitForIdle();

  const allText = sent.map((entry) => entry.content).join('\n---\n');
  assert.match(allText, /已打开 Codex 线程/);
  assert.match(allText, /promoted final answer/);
  assert.doesNotMatch(allText, /后台任务已完成[\s\S]*promoted final answer/);
});

test('weixin foreground/background integration: background approval and stop require explicit /threads targets', async () => {
  const { app, provider, runtime, sent } = makeHarness();
  const approval = provider.defineApprovalTurn('needs background approval');

  await runtime.dispatchInboundEvent(wx('needs background approval'));
  await approval.started.promise;
  await runtime.dispatchInboundEvent(wx('/new'));

  const scopeRef = { platform: 'weixin', externalScopeId: 'wxid_integration' };
  const backgroundTurn = app.services.activeTurns.listScopeTurns(scopeRef)
    .find((turn: any) => turn.visibility === 'background');
  assert.ok(backgroundTurn?.threadId);
  await runtime.dispatchInboundEvent(wx('/status'));
  assert.ok(sent.some((entry) => entry.content.includes('/threads allow B1')));

  await runtime.dispatchInboundEvent(wx('/allow 1'));
  assert.equal(provider.respondToApprovalCalls.length, 0);

  await runtime.dispatchInboundEvent(wx('/threads allow B1 1'));
  await runtime.waitForIdle();
  assert.equal(provider.respondToApprovalCalls.length, 1);

  const stopControl = provider.defineLongTurn('stoppable background task', 'should not be delivered');
  await runtime.dispatchInboundEvent(wx('stoppable background task'));
  await stopControl.started.promise;
  await runtime.dispatchInboundEvent(wx('/new'));
  const stoppableTurn = app.services.activeTurns.listScopeTurns(scopeRef)
    .find((turn: any) => turn.visibility === 'background' && turn.threadId === stopControl.threadId);
  assert.ok(stoppableTurn?.threadId);

  await runtime.dispatchInboundEvent(wx('/status'));
  assert.ok(sent.some((entry) => entry.content.includes('/threads stop B1')));
  await runtime.dispatchInboundEvent(wx('/threads stop B1'));
  assert.equal(provider.interruptTurnCalls.at(-1)?.turnId, stopControl.turnId);

  stopControl.release.resolve();
  await runtime.waitForIdle();

  const allText = sent.map((entry) => entry.content).join('\n---\n');
  assert.match(allText, /已请求中断当前回复/);
  assert.match(allText, /后台任务已中断/);
  assert.doesNotMatch(allText, /should not be delivered/);
  assert.doesNotMatch(allText, /background progress: should not be delivered/);
});
