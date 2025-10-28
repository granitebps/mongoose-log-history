import { Document, Model, Types } from 'mongoose';

/**
 * Supported change types for logging operations.
 */
export type ChangeType = 'create' | 'update' | 'delete';

/**
 * Supported field-level change types.
 */
export type FieldChangeType = 'add' | 'edit' | 'remove';

/**
 * Supported array handling types for tracked fields.
 */
export type ArrayType = 'simple' | 'custom-key';

/**
 * Logger interface that the plugin expects.
 * Must support error and warn methods like console.
 */
export interface Logger {
  error(error: Error | unknown, message?: string): void;
  warn(message: string): void;
}

/**
 * Soft delete configuration for detecting delete operations.
 */
export interface SoftDeleteConfig {
  /** The field path to check for soft delete status */
  field: string;
  /** The value that indicates a document is soft deleted */
  value: unknown;
}

/**
 * Context fields configuration for extracting additional metadata.
 * Can be either an array of field paths or an object with doc/item fields.
 */
export type ContextFields =
  | string[]
  | {
      /** Field paths to extract from the document itself */
      doc?: string[];
      /** Field paths to extract from array items (for array fields) */
      item?: string[];
    };

/**
 * Configuration for a single tracked field.
 */
export interface TrackedField {
  /** The field path using dot notation (e.g., 'status', 'user.name', 'items.0.qty') */
  value: string;

  /** Array handling type - only needed for array fields */
  arrayType?: ArrayType;

  /**
   * Key field for identifying objects in arrays when using 'custom-key' arrayType.
   * This field should uniquely identify each object in the array.
   */
  arrayKey?: string;

  /**
   * The field to track within array objects when using 'custom-key' arrayType.
   * If not specified, the entire object changes will be tracked.
   */
  valueField?: string;

  /**
   * When defined, the value for this field field is masked in the logs.
   * This is useful for sensitive information that should not be stored in logs.
   */
  maskedValue?: string | ((value: unknown) => string | null | undefined);

  /** Additional context fields to include in logs for this specific field */
  contextFields?: ContextFields;

  /**
   * Additional nested fields to track within array objects when using 'custom-key'.
   * Used for tracking multiple fields within complex array objects.
   */
  trackedFields?: TrackedField[];
}

/**
 * Main plugin configuration options.
 */
export interface PluginOptions {
  /**
   * Model identification name. If not provided, will use the model name.
   * This is used to identify which model the log entry belongs to.
   */
  modelName?: string;

  /**
   * Field path that serves as the unique identifier for the model.
   * Defaults to '_id'. Use dot notation for nested fields.
   */
  modelKeyId?: string;

  /**
   * Array of field configurations to track for changes.
   * Each field can have different tracking behavior (simple, array, custom-key).
   */
  trackedFields?: TrackedField[];

  /**
   * Global context fields to include in all log entries.
   * These are extracted from the document itself.
   */
  contextFields?: string[];

  /**
   * Soft delete configuration. When specified, updates that set the field
   * to the specified value will be logged as 'delete' operations instead of 'update'.
   */
  softDelete?: SoftDeleteConfig;

  /**
   * Whether to use a single log collection for all models ('log_histories')
   * or separate collections per model ('log_histories_{modelName}').
   * Defaults to false (separate collections).
   */
  singleCollection?: boolean;

  /**
   * Whether to save complete document snapshots in log entries.
   * This includes original_doc and updated_doc fields.
   * Defaults to false to save storage space.
   */
  saveWholeDoc?: boolean;

  /**
   * Maximum number of documents to process in bulk operations.
   * Helps prevent memory issues with large bulk operations.
   * Defaults to 1000.
   */
  maxBatchLog?: number;

  /**
   * Number of documents to process per batch in bulk operations.
   * Larger batches are more efficient but use more memory.
   * Defaults to 100.
   */
  batchSize?: number;

  /**
   * Custom logger instance. Must implement error() and warn() methods.
   * Defaults to console.
   */
  logger?: Logger;

  /**
   * Field path to extract user information from documents or context.
   * Uses dot notation. Falls back to common user fields if not found.
   * Defaults to 'created_by'.
   */
  userField?: string;

