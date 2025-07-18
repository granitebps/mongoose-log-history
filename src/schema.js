'use strict';

const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  field_name: String,
  from_value: String,
  to_value: String,
  change_type: {
    type: String,
    enum: ['add', 'edit', 'remove'],
    default: 'edit',
  },
  context: mongoose.Schema.Types.Mixed,
});

const logHistorySchema = new mongoose.Schema(
  {
    model: { type: String, required: true },
    model_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    change_type: {
      type: String,
      enum: ['create', 'delete', 'update'],
      default: 'update',
      required: true,
    },
    logs: { type: [logSchema], default: [] },
    created_by: mongoose.Schema.Types.Mixed,
    context: mongoose.Schema.Types.Mixed,
    original_doc: mongoose.Schema.Types.Mixed,
    updated_doc: mongoose.Schema.Types.Mixed,
    is_deleted: { type: Boolean, default: false },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false,
    },
  }
);

logHistorySchema.index({ model: 1, model_id: 1, is_deleted: 1, created_at: -1 });

/**
 * Get the log history Mongoose model for a given model name.
 * @param {string} modelName - The model name.
 * @param {boolean} [singleCollection=false] - Use single collection or per-model.
 * @returns {mongoose.Model} The log history model.
 */
function getLogHistoryModel(modelName, singleCollection = false) {
  const collectionName = singleCollection ? 'log_histories' : `log_histories_${modelName}`;
  const modelKey = singleCollection ? 'LogHistory' : `LogHistory_${modelName}`;
  if (mongoose.models[modelKey]) {
    return mongoose.models[modelKey];
  }
  return mongoose.model(modelKey, logHistorySchema, collectionName);
}

module.exports = { logSchema, logHistorySchema, getLogHistoryModel };
