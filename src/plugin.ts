import mongoose, { Document, Query, Model, Types, isValidObjectId } from 'mongoose';
import {
  PluginOptions,
  TrackedField,
  Logger,
  SaveLogHistoryParams,
  BatchLogEntryParams,
  ExtractUserParams,
  LogHistoryModel,
  LogHistoryEntry,
  FieldLog,
  ChangeType,
  BuildLogEntryParams,
  MaskedValues,
} from './types';
import { getLogHistoryModel } from './schema';
import { getTrackedChanges, extractLogContext } from './change-tracking';
import { compressObject, decompressObject } from './compression';
import {
  getValueByPath,
  arrayToKeyMap,
  isEqual,
  validatePluginOptions,
  deepClone,
  extractMaskedValues,
  maskLogs,
} from './utils';

/**
 * Build a log entry object compatible with the plugin's log schema.
 * This function creates a standardized log entry that can be saved to the database.
 * Supports both object parameters (new API) and positional parameters (legacy API).
 *
 * @example
 * // Object-based API (recommended for TypeScript)
 * const logEntry = buildLogEntry({
 *   model_id: new Types.ObjectId(),
 *   model_name: 'User',
 *   change_type: 'update',
 *   logs: changes,
 *   created_by: 'admin',
 *   saveWholeDoc: true
 * });
 *
 * @example
 * // Legacy positional API (for backward compatibility)
 * const logEntry = buildLogEntry(
 *   new Types.ObjectId(),
 *   'User',
 *   'update',
 *   changes,
 *   'admin',
 *   originalDoc,
 *   updatedDoc,
 *   context,
 *   true
 * );
 *
 * @param paramsOrModelId - Either a BuildLogEntryParams object (new API) or model_id (legacy API)
 * @param model_name - The model name (legacy API only)
 * @param change_type - The type of change (legacy API only)
 * @param logs - Array of field-level changes (legacy API only)
 * @param created_by - User who made the change (legacy API only)
 * @param original_doc - Original document state (legacy API only)
 * @param updated_doc - Updated document state (legacy API only)
 * @param context - Additional context data (legacy API only)
 * @param saveWholeDoc - Whether to save complete documents (legacy API only)
 * @param compressDocs - Whether to compress saved documents (legacy API only)
 * @returns A complete log entry object ready for database insertion
 */
export function buildLogEntry(
  model_id: string | number | Types.ObjectId,
  model_name: string,
  change_type: ChangeType,
  logs: FieldLog[],
  created_by?: unknown,
  original_doc?: unknown,
  updated_doc?: unknown,
  context?: Record<string, unknown>,
  saveWholeDoc?: boolean,
  compressDocs?: boolean,
  maskedValues?: MaskedValues
): LogHistoryEntry;
export function buildLogEntry(params: BuildLogEntryParams): LogHistoryEntry;
export function buildLogEntry(
  paramsOrModelId: BuildLogEntryParams | string | number | Types.ObjectId,
  model_name?: string,
  change_type?: ChangeType,
  logs?: FieldLog[],
  created_by?: unknown,
  original_doc?: unknown,
  updated_doc?: unknown,
  context?: Record<string, unknown>,
  saveWholeDoc?: boolean,
  compressDocs?: boolean,
  maskedValues?: MaskedValues
): LogHistoryEntry {
  let params: BuildLogEntryParams;

  if (typeof paramsOrModelId === 'object' && paramsOrModelId && 'model_id' in paramsOrModelId) {
    // New object-based API
    params = paramsOrModelId as BuildLogEntryParams;
  } else {
    // Legacy positional parameters API
    params = {
      model_id: paramsOrModelId as string | number | Types.ObjectId,
      model_name: model_name!,
      change_type: change_type!,
      logs: logs!,
      created_by,
      original_doc,
      updated_doc,
      context,
      saveWholeDoc: saveWholeDoc || false,
      compressDocs: compressDocs || false,
      maskedValues: maskedValues || undefined,
    };
  }

  const {
    model_id,
    model_name: modelName,
    change_type: changeType,
    logs: fieldLogs,
    created_by: createdBy,
    original_doc: originalDoc = null,
    updated_doc: updatedDoc = null,
    context: contextData = null,
    saveWholeDoc: saveWholeDocument = false,
    compressDocs: compressDocuments = false,
    maskedValues: masks,
  } = params;

  const entry: LogHistoryEntry = {
    model: modelName,
    model_id,
    change_type: changeType,
    logs: maskLogs(fieldLogs, masks),
    created_by: createdBy,
    is_deleted: false,
    created_at: new Date(),
  };

  if (contextData) {
    entry.context = contextData;
  }

  if (saveWholeDocument) {
    entry.original_doc = originalDoc
      ? compressDocuments
        ? compressObject(masks ? deepClone(originalDoc, masks) : originalDoc)
        : deepClone(originalDoc, masks)
      : null;

    entry.updated_doc = updatedDoc
      ? compressDocuments
        ? compressObject(masks ? deepClone(updatedDoc, masks) : updatedDoc)
        : deepClone(updatedDoc, masks)
      : null;
  }

  return entry;
}

