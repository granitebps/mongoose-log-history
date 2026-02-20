require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - Missing schema fields', () => {
  const wait = () => new Promise((resolve) => setTimeout(resolve, 100));

  afterEach(async () => {
    for (const modelName of Object.keys(mongoose.connection.models)) {
      await mongoose.connection.models[modelName].deleteMany({});
    }
  });

  it('strips missing field from payload (strict schema)', async () => {
    const schema = new mongoose.Schema({
      title: String,
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'MissingFieldStrict',
      trackedFields: [{ value: 'title' }],
      singleCollection: true,
      userField: 'created_by',
    });

    delete mongoose.connection.models.MissingFieldStrict;
    const Model = mongoose.model('MissingFieldStrict', schema);
    const LogHistory = getLogHistoryModel('MissingFieldStrict', true);

    const doc = await Model.create({ title: 'A', created_by: { id: 'u1' } });
    await wait();

    const fromDb = await Model.findById(doc._id).lean();
    expect(fromDb.created_by).toBeUndefined();

    const logs = await LogHistory.find({ model_id: doc._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toBeNull();
  });

  it('works when field is added to schema', async () => {
    const schema = new mongoose.Schema({
      title: String,
      created_by: mongoose.Schema.Types.Mixed,
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'MissingFieldWithSchema',
      trackedFields: [{ value: 'title' }],
      singleCollection: true,
      userField: 'created_by',
    });

    delete mongoose.connection.models.MissingFieldWithSchema;
    const Model = mongoose.model('MissingFieldWithSchema', schema);
    const LogHistory = getLogHistoryModel('MissingFieldWithSchema', true);

    const payload = { id: 'u2', role: 'admin' };
    const doc = await Model.create({ title: 'B', created_by: payload });
    await wait();

    const logs = await LogHistory.find({ model_id: doc._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toEqual(payload);
  });

  it('works when strict mode is disabled', async () => {
    const schema = new mongoose.Schema({
      title: String,
    });
    schema.set('strict', false);
    schema.plugin(changeLoggingPlugin, {
      modelName: 'MissingFieldStrictFalse',
      trackedFields: [{ value: 'title' }],
      singleCollection: true,
      userField: 'created_by',
    });

    delete mongoose.connection.models.MissingFieldStrictFalse;
    const Model = mongoose.model('MissingFieldStrictFalse', schema);
    const LogHistory = getLogHistoryModel('MissingFieldStrictFalse', true);

    const payload = { id: 'u3' };
    const doc = await Model.create({ title: 'C', created_by: payload });
    await wait();

    const logs = await LogHistory.find({ model_id: doc._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toEqual(payload);
  });

  it('works when user is passed via $locals', async () => {
    const schema = new mongoose.Schema({
      title: String,
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'MissingFieldLocals',
      trackedFields: [{ value: 'title' }],
      singleCollection: true,
      userField: 'created_by',
    });

    delete mongoose.connection.models.MissingFieldLocals;
    const Model = mongoose.model('MissingFieldLocals', schema);
    const LogHistory = getLogHistoryModel('MissingFieldLocals', true);

    const doc = new Model({ title: 'D' });
    doc.$locals = { created_by: { id: 'u4', name: 'LocalUser' } };
    await doc.save();
    await wait();

    const logs = await LogHistory.find({ model_id: doc._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toEqual({ id: 'u4', name: 'LocalUser' });
  });

  it('does not warn for tracked dotted path inside array of objects', () => {
    const logger = {
      warn: jest.fn(),
      error: jest.fn(),
    };

    const schema = new mongoose.Schema({
      created_by: mongoose.Schema.Types.Mixed,
      invoices_address: [
        {
          street: String,
          city: String,
        },
      ],
    });

    schema.plugin(changeLoggingPlugin, {
      modelName: 'MissingFieldArrayNestedPath',
      trackedFields: [{ value: 'invoices_address.street' }],
      singleCollection: true,
      userField: 'created_by',
      logger,
    });

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
