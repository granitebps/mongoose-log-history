require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel, pruneLogHistory } = require('../../dist');

describe('mongoose-log-history plugin - Pruning Utility', () => {
  let Order;
  let LogHistory;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      status: String,
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'OrderPrune',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
    });

    Order = mongoose.model('OrderPrune', orderSchema);
    LogHistory = getLogHistoryModel('OrderPrune', true);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
  });

  it('prunes logs older than a given date', async () => {
    const order = await Order.create({ status: 'pending' });

    const oldLog = await LogHistory.findOne({ model_id: order._id });
    const db = mongoose.connection.db;
    await db
      .collection('log_histories')
      .updateOne({ _id: oldLog._id }, { $set: { created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });

    order.status = 'done';
    await order.save();

    const deleted = await pruneLogHistory({
      modelName: 'OrderPrune',
      singleCollection: true,
      before: '1d',
    });
    expect(deleted).toBe(1);

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].change_type).toBe('update');
  });

  it('prunes logs by keepLast per model_id', async () => {
    const order = await Order.create({ status: 'pending' });
    for (let i = 0; i < 5; i++) {
      order.status = `status${i}`;
      await order.save();
    }
    let logs = await LogHistory.find({ model_id: order._id }).sort({ created_at: 1 }).lean();
    expect(logs.length).toBe(6);

    const deleted = await pruneLogHistory({
      modelName: 'OrderPrune',
      singleCollection: true,
      keepLast: 2,
    });
    expect(deleted).toBe(4);

    logs = await LogHistory.find({ model_id: order._id }).sort({ created_at: 1 }).lean();
    expect(logs.length).toBe(2);
    expect(logs[0].change_type).toBe('update');
    expect(logs[1].change_type).toBe('update');
  });

  it('prunes logs for a specific modelId', async () => {
    const order1 = await Order.create({ status: 'pending' });
    const order2 = await Order.create({ status: 'pending' });

    order1.status = 'done';
    await order1.save();
    order2.status = 'done';
    await order2.save();

    const deleted = await pruneLogHistory({
      modelName: 'OrderPrune',
      singleCollection: true,
      modelId: order1._id,
    });
    expect(deleted).toBeGreaterThan(0);

    const logs1 = await LogHistory.find({ model_id: order1._id }).lean();
    const logs2 = await LogHistory.find({ model_id: order2._id }).lean();
    expect(logs1.length).toBe(0);
    expect(logs2.length).toBeGreaterThan(0);
  });

  it('does nothing if there are no logs to prune', async () => {
    const deleted = await pruneLogHistory({
      modelName: 'OrderPrune',
      singleCollection: true,
      before: '1d',
    });
    expect(deleted).toBe(0);
  });

  it('prunes all logs if before is far in the future', async () => {
    const order = await Order.create({ status: 'pending' });
    order.status = 'done';
    await order.save();

    const deleted = await pruneLogHistory({
      modelName: 'OrderPrune',
      singleCollection: true,
      before: '0s',
    });
    expect(deleted).toBeGreaterThan(0);

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(0);
  });
});
