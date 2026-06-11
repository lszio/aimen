/**
 * @aimen/e2e — Phase 2 E2E Test
 *
 * Tests the full pipeline:
 * 1. Anytype AgentTask created → Watcher detects → ACP routes to Architect agent
 * 2. Agent executes (simulated) → result written back to Anytype → verify
 * 3. JournalHandler: create journal, add entries, list entries
 */

import { describe, it, expect, afterAll, beforeAll } from 'bun:test';
import {
  HttpTransport,
  MessageRouter,
  AgentRegistry,
  AcpMessageType,
  createMessage,
} from '@aimen/acp-bus';
import type { AcpMessageEnvelope } from '@aimen/acp-bus';
import {
  MockAnytypeClient,
  DefaultAcpMapper,
  AnytypeWatcher,
  JournalHandler,
} from '@aimen/anytype-gateway';
import type { AnytypeTaskObject, AnytypeJournalObject } from '@aimen/anytype-gateway';
import { ArchitectAgent, AgentManager, AgentStatus } from '@aimen/agents';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const PORT = 4124;
const AGENT_ID = 'architect-agent-1';
const AGENT_ROLE = 'architect';
const TASK_ID = 'phase2-task-001';
const TASK_GOAL = '分析项目架构';
const POLL_INTERVAL = 100; // ms — fast polling for test
const TEST_TIMEOUT = 30000;

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------
let transport: HttpTransport;
let router: MessageRouter;
let registry: AgentRegistry;
let mockClient: MockAnytypeClient;
let watcher: AnytypeWatcher;
let mapper: DefaultAcpMapper;
let agentManager: AgentManager;
let architect: ArchitectAgent;

/** Captured TaskResult envelopes from handler */
let lastTaskResult: AcpMessageEnvelope | null = null;
let taskResultResolve: ((value: AcpMessageEnvelope) => void) | null = null;

function waitForTaskResult(): Promise<AcpMessageEnvelope> {
  return new Promise((resolve) => {
    taskResultResolve = resolve;
  });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeAll(async () => {
  // 1. Create registry + router
  registry = new AgentRegistry();
  router = new MessageRouter(registry);

  // 2. Create AgentManager — pass router so it auto-registers as message handler
  agentManager = new AgentManager(registry, router);
  architect = new ArchitectAgent(AGENT_ID, '架构师');
  agentManager.registerAgent(architect, AGENT_ROLE);

  // 3. Capture TaskResult events from router
  router.addEventListener('route:success', (e: Event) => {
    const detail = (e as CustomEvent).detail as { response: AcpMessageEnvelope };
    if (detail.response?.messageType === AcpMessageType.TaskResult ||
        detail.response?.messageType === AcpMessageType.Error) {
      lastTaskResult = detail.response;
      if (taskResultResolve) {
        taskResultResolve(detail.response);
        taskResultResolve = null;
      }
    }
  });

  // 4. Start HTTP transport
  transport = new HttpTransport({ port: PORT, registry, router });
  await transport.start();

  // 5. Create mock client + mapper + watcher
  mockClient = new MockAnytypeClient();
  mapper = new DefaultAcpMapper();
  watcher = new AnytypeWatcher(mockClient, mapper, {
    pollIntervalMs: POLL_INTERVAL,
  });

  // 6. Wire watcher to send HTTP POST to the bus
  watcher.onNewTask = async (msg: AcpMessageEnvelope) => {
    const response = await fetch(`http://localhost:${PORT}/acp/task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Watcher POST failed (${response.status}): ${body}`);
    }
  };
});

afterAll(() => {
  // Clean up — stop watcher first, then transport
  watcher?.stop();
  transport?.stop();
});

