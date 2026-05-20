import { formatPlatformScopeKey } from './contracts.js';
import { createI18n, type Translator } from '../i18n/index.js';
import type { PlatformScopeRef, TurnArtifactDeliveryState } from '../types/core.js';
import type { ProviderApprovalRequest } from '../types/provider.js';

export type ActiveTurnVisibility = 'foreground' | 'background';

export interface ActiveTurnRecord {
  scopeRef: PlatformScopeRef;
  bridgeSessionId: string | null;
  providerProfileId: string | null;
  threadId: string | null;
  turnId: string | null;
  visibility: ActiveTurnVisibility;
  interruptRequested: boolean;
  interruptDispatched: boolean;
  pendingApprovals: ProviderApprovalRequest[];
  artifactDelivery: TurnArtifactDeliveryState | null;
  createdAt: number;
  updatedAt: number;
}

interface BeginScopeTurnOptions {
  bridgeSessionId?: string | null;
  providerProfileId?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  visibility?: ActiveTurnVisibility | null;
}

interface ActiveTurnRegistryOptions {
  now?: () => number;
  locale?: string | null;
}

export class ActiveTurnRegistry {
  private readonly now: () => number;

  private readonly turnsByKey: Map<string, ActiveTurnRecord>;

  private readonly i18n: Translator;

  constructor({ now = () => Date.now(), locale = null }: ActiveTurnRegistryOptions = {}) {
    this.now = now;
    this.turnsByKey = new Map();
    this.i18n = createI18n(locale);
  }

  resolveScopeTurn(scopeRef: PlatformScopeRef): ActiveTurnRecord | null {
    const scopeKey = buildScopeKey(scopeRef);
    return [...this.turnsByKey.values()]
      .find((record) => (
        buildScopeKey(record.scopeRef) === scopeKey
        && record.visibility === 'foreground'
      )) ?? null;
  }

  resolveTurnByBridgeSessionId(bridgeSessionId: string | null | undefined): ActiveTurnRecord | null {
    const normalized = normalizeId(bridgeSessionId);
    if (!normalized) {
      return null;
    }
    return this.turnsByKey.get(buildSessionKey(normalized)) ?? null;
  }

