require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Masked Values', () => {
  let Order;
  let LogHistory;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      name: String,
      tags: [String],
      subdoc: {
        secret: String,
        plain: String,
      },
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'Order',
      trackedFields: [
        { value: 'name', maskedValue: '***' },
        { value: 'subdoc.secret', maskedValue: (s) => '@'.repeat(s.length) },
      ],
      singleCollection: true,
      saveWholeDoc: true,
      maxBatchLog: 5,
    });

    Order = mongoose.model('Order', orderSchema);
    LogHistory = getLogHistoryModel('Order', true);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
  });

  const wait = () => new Promise((resolve) => setTimeout(resolve, 100));

  it('logs masked value via create', async () => {
    const order = await Order.create({ name: 'John Doe' });
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(0);
    expect(log.original_doc).toBe(null);
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.name).toBe('***');
  });

  it('logs nested masked value via create', async () => {
    const order = await Order.create({ subdoc: { secret: 'secret', plain: 'plain' } });
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(0);
    expect(log.original_doc).toBe(null);
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.subdoc.secret).toBe('@@@@@@');
    expect(log.updated_doc.subdoc.plain).toBe('plain');
  });

  it('logs masked value via updateOne', async () => {
    const order = await Order.create({ name: 'John Doe' });
    await Order.updateOne({ _id: order._id }, { $set: { name: 'Jane Doe' } });
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].from_value).toBe('***');
    expect(log.logs[0].to_value).toBe('***');
    expect(log.original_doc).toBeDefined();
    expect(log.original_doc.name).toBe('***');
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.name).toBe('***');
  });

  it('logs nested masked value via updateOne', async () => {
    const order = await Order.create({ subdoc: { secret: 'secret', plain: 'plain' } });
    await Order.updateOne({ _id: order._id }, { $set: { subdoc: { secret: 'new_secret', plain: 'new_plain' } } });
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].from_value).toBe('@@@@@@');
    expect(log.logs[0].to_value).toBe('@@@@@@@@@@');
    expect(log.original_doc).toBeDefined();
    expect(log.original_doc.subdoc.secret).toBe('@@@@@@');
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.subdoc.secret).toBe('@@@@@@@@@@');
  });

  it('logs masked value via findOneAndUpdate', async () => {
    const order = await Order.create({ name: 'John Doe' });
    await Order.findOneAndUpdate({ _id: order._id }, { $set: { name: 'Jane Doe' } });
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].from_value).toBe('***');
    expect(log.logs[0].to_value).toBe('***');
    expect(log.original_doc).toBeDefined();
    expect(log.original_doc.name).toBe('***');
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.name).toBe('***');
  });

  it('logs nested masked value via findOneAndUpdate', async () => {
    const order = await Order.create({ subdoc: { secret: 'secret', plain: 'plain' } });
    await Order.findOneAndUpdate(
      { _id: order._id },
      { $set: { subdoc: { secret: 'new_secret', plain: 'new_plain' } } }
    );
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].from_value).toBe('@@@@@@');
    expect(log.logs[0].to_value).toBe('@@@@@@@@@@');
    expect(log.original_doc).toBeDefined();
    expect(log.original_doc.subdoc.secret).toBe('@@@@@@');
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.subdoc.secret).toBe('@@@@@@@@@@');
  });

  it('logs masked value via updateMany', async () => {
    const orders = await Order.insertMany([{ name: 'John Doe' }, { name: 'John Doe' }]);
    await LogHistory.deleteMany({});
    await Order.updateMany({}, { $set: { name: 'Jane Doe' } });
    await wait();

    for (const order of orders) {
      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs.length).toBe(1);
      const log = logs[0];
      expect(log.model).toBe('Order');
      expect(log.logs.length).toBe(1);
      expect(log.logs[0].from_value).toBe('***');
      expect(log.logs[0].to_value).toBe('***');
      expect(log.original_doc).toBeDefined();
      expect(log.original_doc.name).toBe('***');
      expect(log.updated_doc).toBeDefined();
      expect(log.updated_doc.name).toBe('***');
    }
  });

  it('logs nested masked value via updateMany', async () => {
    const orders = await Order.insertMany([
      { subdoc: { secret: 'secret', plain: 'plain' } },
      { subdoc: { secret: 'secret', plain: 'plain' } },
    ]);
    await LogHistory.deleteMany({});
    await Order.updateMany({}, { $set: { subdoc: { secret: 'new_secret', plain: 'new_plain' } } });
    await wait();

    for (const order of orders) {
      const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
      expect(logs.length).toBe(1);
      const log = logs[0];
      expect(log.model).toBe('Order');
      expect(log.logs.length).toBe(1);
      expect(log.logs[0].from_value).toBe('@@@@@@');
      expect(log.logs[0].to_value).toBe('@@@@@@@@@@');
      expect(log.original_doc).toBeDefined();
      expect(log.original_doc.subdoc.secret).toBe('@@@@@@');
      expect(log.updated_doc).toBeDefined();
      expect(log.updated_doc.subdoc.secret).toBe('@@@@@@@@@@');
    }
  });

  it('logs masked value when field is set via save', async () => {
    const order = await Order.create({ name: 'John Doe' });
    order.name = 'Judy Doe';
    await order.save();
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].from_value).toBe('***');
    expect(log.logs[0].to_value).toBe('***');
    expect(log.original_doc).toBeDefined();
    expect(log.original_doc.name).toBe('***');
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.name).toBe('***');
  });

  it('logs nested masked value when field is set via save', async () => {
    const order = await Order.create({ subdoc: { secret: 'secret', plain: 'plain' } });
    order.subdoc.secret = 'new_secret';
    order.subdoc.plain = 'new_plain';
    await order.save();
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].from_value).toBe('@@@@@@');
    expect(log.logs[0].to_value).toBe('@@@@@@@@@@');
    expect(log.original_doc).toBeDefined();
    expect(log.original_doc.subdoc.secret).toBe('@@@@@@');
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.subdoc.secret).toBe('@@@@@@@@@@');
  });

  it('logs masked value when field is set via replaceOne', async () => {
    const order = await Order.create({ name: 'John Doe' });
    await Order.replaceOne({ _id: order._id }, { name: 'Jane Doe' });
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].from_value).toBe('***');
    expect(log.logs[0].to_value).toBe('***');
    expect(log.original_doc).toBeDefined();
    expect(log.original_doc.name).toBe('***');
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.name).toBe('***');
  });

  it('logs nested masked value when field is set via replaceOne', async () => {
    const order = await Order.create({ subdoc: { secret: 'secret', plain: 'plain' } });
    await Order.replaceOne({ _id: order._id }, { subdoc: { secret: 'new_secret', plain: 'new_plain' } });
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].from_value).toBe('@@@@@@');
    expect(log.logs[0].to_value).toBe('@@@@@@@@@@');
    expect(log.original_doc).toBeDefined();
    expect(log.original_doc.subdoc.secret).toBe('@@@@@@');
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.subdoc.secret).toBe('@@@@@@@@@@');
  });

  it('logs masked value when field is set via findOneAndReplace', async () => {
    const order = await Order.create({ name: 'John Doe' });
    await Order.findOneAndReplace({ _id: order._id }, { name: 'Jane Doe' });
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].from_value).toBe('***');
    expect(log.logs[0].to_value).toBe('***');
    expect(log.original_doc).toBeDefined();
    expect(log.original_doc.name).toBe('***');
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.name).toBe('***');
  });

  it('logs nested masked value when field is set via findOneAndReplace', async () => {
    const order = await Order.create({ subdoc: { secret: 'secret', plain: 'plain' } });
    await Order.findOneAndReplace({ _id: order._id }, { subdoc: { secret: 'new_secret', plain: 'new_plain' } });
    await wait();

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.model).toBe('Order');
    expect(log.logs.length).toBe(1);
    expect(log.logs[0].from_value).toBe('@@@@@@');
    expect(log.logs[0].to_value).toBe('@@@@@@@@@@');
    expect(log.original_doc).toBeDefined();
    expect(log.original_doc.subdoc.secret).toBe('@@@@@@');
    expect(log.updated_doc).toBeDefined();
    expect(log.updated_doc.subdoc.secret).toBe('@@@@@@@@@@');
  });

  it('logs masked values for multiple docs in updateMany (batch limit)', async () => {
    await Order.insertMany([
      { name: 'John Doe' },
      { name: 'John Doe' },
      { name: 'John Doe' },
      { name: 'John Doe' },
      { name: 'John Doe' },
      { name: 'John Doe' },
    ]);
    await LogHistory.deleteMany({});
    await Order.updateMany({}, { $set: { name: 'Jane Doe' } });
    await wait();

    const logs = await LogHistory.find({ change_type: 'update' }).lean();
    expect(logs.length).toBe(5);

    for (const log of logs) {
      expect(log.model).toBe('Order');
      expect(log.logs.length).toBe(1);
      expect(log.logs[0].from_value).toBe('***');
      expect(log.logs[0].to_value).toBe('***');
      expect(log.original_doc).toBeDefined();
      expect(log.original_doc.name).toBe('***');
      expect(log.updated_doc).toBeDefined();
      expect(log.updated_doc.name).toBe('***');
    }
  });

  it('logs nested masked values for multiple docs in updateMany (batch limit)', async () => {
    await Order.insertMany([
      { subdoc: { secret: 'secret', plain: 'plain' } },
      { subdoc: { secret: 'secret', plain: 'plain' } },
      { subdoc: { secret: 'secret', plain: 'plain' } },
      { subdoc: { secret: 'secret', plain: 'plain' } },
      { subdoc: { secret: 'secret', plain: 'plain' } },
      { subdoc: { secret: 'secret', plain: 'plain' } },
    ]);
    await LogHistory.deleteMany({});
    await Order.updateMany({}, { $set: { subdoc: { secret: 'new_secret', plain: 'new_plain' } } });
    await wait();

    const logs = await LogHistory.find({ change_type: 'update' }).lean();
    expect(logs.length).toBe(5);

    for (const log of logs) {
      expect(log.model).toBe('Order');
      expect(log.logs.length).toBe(1);
      expect(log.logs[0].from_value).toBe('@@@@@@');
      expect(log.logs[0].to_value).toBe('@@@@@@@@@@');
      expect(log.original_doc).toBeDefined();
      expect(log.original_doc.subdoc.secret).toBe('@@@@@@');
      expect(log.updated_doc).toBeDefined();
      expect(log.updated_doc.subdoc.secret).toBe('@@@@@@@@@@');
    }
  });
});
