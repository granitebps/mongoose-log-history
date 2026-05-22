require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Model ID Types (string, number, ObjectId)', () => {
  afterEach(async () => {
    // Clean up all models created during tests
    const modelNames = Object.keys(mongoose.connection.models);
    for (const modelName of modelNames) {
      if (modelName.includes('IdType')) {
        await mongoose.connection.models[modelName].deleteMany({});
        delete mongoose.connection.models[modelName];
      }
    }
  });

  describe('String ID Type', () => {
    it('should log changes with string _id', async () => {
      const schema = new mongoose.Schema({
        _id: String,
        status: String,
        name: String,
      });

      schema.plugin(changeLoggingPlugin, {
        modelName: 'StringIdTypeModel',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });

      const Model = mongoose.model('StringIdTypeModel', schema);
      const LogHistory = getLogHistoryModel('StringIdTypeModel', true);

      // Create document with string ID
      const stringId = 'user-12345';
      const doc = await Model.create({ _id: stringId, status: 'pending', name: 'Test' });

      // Verify create log
      let logs = await LogHistory.find({ model_id: stringId }).lean();
      expect(logs.length).toBe(1);
      expect(logs[0].model_id).toBe(stringId);
      expect(logs[0].change_type).toBe('create');

      // Update document
      doc.status = 'completed';
      await doc.save();

      // Verify update log
      logs = await LogHistory.find({ model_id: stringId }).lean();
      expect(logs.length).toBe(2);
      const updateLog = logs.find((log) => log.change_type === 'update');
      expect(updateLog).toBeDefined();
      expect(updateLog.model_id).toBe(stringId);
      expect(updateLog.logs.length).toBe(1);
      expect(updateLog.logs[0].field_name).toBe('status');
      expect(updateLog.logs[0].from_value).toBe('pending');
      expect(updateLog.logs[0].to_value).toBe('completed');
    });

    it('should handle bulk operations with string IDs', async () => {
      const schema = new mongoose.Schema({
        _id: String,
        status: String,
      });

      schema.plugin(changeLoggingPlugin, {
        modelName: 'StringIdTypeBulk',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });

      const Model = mongoose.model('StringIdTypeBulk', schema);
      const LogHistory = getLogHistoryModel('StringIdTypeBulk', true);

      // Bulk insert
      const docs = [
        { _id: 'doc-001', status: 'pending' },
        { _id: 'doc-002', status: 'pending' },
        { _id: 'doc-003', status: 'pending' },
      ];
      await Model.insertMany(docs);

      // Verify all logs created
      const logs = await LogHistory.find({}).lean();
      expect(logs.length).toBe(3);
      expect(logs.every((log) => typeof log.model_id === 'string')).toBe(true);
      expect(logs.map((log) => log.model_id).sort()).toEqual(['doc-001', 'doc-002', 'doc-003']);
    });

    it('should handle updateMany with string IDs', async () => {
      const schema = new mongoose.Schema({
        _id: String,
        status: String,
        category: String,
      });

      schema.plugin(changeLoggingPlugin, {
        modelName: 'StringIdTypeUpdateMany',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });

      const Model = mongoose.model('StringIdTypeUpdateMany', schema);
      const LogHistory = getLogHistoryModel('StringIdTypeUpdateMany', true);

      // Create docs
      await Model.insertMany([
        { _id: 'item-1', status: 'pending', category: 'A' },
        { _id: 'item-2', status: 'pending', category: 'A' },
      ]);
      await LogHistory.deleteMany({});

      // Update many
      await Model.updateMany({ category: 'A' }, { $set: { status: 'approved' } });

      const logs = await LogHistory.find({ change_type: 'update' }).lean();
      expect(logs.length).toBe(2);
      expect(logs.every((log) => typeof log.model_id === 'string')).toBe(true);
    });
  });

  describe('Number ID Type', () => {
    it('should log changes with number _id', async () => {
      const schema = new mongoose.Schema({
        _id: Number,
        status: String,
        name: String,
      });

      schema.plugin(changeLoggingPlugin, {
        modelName: 'NumberIdTypeModel',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });

      const Model = mongoose.model('NumberIdTypeModel', schema);
      const LogHistory = getLogHistoryModel('NumberIdTypeModel', true);

      // Create document with number ID
      const numberId = 12345;
      const doc = await Model.create({ _id: numberId, status: 'pending', name: 'Test' });

      // Verify create log
      let logs = await LogHistory.find({ model_id: numberId }).lean();
      expect(logs.length).toBe(1);
      expect(logs[0].model_id).toBe(numberId);
      expect(logs[0].change_type).toBe('create');

      // Update document
      doc.status = 'completed';
      await doc.save();

      // Verify update log
      logs = await LogHistory.find({ model_id: numberId }).lean();
      expect(logs.length).toBe(2);
      const updateLog = logs.find((log) => log.change_type === 'update');
      expect(updateLog).toBeDefined();
      expect(updateLog.model_id).toBe(numberId);
      expect(updateLog.logs.length).toBe(1);
      expect(updateLog.logs[0].field_name).toBe('status');
      expect(updateLog.logs[0].from_value).toBe('pending');
      expect(updateLog.logs[0].to_value).toBe('completed');
    });

    it('should handle bulk operations with number IDs', async () => {
      const schema = new mongoose.Schema({
        _id: Number,
        status: String,
      });

      schema.plugin(changeLoggingPlugin, {
        modelName: 'NumberIdTypeBulk',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });

      const Model = mongoose.model('NumberIdTypeBulk', schema);
      const LogHistory = getLogHistoryModel('NumberIdTypeBulk', true);

      // Bulk insert
      const docs = [
        { _id: 1001, status: 'pending' },
        { _id: 1002, status: 'pending' },
        { _id: 1003, status: 'pending' },
      ];
      await Model.insertMany(docs);

      // Verify all logs created
      const logs = await LogHistory.find({}).lean();
      expect(logs.length).toBe(3);
      expect(logs.every((log) => typeof log.model_id === 'number')).toBe(true);
      expect(logs.map((log) => log.model_id).sort()).toEqual([1001, 1002, 1003]);
    });

    it('should handle deleteMany with number IDs', async () => {
      const schema = new mongoose.Schema({
        _id: Number,
        status: String,
      });

      schema.plugin(changeLoggingPlugin, {
        modelName: 'NumberIdTypeDelete',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });

      const Model = mongoose.model('NumberIdTypeDelete', schema);
      const LogHistory = getLogHistoryModel('NumberIdTypeDelete', true);

      // Create docs
      await Model.insertMany([
        { _id: 2001, status: 'pending' },
        { _id: 2002, status: 'pending' },
      ]);
      await LogHistory.deleteMany({});

      // Delete docs
      await Model.deleteMany({ _id: { $in: [2001, 2002] } });

      const logs = await LogHistory.find({ change_type: 'delete' }).lean();
      expect(logs.length).toBe(2);
      expect(logs.every((log) => typeof log.model_id === 'number')).toBe(true);
      expect(logs.map((log) => log.model_id).sort()).toEqual([2001, 2002]);
    });
  });

  describe('ObjectId Type (default)', () => {
    it('should log changes with ObjectId _id (default)', async () => {
      const schema = new mongoose.Schema({
        status: String,
        name: String,
      });

      schema.plugin(changeLoggingPlugin, {
        modelName: 'ObjectIdTypeModel',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });

      const Model = mongoose.model('ObjectIdTypeModel', schema);
      const LogHistory = getLogHistoryModel('ObjectIdTypeModel', true);

      // Create document with default ObjectId
      const doc = await Model.create({ status: 'pending', name: 'Test' });

      const objectId = doc._id;

      // Verify create log
      let logs = await LogHistory.find({ model_id: objectId }).lean();
      expect(logs.length).toBe(1);
      expect(logs[0].model_id.toString()).toBe(objectId.toString());
      expect(logs[0].change_type).toBe('create');

      // Update document
      doc.status = 'completed';
      await doc.save();

      // Verify update log
      logs = await LogHistory.find({ model_id: objectId }).lean();
      expect(logs.length).toBe(2);
      const updateLog = logs.find((log) => log.change_type === 'update');
      expect(updateLog).toBeDefined();
      expect(updateLog.model_id.toString()).toBe(objectId.toString());
      expect(updateLog.logs.length).toBe(1);
      expect(updateLog.logs[0].field_name).toBe('status');
    });

    it('should handle explicit ObjectId creation', async () => {
      const schema = new mongoose.Schema({
        status: String,
      });

      schema.plugin(changeLoggingPlugin, {
        modelName: 'ObjectIdTypeExplicit',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });

      const Model = mongoose.model('ObjectIdTypeExplicit', schema);
      const LogHistory = getLogHistoryModel('ObjectIdTypeExplicit', true);

      // Create with explicit ObjectId
      const customObjectId = new mongoose.Types.ObjectId();
      await Model.create({ _id: customObjectId, status: 'pending' });

      const logs = await LogHistory.find({ model_id: customObjectId }).lean();
      expect(logs.length).toBe(1);
      expect(logs[0].model_id.toString()).toBe(customObjectId.toString());
    });
  });

  describe('Custom modelKeyId with different ID types', () => {
    it('should use custom modelKeyId with string type', async () => {
      const schema = new mongoose.Schema({
        customId: String,
        status: String,
      });

      schema.plugin(changeLoggingPlugin, {
        modelName: 'CustomKeyString',
        modelKeyId: 'customId',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });

      const Model = mongoose.model('CustomKeyString', schema);
      const LogHistory = getLogHistoryModel('CustomKeyString', true);

      const doc = await Model.create({ customId: 'custom-123', status: 'pending' });

      const logs = await LogHistory.find({ model_id: 'custom-123' }).lean();
      expect(logs.length).toBe(1);
      expect(logs[0].model_id).toBe('custom-123');
    });

    it('should use custom modelKeyId with number type', async () => {
      const schema = new mongoose.Schema({
        customId: Number,
        status: String,
      });

      schema.plugin(changeLoggingPlugin, {
        modelName: 'CustomKeyNumber',
        modelKeyId: 'customId',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });

      const Model = mongoose.model('CustomKeyNumber', schema);
      const LogHistory = getLogHistoryModel('CustomKeyNumber', true);

      const doc = await Model.create({ customId: 999, status: 'pending' });

      const logs = await LogHistory.find({ model_id: 999 }).lean();
      expect(logs.length).toBe(1);
      expect(logs[0].model_id).toBe(999);
    });
  });

  describe('Mixed ID types in single collection mode', () => {
    it('should handle different models with different ID types in single collection', async () => {
      // Model with string ID
      const stringSchema = new mongoose.Schema({
        _id: String,
        status: String,
      });
      stringSchema.plugin(changeLoggingPlugin, {
        modelName: 'MixedStringModel',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });
      const StringModel = mongoose.model('MixedStringModel', stringSchema);

      // Model with number ID
      const numberSchema = new mongoose.Schema({
        _id: Number,
        status: String,
      });
      numberSchema.plugin(changeLoggingPlugin, {
        modelName: 'MixedNumberModel',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });
      const NumberModel = mongoose.model('MixedNumberModel', numberSchema);

      // Model with ObjectId (default)
      const objectIdSchema = new mongoose.Schema({
        status: String,
      });
      objectIdSchema.plugin(changeLoggingPlugin, {
        modelName: 'MixedObjectIdModel',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
      });
      const ObjectIdModel = mongoose.model('MixedObjectIdModel', objectIdSchema);

      const LogHistory = getLogHistoryModel('MixedStringModel', true);

      // Create documents with different ID types
      const stringDoc = await StringModel.create({ _id: 'str-001', status: 'pending' });
      const numberDoc = await NumberModel.create({ _id: 5000, status: 'pending' });
      const objectIdDoc = await ObjectIdModel.create({ status: 'pending' });

      // Verify all logs are in the same collection
      const allLogs = await LogHistory.find({}).lean();
      expect(allLogs.length).toBeGreaterThanOrEqual(3);

      // Verify each model's logs with correct ID types
      const stringLogs = await LogHistory.find({ model: 'MixedStringModel' }).lean();
      expect(stringLogs.length).toBe(1);
      expect(typeof stringLogs[0].model_id).toBe('string');
      expect(stringLogs[0].model_id).toBe('str-001');

      const numberLogs = await LogHistory.find({ model: 'MixedNumberModel' }).lean();
      expect(numberLogs.length).toBe(1);
      expect(typeof numberLogs[0].model_id).toBe('number');
      expect(numberLogs[0].model_id).toBe(5000);

      const objectIdLogs = await LogHistory.find({ model: 'MixedObjectIdModel' }).lean();
      expect(objectIdLogs.length).toBe(1);
      expect(objectIdLogs[0].model_id.toString()).toBe(objectIdDoc._id.toString());
    });
  });
});
