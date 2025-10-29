require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Nested Field Tracking', () => {
  let Order;
  let LogHistory;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      customer: {
        name: String,
        address: {
          city: String,
          zip: String,
        },
      },
      items: [
        {
          sku: String,
          details: {
            color: String,
            size: String,
          },
          qty: Number,
        },
      ],
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'Order',
      trackedFields: [
        { value: 'customer.name' },
        { value: 'customer.address.city' },
        {
          value: 'items',
          arrayType: 'custom-key',
          arrayKey: 'sku',
          trackedFields: [{ value: 'details.color' }, { value: 'qty' }],
        },
      ],
      singleCollection: true,
    });

    Order = mongoose.model('Order', orderSchema);
    LogHistory = getLogHistoryModel('Order', true);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
  });

  it('logs edit for nested object field', async () => {
    const order = await Order.create({ customer: { name: 'Alice', address: { city: 'Jakarta', zip: '12345' } } });
    await LogHistory.deleteMany({});
    order.customer.name = 'Bob';
    order.customer.address.city = 'Bandung';
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.logs.some((l) => l.field_name === 'customer.name' && l.change_type === 'edit')).toBe(true);
    expect(log.logs.some((l) => l.field_name === 'customer.address.city' && l.change_type === 'edit')).toBe(true);
  });

  it('logs add and remove for nested object field', async () => {
    const order = await Order.create({});
    await LogHistory.deleteMany({});
    order.customer = { name: 'Alice', address: { city: 'Jakarta', zip: '12345' } };
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.logs.filter((l) => l.field_name === 'customer.name' && l.change_type === 'add').length).toBe(1);
    expect(log.logs.filter((l) => l.field_name === 'customer.address.city' && l.change_type === 'add').length).toBe(1);

    order.customer = undefined;
    await order.save();

    const logs2 = await LogHistory.find({ model_id: order._id, change_type: 'update' }).sort({ created_at: -1 }).lean();
    expect(logs2.length).toBeGreaterThanOrEqual(1);
    const log2 = logs2[0];
    expect(log2.logs.filter((l) => l.field_name === 'customer.name' && l.change_type === 'remove').length).toBe(1);
    expect(log2.logs.filter((l) => l.field_name === 'customer.address.city' && l.change_type === 'remove').length).toBe(
      1
    );
  });

  it('logs edit for nested field in array of objects', async () => {
    const order = await Order.create({
      items: [
        { sku: 'A', details: { color: 'red', size: 'M' }, qty: 1 },
        { sku: 'B', details: { color: 'blue', size: 'L' }, qty: 2 },
      ],
    });
    await LogHistory.deleteMany({});
    order.items = [
      { sku: 'A', details: { color: 'green', size: 'M' }, qty: 3 },
      { sku: 'B', details: { color: 'blue', size: 'L' }, qty: 2 },
    ];
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.logs.some((l) => l.field_name === 'items.details.color' && l.change_type === 'edit')).toBe(true);
    expect(log.logs.some((l) => l.field_name === 'items.qty' && l.change_type === 'edit')).toBe(true);
  });

  it('does not log when nested fields unchanged', async () => {
    const order = await Order.create({
      customer: { name: 'Alice', address: { city: 'Jakarta', zip: '12345' } },
      items: [{ sku: 'A', details: { color: 'red', size: 'M' }, qty: 1 }],
    });
    await LogHistory.deleteMany({});
    order.customer = { name: 'Alice', address: { city: 'Jakarta', zip: '12345' } };
    order.items = [{ sku: 'A', details: { color: 'red', size: 'M' }, qty: 1 }];
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(0);
  });

  it('handles null/undefined for nested fields', async () => {
    const order = await Order.create({
      customer: { name: 'Alice', address: { city: 'Jakarta', zip: '12345' } },
    });
    await LogHistory.deleteMany({});
    order.customer = null;
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.logs.some((l) => l.field_name === 'customer.name' && l.change_type === 'remove')).toBe(true);
    expect(log.logs.some((l) => l.field_name === 'customer.address.city' && l.change_type === 'remove')).toBe(true);
  });

  it('handles add/remove in nested array of objects', async () => {
    const order = await Order.create({
      items: [{ sku: 'A', details: { color: 'red', size: 'M' }, qty: 1 }],
    });
    await LogHistory.deleteMany({});
    order.items = [
      { sku: 'A', details: { color: 'red', size: 'M' }, qty: 1 },
      { sku: 'B', details: { color: 'blue', size: 'L' }, qty: 2 },
    ];
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.logs.filter((l) => l.change_type === 'add' && l.field_name === 'items').length).toBe(1);

    order.items = [{ sku: 'A', details: { color: 'red', size: 'M' }, qty: 1 }];
    await order.save();

    const logs2 = await LogHistory.find({ model_id: order._id, change_type: 'update' }).sort({ created_at: -1 }).lean();
    expect(logs2.length).toBeGreaterThanOrEqual(1);
    const log2 = logs2[0];
    expect(log2.logs.filter((l) => l.change_type === 'remove' && l.field_name === 'items').length).toBe(1);
  });
});
