import { getLogHistoryModel } from './schema';
import { parseHumanTime } from './utils';
import { Connection, Types } from 'mongoose';

/**
 * Options for pruning log history entries.
 */
export interface PruneOptions {
  modelName?: string;
  singleCollection?: boolean;
  before?: Date | string | number;
  keepLast?: number;
  modelId?: string | number | Types.ObjectId | unknown;
  logConnection?: Connection;
}

/**
 * Prune log history entries based on various criteria.
 * This function helps manage storage by removing old or excessive log entries.
 *
 * @param options - Pruning configuration options.
 * @returns Number of deleted documents.
 */
export async function pruneLogHistory({
  modelName,
  singleCollection = false,
  before,
  keepLast,
  modelId,
  logConnection,
}: PruneOptions): Promise<number> {
  const LogHistory = getLogHistoryModel(modelName as string, singleCollection, logConnection);

  const query: Record<string, unknown> = {};
  if (before) {
    const beforeDate = parseHumanTime(before);
    if (beforeDate) query.created_at = { $lt: beforeDate };
  }
  if (modelId) {
    query.model_id = modelId;
  }

  if (keepLast) {
    const ids = modelId ? [modelId] : await LogHistory.distinct('model_id', query);
    let totalDeleted = 0;
    for (const id of ids) {
      const docs = await LogHistory.find({ ...query, model_id: id })
        .sort({ created_at: -1 })
        .skip(keepLast)
        .select('_id');
      if (docs.length) {
        const res = await LogHistory.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
        totalDeleted += res.deletedCount || 0;
      }
    }
    return totalDeleted;
  } else {
    const res = await LogHistory.deleteMany(query);
    return res.deletedCount || 0;
  }
}