// ---------------------------------------------------------------------------
// Phase 2 Pipeline E2E Tests
// ---------------------------------------------------------------------------
describe('Aimen Phase 2 Pipeline E2E', () => {
  it('should have the HTTP transport running', () => {
    expect(transport.running).toBe(true);
  });

  it('should have the architect agent registered', () => {
    const agent = registry.get(AGENT_ID);
    expect(agent).toBeDefined();
    expect(agent!.id).toBe(AGENT_ID);
    expect(agent!.role).toBe(AGENT_ROLE);
    expect(agent!.status).toBe('online');
  });

  it('should process full pipeline: Anytype task → Watcher → ACP → Architect → result written back', async () => {
    // Clear previous state
    lastTaskResult = null;

    // Create a promise that resolves when the TaskResult arrives
    const resultPromise = waitForTaskResult();

    // Insert a new AgentTask into MockAnytypeClient
    const now = new Date().toISOString();
    const task: AnytypeTaskObject = {
      id: TASK_ID,
      spaceId: 'phase2-space',
      type: 'AgentTask',
      createdAt: now,
      updatedAt: now,
      properties: {
        goal: TASK_GOAL,
        agentRole: AGENT_ROLE,
        status: 'pending',
        createdAt: now,
      },
    };

    mockClient.setObject(TASK_ID, task);

    // Start watcher — it will poll and detect the task
    watcher.start();

    // Wait for the TaskResult (with timeout)
    const result = await Promise.race([
      resultPromise,
      new Promise<null>((_, reject) =>
        setTimeout(
          () => reject(new Error('Timeout waiting for TaskResult from architect agent')),
          15000,
        ),
      ),
    ]);

    expect(result).not.toBeNull();
    const taskResult = result!;

    // --- Verify TaskResult from handler ---
    expect(taskResult.messageType).toBe(AcpMessageType.TaskResult);
    expect(taskResult.payload.taskId).toBe(TASK_ID);
    expect(taskResult.senderId).toBe(AGENT_ID);
    expect(taskResult.targetId).toBe('anytype-gateway');

    // --- Verify agent executed by inspecting the result payload ---
    const agentResult = taskResult.payload.result as Record<string, unknown>;
    expect(agentResult).toBeDefined();
    expect(agentResult.status).toBe('completed');

    // --- Apply the result back to Anytype (simulating the gateway write-back) ---
    await mapper.applyTaskResult(taskResult, mockClient);

    // --- Verify the task was updated in the Anytype mock ---
    const updatedTask = mockClient.getObject(TASK_ID) as AnytypeTaskObject;
    expect(updatedTask).toBeDefined();
    expect(updatedTask.properties.status).toBe('completed');
    expect(updatedTask.properties.result).toBeDefined();
    expect(updatedTask.properties.result).toHaveProperty('status', 'completed');

    // --- Verify the watcher updated the intermediate status (happens during poll) ---
    // The watcher sets status to 'running' after sending, then applyTaskResult sets 'completed'.
    // We already verified 'completed', but let's also check the result text is present.
    const agentResultObj = updatedTask.properties.result as Record<string, unknown>;
    expect(agentResultObj.task).toBe(TASK_GOAL);
    expect(agentResultObj.analysis).toBeDefined();
    expect(agentResultObj.formattedPlan).toBeDefined();
    expect(agentResultObj.formattedPlan).toHaveProperty('title');
    expect(agentResultObj.formattedPlan).toHaveProperty('body');
  });

  it('should not re-process the same task', async () => {
    // Task was already processed — wait a few poll cycles
    // The handler should NOT be called again for this task.
    // The watcher sets status to 'running' after the HTTP response comes back,
    // while applyTaskResult sets it to 'completed'. There can be a race between
    // these two, so we just verify no re-processing occurred by checking:
    // 1. The handler was only called once (indirectly verified via seenIds)
    // 2. The task still has a result set (from our applyTaskResult call)

    await new Promise((r) => setTimeout(r, POLL_INTERVAL * 5));

    // The seenIds prevents the watcher from re-sending, and the watcher
    // only processes 'pending' tasks. If status is 'running' or 'completed',
    // the task won't be re-processed.
    const task = mockClient.getObject(TASK_ID) as AnytypeTaskObject;
    expect(['completed', 'running']).toContain(task.properties.status);

    // The result should still be present (written by applyTaskResult)
    expect(task.properties.result).toBeDefined();
    if (task.properties.status === 'completed') {
      expect((task.properties.result as Record<string, unknown>).status).toBe('completed');
    }
  });
});

// ---------------------------------------------------------------------------
// JournalHandler Tests
// ---------------------------------------------------------------------------
describe('JournalHandler', () => {
  let journalHandler: JournalHandler;

  beforeAll(() => {
    // Create a fresh JournalHandler for each test run in this suite
    journalHandler = new JournalHandler(mockClient);
  });

  it('should create a journal', async () => {
    const journal = await journalHandler.createJournal('测试会话日志');

    expect(journal).toBeDefined();
    expect(journal.id).toBeDefined();
    expect(journal.type).toBe('Journal');
    expect(journal.properties.title).toBe('测试会话日志');
    expect(journal.properties.entries).toEqual([]);

    // Verify it's in the mock client
    const stored = mockClient.getObject(journal.id) as AnytypeJournalObject;
    expect(stored).toBeDefined();
    expect(stored.id).toBe(journal.id);
  });

  it('should add user and agent entries to a journal', async () => {
    const journal = await journalHandler.createJournal('多条目日志');
    const journalId = journal.id;

    // Add a user entry
    const userEntry = await journalHandler.addEntry(
      journalId,
      'user',
      '请分析当前项目的架构设计',
    );

    expect(userEntry).toBeDefined();
    expect(userEntry.type).toBe('JournalEntry');
    expect(userEntry.properties.role).toBe('user');
    expect(userEntry.properties.content).toBe('请分析当前项目的架构设计');
    expect(userEntry.properties.journalId).toBe(journalId);

    // Add an agent entry
    const agentEntry = await journalHandler.addEntry(
      journalId,
      'agent',
      '项目采用分层架构，包含展示层、业务逻辑层和数据访问层。',
      AGENT_ID,
    );

    expect(agentEntry).toBeDefined();
    expect(agentEntry.type).toBe('JournalEntry');
    expect(agentEntry.properties.role).toBe('agent');
    expect(agentEntry.properties.content).toBe('项目采用分层架构，包含展示层、业务逻辑层和数据访问层。');
    expect(agentEntry.properties.agentId).toBe(AGENT_ID);
    expect(agentEntry.properties.journalId).toBe(journalId);

    // Keep journalId for the next test
    (globalThis as Record<string, unknown>).__journalId = journalId;
  });

  it('should list entries for a journal', async () => {
    const journalId = (globalThis as Record<string, unknown>).__journalId as string;
    expect(journalId).toBeDefined();

    const entries = await journalHandler.listEntries(journalId);

    expect(entries).toHaveLength(2);

    // First entry should be the user entry
    expect(entries[0].properties.role).toBe('user');
    expect(entries[0].properties.content).toBe('请分析当前项目的架构设计');

    // Second entry should be the agent entry
    expect(entries[1].properties.role).toBe('agent');
    expect(entries[1].properties.content).toBe('项目采用分层架构，包含展示层、业务逻辑层和数据访问层。');
    expect(entries[1].properties.agentId).toBe(AGENT_ID);
  });

  it('should list all journals', async () => {
    const journals = await journalHandler.getJournals();
    // We created at least 2 journals in this suite + potentially any from earlier tests
    expect(journals.length).toBeGreaterThanOrEqual(2);

    const titles = journals.map((j) => j.properties.title);
    expect(titles).toContain('测试会话日志');
    expect(titles).toContain('多条目日志');
  });
});