/**
 * Main plugin class that handles all change logging functionality.
 * This class encapsulates all the logic for tracking document changes
 * and provides a clean interface for the Mongoose plugin system.
 */
export class ChangeLogPlugin {
  public readonly modelName: string;
  public readonly modelKeyId: string;
  public readonly trackedFields: TrackedField[];
  public readonly contextFields: string[];
  public readonly softDelete: { field: string; value: unknown } | null;
  public readonly singleCollection: boolean;
  public readonly saveWholeDoc: boolean;
  public readonly maxBatchLog: number;
  public readonly batchSize: number;
  public readonly logger: Logger;
  public readonly userField: string;
  public readonly compressDocs: boolean;
  public readonly maskedValues?: MaskedValues;

  constructor(options: PluginOptions & { modelName: string }) {
    validatePluginOptions(options);

    this.modelName = options.modelName;
    this.modelKeyId = options.modelKeyId ?? '_id';
    this.trackedFields = options.trackedFields ?? [];
    this.contextFields = options.contextFields ?? [];
    this.softDelete = options.softDelete ?? null;
    this.singleCollection = options.singleCollection === true;
    this.saveWholeDoc = options.saveWholeDoc === true;
    this.maxBatchLog = options.maxBatchLog ?? 1000;
    this.batchSize = options.batchSize ?? 100;
    this.logger = options.logger ?? console;
    this.userField = options.userField ?? 'created_by';
    this.compressDocs = options.compressDocs === true;
    this.maskedValues = extractMaskedValues(this.trackedFields);
  }

  /**
   * Get the log history model for the current plugin instance.
   * @returns The log history model for this plugin configuration.
   */
  public getLogHistoryModelPlugin(): LogHistoryModel {
    return getLogHistoryModel(this.modelName, this.singleCollection);
  }

  /**
   * Extract user info from context or document, with fallbacks to common user fields.
   * This method provides flexible user extraction with multiple fallback strategies.
   *
   * @param params - Parameters containing document, context, and user field configuration.
   * @returns The extracted user info, or null if none found.
   */
  private extractUser(params: ExtractUserParams): unknown {
    const { doc, context, userField } = params;

    if (context && userField) {
      const userFromContext = getValueByPath(context, userField);
      if (userFromContext !== undefined && userFromContext !== null) {
        return userFromContext;
      }
    }

    if (doc && userField) {
      const userFromDoc = getValueByPath(doc, userField);
      if (userFromDoc !== undefined && userFromDoc !== null) {
        return userFromDoc;
      }
    }

    if (doc) {
      const fallbackFields = ['created_by', 'updated_by', 'modified_by', 'user_id', 'userId'];
      for (const field of fallbackFields) {
        const userValue = getValueByPath(doc, field);
        if (userValue !== undefined && userValue !== null) {
          return userValue;
        }
      }
    }

    return null;
  }

