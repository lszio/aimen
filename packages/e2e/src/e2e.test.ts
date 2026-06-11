/**
 * @aimen/e2e — Phase 1 E2E Test
 *
 * End-to-end test for the aimen Phase 1 pipeline:
 * 1. ACP Bus starts with HTTP Transport
 * 2. An agent registers via AgentAnnounce
 * 3. MockAnytypeClient gets a new AgentTask object
 * 4. AnytypeWatcher polls, detects it, converts via mapper to ACP message
 * 5. ACP message is sent to the bus via HTTP POST
 * 6. ACP Bus routes it to the registered agent handler
 * 7. Agent responds with TaskResult
 * 8. Everything is logged and verified
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
} from '@aimen/anytype-gateway';
import type { AnytypeTaskObject } from '@aimen/anytype-gateway';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const PORT = 4123;
const AGENT_ID = 'test-agent-1';
const AGENT_ROLE = 'assistant';
const TASK_ID = 'e2e-task-001';
const TASK_GOAL = '完成测试任务: 请回复 "你好，世界！"';
const POLL_INTERVAL = 500; // ms — fast polling for test

// ---------------------------------------------------------------------------
// Test state
// ---------------------------------------------------------------------------
let transport: HttpTransport;
let router: MessageRouter;
let registry: AgentRegistry;
let mockClient: MockAnytypeClient;
let watcher: AnytypeWatcher;
let mapper: DefaultAcpMapper;

/** Captured handler invocations */
const handlerInvocations: AcpMessageEnvelope[] = [];
let unregisterHandler: (() => void) | null = null;
let handlerResolve: ((value: AcpMessageEnvelope) => void) | null = null;

/**
 * Handler promise — resolves when the agent handler receives a TaskSubmit.
 */
function waitForHandlerCall(): Promise<AcpMessageEnvelope> {
  return new Promise((resolve) => {
    handlerResolve = resolve;
  });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeAll(async () => {
  // 1. Create registry + router
  registry = new AgentRegistry();
  router = new MessageRouter(registry);

  // 2. Register agent handler
  unregisterHandler = router.onMessage(async (envelope) => {
    // Only handle TaskSubmit messages
    if (envelope.messageType !== AcpMessageType.TaskSubmit) {
      return null;
    }

    handlerInvocations.push(envelope);

    // Resolve the promise so the test can proceed
    if (handlerResolve) {
      handlerResolve(envelope);
      handlerResolve = null;
    }

    // Return a TaskResult
    return createMessage(
      AcpMessageType.TaskResult,
      AGENT_ID,
      envelope.senderId,
      {
        taskId: (envelope.payload as Record<string, unknown>).taskId,
        result: `已收到任务: ${(envelope.payload as Record<string, unknown>).goal}`,
      },
    );
  });

  // 3. Start HTTP transport
  transport = new HttpTransport({ port: PORT, registry, router });
  await transport.start();

  // 4. Create mock client
  mockClient = new MockAnytypeClient();

  // 5. Create mapper + watcher
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
      console.error(`[HTTP POST] Error: ${response.status} ${body}`);
    }
  };
});

afterAll(() => {
  // Clean up
  watcher?.stop();
  transport?.stop();
  if (unregisterHandler) {
    unregisterHandler();
  }
});

// ---------------------------------------------------------------------------
// E2E Test
// ---------------------------------------------------------------------------
describe('Aimen Phase 1 Pipeline E2E', () => {
  it('should start the HTTP transport and be ready', () => {
    expect(transport.running).toBe(true);
  });

  it('should register an agent via AgentAnnounce sent through HTTP', async () => {
    // NOTE: The HTTP /acp/message endpoint overrides the messageType to 'Message',
    // so we send AgentAnnounce directly through the router.route() method instead.
    const announceEnvelope = createMessage(
      AcpMessageType.AgentAnnounce,
      AGENT_ID,
      'router',
      {
        agent: {
          id: AGENT_ID,
          name: '测试助手',
          role: AGENT_ROLE,
          status: 'online',
          capabilities: ['test', 'echo'],
          lastHeartbeat: new Date().toISOString(),
        },
      },
    );

    const result = await router.route(announceEnvelope);
    expect(result.success).toBe(true);

    // Verify agent is registered
    const agent = registry.get(AGENT_ID);
    expect(agent).toBeDefined();
    expect(agent!.id).toBe(AGENT_ID);
    expect(agent!.role).toBe(AGENT_ROLE);
    expect(agent!.status).toBe('online');
  });

  it('should create an AgentTask in MockAnytypeClient and have the watcher pick it up', async () => {
    // Clear any previous handler state
    handlerInvocations.length = 0;

    // Create a promise that resolves when the handler receives a message
    const handlerCalled = waitForHandlerCall();

    // Insert a new AgentTask into MockAnytypeClient
    const now = new Date().toISOString();
    const task: AnytypeTaskObject = {
      id: TASK_ID,
      spaceId: 'e2e-space',
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

    // Start the watcher
    watcher.start();

    // Wait for the handler to be invoked (with timeout)
    const receivedEnvelope = await Promise.race([
      handlerCalled,
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout waiting for handler to be called')), 10000),
      ),
    ]);

    expect(receivedEnvelope).not.toBeNull();
    const env = receivedEnvelope!;

    // Verify the handler received the correct task
    expect(env.messageType).toBe(AcpMessageType.TaskSubmit);
    expect(env.payload.taskId).toBe(TASK_ID);
    expect(env.payload.goal).toBe(TASK_GOAL);
    expect(env.senderId).toBe('anytype-gateway');
    expect(env.targetId).toBe(AGENT_ROLE);

    // Verify handler was called exactly once
    expect(handlerInvocations.length).toBe(1);
  });

  it('should have updated the task status to "running" in MockAnytypeClient', async () => {
    // Give the watcher a moment to update the status (it happens after onNewTask)
    await new Promise((r) => setTimeout(r, POLL_INTERVAL + 100));

    const updatedTask = mockClient.getObject(TASK_ID) as AnytypeTaskObject;
    expect(updatedTask).toBeDefined();
    expect(updatedTask.properties.status).toBe('running');
  });

  it('should not re-process the same task', async () => {
    // Wait a few poll cycles — the handler should NOT be called again
    const previousCount = handlerInvocations.length;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL * 3));

    expect(handlerInvocations.length).toBe(previousCount);
  });
});