  /**
   * Whether to compress document snapshots using gzip when saveWholeDoc is true.
   * Helps reduce storage size for large documents.
   * Defaults to false.
   */
  compressDocs?: boolean;
}

/**
 * Individual field-level change log entry.
 */
export interface FieldLog {
  /** The field path that changed */
  field_name: string;

  /** String representation of the value before the change */
  from_value: string | null | undefined;

  /** String representation of the value after the change */
  to_value: string | null | undefined;

  /** The type of change that occurred */
  change_type: FieldChangeType;

  /** Additional context specific to this field change */
  context?: Record<string, unknown>;
}

/**
 * Complete log history entry stored in the database.
 */
export interface LogHistoryEntry {
  /** The model name this log entry belongs to */
  model: string;

  /** The ObjectId of the document that was changed */
  model_id: Types.ObjectId | string | number;

  /** The type of change operation */
  change_type: ChangeType;

  /** Array of individual field changes */
  logs: FieldLog[];

  /** Information about who made the change */
  created_by?: unknown;

  /** Global context information for this change */
  context?: Record<string, unknown>;

  /** Complete original document snapshot (if saveWholeDoc is enabled) */
  original_doc?: unknown;

  /** Complete updated document snapshot (if saveWholeDoc is enabled) */
  updated_doc?: unknown;

  /** Whether this log entry represents a deleted document */
  is_deleted: boolean;

  /** Timestamp when the log entry was created */
  created_at: Date;
}

/**
 * Mongoose document interface for log history entries.
 */
export interface LogHistoryDocument extends Omit<Document, 'model'> {
  /** The model name this log entry belongs to */
  model: string;

  /** The ObjectId of the document that was changed */
  model_id: Types.ObjectId | string | number;

  /** The type of change operation */
  change_type: ChangeType;

  /** Array of individual field changes */
  logs: FieldLog[];

  /** Information about who made the change */
  created_by?: unknown;

  /** Global context information for this change */
  context?: Record<string, unknown>;

  /** Complete original document snapshot (if saveWholeDoc is enabled) */
  original_doc?: unknown;

  /** Complete updated document snapshot (if saveWholeDoc is enabled) */
  updated_doc?: unknown;

  /** Whether this log entry represents a deleted document */
  is_deleted: boolean;

  /** Timestamp when the log entry was created */
  created_at: Date;
}

/**
 * Mongoose model interface for log history collections.
 */
export interface LogHistoryModel extends Model<LogHistoryDocument> {}

/**
 * A mapping of field paths to their masked values or masking functions.
 */
export type MaskedValues = Record<string, string | ((value: unknown) => string | null | undefined)>;

/**
 * Parameters for building a log entry.
 */
export interface BuildLogEntryParams {
  model_id: string | number | Types.ObjectId;
  model_name: string;
  change_type: ChangeType;
  logs: FieldLog[];
  created_by?: unknown;
  original_doc?: unknown;
  updated_doc?: unknown;
  context?: Record<string, unknown>;
  saveWholeDoc?: boolean;
  compressDocs?: boolean;
  maskedValues?: MaskedValues;
}

/**
 * Parameters for saving a single log history entry.
 */
export interface SaveLogHistoryParams {
  modelId: string | number | Types.ObjectId;
  originalData?: Record<string, unknown>;
  updatedData?: Record<string, unknown>;
  changeType?: ChangeType;
  user?: unknown;
}

/**
 * Parameters for batch log history operations.
 */
export interface BatchLogEntryParams {
  modelId: string | number | Types.ObjectId;
  originalData?: Record<string, unknown>;
  updatedData?: Record<string, unknown>;
  changeType: ChangeType;
  user?: unknown;
}

/**
 * User extraction parameters.
 */
export interface ExtractUserParams {
  doc?: Record<string, unknown>;
  context?: Record<string, unknown>;
  userField: string;
}

/**
 * Array difference result for simple arrays.
 */
export interface ArrayDiff<T = unknown> {
  added: T[];
  removed: T[];
}