  /**
   * Simulate $addToSet update operator for arrays.
   * This ensures accurate change tracking for MongoDB array operations.
   *
   * @param originalArr - The original array.
   * @param addArr - The value(s) to add.
   * @param arrayKey - The key for custom-key arrays.
   * @returns The updated array after simulation.
   */
  private simulateAddToSet(
    originalArr: unknown[] | null | undefined,
    addArr: unknown[] | unknown,
    arrayKey?: string
  ): unknown[] {
    if (!Array.isArray(originalArr)) {
      originalArr = [];
    }
    const toAdd: unknown[] = Array.isArray(addArr) ? addArr : [addArr];
    const result = [...originalArr];
    if (arrayKey) {
      const map = arrayToKeyMap(originalArr as Record<string, unknown>[], arrayKey);
      for (const item of toAdd) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const obj = item as Record<string, unknown>;
          const key = (obj as Record<string, unknown>)[arrayKey];
          if (!map[key as string]) {
            result.push(item);
            map[key as string] = obj;
          }
        }
      }
    } else {
      for (const item of toAdd) {
        if (!result.some((x) => isEqual(x, item))) {
          result.push(item);
        }
      }
    }
    return result;
  }

  /**
   * Simulate $pull update operator for arrays.
   * Removes elements matching the query criteria.
   *
   * @param originalArr - The original array.
   * @param pullQuery - The value or query object to match for removal.
   * @returns The updated array after simulation.
   */
  private simulatePull(originalArr: unknown[] | null | undefined, pullQuery: unknown): unknown[] {
    if (!Array.isArray(originalArr)) {
      return [];
    }

    if (typeof pullQuery !== 'object' || Array.isArray(pullQuery) || pullQuery === null) {
      return originalArr.filter((item) => !isEqual(item, pullQuery));
    }

    const queryObj = pullQuery as Record<string, unknown>;
    const queryKeys = Object.keys(queryObj);

    return originalArr.filter((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return true;
      }

      const itemObj = item as Record<string, unknown>;

      for (const key of queryKeys) {
        if (!isEqual(itemObj[key], queryObj[key])) {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Simulate $pullAll update operator for arrays.
   * Removes all occurrences of specified values.
   *
   * @param originalArr - The original array.
   * @param pullAllArr - The values to remove.
   * @returns The updated array after simulation.
   */
  private simulatePullAll(originalArr: unknown[] | null | undefined, pullAllArr: unknown[] | unknown): unknown[] {
    if (!Array.isArray(originalArr)) {
      return [];
    }

    const valuesToRemove = Array.isArray(pullAllArr) ? pullAllArr : [pullAllArr];

    return originalArr.filter((item) => !valuesToRemove.some((valueToRemove) => isEqual(item, valueToRemove)));
  }

  /**
   * Extract the updated fields from a MongoDB update object and the original document.
   * This method simulates all MongoDB update operators to predict the final document state.
   *
   * @param update - The MongoDB update object with operators.
   * @param originalDoc - The original document state.
   * @returns The simulated updated fields.
   */
  private extractUpdateFields(
    update: Record<string, unknown> | null | undefined,
    originalDoc: Record<string, unknown> | null | undefined
  ): Record<string, unknown> {
    const fields: Record<string, unknown> = {};

    if (!update) {
      return fields;
    }

    // Handle direct field assignments (non-operator updates)
    Object.keys(update).forEach((key) => {
      if (!key.startsWith('$')) {
        fields[key] = update[key];
      }
    });

    // Handle $set operator
    if (update.$set && typeof update.$set === 'object') {
      Object.assign(fields, update.$set);
    }

    // Handle $setOnInsert operator
    if (update.$setOnInsert && typeof update.$setOnInsert === 'object') {
      Object.assign(fields, update.$setOnInsert);
    }

    // Handle $unset operator
    if (update.$unset && typeof update.$unset === 'object') {
      Object.keys(update.$unset as Record<string, unknown>).forEach((key) => {
        fields[key] = undefined;
      });
    }

    for (const field of this.trackedFields) {
      const fieldName = field.value;
      const arrayKey = field.arrayKey;

      // Handle $addToSet operator
      if (update.$addToSet && typeof update.$addToSet === 'object') {
        const addToSetOp = update.$addToSet as Record<string, unknown>;
        if (addToSetOp[fieldName]) {
          const originalArr = getValueByPath(originalDoc, fieldName) as unknown[] | undefined;
          const addToSetValue = addToSetOp[fieldName] as unknown;

          const isEachOperation =
            addToSetValue &&
            typeof addToSetValue === 'object' &&
            !Array.isArray(addToSetValue) &&
            '$each' in (addToSetValue as Record<string, unknown>);

          const addArr = isEachOperation ? (addToSetValue as { $each: unknown[] }).$each : [addToSetValue];

          fields[fieldName] = this.simulateAddToSet(originalArr, addArr, arrayKey);
        }
      }

      // Handle $push operator
      if (update.$push && typeof update.$push === 'object') {
        const pushOp = update.$push as Record<string, unknown>;
        if (pushOp[fieldName]) {
          const originalArr = (getValueByPath(originalDoc, fieldName) as unknown[] | undefined) ?? [];
          const pushValue = pushOp[fieldName] as unknown;

          const isEachOperation =
            pushValue &&
            typeof pushValue === 'object' &&
            !Array.isArray(pushValue) &&
            '$each' in (pushValue as Record<string, unknown>);

          const pushArr = isEachOperation ? (pushValue as { $each: unknown[] }).$each : [pushValue];

          fields[fieldName] = (originalArr as unknown[]).concat(pushArr);
        }
      }

      // Handle $pull operator
      if (update.$pull && typeof update.$pull === 'object') {
        const pullOp = update.$pull as Record<string, unknown>;
        if (pullOp[fieldName]) {
          const originalArr = getValueByPath(originalDoc, fieldName) as unknown[] | undefined;
          const pullQuery = pullOp[fieldName];
          fields[fieldName] = this.simulatePull(originalArr, pullQuery);
        }
      }

      // Handle $pullAll operator
      if (update.$pullAll && typeof update.$pullAll === 'object') {
        const pullAllOp = update.$pullAll as Record<string, unknown>;
        if (pullAllOp[fieldName]) {
          const originalArr = getValueByPath(originalDoc, fieldName) as unknown[] | undefined;
          const pullAllArr = pullAllOp[fieldName];
          fields[fieldName] = this.simulatePullAll(originalArr, pullAllArr);
        }
      }

      // Handle $pop operator
      if (update.$pop && typeof update.$pop === 'object') {
        const popOp = update.$pop as Record<string, unknown>;
        if (popOp[fieldName] !== undefined) {
          const originalArr = (getValueByPath(originalDoc, fieldName) as unknown[] | undefined) ?? [];
          const popVal = popOp[fieldName] as number;

          if (popVal === 1) {
            fields[fieldName] = originalArr.slice(0, -1);
          } else if (popVal === -1) {
            fields[fieldName] = originalArr.slice(1);
          } else {
            fields[fieldName] = originalArr;
          }
        }
      }

      // Handle $inc operator
      if (update.$inc && typeof update.$inc === 'object') {
        const incOp = update.$inc as Record<string, unknown>;
        if (incOp[fieldName] !== undefined) {
          const originalValue = (getValueByPath(originalDoc, fieldName) as number) || 0;
          const incValue = incOp[fieldName] as number;
          fields[fieldName] = originalValue + incValue;
        }
      }

      // Handle $mul operator
      if (update.$mul && typeof update.$mul === 'object') {
        const mulOp = update.$mul as Record<string, unknown>;
        if (mulOp[fieldName] !== undefined) {
          const originalValue = (getValueByPath(originalDoc, fieldName) as number) || 0;
          const mulValue = mulOp[fieldName] as number;
          fields[fieldName] = originalValue * mulValue;
        }
      }

      // Handle $min operator
      if (update.$min && typeof update.$min === 'object') {
        const minOp = update.$min as Record<string, unknown>;
        if (minOp[fieldName] !== undefined) {
          const originalValue = getValueByPath(originalDoc, fieldName) as number;
          const minValue = minOp[fieldName] as number;
          fields[fieldName] = originalValue === undefined ? minValue : Math.min(originalValue, minValue);
        }
      }

      // Handle $max operator
      if (update.$max && typeof update.$max === 'object') {
        const maxOp = update.$max as Record<string, unknown>;
        if (maxOp[fieldName] !== undefined) {
          const originalValue = getValueByPath(originalDoc, fieldName) as number;
          const maxValue = maxOp[fieldName] as number;
          fields[fieldName] = originalValue === undefined ? maxValue : Math.max(originalValue, maxValue);
        }
      }
    }

    return fields;
  }

  /**
   * Save a single log history entry to the database.
   * This method handles the creation and saving of individual log entries.
   *
   * @param params - Parameters for saving the log history entry.
   */
  private async saveLogHistory(params: SaveLogHistoryParams): Promise<void> {
    const { modelId, originalData, updatedData, changeType = 'update', user = null } = params;

    let changes: FieldLog[] = [];
    let context: Record<string, unknown> | undefined;

    if (changeType === 'update') {
      changes = getTrackedChanges(
        originalData as Record<string, unknown>,
        updatedData as Record<string, unknown>,
        this.trackedFields
      );

      if (changes.length === 0) {
        return;
      }
    } else {
      context = extractLogContext(
        this.contextFields,
        originalData as Record<string, unknown>,
        updatedData as Record<string, unknown>
      );
    }

    try {
      const LogHistory = this.getLogHistoryModelPlugin();
      const logEntry = buildLogEntry({
        model_id: modelId,
        model_name: this.modelName,
        change_type: changeType,
        logs: changes,
        created_by: user,
        original_doc: originalData,
        updated_doc: updatedData,
        context,
        saveWholeDoc: this.saveWholeDoc,
        compressDocs: this.compressDocs,
        maskedValues: this.maskedValues,
      });

      await LogHistory.create(logEntry);
    } catch (err) {
      this.logger.error(
        err as Error,
        `[pluginLogHistory: saveLogHistory] Failed to write log history. Model: ${this.modelName}. ID: ${modelId}.`
      );
    }
  }

  /**
   * Save multiple log history entries in a batch operation.
   * This method is optimized for bulk operations and uses MongoDB's bulkWrite for efficiency.
   *
   * @param logEntriesData - Array of log entry parameter objects.
   */
  private async saveLogHistoryBatch(logEntriesData: BatchLogEntryParams[]): Promise<void> {
    const bulkOperations = logEntriesData
      .map((params) => {
        let changes: FieldLog[] = [];
        let context: Record<string, unknown> | undefined;

        if (params.changeType === 'update') {
          changes = getTrackedChanges(
            params.originalData as Record<string, unknown>,
            params.updatedData as Record<string, unknown>,
            this.trackedFields
          );

          if (!changes.length) {
            return null;
          }
        } else {
          context = extractLogContext(
            this.contextFields,
            params.originalData as Record<string, unknown>,
            params.updatedData as Record<string, unknown>
          );
        }

        const logEntry = buildLogEntry({
          model_id: params.modelId,
          model_name: this.modelName,
          change_type: params.changeType,
          logs: changes,
          created_by: params.user,
          original_doc: params.originalData,
          updated_doc: params.updatedData,
          context,
          saveWholeDoc: this.saveWholeDoc,
          compressDocs: this.compressDocs,
          maskedValues: this.maskedValues,
        });

        return {
          insertOne: {
            document: logEntry,
          },
        };
      })
      .filter((op): op is NonNullable<typeof op> => op !== null);

    if (!bulkOperations.length) {
      return;
    }

    try {
      const LogHistory = this.getLogHistoryModelPlugin();
      await LogHistory.bulkWrite(bulkOperations, { ordered: false });
    } catch (err) {
      this.logger.error(
        err as Error,
        `[pluginLogHistory: saveLogHistoryBatch] Failed to write log history. Model: ${this.modelName}.`
      );
    }
  }

  /**
   * Process documents in batches for bulk operations, respecting maxBatchLog and batchSize limits.
   * This method helps prevent memory issues and database overload during large operations.
   *
   * @param docs - The documents to process.
   * @param processFn - The function to process each batch.
   * @param operationName - The operation name for logging purposes.
   * @param user - User information for the operation.
   */
  private async batchLogHistory<T>(
    docs: T[],
    processFn: (batch: T[], user?: unknown) => Promise<void>,
    operationName = 'batch',
    user: unknown = null
  ): Promise<void> {
    const maxBatchLog = this.maxBatchLog;
    let processed = 0;
    let skipped = 0;
    let batch: T[] = [];

    for (const doc of docs) {
      if (processed >= maxBatchLog) {
        skipped++;
        continue;
      }

      batch.push(doc);
      processed++;

      if (batch.length >= this.batchSize) {
        await processFn(batch, user);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await processFn(batch, user);
    }

    if (skipped > 0) {
      this.logger.warn(
        `[ChangeLogPlugin:${operationName}] Skipped logging for ${skipped} documents (limit: ${maxBatchLog}) in model: ${this.modelName}`
      );
    }
  }

  /**
   * Create the pre-update hook for handling query-based update operations.
   * This hook intercepts updateOne, updateMany, and findOneAndUpdate operations.
   *
   * @returns The pre-update hook function.
   */
  createPreUpdateHook() {
    const self = this;

    return async function preUpdateHook(this: Query<unknown, unknown>, next: () => void) {
      let modelId: string | number | Types.ObjectId | undefined;

      try {
        const query = this;
        const model = query.model;
        const filter = query.getFilter();
        const update = query.getUpdate() as Record<string, unknown>;
        const options = query.getOptions() ?? {};
        const context = (options as { context?: Record<string, unknown> }).context ?? {};

        const trackedPaths = [...new Set(self.trackedFields.map((f) => f.value.split('.')[0]))];

        const originalDoc = (await model.findOne(filter).select(trackedPaths.join(' ')).lean()) as Record<
          string,
          unknown
        > | null;

        const updateFields = self.extractUpdateFields(update, originalDoc);

        let isSoftDelete = false;
        if (self.softDelete && updateFields && originalDoc) {
          const wasDeleted = getValueByPath(originalDoc, self.softDelete.field) === self.softDelete.value;
          const willBeDeleted =
            getValueByPath({ ...originalDoc, ...updateFields }, self.softDelete.field) === self.softDelete.value;
          if (!wasDeleted && willBeDeleted) {
            isSoftDelete = true;
          }
        }

        const updatedData = originalDoc ? { ...originalDoc, ...updateFields } : updateFields;

        modelId = getValueByPath(updatedData, self.modelKeyId) as string | number | Types.ObjectId;
        if (!modelId) {
          modelId = getValueByPath(filter, self.modelKeyId) as string | number | Types.ObjectId;
        }

        const user = self.extractUser({
          doc: updatedData,
          context,
          userField: self.userField,
        });

        if (!originalDoc && (options as { upsert?: boolean }).upsert) {
          await self.saveLogHistory({
            modelId: modelId!,
            changeType: 'create',
            user,
            updatedData,
          });
          return next();
        }

        if (isSoftDelete && originalDoc) {
          await self.saveLogHistory({
            modelId: modelId!,
            originalData: originalDoc,
            updatedData,
            changeType: 'delete',
            user,
          });
          return next();
        }

        if (originalDoc) {
          await self.saveLogHistory({
            modelId: modelId!,
            originalData: originalDoc,
            updatedData,
            changeType: 'update',
            user,
          });
        }
      } catch (err) {
        self.logger.error(
          err as Error,
          `[pluginLogHistory: preUpdateHook] Failed to write log history. Model: ${self.modelName}. ID: ${modelId}.`
        );
      } finally {
        next();
      }
    };
  }

  /**
   * Create the pre-save hook for handling document save operations.
   * This hook intercepts both create and update operations through document.save().
   *
   * @returns The pre-save hook function.
   */
  createPreSaveHook() {
    const self = this;

    return async function preSaveHook(this: Document, next: () => void) {
      let modelId: string | number | Types.ObjectId | undefined;

      try {
        const doc = this;
        const isNew = doc.isNew;

        const user = self.extractUser({
          doc: doc.toObject(),
          userField: self.userField,
        });

        const trackedPaths = [...new Set(self.trackedFields.map((f) => f.value.split('.')[0]))];
        modelId = getValueByPath(doc.toObject(), self.modelKeyId) as string | number | Types.ObjectId;

        if (isNew) {
          await self.saveLogHistory({
            modelId: modelId!,
            changeType: 'create',
            user,
            updatedData: doc.toObject(),
          });
        } else {
          const originalDoc = (await (doc.constructor as Model<Document>)
            .findById(doc._id)
            .select(trackedPaths.join(' '))
            .lean()) as Record<string, unknown> | null;

          if (!originalDoc) {
            return next();
          }

          let isSoftDelete = false;
          if (self.softDelete) {
            const wasDeleted = getValueByPath(originalDoc, self.softDelete.field) === self.softDelete.value;
            const willBeDeleted = getValueByPath(doc.toObject(), self.softDelete.field) === self.softDelete.value;
            if (!wasDeleted && willBeDeleted) {
              isSoftDelete = true;
            }
          }

          const changeType: ChangeType = isSoftDelete ? 'delete' : 'update';

          await self.saveLogHistory({
            modelId: modelId!,
            originalData: originalDoc,
            updatedData: doc.toObject(),
            changeType,
            user,
          });
        }
      } catch (err) {
        self.logger.error(
          err as Error,
          `[pluginLogHistory: preSaveHook] Failed to write log history. Model: ${self.modelName}. ID: ${modelId}.`
        );
      } finally {
        next();
      }
    };
  }

  /**
   * Create the pre-insertMany hook for handling bulk insert operations.
   * This hook processes multiple documents efficiently in batches.
   *
   * @returns The pre-insertMany hook function.
   */
  createPreInsertManyHook() {
    const self = this;

    return async function preInsertManyHook(this: Model<Document>, next: () => void, docs: Document[]) {
      try {
        await self.batchLogHistory(
          docs,
          async (batch: Document[]) => {
            const logEntryParams: BatchLogEntryParams[] = [];

            for (const doc of batch) {
              if (!doc._id) {
                (doc as Document & { _id: Types.ObjectId })._id = new mongoose.Types.ObjectId();
              }

              const modelId = getValueByPath(doc.toObject ? doc.toObject() : doc, self.modelKeyId) as
                | string
                | number
                | Types.ObjectId;
              const userData = self.extractUser({
                doc: doc.toObject ? doc.toObject() : doc,
                userField: self.userField,
              });

              logEntryParams.push({
                modelId: modelId!,
                changeType: 'create',
                updatedData: doc.toObject ? doc.toObject() : doc,
                user: userData,
              });
            }

            await self.saveLogHistoryBatch(logEntryParams);
          },
          'insertMany'
        );
      } catch (err) {
        self.logger.error(
          err as Error,
          `[pluginLogHistory: preInsertManyHook] Failed to write log history. Model: ${self.modelName}.`
        );
      } finally {
        next();
      }
    };
  }

  /**
   * Create the pre-delete hook for handling delete operations.
   * This hook intercepts deleteOne, deleteMany, and findOneAndDelete operations.
   *
   * @returns The pre-delete hook function.
   */
  createPreDeleteHook() {
    const self = this;

    return async function preDeleteHook(this: Query<unknown, unknown>, next: () => void) {
      try {
        const query = this;
        const model = query.model;
        const filter = query.getFilter();
        const options = query.getOptions() ?? {};
        const context = (options as { context?: Record<string, unknown> }).context ?? {};

        const docs = (await model.find(filter).lean()) as Record<string, unknown>[];

        await self.batchLogHistory(
          docs,
          async (batch: Record<string, unknown>[]) => {
            const logEntryParamsArray: BatchLogEntryParams[] = [];

            for (const doc of batch) {
              const modelId = getValueByPath(doc, self.modelKeyId) as string | number | Types.ObjectId;
              const userData = self.extractUser({
                doc,
                context,
                userField: self.userField,
              });

              logEntryParamsArray.push({
                modelId: modelId!,
                originalData: doc,
                changeType: 'delete',
                user: userData,
              });
            }

            await self.saveLogHistoryBatch(logEntryParamsArray);
          },
          'deleteMany'
        );
      } catch (err) {
        self.logger.error(
          err as Error,
          `[pluginLogHistory: preDeleteHook] Failed to write log history. Model: ${self.modelName}.`
        );
      } finally {
        next();
      }
    };
  }

  /**
   * Create the pre-updateMany hook for handling multi-document update operations.
   * Mirrors original JS implementation to log each affected document individually.
   */
  createPreUpdateManyHook() {
    const self = this;
    return async function preUpdateManyHook(this: Query<unknown, unknown>, next: () => void) {
      try {
        const query = this;
        const model = query.model as Model<Document>;
        const filter = query.getFilter();
        const update = query.getUpdate() as Record<string, unknown>;
        const options = query.getOptions() ?? {};
        const context = (options as { context?: Record<string, unknown> }).context ?? {};

        const trackedPaths = [...new Set(self.trackedFields.map((f) => f.value.split('.')[0]))];
        const originalDocs = (await model.find(filter).select(trackedPaths.join(' ')).lean()) as Record<
          string,
          unknown
        >[];

        await self.batchLogHistory(
          originalDocs,
          async (batch: Record<string, unknown>[]) => {
            const logEntryParams: BatchLogEntryParams[] = [];
            for (const originalDoc of batch) {
              if (!originalDoc) continue;
              const updateFields = self.extractUpdateFields(update, originalDoc);
              let isSoftDelete = false;
              if (self.softDelete && updateFields) {
                const wasDeleted = getValueByPath(originalDoc, self.softDelete.field) === self.softDelete.value;
                const willBeDeleted =
                  getValueByPath({ ...originalDoc, ...updateFields }, self.softDelete.field) === self.softDelete.value;
                if (!wasDeleted && willBeDeleted) {
                  isSoftDelete = true;
                }
              }
              const updatedData = { ...originalDoc, ...updateFields } as Record<string, unknown>;
              const modelId = (getValueByPath(updatedData, self.modelKeyId) ||
                getValueByPath(filter, self.modelKeyId)) as string | number | Types.ObjectId;
              const user = self.extractUser({ doc: updatedData, context, userField: self.userField });
              logEntryParams.push({
                modelId: modelId!,
                originalData: originalDoc,
                updatedData,
                changeType: isSoftDelete ? 'delete' : 'update',
                user,
              });
            }
            await self.saveLogHistoryBatch(logEntryParams);
          },
          'updateMany'
        );
      } catch (err) {
        (self.logger || console).error(
          err as Error,
          `[pluginLogHistory: preUpdateManyHook] Failed to write log history. Model: ${self.modelName}.`
        );
      } finally {
        next();
      }
    };
  }
}

/**
 * The main plugin function that can be used with Mongoose schemas.
 * This function creates a plugin instance and attaches all necessary hooks to the schema.
 *
 * @param schema - The Mongoose schema to apply the plugin to.
 * @param options - Plugin configuration options.
 */
export function changeLoggingPlugin(schema: mongoose.Schema, options: PluginOptions = {}) {
  if (!options.modelName) {
    throw new Error('Plugin option "modelName" is required');
  }

  const pluginInstance = new ChangeLogPlugin({ ...options, modelName: options.modelName });

  (schema.statics as Record<string, unknown>).getHistoriesById = async function (
    modelId: string | number | Types.ObjectId,
    fields?: unknown,
    findOptions?: unknown
  ): Promise<LogHistoryEntry[]> {
    const historyModel: LogHistoryModel = pluginInstance.getLogHistoryModelPlugin();
    const query: Record<string, unknown> = {
      model_id: isValidObjectId(modelId) ? new Types.ObjectId(modelId) : modelId,
      is_deleted: false,
    };
    if (pluginInstance.singleCollection) query.model = pluginInstance.modelName;

    const logs = (await historyModel.find(query, fields as any, findOptions as any).lean()) as LogHistoryEntry[];

    if (pluginInstance.compressDocs) {
      for (const log of logs) {
        if (log?.original_doc) {
          log.original_doc = decompressObject(log.original_doc as any);
        }
        if (log?.updated_doc) {
          log.updated_doc = decompressObject(log.updated_doc as any);
        }
      }
    }
    return logs;
  };

  const preUpdateHook = pluginInstance.createPreUpdateHook();
  const preUpdateManyHook = pluginInstance.createPreUpdateManyHook();
  const preSaveHook = pluginInstance.createPreSaveHook();
  const preInsertManyHook = pluginInstance.createPreInsertManyHook();
  const preDeleteHook = pluginInstance.createPreDeleteHook();

  schema.pre('updateOne', preUpdateHook);
  schema.pre('findOneAndUpdate', preUpdateHook);
  schema.pre('findOneAndReplace', preUpdateHook);
  schema.pre('replaceOne', preUpdateHook);

  (schema.pre as unknown as any)('update', preUpdateHook);
  schema.pre('updateMany', preUpdateManyHook);

  schema.pre('save', preSaveHook);
  schema.pre('insertMany', preInsertManyHook);

  schema.pre('findOneAndDelete', preDeleteHook);
  (schema.pre as unknown as any)('findByIdAndDelete', preDeleteHook);
  schema.pre('deleteOne', preDeleteHook);
  schema.pre('deleteMany', preDeleteHook);
  (schema.pre as unknown as any)('remove', preDeleteHook);
  (schema.pre as unknown as any)('delete', preDeleteHook);
}
