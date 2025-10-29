require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Context Fields', () => {
  let Order;
  let LogHistory;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      status: String,
      user: {
        name: String,
        role: String,
      },
      items: [
        {
          sku: String,
          qty: Number,
          meta: {
            color: String,
          },
        },
      ],
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'Order',
      trackedFields: [
        {
          value: 'status',
          contextFields: ['user.name'],
        },
        {
          value: 'items',
          arrayType: 'custom-key',
          arrayKey: 'sku',
          contextFields: {
            doc: ['user.role'],
            item: ['sku', 'meta.color'],
          },
          trackedFields: [{ value: 'qty' }],
        },
      ],
      contextFields: ['user.name', 'user.role'],
      singleCollection: true,
    });

    Order = mongoose.model('Order', orderSchema);
    LogHistory = getLogHistoryModel('Order', true);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
  });

  it('includes global contextFields in log', async () => {
    const order = await Order.create({
      status: 'pending',
      user: { name: 'Alice', role: 'admin' },
    });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.context.doc.user.name).toBe('Alice');
    expect(log.context.doc.user.role).toBe('admin');
  });

  it('includes per-field contextFields (array) in log', async () => {
    const order = await Order.create({
      status: 'pending',
      user: { name: 'Bob', role: 'user' },
    });
    await LogHistory.deleteMany({});
    order.status = 'done';
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];

    const statusLog = log.logs.find((l) => l.field_name === 'status');
    expect(statusLog.context.doc.user.name).toBe('Bob');
  });

  it('includes per-field contextFields (object: doc and item) in log for array of objects', async () => {
    const order = await Order.create({
      user: { name: 'Charlie', role: 'manager' },
      items: [{ sku: 'A', qty: 1, meta: { color: 'red' } }],
    });
    await LogHistory.deleteMany({});
    order.items = [{ sku: 'A', qty: 2, meta: { color: 'blue' } }];
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];

    const qtyLog = log.logs.find((l) => l.field_name === 'items.qty');
    expect(qtyLog.context.doc.user.role).toBe('manager');
    expect(qtyLog.context.item.sku).toBe('A');
    expect(qtyLog.context.item.meta.color).toBe('blue');
  });

  it('handles missing context fields gracefully', async () => {
    const order = await Order.create({
      status: 'pending',
    });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.context).toBeUndefined();
  });

  it('handles null/undefined context fields', async () => {
    const order = await Order.create({
      status: 'pending',
      user: { name: null, role: undefined },
    });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.context).toBeUndefined();
  });

  it('handles contextFields for array items with missing item fields', async () => {
    const order = await Order.create({
      user: { name: 'Diana', role: 'staff' },
      items: [{ sku: 'B', qty: 1 }],
    });
    await LogHistory.deleteMany({});
    order.items = [{ sku: 'B', qty: 2 }];
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    const qtyLog = log.logs.find((l) => l.field_name === 'items.qty');
    expect(qtyLog.context.doc.user.role).toBe('staff');

    if (qtyLog.context.item.meta) {
      expect(qtyLog.context.item.meta.color).toBeUndefined();
    } else {
      expect(qtyLog.context.item.meta).toBeUndefined();
    }
  });
});