  listScopeTurns(scopeRef: PlatformScopeRef): ActiveTurnRecord[] {
    const scopeKey = buildScopeKey(scopeRef);
    return [...this.turnsByKey.values()]
      .filter((record) => buildScopeKey(record.scopeRef) === scopeKey)
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  listBackgroundTurns(scopeRef: PlatformScopeRef, foregroundBridgeSessionId: string | null | undefined = null): ActiveTurnRecord[] {
    const foregroundId = normalizeId(foregroundBridgeSessionId);
    return this.listScopeTurns(scopeRef)
      .filter((record) => (
        record.visibility === 'background'
        || (foregroundId && record.bridgeSessionId !== foregroundId)
      ));
  }

  listActiveTurns(): ActiveTurnRecord[] {
    return [...this.turnsByKey.values()];
  }

  hasAnyActiveTurn(): boolean {
    return this.turnsByKey.size > 0;
  }

  beginScopeTurn(scopeRef: PlatformScopeRef, initial: BeginScopeTurnOptions = {}): ActiveTurnRecord {
    const key = buildRecordKey(scopeRef, initial.bridgeSessionId);
    if (this.turnsByKey.has(key)) {
      throw new Error(this.i18n.t('service.activeTurn.alreadyExists', { scope: buildScopeKey(scopeRef) }));
    }
    const now = this.now();
    const record: ActiveTurnRecord = {
      scopeRef: {
        platform: scopeRef.platform,
        externalScopeId: scopeRef.externalScopeId,
      },
      bridgeSessionId: initial.bridgeSessionId ?? null,
      providerProfileId: initial.providerProfileId ?? null,
      threadId: initial.threadId ?? null,
      turnId: initial.turnId ?? null,
      visibility: initial.visibility ?? 'foreground',
      interruptRequested: false,
      interruptDispatched: false,
      pendingApprovals: [],
      artifactDelivery: null,
      createdAt: now,
      updatedAt: now,
    };
    this.turnsByKey.set(key, record);
    return record;
  }

  beginSessionTurn(scopeRef: PlatformScopeRef, bridgeSessionId: string, initial: BeginScopeTurnOptions = {}): ActiveTurnRecord {
    return this.beginScopeTurn(scopeRef, {
      ...initial,
      bridgeSessionId,
    });
  }

  updateScopeTurn(
    scopeRef: PlatformScopeRef,
    updates: Partial<ActiveTurnRecord> = {},
  ): ActiveTurnRecord | null {
    const record = this.resolveScopeTurn(scopeRef);
    if (!record) {
      return null;
    }
    const previousKey = findRecordKey(this.turnsByKey, record);
    Object.assign(record, updates, {
      updatedAt: this.now(),
    });
    const nextKey = buildRecordKey(record.scopeRef, record.bridgeSessionId);
    if (previousKey && previousKey !== nextKey) {
      this.turnsByKey.delete(previousKey);
      this.turnsByKey.set(nextKey, record);
    }
    return record;
  }

  updateSessionTurn(
    bridgeSessionId: string | null | undefined,
    updates: Partial<ActiveTurnRecord> = {},
  ): ActiveTurnRecord | null {
    const record = this.resolveTurnByBridgeSessionId(bridgeSessionId);
    if (!record) {
      return null;
    }
    const previousKey = findRecordKey(this.turnsByKey, record);
    Object.assign(record, updates, {
      updatedAt: this.now(),
    });
    const nextKey = buildRecordKey(record.scopeRef, record.bridgeSessionId);
    if (previousKey && previousKey !== nextKey) {
      this.turnsByKey.delete(previousKey);
      this.turnsByKey.set(nextKey, record);
    }
    return record;
  }

  requestInterrupt(scopeRef: PlatformScopeRef): ActiveTurnRecord | null {
    return this.updateScopeTurn(scopeRef, {
      interruptRequested: true,
    });
  }

  requestInterruptByBridgeSessionId(bridgeSessionId: string): ActiveTurnRecord | null {
    return this.updateSessionTurn(bridgeSessionId, {
      interruptRequested: true,
    });
  }

  noteInterruptDispatched(scopeRef: PlatformScopeRef, value = true): ActiveTurnRecord | null {
    return this.updateScopeTurn(scopeRef, {
      interruptDispatched: value,
    });
  }

  noteInterruptDispatchedByBridgeSessionId(bridgeSessionId: string, value = true): ActiveTurnRecord | null {
    return this.updateSessionTurn(bridgeSessionId, {
      interruptDispatched: value,
    });
  }

  addPendingApproval(scopeRef: PlatformScopeRef, request: ProviderApprovalRequest): ActiveTurnRecord | null {
    const record = this.resolveScopeTurn(scopeRef);
    if (!record) {
      return null;
    }
    const next = record.pendingApprovals.filter((entry) => entry.requestId !== request.requestId);
    next.push(request);
    return this.updateScopeTurn(scopeRef, {
      pendingApprovals: next,
    });
  }

  addPendingApprovalByBridgeSessionId(bridgeSessionId: string, request: ProviderApprovalRequest): ActiveTurnRecord | null {
    const record = this.resolveTurnByBridgeSessionId(bridgeSessionId);
    if (!record) {
      return null;
    }
    const next = record.pendingApprovals.filter((entry) => entry.requestId !== request.requestId);
    next.push(request);
    return this.updateSessionTurn(bridgeSessionId, {
      pendingApprovals: next,
    });
  }

  clearPendingApproval(scopeRef: PlatformScopeRef, requestId: string): ActiveTurnRecord | null {
    const record = this.resolveScopeTurn(scopeRef);
    if (!record) {
      return null;
    }
    return this.updateScopeTurn(scopeRef, {
      pendingApprovals: record.pendingApprovals.filter((entry) => entry.requestId !== requestId),
    });
  }

  clearPendingApprovalByBridgeSessionId(bridgeSessionId: string, requestId: string): ActiveTurnRecord | null {
    const record = this.resolveTurnByBridgeSessionId(bridgeSessionId);
    if (!record) {
      return null;
    }
    return this.updateSessionTurn(bridgeSessionId, {
      pendingApprovals: record.pendingApprovals.filter((entry) => entry.requestId !== requestId),
    });
  }

  clearPendingApprovals(scopeRef: PlatformScopeRef): ActiveTurnRecord | null {
    return this.updateScopeTurn(scopeRef, {
      pendingApprovals: [],
    });
  }

  clearPendingApprovalsByBridgeSessionId(bridgeSessionId: string): ActiveTurnRecord | null {
    return this.updateSessionTurn(bridgeSessionId, {
      pendingApprovals: [],
    });
  }

  endScopeTurn(scopeRef: PlatformScopeRef): ActiveTurnRecord | null {
    const record = this.resolveScopeTurn(scopeRef);
    const key = record ? findRecordKey(this.turnsByKey, record) : null;
    if (key) {
      this.turnsByKey.delete(key);
    }
    return record;
  }

  endSessionTurn(bridgeSessionId: string | null | undefined): ActiveTurnRecord | null {
    const record = this.resolveTurnByBridgeSessionId(bridgeSessionId);
    const key = record ? findRecordKey(this.turnsByKey, record) : null;
    if (key) {
      this.turnsByKey.delete(key);
    }
    return record;
  }
}

function buildScopeKey(scopeRef: PlatformScopeRef): string {
  return formatPlatformScopeKey(scopeRef.platform, scopeRef.externalScopeId);
}

function normalizeId(value: string | null | undefined): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function buildSessionKey(bridgeSessionId: string): string {
  return `session:${bridgeSessionId}`;
}

function buildRecordKey(scopeRef: PlatformScopeRef, bridgeSessionId: string | null | undefined): string {
  const normalized = normalizeId(bridgeSessionId);
  return normalized ? buildSessionKey(normalized) : `scope:${buildScopeKey(scopeRef)}`;
}

function findRecordKey(records: Map<string, ActiveTurnRecord>, record: ActiveTurnRecord): string | null {
  for (const [key, value] of records.entries()) {
    if (value === record) {
      return key;
    }
  }
  return null;
}
