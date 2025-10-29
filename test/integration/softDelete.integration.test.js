require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Soft Delete', () => {
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
      softDelete: {
        field: 'status',
        value: 'deleted',
      },
      maxBatchLog: 5,
    });

    Order = mongoose.model('Order', orderSchema);
    LogHistory = getLogHistoryModel('Order', true);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
  });

  it('logs delete when soft delete field is set via updateOne', async () => {
    const order = await Order.create({ status: 'active' });
    await Order.updateOne({ _id: order._id }, { $set: { status: 'deleted' } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].model).toBe('Order');
  });

  it('logs delete when soft delete field is set via findOneAndUpdate', async () => {
    const order = await Order.create({ status: 'active' });
    await Order.findOneAndUpdate({ _id: order._id }, { $set: { status: 'deleted' } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(1);
  });

  it('logs delete when soft delete field is set via updateMany', async () => {
    const orders = await Order.insertMany([{ status: 'active' }, { status: 'active' }]);
    await LogHistory.deleteMany({});
    await Order.updateMany({}, { $set: { status: 'deleted' } });

    for (const order of orders) {
      const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
      expect(logs.length).toBe(1);
    }
  });

  it('logs delete when soft delete field is set via save', async () => {
    const order = await Order.create({ status: 'active' });
    order.status = 'deleted';
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(1);
  });

  it('logs delete when soft delete field is set via replaceOne', async () => {
    const order = await Order.create({ status: 'active' });
    await Order.replaceOne({ _id: order._id }, { status: 'deleted' });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(1);
  });

  it('logs delete when soft delete field is set via findOneAndReplace', async () => {
    const order = await Order.create({ status: 'active' });
    await Order.findOneAndReplace({ _id: order._id }, { status: 'deleted' });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(1);
  });

  it('does not log delete if soft delete field is set to a different value', async () => {
    const order = await Order.create({ status: 'active' });
    await Order.updateOne({ _id: order._id }, { $set: { status: 'archived' } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(0);
  });

  it('does not log delete if soft delete field is missing', async () => {
    const order = await Order.create({ status: 'active' });
    await Order.updateOne({ _id: order._id }, { $unset: { status: '' } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(0);
  });

  it('does not log delete if already deleted', async () => {
    const order = await Order.create({ status: 'deleted' });
    await Order.updateOne({ _id: order._id }, { $set: { status: 'deleted' } });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'delete' }).lean();
    expect(logs.length).toBe(0);
  });

  it('logs delete for multiple docs in updateMany (batch limit)', async () => {
    await Order.insertMany([
      { status: 'active' },
      { status: 'active' },
      { status: 'active' },
      { status: 'active' },
      { status: 'active' },
      { status: 'active' },
    ]);
    await LogHistory.deleteMany({});
    await Order.updateMany({}, { $set: { status: 'deleted' } });

    const logs = await LogHistory.find({ change_type: 'delete' }).lean();
    expect(logs.length).toBe(5);
  });
});
