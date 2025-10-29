require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Delete Operation (all hooks and edge cases)', () => {
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

  it('logs delete via deleteOne (query)', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.deleteOne({ _id: order._id });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
    expect(logs[0].model).toBe('Order');
  });

  it('logs delete via deleteMany (multiple docs)', async () => {
    const order1 = await Order.create({ status: 'pending' });
    const order2 = await Order.create({ status: 'pending' });
    await Order.deleteMany({ status: 'pending' });

    const logs1 = await LogHistory.find({ model_id: order1._id, change_type: 'delete' }).lean();
    const logs2 = await LogHistory.find({ model_id: order2._id, change_type: 'delete' }).lean();
    expect(logs1.length).toBe(1);
    expect(logs2.length).toBe(1);
    expect(logs1[0].logs.length).toBe(0);
    expect(logs2[0].logs.length).toBe(0);
    expect(logs1[0].model).toBe('Order');
    expect(logs2[0].model).toBe('Order');
  });

  it('logs delete via findOneAndDelete', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.findOneAndDelete({ _id: order._id });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
    expect(logs[0].model).toBe('Order');
  });

  it('logs delete via findByIdAndDelete', async () => {
    const order = await Order.create({ status: 'pending' });
    await Order.findByIdAndDelete(order._id);

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
    expect(logs[0].model).toBe('Order');
  });

  it('logs delete via deleteOne (doc instance)', async () => {
    const order = await Order.create({ status: 'pending' });
    await order.deleteOne();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
    expect(logs[0].model).toBe('Order');
  });

  it('does not log delete for non-existent document', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    await Order.deleteOne({ _id: fakeId });

    const logs = await LogHistory.find({ model_id: fakeId, change_type: 'delete' }).lean();
    expect(logs.length).toBe(0);
  });

  it('does not log delete for untracked fields', async () => {
    const schema = new mongoose.Schema({ foo: String });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'NoTrackDelete',
      trackedFields: [],
      singleCollection: true,
    });
    const NoTrackDelete = mongoose.model('NoTrackDelete', schema);
    const LogHistoryNoTrack = getLogHistoryModel('NoTrackDelete', true);

    const doc = await NoTrackDelete.create({ foo: 'bar' });
    await doc.deleteOne();

    const logs = await LogHistoryNoTrack.find({ model_id: doc._id, change_type: 'delete' }).lean();

    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
  });

  it('handles delete with missing/invalid input gracefully', async () => {
    await Order.deleteMany({});

    const logs = await LogHistory.find({ change_type: 'delete' }).lean();

    expect(logs.length).toBe(0);
  });

  it('logs delete for large document', async () => {
    const bigString = 'x'.repeat(10000);
    const order = await Order.create({ status: bigString });
    await order.deleteOne();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
  });
});
