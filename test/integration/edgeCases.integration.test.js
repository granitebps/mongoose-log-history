require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Edge Cases', () => {
  let Order;
  let LogHistory;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      status: String,
      tags: [String],
      nested: {
        foo: String,
        bar: Number,
      },
      data: String,
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'OrderEdge',
      trackedFields: [{ value: 'status' }, { value: 'tags', arrayType: 'simple' }, { value: 'nested.foo' }],
      singleCollection: true,
    });

    Order = mongoose.model('OrderEdge', orderSchema);
    LogHistory = getLogHistoryModel('OrderEdge', true);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
  });

  it('does not log if no tracked fields are configured', async () => {
    const schema = new mongoose.Schema({ foo: String });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'NoTrackedFields',
      trackedFields: [],
      singleCollection: true,
    });
    delete mongoose.connection.models.NoTrackedFields;
    const NoTrackedFields = mongoose.model('NoTrackedFields', schema);
    const LogHistoryNoTracked = getLogHistoryModel('NoTrackedFields', true);

    const doc = await NoTrackedFields.create({ foo: 'bar' });

    doc.foo = 'baz';
    await doc.save();

    const logs = await LogHistoryNoTracked.find({ model_id: doc._id }).lean();

    expect(logs.length).toBe(1);
    expect(logs[0].change_type).toBe('create');
  });

  it('does not log for empty update', async () => {
    const order = await Order.create({ status: 'pending' });
    await LogHistory.deleteMany({});
    await Order.updateOne({ _id: order._id }, {});

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(0);
  });

  it('handles null/undefined values gracefully', async () => {
    const order = await Order.create({ status: null, tags: undefined });

    order.status = 'active';
    order.tags = ['a'];
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.some((l) => l.field_name === 'status' && l.change_type === 'add')).toBe(true);
    expect(logs[0].logs.some((l) => l.field_name === 'tags' && l.change_type === 'add')).toBe(true);

    order.status = null;
    order.tags = undefined;
    await order.save();

    const logs2 = await LogHistory.find({ model_id: order._id, change_type: 'update' }).sort({ created_at: -1 }).lean();
    expect(logs2.length).toBeGreaterThanOrEqual(1);
    expect(logs2[0].logs.some((l) => l.field_name === 'status' && l.change_type === 'remove')).toBe(true);
    expect(logs2[0].logs.some((l) => l.field_name === 'tags' && l.change_type === 'remove')).toBe(true);
  });

  it('handles large documents', async () => {
    const bigString = 'x'.repeat(100000);
    const order = await Order.create({ status: 'pending', data: bigString });

    order.status = 'done';
    order.data = `${bigString}y`;
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(2);
    expect(logs[1].logs[0].field_name).toBe('status');
    expect(logs[1].logs[0].from_value).toBe('pending');
    expect(logs[1].logs[0].to_value).toBe('done');
  });

  it('does not log for repeated updates with no changes', async () => {
    const order = await Order.create({ status: 'pending' });
    await LogHistory.deleteMany({});
    for (let i = 0; i < 3; i++) {
      order.status = 'pending';
      await order.save();
    }
    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(0);
  });

  it('does not log for updates with only untracked fields', async () => {
    const order = await Order.create({ status: 'pending', tags: ['a'] });
    await LogHistory.deleteMany({});
    order.nested = { foo: 'bar', bar: 42 };
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();

    expect(logs.length).toBe(1);
    expect(logs[0].logs.some((l) => l.field_name === 'nested.foo')).toBe(true);

    order.nested.bar = 99;
    await order.save();

    const logs2 = await LogHistory.find({ model_id: order._id, change_type: 'update' }).sort({ created_at: -1 }).lean();

    expect(logs2.length).toBe(1);
  });

  it('handles deeply nested missing fields gracefully', async () => {
    const order = await Order.create({});

    order.nested = { foo: 'deep' };
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.some((l) => l.field_name === 'nested.foo' && l.change_type === 'add')).toBe(true);
  });

  it('handles empty arrays', async () => {
    const order = await Order.create({ tags: [] });

    order.tags = ['a'];
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].logs.some((l) => l.field_name === 'tags' && l.change_type === 'add')).toBe(true);

    order.tags = [];
    await order.save();

    const logs2 = await LogHistory.find({ model_id: order._id, change_type: 'update' }).sort({ created_at: -1 }).lean();
    expect(logs2.length).toBeGreaterThanOrEqual(1);
    expect(logs2[0].logs.some((l) => l.field_name === 'tags' && l.change_type === 'remove')).toBe(true);
  });
});
