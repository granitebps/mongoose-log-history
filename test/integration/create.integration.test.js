require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Create Operation (all hooks and edge cases)', () => {
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

  it('logs create via save (document hook)', async () => {
    const order = new Order({ status: 'pending' });
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.change_type).toBe('create');
    expect(Array.isArray(log.logs)).toBe(true);
    expect(log.logs.length).toBe(0);
    expect(log.model).toBe('Order');
  });

  it('logs create via insertMany (plain object)', async () => {
    const [order] = await Order.insertMany([{ status: 'pending' }]);

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.change_type).toBe('create');
    expect(log.logs.length).toBe(0);
    expect(log.model).toBe('Order');
  });

  it('logs create via insertMany (Mongoose document)', async () => {
    const doc = new Order({ status: 'pending' });
    const [order] = await Order.insertMany([doc]);

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].change_type).toBe('create');
    expect(logs[0].logs.length).toBe(0);
    expect(logs[0].model).toBe('Order');
  });

  it('logs create with explicit _id', async () => {
    const customId = new mongoose.Types.ObjectId();
    await Order.insertMany([{ _id: customId, status: 'pending' }]);

    const logs = await LogHistory.find({ model_id: customId }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].model_id.toString()).toBe(customId.toString());
    expect(logs[0].model).toBe('Order');
  });

  it('does not log create for untracked fields', async () => {
    const schema = new mongoose.Schema({ foo: String });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'NoTrack',
      trackedFields: [],
      singleCollection: true,
    });
    const NoTrack = mongoose.model('NoTrack', schema);
    const LogHistoryNoTrack = getLogHistoryModel('NoTrack', true);

    const doc = new NoTrack({ foo: 'bar' });
    await doc.save();

    const logs = await LogHistoryNoTrack.find({ model_id: doc._id }).lean();

    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
  });

  it('handles missing/invalid input gracefully', async () => {
    const order = new Order({});
    await expect(order.save()).resolves.toBeDefined();

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
  });

  it('logs create with extra/unexpected fields', async () => {
    const [order] = await Order.insertMany([{ status: 'pending', foo: 'bar', bar: 123 }]);

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
  });

  it('logs create with null/undefined values', async () => {
    const [order] = await Order.insertMany([{ status: null }]);

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
  });

  it('logs create with large document', async () => {
    const bigString = 'x'.repeat(10000);
    const [order] = await Order.insertMany([{ status: bigString }]);

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.length).toBe(0);
  });
});
