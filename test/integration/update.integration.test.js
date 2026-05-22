require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Update Operation (all hooks and edge cases)', () => {
  let Order;
  let LogHistory;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      status: String,
      tags: [String],
      items: [
        {
          sku: String,
          qty: Number,
          price: Number,
        },
      ],
      created_by: {
        id: mongoose.Schema.Types.ObjectId,
        name: String,
        role: String,
      },
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'Order',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
    });

    Order = mongoose.model('Order', orderSchema);
    LogHistory = getLogHistoryModel('Order', true);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
  });

  it('logs update via save (doc update)', async () => {
    const order = await Order.create({ status: 'pending' });
    order.status = 'done';
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].field_name).toBe('status');
    expect(log.logs[0].from_value).toBe('pending');
    expect(log.logs[0].to_value).toBe('done');
    expect(log.logs[0].change_type).toBe('edit');
    expect(log.model).toBe('Order');
  });

  it('logs update via updateOne', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.updateOne({ _id: order._id }, { $set: { status: 'done' } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.logs[0].field_name).toBe('status');
    expect(log.logs[0].from_value).toBe('pending');
    expect(log.logs[0].to_value).toBe('done');
    expect(log.logs[0].change_type).toBe('edit');
    expect(log.model).toBe('Order');
  });

  it('logs update via updateOne with upsert (creates doc and logs create)', async () => {
    const upsertId = new mongoose.Types.ObjectId();
    await Order.updateOne({ _id: upsertId }, { $set: { status: 'upserted' } }, { upsert: true });

    const logs = await LogHistory.find({ model_id: upsertId }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].change_type).toBe('create');
    expect(logs[0].logs.length).toBe(0);
    expect(logs[0].model).toBe('Order');
  });

  it('logs update via findOneAndUpdate', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.findOneAndUpdate({ _id: order._id }, { $set: { status: 'done' } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.logs[0].field_name).toBe('status');
    expect(log.logs[0].from_value).toBe('pending');
    expect(log.logs[0].to_value).toBe('done');
    expect(log.logs[0].change_type).toBe('edit');
    expect(log.model).toBe('Order');
  });

  it('logs update via findOneAndUpdate with upsert (creates doc and logs create)', async () => {
    const upsertId = new mongoose.Types.ObjectId();
    await Order.findOneAndUpdate({ _id: upsertId }, { $set: { status: 'upserted' } }, { upsert: true });

    const logs = await LogHistory.find({ model_id: upsertId }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].change_type).toBe('create');
    expect(logs[0].logs.length).toBe(0);
    expect(logs[0].model).toBe('Order');
  });

  it('logs update via updateMany (multiple docs)', async () => {
    const order1 = await Order.create({ status: 'pending' });
    const order2 = await Order.create({ status: 'pending' });
    await Order.updateMany({}, { $set: { status: 'done' } });

    const logs1 = await LogHistory.find({ model_id: order1._id, change_type: 'update' }).lean();
    const logs2 = await LogHistory.find({ model_id: order2._id, change_type: 'update' }).lean();
    expect(logs1.length).toBe(1);
    expect(logs2.length).toBe(1);
    expect(logs1[0].logs[0].to_value).toBe('done');
    expect(logs2[0].logs[0].to_value).toBe('done');
    expect(logs1[0].model).toBe('Order');
    expect(logs2[0].model).toBe('Order');
  });

  it('logs update via replaceOne', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.replaceOne({ _id: order._id }, { status: 'done' });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.logs[0].field_name).toBe('status');
    expect(log.logs[0].from_value).toBe('pending');
    expect(log.logs[0].to_value).toBe('done');
    expect(log.logs[0].change_type).toBe('edit');
    expect(log.model).toBe('Order');
  });

  it('logs update via findOneAndReplace', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.findOneAndReplace({ _id: order._id }, { status: 'done' });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.logs[0].field_name).toBe('status');
    expect(log.logs[0].from_value).toBe('pending');
    expect(log.logs[0].to_value).toBe('done');
    expect(log.logs[0].change_type).toBe('edit');
    expect(log.model).toBe('Order');
  });

  it('does not log when updating to the same value (no-op)', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.updateOne({ _id: order._id }, { $set: { status: 'pending' } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(0);
  });

  it('does not log when updating untracked fields', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.updateOne({ _id: order._id }, { $set: { tags: ['a', 'b'] } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(0);
  });

  it('handles update with null/undefined values', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.updateOne({ _id: order._id }, { $set: { status: null } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs[0].to_value).toBe(null);
  });

  it('handles update with large value', async () => {
    const order = await Order.create({ status: 'pending' });
    const bigString = 'x'.repeat(10000);
    await Order.updateOne({ _id: order._id }, { $set: { status: bigString } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs[0].to_value).toBe(bigString);
  });

  it('handles update with missing/invalid input gracefully', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.updateOne({ _id: order._id }, {});

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(0);
  });
});
