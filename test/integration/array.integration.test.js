require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Array Field Tracking', () => {
  let Order;
  let LogHistory;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      tags: [String],
      items: [
        {
          sku: String,
          qty: Number,
          price: Number,
        },
      ],
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'Order',
      trackedFields: [
        { value: 'tags', arrayType: 'simple' },
        {
          value: 'items',
          arrayType: 'custom-key',
          arrayKey: 'sku',
          valueField: 'qty',
          trackedFields: [{ value: 'qty' }, { value: 'price' }],
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

  describe('Simple array (arrayType: simple)', () => {
    it('logs add and remove in simple array', async () => {
      const order = await Order.create({ tags: ['a', 'b'] });
      await LogHistory.deleteMany({});
      order.tags = ['b', 'c'];
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs.length).toBe(1);
      const log = logs[0];

      expect(log.logs.length).toBe(2);
      expect(log.logs.some((l) => l.change_type === 'add' && l.to_value === 'c')).toBe(true);
      expect(log.logs.some((l) => l.change_type === 'remove' && l.from_value === 'a')).toBe(true);
    });

    it('logs add when array grows', async () => {
      const order = await Order.create({ tags: ['a'] });
      await LogHistory.deleteMany({});
      order.tags = ['a', 'b'];
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs[0].logs.some((l) => l.change_type === 'add' && l.to_value === 'b')).toBe(true);
    });

    it('logs remove when array shrinks', async () => {
      const order = await Order.create({ tags: ['a', 'b'] });
      await LogHistory.deleteMany({});
      order.tags = ['a'];
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs[0].logs.some((l) => l.change_type === 'remove' && l.from_value === 'b')).toBe(true);
    });

    it('does not log when array unchanged', async () => {
      const order = await Order.create({ tags: ['a', 'b'] });
      await LogHistory.deleteMany({});
      order.tags = ['a', 'b'];
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs.length).toBe(0);
    });

    it('handles empty arrays and null/undefined', async () => {
      const order = await Order.create({ tags: [] });
      await LogHistory.deleteMany({});
      order.tags = null;
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs.length).toBe(0);
    });
  });

  describe('Custom-key array (arrayType: custom-key)', () => {
    it('logs add, remove, and edit in array of objects', async () => {
      const order = await Order.create({
        items: [
          { sku: 'A', qty: 1, price: 10 },
          { sku: 'B', qty: 2, price: 20 },
        ],
      });
      await LogHistory.deleteMany({});
      order.items = [
        { sku: 'A', qty: 3, price: 10 },
        { sku: 'C', qty: 4, price: 40 },
      ];
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs.length).toBe(1);
      const log = logs[0];

      expect(log.logs.some((l) => l.change_type === 'remove' && l.field_name === 'items')).toBe(true);
      expect(log.logs.some((l) => l.change_type === 'add' && l.field_name === 'items')).toBe(true);
      expect(log.logs.some((l) => l.change_type === 'edit' && l.field_name === 'items.qty')).toBe(true);
    });

    it('logs add when new object is added', async () => {
      const order = await Order.create({
        items: [{ sku: 'A', qty: 1, price: 10 }],
      });
      await LogHistory.deleteMany({});
      order.items = [
        { sku: 'A', qty: 1, price: 10 },
        { sku: 'B', qty: 2, price: 20 },
      ];
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs[0].logs.some((l) => l.change_type === 'add' && l.field_name === 'items')).toBe(true);
    });

    it('logs remove when object is removed', async () => {
      const order = await Order.create({
        items: [
          { sku: 'A', qty: 1, price: 10 },
          { sku: 'B', qty: 2, price: 20 },
        ],
      });
      await LogHistory.deleteMany({});
      order.items = [{ sku: 'A', qty: 1, price: 10 }];
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs[0].logs.some((l) => l.change_type === 'remove' && l.field_name === 'items')).toBe(true);
    });

    it('logs edit for nested fields in object', async () => {
      const order = await Order.create({
        items: [{ sku: 'A', qty: 1, price: 10 }],
      });
      await LogHistory.deleteMany({});
      order.items = [{ sku: 'A', qty: 2, price: 15 }];
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs[0].logs.some((l) => l.field_name === 'items.qty' && l.change_type === 'edit')).toBe(true);
      expect(logs[0].logs.some((l) => l.field_name === 'items.price' && l.change_type === 'edit')).toBe(true);
    });

    it('does not log when array of objects unchanged', async () => {
      const order = await Order.create({
        items: [{ sku: 'A', qty: 1, price: 10 }],
      });
      await LogHistory.deleteMany({});
      order.items = [{ sku: 'A', qty: 1, price: 10 }];
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs.length).toBe(0);
    });

    it('handles empty arrays and null/undefined', async () => {
      const order = await Order.create({ items: [] });
      await LogHistory.deleteMany({});
      order.items = null;
      await order.save();

      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs.length).toBe(0);
    });
  });
});
