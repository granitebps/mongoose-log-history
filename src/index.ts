/**
 * @author Granite Bagas
 * @description Plugin to log history if model changes
 *
 * This Mongoose plugin automatically tracks and logs changes to specified fields
 * in documents. It monitors create, update, and bulk insert operations, saving
 * detailed audit logs to designated log history collections.
 *
 * @param schema - The Mongoose schema to apply the plugin to
 * @param options - Plugin configuration options
 *
 * OPTIONS:
 *
 * @param options.modelName - Model identification (required)
 * @param options.modelKeyId - ID key that identifies the model. Will be the ID of the model (optional, defaults to _id)
 *
 * @param options.softDelete - Soft delete config (optional)
 * @param options.softDelete.field - Soft delete field
 * @param options.softDelete.value - Soft delete field value to be considered deleted
 *
 * @param options.contextFields - List of additional fields to inject into the log (array of field paths from the document itself; must be an array at the plugin level)
 *
 * @param options.singleCollection - Whether to log using a single collection ('log_histories') or per-model collection ('log_histories_{modelName}'). Default is false
 *
 * @param options.saveWholeDoc - Whether to save the original and the updated document. Default is false
 *
 * @param options.maxBatchLog - Maximum number of documents to process in bulk hooks (insertMany, updateMany, deleteMany). Default is 1000
 * @param options.batchSize - Number of documents to process per batch in bulk hooks. Default is 100
 *
 * @param options.logger - Custom logger object (must support .error and .warn methods)
 * @param options.userField - Field path used to extract user data from context/doc (optional, defaults to created_by)
 * @param options.compressDocs - Compress original_doc and updated_doc with gzip when saveWholeDoc is true (optional, defaults to false)
 *
 * @param options.trackedFields - Array of field configurations to track (required)
 * @param options.trackedFields[].value - Field path (supports dot notation)
 * @param options.trackedFields[].arrayType - Array handling type: 'simple' | 'custom-key'
 * @param options.trackedFields[].arrayKey - Identifier/key field for the object inside the array. Used in 'custom-key'
 * @param options.trackedFields[].valueField - Key field of the object inside array to track. Used in 'custom-key'
 * @param options.trackedFields[].contextFields - Additional fields to inject into the log for this field.
 *   - If an array, fields are extracted from the document itself.
 *   - If an object, it can have:
 *     - `doc`: array of field paths from the document itself
 *     - `item`: array of field paths from the array item (for arrays of objects)
 * @param options.trackedFields[].trackedFields - Additional nested fields on the object inside array to track. Used in 'custom-key'
 *
 * Key Features:
 * - Field-level change tracking with dot notation support
 * - Array handling (simple arrays and complex object arrays)
 * - Soft delete detection and logging
 * - Batch operation support with configurable limits
 * - Contextual logging for additional metadata
 * - Flexible storage options (single or per-model collections)
 * - Document compression for storage optimization
 * - Comprehensive MongoDB update operator simulation
 * - Type-safe TypeScript implementation
 *
 * @example
 * ```typescript
 * import { changeLoggingPlugin } from 'mongoose-log-history';
 *
 * const orderSchema = new mongoose.Schema({
 *   status: String,
 *   items: [{ sku: String, qty: Number }]
 * });
 *
 * orderSchema.plugin(changeLoggingPlugin, {
 *   modelName: 'Order',
 *   trackedFields: [
 *     { value: 'status' },
 *     { value: 'items', arrayType: 'custom-key', arrayKey: 'sku' }
 *   ],
 *   singleCollection: true
 * });
 * ```
 */

export { changeLoggingPlugin, buildLogEntry, ChangeLogPlugin } from './plugin';
export { getTrackedChanges, extractLogContext } from './change-tracking';
export { getLogHistoryModel, logSchema, logHistorySchema } from './schema';
export { pruneLogHistory } from './prune';
export { decompressObject, compressObject } from './compression';
export {
  isDate,
  isObject,
  isIsoDateString,
  exists,
  isEqual,
  areValuesEqual,
  getValueByPath,
  setByPath,
  arrayToKeyMap,
  valueToString,
  diffSimpleArray,
  validatePluginOptions,
  deepClone,
  parseHumanTime,
} from './utils';

export type {
  ChangeType,
  FieldChangeType,
  ArrayType,
  Logger,
  PluginOptions,
  TrackedField,
  SoftDeleteConfig,
  ContextFields,
  FieldLog,
  LogHistoryEntry,
  LogHistoryDocument,
  LogHistoryModel,
  BuildLogEntryParams,
  SaveLogHistoryParams,
  BatchLogEntryParams,
  ExtractUserParams,
  ArrayDiff,
} from './types';
export type { PruneOptions } from './prune';

import { changeLoggingPlugin, buildLogEntry } from './plugin';
import { getTrackedChanges } from './change-tracking';
import { getLogHistoryModel } from './schema';
import { pruneLogHistory } from './prune';
import { decompressObject } from './compression';

/**
 * Default export for CommonJS compatibility
 */
export default {
  changeLoggingPlugin,
  buildLogEntry,
  getTrackedChanges,
  getLogHistoryModel,
  pruneLogHistory,
  decompressObject,
};
