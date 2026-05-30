const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - saveWholeDoc', () => {
  afterEach(async () => {
    for (const name of Object.keys(mongoose.models)) {
      if (name.startsWith('SaveWholeDoc')) mongoose.deleteModel(name);
      if (name.startsWith('LogHistory_SaveWholeDoc')) mongoose.deleteModel(name);
    }
  });

  it('preserves ObjectId fields as ObjectId instances in updated_doc on create', async () => {
    const orgId = new mongoose.Types.ObjectId();

    const schema = new mongoose.Schema({
      status: String,
      organisation: mongoose.Schema.Types.ObjectId,
    });

    schema.plugin(changeLoggingPlugin, {
      modelName: 'SaveWholeDocCreate',
      trackedFields: [{ value: 'status' }],
      saveWholeDoc: true,
    });

    const Order = mongoose.model('SaveWholeDocCreate', schema);
    const doc = await Order.create({ status: 'pending', organisation: orgId });

    const LogHistory = getLogHistoryModel('SaveWholeDocCreate');
    const createLog = await LogHistory.findOne({ model_id: doc._id, change_type: 'create' });

    expect(createLog).not.toBeNull();
    expect(createLog.updated_doc).not.toBeNull();

    // ObjectId fields must be proper ObjectId instances, not { buffer: { '0': ..., '1': ... } }
    expect(createLog.updated_doc._id instanceof mongoose.Types.ObjectId).toBe(true);
    expect(createLog.updated_doc.organisation instanceof mongoose.Types.ObjectId).toBe(true);
    expect(createLog.updated_doc.organisation.toHexString()).toBe(orgId.toHexString());
    // buffer must be a real Buffer instance, not a plain object with numeric keys
    expect(Buffer.isBuffer(createLog.updated_doc.organisation.buffer)).toBe(true);
  });

  it('preserves ObjectId fields in original_doc and updated_doc on save-based update', async () => {
    const orgId = new mongoose.Types.ObjectId();

    // Include organisation in trackedFields so it appears in the selective fetch
    const schema = new mongoose.Schema({
      status: String,
      organisation: mongoose.Schema.Types.ObjectId,
    });

    schema.plugin(changeLoggingPlugin, {
      modelName: 'SaveWholeDocUpdate',
      trackedFields: [{ value: 'status' }, { value: 'organisation' }],
      saveWholeDoc: true,
    });

    const Order = mongoose.model('SaveWholeDocUpdate', schema);
    const doc = await Order.create({ status: 'pending', organisation: orgId });

    doc.status = 'paid';
    await doc.save();

    const LogHistory = getLogHistoryModel('SaveWholeDocUpdate');
    const updateLog = await LogHistory.findOne({ model_id: doc._id, change_type: 'update' });

    expect(updateLog).not.toBeNull();
    expect(updateLog.original_doc).not.toBeNull();
    expect(updateLog.updated_doc).not.toBeNull();

    // ObjectId fields must be proper ObjectId instances, not { buffer: { '0': ..., '1': ... } }
    expect(updateLog.original_doc._id instanceof mongoose.Types.ObjectId).toBe(true);
    expect(updateLog.original_doc.organisation instanceof mongoose.Types.ObjectId).toBe(true);
    expect(updateLog.updated_doc._id instanceof mongoose.Types.ObjectId).toBe(true);
    expect(updateLog.updated_doc.organisation instanceof mongoose.Types.ObjectId).toBe(true);

    expect(updateLog.original_doc.organisation.toHexString()).toBe(orgId.toHexString());
    expect(updateLog.updated_doc.organisation.toHexString()).toBe(orgId.toHexString());

    // buffer must be a real Buffer instance, not a plain object with numeric keys
    expect(Buffer.isBuffer(updateLog.original_doc.organisation.buffer)).toBe(true);
    expect(Buffer.isBuffer(updateLog.updated_doc.organisation.buffer)).toBe(true);
  });
});
