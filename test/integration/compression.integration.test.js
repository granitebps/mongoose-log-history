require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel, decompressObject } = require('../../dist');
const { Binary } = require('mongodb');

describe('mongoose-log-history plugin - Compression', () => {
  let Order;
  let LogHistory;

  beforeAll(() => {
    const orderSchema = new mongoose.Schema({
      status: String,
      data: String,
    });

    orderSchema.plugin(changeLoggingPlugin, {
      modelName: 'OrderCompression',
      trackedFields: [{ value: 'status' }, { value: 'data' }],
      singleCollection: true,
      saveWholeDoc: true,
      compressDocs: true,
    });

    Order = mongoose.model('OrderCompression', orderSchema);
    LogHistory = getLogHistoryModel('OrderCompression', true);
  });

  afterEach(async () => {
    await Order.deleteMany({});
    await LogHistory.deleteMany({});
  });

  it('stores updated_doc as Binary (compressed) and original_doc as null on create', async () => {
    const order = await Order.create({ status: 'pending', data: 'x'.repeat(1000) });

    const log = await LogHistory.findOne({ model_id: order._id, change_type: 'create' });
    expect(log.original_doc).toBeNull();
    expect(log.updated_doc).toBeInstanceOf(Binary);
  });

  it('automatically decompresses docs in getHistoriesById', async () => {
    const order = await Order.create({ status: 'pending', data: 'foo' });

    const logs = await Order.getHistoriesById(order._id);
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(typeof log.updated_doc).toBe('object');
    expect(log.updated_doc.status).toBe('pending');
    expect(log.updated_doc.data).toBe('foo');
  });

  it('manual decompressObject works on Binary', async () => {
    const order = await Order.create({ status: 'pending', data: 'bar' });

    const log = await LogHistory.findOne({ model_id: order._id, change_type: 'create' });
    const buf = log.updated_doc._bsontype === 'Binary' ? log.updated_doc.buffer : log.updated_doc;
    const decompressed = decompressObject(buf);
    expect(decompressed.status).toBe('pending');
    expect(decompressed.data).toBe('bar');
  });

  it('handles decompressObject with null/undefined gracefully', () => {
    expect(decompressObject(null)).toBeNull();
    expect(decompressObject(undefined)).toBeNull();
  });

  it('compresses only when saveWholeDoc is true', async () => {
    const schema = new mongoose.Schema({ status: String });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderNoWholeDoc',
      trackedFields: [{ value: 'status' }, { value: 'data' }],
      singleCollection: true,
      saveWholeDoc: false,
      compressDocs: true,
    });
    delete mongoose.connection.models.OrderNoWholeDoc;
    const OrderNoWholeDoc = mongoose.model('OrderNoWholeDoc', schema);
    const LogHistoryNoWholeDoc = getLogHistoryModel('OrderNoWholeDoc', true);

    const order = await OrderNoWholeDoc.create({ status: 'pending' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const log = await LogHistoryNoWholeDoc.findOne({ model_id: order._id, change_type: 'create' });
    expect(log.original_doc).toBeUndefined();
    expect(log.updated_doc).toBeUndefined();
  });

  it('compresses on update as well as create', async () => {
    const order = await Order.create({ status: 'pending', data: 'foo' });
    await LogHistory.deleteMany({});
    order.status = 'done';
    order.data = 'bar';
    await order.save();

    const log = await LogHistory.findOne({ model_id: order._id, change_type: 'update' });
    expect(log.original_doc).toBeInstanceOf(Binary);
    expect(log.updated_doc).toBeInstanceOf(Binary);

    const orig = decompressObject(log.original_doc.buffer);
    const updated = decompressObject(log.updated_doc.buffer);
    expect(orig.status).toBe('pending');
    expect(updated.status).toBe('done');
    expect(orig.data).toBe('foo');
    expect(updated.data).toBe('bar');
  });
});
