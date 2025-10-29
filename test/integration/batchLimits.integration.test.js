require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Batch Size and Max Batch Log', () => {
  let Order;
  let LogHistory;
  let warnSpy;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      status: String,
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'Order',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
      maxBatchLog: 5,
      batchSize: 2,
    });

    Order = mongoose.model('Order', orderSchema);
    LogHistory = getLogHistoryModel('Order', true);
  });

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
    warnSpy.mockRestore();
  });

  it('respects maxBatchLog limit in updateMany', async () => {
    await Order.insertMany([
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
    ]);
    await LogHistory.deleteMany({});
    await Order.updateMany({}, { $set: { status: 'z' } });

    const logs = await LogHistory.find({ change_type: 'update' }).lean();
    expect(logs.length).toBe(5);

    expect(warnSpy).toHaveBeenCalled();
    const warning = warnSpy.mock.calls.find((call) => call[0] && call[0].includes('Skipped logging for'));
    expect(warning).toBeDefined();
  });

  it('respects batchSize in batch processing', async () => {
    await Order.insertMany([{ status: 'a' }, { status: 'a' }, { status: 'a' }, { status: 'a' }]);
    await LogHistory.deleteMany({});
    await Order.updateMany({}, { $set: { status: 'z' } });

    const logs = await LogHistory.find({ change_type: 'update' }).lean();
    expect(logs.length).toBe(4);
  });

  it('respects maxBatchLog in deleteMany', async () => {
    await Order.insertMany([
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
      { status: 'a' },
    ]);
    await LogHistory.deleteMany({});
    await Order.deleteMany({});

    const logs = await LogHistory.find({ change_type: 'delete' }).lean();
    expect(logs.length).toBe(5);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('respects maxBatchLog in insertMany', async () => {
    const docs = [];
    for (let i = 0; i < 10; i++) {
      docs.push({ status: 'a' });
    }
    await Order.insertMany(docs);

    const logs = await LogHistory.find({ change_type: 'create' }).lean();

    expect(logs.length).toBe(5);
    expect(warnSpy).toHaveBeenCalled();
  });
});
