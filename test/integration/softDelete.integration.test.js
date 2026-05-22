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

describe('mongoose-log-history plugin - Soft Delete (softDelete.field not in trackedFields)', () => {
  let Item;
  let LogHistoryItem;

  beforeAll(() => {
    const itemSchema = new mongoose.Schema({
      name: String,
      is_deleted: { type: Boolean, default: false },
    });

    itemSchema.plugin(changeLoggingPlugin, {
      modelName: 'ItemSoftDeleteSeparate',
      trackedFields: [{ value: 'name' }],
      singleCollection: true,
      softDelete: {
        field: 'is_deleted',
        value: true,
      },
    });

    Item = mongoose.model('ItemSoftDeleteSeparate', itemSchema);
    LogHistoryItem = getLogHistoryModel('ItemSoftDeleteSeparate', true);
  });

  afterEach(async () => {
    await Item.deleteMany({});
    await LogHistoryItem.deleteMany({});
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 100));

  it('logs delete (not update) when softDelete.field is outside trackedFields via updateOne', async () => {
    const item = await Item.create({ name: 'Widget', is_deleted: false });
    await LogHistoryItem.deleteMany({});

    await Item.updateOne({ _id: item._id }, { $set: { is_deleted: true } });
    await wait();

    const deleteLogs = await LogHistoryItem.find({ model_id: item._id, change_type: 'delete' }).lean();
    const updateLogs = await LogHistoryItem.find({ model_id: item._id, change_type: 'update' }).lean();

    expect(deleteLogs.length).toBe(1);
    expect(updateLogs.length).toBe(0);
  });
});
