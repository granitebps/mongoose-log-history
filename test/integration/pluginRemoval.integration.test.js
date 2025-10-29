require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Plugin Removal', () => {
  let OrderWithPlugin, OrderWithoutPlugin, LogHistory;

  beforeAll(() => {
    const schemaWith = new mongoose.Schema({ status: String });
    schemaWith.plugin(changeLoggingPlugin, {
      modelName: 'OrderWithPlugin',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
    });
    delete mongoose.connection.models.OrderWithPlugin;
    OrderWithPlugin = mongoose.model('OrderWithPlugin', schemaWith);
    LogHistory = getLogHistoryModel('OrderWithPlugin', true);

    const schemaWithout = new mongoose.Schema({ status: String });
    delete mongoose.connection.models.OrderWithoutPlugin;
    OrderWithoutPlugin = mongoose.model('OrderWithoutPlugin', schemaWithout);
  });

  afterEach(async () => {
    await OrderWithPlugin.deleteMany({});
    await OrderWithoutPlugin.deleteMany({});
    await LogHistory.deleteMany({});
  });

  it('does not log for model without plugin', async () => {
    const order = await OrderWithoutPlugin.create({ status: 'pending' });
    order.status = 'done';
    await order.save();

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(0);
  });

  it('logs for model with plugin, but not for model without plugin', async () => {
    const orderWith = await OrderWithPlugin.create({ status: 'pending' });
    const orderWithout = await OrderWithoutPlugin.create({ status: 'pending' });

    orderWith.status = 'done';
    await orderWith.save();
    orderWithout.status = 'done';
    await orderWithout.save();

    const logsWith = await LogHistory.find({ model_id: orderWith._id }).lean();
    const logsWithout = await LogHistory.find({ model_id: orderWithout._id }).lean();

    expect(logsWith.length).toBeGreaterThan(0);
    expect(logsWithout.length).toBe(0);
  });

  it('does not log after switching to a model without the plugin', async () => {
    const schemaWith = new mongoose.Schema({ status: String }, { collection: 'orders_plugin_removal' });
    schemaWith.plugin(changeLoggingPlugin, {
      modelName: 'OrderWithPlugin',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
    });
    delete mongoose.connection.models.OrderWithPlugin;
    const OrderWithPlugin = mongoose.model('OrderWithPlugin', schemaWith);
    const LogHistory = getLogHistoryModel('OrderWithPlugin', true);

    const schemaNoPlugin = new mongoose.Schema({ status: String }, { collection: 'orders_plugin_removal' });
    delete mongoose.connection.models.OrderNoPlugin;
    const OrderNoPlugin = mongoose.model('OrderNoPlugin', schemaNoPlugin);

    const order = await OrderWithPlugin.create({ status: 'pending' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const orderNoPlugin = await OrderNoPlugin.findById(order._id);
    expect(orderNoPlugin).not.toBeNull();
    orderNoPlugin.status = 'done';
    await orderNoPlugin.save();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const logs = await LogHistory.find({ model_id: order._id }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].change_type).toBe('create');
  });
});
