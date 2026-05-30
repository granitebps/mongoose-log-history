import mongoose, { Schema } from 'mongoose';
import { LogHistoryDocument, LogHistoryModel } from './types';

/**
 * Schema for individual field change logs within a log history entry.
 * Each field change is represented as a separate log object.
 */
const logSchema = new Schema({
  /** The field path that changed (using dot notation) */
  field_name: {
    type: String,
  },

  /** String representation of the value before the change */
  from_value: {
    type: String,
  },

  /** String representation of the value after the change */
  to_value: {
    type: String,
  },

  /** The type of change that occurred */
  change_type: {
    type: String,
    enum: ['add', 'edit', 'remove'],
    default: 'edit',
  },

  /** Additional context specific to this field change */
  context: {
    type: Schema.Types.Mixed,
  },
});

/**
 * Main schema for log history entries.
 * Each entry represents a complete change operation (create, update, delete) on a document.
 */
const logHistorySchema = new Schema<LogHistoryDocument>(
  {
    /** The model name this log entry belongs to */
    model: {
      type: String,
      required: true,
    },

    /** The ID of the document that was changed. Can be string, number or ObjectId */
    model_id: {
      type: Schema.Types.Mixed,
      required: true,
    },

    /** The type of change operation */
    change_type: {
      type: String,
      enum: ['create', 'delete', 'update'],
      default: 'update',
      required: true,
    },

    /** Array of individual field changes */
    logs: {
      type: [logSchema],
      default: [],
    },

    /** Information about who made the change (flexible type to support various user representations) */
    created_by: {
      type: Schema.Types.Mixed,
    },

    /** Global context information for this change */
    context: {
      type: Schema.Types.Mixed,
    },

    /** Complete original document snapshot (if saveWholeDoc is enabled) */
    original_doc: {
      type: Schema.Types.Mixed,
    },

    /** Complete updated document snapshot (if saveWholeDoc is enabled) */
    updated_doc: {
      type: Schema.Types.Mixed,
    },

    /** Whether this log entry represents a deleted document */
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false,
    },
  }
);

/**
 * Compound index for efficient querying of log entries.
 * - Finding all logs for a specific model
 * - Finding all logs for a specific document
 * - Finding logs within a time range
 * - Filtering by deletion status
 */
logHistorySchema.index({
  model: 1,
  model_id: 1,
  is_deleted: 1,
  created_at: -1,
});

/**
 * Get or create the log history Mongoose model for a given model name.
 *
 * @param modelName - The name of the model being tracked.
 * @param singleCollection - Whether to use a single collection for all models or separate collections.
 * @param logConnection - Optional Mongoose connection used to store and read log history instead of default connection.
 * @returns The Mongoose model for log history operations.
 */
export function getLogHistoryModel(
  modelName: string,
  singleCollection = false,
  logConnection?: mongoose.Connection
): LogHistoryModel {
  if (
    logConnection !== undefined &&
    (!logConnection || typeof logConnection.model !== 'function' || typeof logConnection.collection !== 'function')
  ) {
    throw new Error('[mongoose-log-history] "logConnection" must be a valid Mongoose connection.');
  }

  const collectionName = singleCollection ? 'log_histories' : `log_histories_${modelName}`;
  const modelKey = singleCollection ? 'LogHistory' : `LogHistory_${modelName}`;
  const connection = logConnection ?? mongoose.connection;

  if (connection.models[modelKey]) {
    return connection.models[modelKey] as LogHistoryModel;
  }

  return connection.model<LogHistoryDocument, LogHistoryModel>(modelKey, logHistorySchema, collectionName);
}

export { logSchema, logHistorySchema };
