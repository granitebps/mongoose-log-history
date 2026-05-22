require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Error Handling', () => {
  let Order;
  let LogHistory;
  let errorSpy;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      status: String,
    });

    const customLogger = {
      error: jest.fn(),
      warn: jest.fn(),
    };

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'OrderError',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
      logger: customLogger,
    });

    Order = mongoose.model('OrderError', orderSchema);
    LogHistory = getLogHistoryModel('OrderError', true);
    errorSpy = customLogger.error;
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
    if (errorSpy.mockClear) {
      errorSpy.mockClear();
    }
  });

  it('does not block document save if logging fails', async () => {
    const origCreate = LogHistory.create;
    LogHistory.create = () => {
      throw new Error('Simulated log error');
    };

    const order = new Order({ status: 'pending' });
    await expect(order.save()).resolves.toBeDefined();

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(errorSpy.mock.calls[0][0].message).toMatch(/Simulated log error/);

    LogHistory.create = origCreate;
  });

  it('does not block update if logging fails', async () => {
    const order = await Order.create({ status: 'pending' });

    const origCreate = LogHistory.create;
    LogHistory.create = () => {
      throw new Error('Simulated log error');
    };

    await expect(Order.updateOne({ _id: order._id }, { $set: { status: 'done' } })).resolves.toBeDefined();
    expect(errorSpy).toHaveBeenCalled();

    LogHistory.create = origCreate;
  });

  it('does not block delete if logging fails', async () => {
    const order = await Order.create({ status: 'pending' });

    const origBulkWrite = LogHistory.bulkWrite;
    LogHistory.bulkWrite = () => {
      throw new Error('Simulated log error');
    };

    await expect(Order.deleteOne({ _id: order._id })).resolves.toBeDefined();
    expect(errorSpy).toHaveBeenCalled();

    LogHistory.bulkWrite = origBulkWrite;
  });

  it('does not block batch operations if logging fails', async () => {
    await Order.insertMany([{ status: 'a' }, { status: 'b' }]);

    const origBulkWrite = LogHistory.bulkWrite;
    LogHistory.bulkWrite = () => {
      throw new Error('Simulated log error');
    };

    await expect(Order.updateMany({}, { $set: { status: 'z' } })).resolves.toBeDefined();
    expect(errorSpy).toHaveBeenCalled();

    LogHistory.bulkWrite = origBulkWrite;
  });
});
