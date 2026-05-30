const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { changeLoggingPlugin, getLogHistoryModel, pruneLogHistory } = require('../../dist');

describe('mongoose-log-history plugin - Log Connection', () => {
  let logMongoServer;

  beforeAll(async () => {
    logMongoServer = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    await logMongoServer.stop();
  });

  it('returns log history model bound to provided logConnection', async () => {
    const logConn = await mongoose.createConnection(logMongoServer.getUri()).asPromise();

    try {
      const LogHistory = getLogHistoryModel('OrderHelperLogConn', false, logConn);

      expect(LogHistory.db === logConn).toBe(true);
      expect(logConn.models.LogHistory_OrderHelperLogConn).toBe(LogHistory);
      expect(mongoose.models.LogHistory_OrderHelperLogConn).toBeUndefined();
    } finally {
      await logConn.close();
      await logConn.deleteModel(/LogHistory_OrderHelperLogConn/);
    }
  });

  it('falls back to default connection when logConnection is omitted', async () => {
    const logConn = await mongoose.createConnection(logMongoServer.getUri()).asPromise();

    try {
      const orderSchema = new mongoose.Schema({
        status: String,
      });

      orderSchema.plugin(changeLoggingPlugin, {
        modelName: 'OrderDefaultLogConn',
        trackedFields: [{ value: 'status' }],
      });

      const Order = mongoose.model('OrderDefaultLogConn', orderSchema);
      const doc = await Order.create({ status: 'pending' });
      await Order.updateOne({ _id: doc._id }, { status: 'paid' });

      const defaultLogs = await getLogHistoryModel('OrderDefaultLogConn').find({ model_id: doc._id });
      const defaultLogModel = mongoose.connection.models.LogHistory_OrderDefaultLogConn;
      const histories = await Order.getHistoriesById(doc._id);
      const customLogs = await getLogHistoryModel('OrderDefaultLogConn', false, logConn).find({ model_id: doc._id });
      const updateLog = defaultLogs.find((log) => log.change_type === 'update');
      const historyUpdateLog = histories.find((log) => log.change_type === 'update');

      expect(defaultLogs).toHaveLength(2);
      expect(updateLog).toBeDefined();
      expect(updateLog.logs).toHaveLength(1);
      expect(updateLog.logs[0]).toMatchObject({
        field_name: 'status',
        from_value: 'pending',
        to_value: 'paid',
      });
      expect(histories).toHaveLength(2);
      expect(historyUpdateLog).toBeDefined();
      expect(historyUpdateLog.logs).toHaveLength(1);
      expect(historyUpdateLog.logs[0]).toMatchObject({
        field_name: 'status',
        from_value: 'pending',
        to_value: 'paid',
      });
      expect(customLogs).toHaveLength(0);
      expect(defaultLogModel).toBeDefined();
      expect(defaultLogModel.db === mongoose.connection).toBe(true);
    } finally {
      await mongoose.deleteModel(/OrderDefaultLogConn/);
      await mongoose.deleteModel(/LogHistory_OrderDefaultLogConn/);
      await logConn.deleteModel(/LogHistory_OrderDefaultLogConn/);
      await logConn.close();
    }
  });

  it('rejects invalid logConnection in helper', () => {
    expect(() => {
      getLogHistoryModel('OrderHelperInvalidLogConn', false, {});
    }).toThrow('[mongoose-log-history] "logConnection" must be a valid Mongoose connection.');
  });

  it('isolates same model name across default and custom log connections', async () => {
    const logConn = await mongoose.createConnection(logMongoServer.getUri()).asPromise();

    try {
      const defaultLogHistory = getLogHistoryModel('OrderSharedLogConn');
      const customLogHistory = getLogHistoryModel('OrderSharedLogConn', false, logConn);

      expect(defaultLogHistory).not.toBe(customLogHistory);
      expect(defaultLogHistory.db === mongoose.connection).toBe(true);
      expect(customLogHistory.db === logConn).toBe(true);
      expect(mongoose.models.LogHistory_OrderSharedLogConn).toBe(defaultLogHistory);
      expect(logConn.models.LogHistory_OrderSharedLogConn).toBe(customLogHistory);
    } finally {
      await logConn.close();
      await mongoose.deleteModel(/LogHistory_OrderSharedLogConn/);
      await logConn.deleteModel(/LogHistory_OrderSharedLogConn/);
    }
  });

  it('writes and prunes single-collection log history using a provided logConnection', async () => {
    const logConn = await mongoose.createConnection(logMongoServer.getUri()).asPromise();

    try {
      const orderSchema = new mongoose.Schema({
        status: String,
      });

      orderSchema.plugin(changeLoggingPlugin, {
        modelName: 'OrderSingleCollectionLogConn',
        trackedFields: [{ value: 'status' }],
        singleCollection: true,
        logConnection: logConn,
      });

      const Order = mongoose.model('OrderSingleCollectionLogConn', orderSchema);
      const doc = await Order.create({ status: 'pending' });
      await Order.updateOne({ _id: doc._id }, { status: 'paid' });

      const defaultLogs = await getLogHistoryModel('OrderSingleCollectionLogConn', true).find({
        model: 'OrderSingleCollectionLogConn',
        model_id: doc._id,
      });
      const customLogs = await getLogHistoryModel('OrderSingleCollectionLogConn', true, logConn).find({
        model: 'OrderSingleCollectionLogConn',
        model_id: doc._id,
      });
      const histories = await Order.getHistoriesById(doc._id);
      const customUpdateLog = customLogs.find((log) => log.change_type === 'update');
      const historyUpdateLog = histories.find((log) => log.change_type === 'update');

      expect(customLogs).toHaveLength(2);
      expect(customUpdateLog).toBeDefined();
      expect(customUpdateLog.logs).toHaveLength(1);
      expect(customUpdateLog.logs[0]).toMatchObject({
        field_name: 'status',
        from_value: 'pending',
        to_value: 'paid',
      });
      expect(defaultLogs).toHaveLength(0);
      expect(histories).toHaveLength(2);
      expect(historyUpdateLog).toBeDefined();
      expect(historyUpdateLog.logs).toHaveLength(1);
      expect(historyUpdateLog.logs[0]).toMatchObject({
        field_name: 'status',
        from_value: 'pending',
        to_value: 'paid',
      });

      const deletedCount = await pruneLogHistory({
        singleCollection: true,
        logConnection: logConn,
      });
      const prunedCustomLogs = await getLogHistoryModel('OrderSingleCollectionLogConn', true, logConn).find({
        model: 'OrderSingleCollectionLogConn',
        model_id: doc._id,
      });

      expect(deletedCount).toBe(2);
      expect(prunedCustomLogs).toHaveLength(0);
    } finally {
      await mongoose.deleteModel(/OrderSingleCollectionLogConn/);
      await mongoose.deleteModel('LogHistory');
      await logConn.deleteModel('LogHistory');
      await logConn.close();
    }
  });

  it('writes log history using a provided logConnection', async () => {
    const logConn = await mongoose.createConnection(logMongoServer.getUri()).asPromise();

    try {
      const orderSchema = new mongoose.Schema({
        status: String,
      });

      orderSchema.plugin(changeLoggingPlugin, {
        modelName: 'OrderLogConn',
        trackedFields: [{ value: 'status' }],
        logConnection: logConn,
      });

      const Order = mongoose.model('OrderLogConn', orderSchema);
      const doc = await Order.create({ status: 'pending' });
      await Order.updateOne({ _id: doc._id }, { status: 'paid' });

      const defaultLogs = await getLogHistoryModel('OrderLogConn').find({ model_id: doc._id });
      const customLogs = await getLogHistoryModel('OrderLogConn', false, logConn).find({ model_id: doc._id });
      const histories = await Order.getHistoriesById(doc._id);
      const customUpdateLog = customLogs.find((log) => log.change_type === 'update');
      const historyUpdateLog = histories.find((log) => log.change_type === 'update');

      expect(customLogs).toHaveLength(2);
      expect(customUpdateLog).toBeDefined();
      expect(customUpdateLog.logs).toHaveLength(1);
      expect(customUpdateLog.logs[0]).toMatchObject({
        field_name: 'status',
        from_value: 'pending',
        to_value: 'paid',
      });
      expect(histories).toHaveLength(2);
      expect(historyUpdateLog).toBeDefined();
      expect(historyUpdateLog.logs).toHaveLength(1);
      expect(historyUpdateLog.logs[0]).toMatchObject({
        field_name: 'status',
        from_value: 'pending',
        to_value: 'paid',
      });
      expect(defaultLogs).toHaveLength(0);
    } finally {
      await mongoose.deleteModel(/OrderLogConn/);
      await mongoose.deleteModel(/LogHistory_OrderLogConn/);
      await logConn.deleteModel(/LogHistory_OrderLogConn/);
      await logConn.close();
    }
  });

  it('prunes log history using a provided logConnection', async () => {
    const logConn = await mongoose.createConnection(logMongoServer.getUri()).asPromise();

    try {
      const orderSchema = new mongoose.Schema({
        status: String,
      });

      orderSchema.plugin(changeLoggingPlugin, {
        modelName: 'OrderPruneLogConn',
        trackedFields: [{ value: 'status' }],
        logConnection: logConn,
      });

      const Order = mongoose.model('OrderPruneLogConn', orderSchema);
      const doc = await Order.create({ status: 'pending' });
      await Order.updateOne({ _id: doc._id }, { status: 'paid' });

      const deletedCount = await pruneLogHistory({
        modelName: 'OrderPruneLogConn',
        modelId: doc._id,
        logConnection: logConn,
      });

      const defaultLogs = await getLogHistoryModel('OrderPruneLogConn').find({ model_id: doc._id });
      const customLogs = await getLogHistoryModel('OrderPruneLogConn', false, logConn).find({ model_id: doc._id });

      expect(deletedCount).toBe(2);
      expect(customLogs).toHaveLength(0);
      expect(defaultLogs).toHaveLength(0);
    } finally {
      await mongoose.deleteModel(/OrderPruneLogConn/);
      await mongoose.deleteModel(/LogHistory_OrderPruneLogConn/);
      await logConn.deleteModel(/LogHistory_OrderPruneLogConn/);
      await logConn.close();
    }
  });

  it('rejects invalid logConnection during plugin setup', () => {
    const orderSchema = new mongoose.Schema({ status: String });

    expect(() => {
      orderSchema.plugin(changeLoggingPlugin, {
        modelName: 'OrderInvalidLogConn',
        trackedFields: [{ value: 'status' }],
        logConnection: {},
      });
    }).toThrow('[mongoose-log-history] "logConnection" must be a valid Mongoose connection.');
  });
});
