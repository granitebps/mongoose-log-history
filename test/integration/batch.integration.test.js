require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Batch Operations', () => {
  let Order;
  let LogHistory;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      status: String,
      tags: [String],
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'Order',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
      maxBatchLog: 5,
      batchSize: 2,
    });

    Order = mongoose.model('Order', orderSchema);
    LogHistory = getLogHistoryModel('Order', true);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
  });

  it('logs create for each doc in insertMany', async () => {
    const docs = [{ status: 'a' }, { status: 'b' }, { status: 'c' }];
    const inserted = await Order.insertMany(docs);

    for (const doc of inserted) {
      const logs = await LogHistory.find({ model_id: doc._id, change_type: 'create' }).lean();
      expect(logs.length).toBe(1);
      expect(logs[0].logs.length).toBe(0);
    }
  });

  it('logs update for each doc in updateMany', async () => {
    const orders = await Order.insertMany([{ status: 'a' }, { status: 'a' }, { status: 'b' }]);
    await LogHistory.deleteMany({});
    await Order.updateMany({ status: 'a' }, { $set: { status: 'z' } });

    for (const order of orders.filter((o) => o.status === 'a')) {
      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs.length).toBe(1);
      expect(logs[0].logs[0].field_name).toBe('status');
      expect(logs[0].logs[0].to_value).toBe('z');
    }

    const logsB = await LogHistory.find({ model_id: orders[2]._id, change_type: 'update' }).lean();
    expect(logsB.length).toBe(0);
  });

  it('logs delete for each doc in deleteMany', async () => {
    const orders = await Order.insertMany([{ status: 'a' }, { status: 'a' }, { status: 'b' }]);
    await LogHistory.deleteMany({});
    await Order.deleteMany({ status: 'a' });

    for (const order of orders.filter((o) => o.status === 'a')) {
      const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
      expect(logs.length).toBe(1);
      expect(logs[0].logs.length).toBe(0);
    }

    const logsB = await LogHistory.find({ model_id: orders[2]._id, change_type: 'delete' }).lean();
    expect(logsB.length).toBe(0);
  });

  it('does not log for empty insertMany', async () => {
    const inserted = await Order.insertMany([]);

    expect(inserted.length).toBe(0);
    const logs = await LogHistory.find({ change_type: 'create' }).lean();
    expect(logs.length).toBe(0);
  });

  it('respects maxBatchLog limit in updateMany', async () => {
    await Order.insertMany([
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
    ]);
    await LogHistory.deleteMany({});
    await Order.updateMany({}, { $set: { status: 'z' } });

    const logs = await LogHistory.find({ change_type: 'update' }).lean();
    expect(logs.length).toBe(5);
  });

  it('respects batchSize in batch processing', async () => {
    await Order.insertMany([{ status: 'a' }, { status: 'a' }, { status: 'a' }, { status: 'a' }]);
    await LogHistory.deleteMany({});
    await Order.updateMany({}, { $set: { status: 'z' } });

    const logs = await LogHistory.find({ change_type: 'update' }).lean();
    expect(logs.length).toBe(4);
  });

  it('handles duplicate _id in insertMany gracefully', async () => {
    const id = new mongoose.Types.ObjectId();
    await Order.insertMany([{ _id: id, status: 'a' }]);

    await expect(Order.insertMany([{ _id: id, status: 'b' }])).rejects.toThrow();

    const logs = await LogHistory.find({ model_id: id, change_type: 'create' }).lean();
    expect(logs.length).toBe(2);
  });

  it('handles missing fields in insertMany', async () => {
    const [order] = await Order.insertMany([{}]);

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
  });

  it('handles no matching docs in updateMany/deleteMany', async () => {
    await Order.insertMany([{ status: 'a' }]);
    await LogHistory.deleteMany({});
    await Order.updateMany({ status: 'notfound' }, { $set: { status: 'z' } });
    await Order.deleteMany({ status: 'notfound' });

    const logs = await LogHistory.find({ change_type: { $in: ['update', 'delete'] } }).lean();
    expect(logs.length).toBe(0);
  });
});
