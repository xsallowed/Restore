import { logger } from '../../../lib/logger';

// Base Connector Interface
export interface IConnector {
  name: string;
  type: string;
  config: Record<string, unknown>;
  sync(): Promise<{
    assetsDiscovered: number;
    assetsUpdated: number;
    assetsMerged: number;
    errors: string[];
  }>;
}

// Connector Configuration Validation
export abstract class BaseConnector implements IConnector {
  name: string;
  type: string;
  config: Record<string, unknown>;

  constructor(name: string, type: string, config: Record<string, unknown>) {
    this.name = name;
    this.type = type;
    this.config = config;
    this.validateConfig();
  }

  abstract validateConfig(): void;

  abstract sync(): Promise<{
    assetsDiscovered: number;
    assetsUpdated: number;
    assetsMerged: number;
    errors: string[];
  }>;

  protected logDebug(message: string, data?: unknown) {
    logger.debug(`[${this.type}] ${message}`, data);
  }

  protected logError(message: string, err?: unknown) {
    logger.error(`[${this.type}] ${message}`, { err: String(err) });
  }
}

// Factory for creating connectors
export class ConnectorFactory {
  private static connectors: Map<string, typeof BaseConnector> = new Map();

  static register(type: string, ConnectorClass: typeof BaseConnector) {
    ConnectorFactory.connectors.set(type, ConnectorClass);
    logger.info(`Registered connector type: ${type}`);
  }

  static create(name: string, type: string, config: Record<string, unknown>): BaseConnector {
    const ConnectorClass = ConnectorFactory.connectors.get(type);
    if (!ConnectorClass) {
      throw new Error(`Unknown connector type: ${type}`);
    }
    return new ConnectorClass(name, type, config);
  }

  static getAvailableTypes(): string[] {
    return Array.from(ConnectorFactory.connectors.keys());
  }
}

// Encryption utility for storing credentials
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ENCRYPTION_KEY_SALT = process.env.ENCRYPTION_SALT || 'restore_default_salt_change_in_prod';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

export function encryptConfig(config: Record<string, unknown>): string {
  const derivedKey = scryptSync(ENCRYPTION_KEY_SALT, 'salt', 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, derivedKey, iv);

  let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    authTag: authTag.toString('hex'),
    algorithm: ENCRYPTION_ALGORITHM,
  });
}

export function decryptConfig(encryptedData: string): Record<string, unknown> {
  try {
    const derivedKey = scryptSync(ENCRYPTION_KEY_SALT, 'salt', 32);
    const { iv, encryptedData: encrypted, authTag } = JSON.parse(encryptedData);

    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      derivedKey,
      Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (err) {
    logger.error('Failed to decrypt config', { err: String(err) });
    throw new Error('Failed to decrypt connector config');
  }
}
