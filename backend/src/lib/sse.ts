import { Request, Response } from 'express';
import { onNotify } from '../lib/db';
import { logger } from '../lib/logger';

interface SSEClient {
  id: string;
  res: Response;
  eventId?: string;
  tier: string;
  heartbeatTimer: ReturnType<typeof setInterval>;
}

const clients = new Map<string, SSEClient>();

export function setupSSE(req: Request, res: Response) {
  const clientId = `${req.user!.sub}-${Date.now()}`;
  const eventId = req.query.eventId as string | undefined;
  const tier = req.user!.restore_tier;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Heartbeat every 30s to keep connection alive
  const heartbeatTimer = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  const client: SSEClient = { id: clientId, res, eventId, tier, heartbeatTimer };
  clients.set(clientId, client);

  logger.info('SSE client connected', { clientId, tier, eventId });

  // Send initial connection confirmation
  sendToClient(client, 'connected', { clientId, tier });

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    clients.delete(clientId);
    logger.info('SSE client disconnected', { clientId });
  });
}

function sendToClient(client: SSEClient, event: string, data: unknown) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(client.id);
  }
}

// Broadcast step status change to all Silver+ clients watching an event
export function broadcastStepChanged(payload: {
  stepId: string;
  soeId: string;
  status: string;
  assignedTo?: string;
  eventId?: string;
}) {
  for (const client of clients.values()) {
    if (client.tier === 'GOLD') continue; // Gold gets aggregated updates only
    if (payload.eventId && client.eventId && client.eventId !== payload.eventId) continue;

    sendToClient(client, 'step_changed', payload);
  }
}

// Broadcast health change to all clients
export function broadcastHealthChanged(payload: {
  assetId: string;
  status: string;
}) {
  for (const client of clients.values()) {
    sendToClient(client, 'health_changed', payload);
  }
}

// Broadcast Gantt TTFR update to Silver commanders
export function broadcastTTFRUpdate(eventId: string, payload: {
  ttfrMinutes: number;
  confidenceLow: number;
  confidenceHigh: number;
  recoveryConfidenceScore: number;
  completionPercentage: number;
}) {
  for (const client of clients.values()) {
    if (client.tier === 'BRONZE') continue;
    if (client.eventId && client.eventId !== eventId) continue;

    if (client.tier === 'GOLD') {
      // Gold gets only the score and high-level status
      sendToClient(client, 'confidence_update', {
        recoveryConfidenceScore: payload.recoveryConfidenceScore,
        completionPercentage: payload.completionPercentage,
      });
    } else {
      sendToClient(client, 'ttfr_update', payload);
    }
  }
}

// Wire up PostgreSQL LISTEN/NOTIFY to SSE broadcasts
export function initSSEBridge() {
  onNotify('step_changed', (raw) => {
    try {
      const payload = JSON.parse(raw);
      broadcastStepChanged(payload);
    } catch {
      logger.warn('Failed to parse step_changed notification', { raw });
    }
  });

  onNotify('asset_health_changed', (raw) => {
    try {
      const payload = JSON.parse(raw);
      broadcastHealthChanged(payload);
    } catch {
      logger.warn('Failed to parse asset_health_changed notification', { raw });
    }
  });

  logger.info('SSE bridge to PostgreSQL LISTEN/NOTIFY initialised');
}

export function getConnectedClientCount() {
  return clients.size;
}
