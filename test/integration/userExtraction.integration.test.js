require('../setup/mongodb');
const mongoose = require('mongoose');
const { changeLoggingPlugin, getLogHistoryModel } = require('../../dist');

describe('mongoose-log-history plugin - User Extraction', () => {
  afterEach(async () => {
    for (const modelName of Object.keys(mongoose.connection.models)) {
      await mongoose.connection.models[modelName].deleteMany({});
    }
  });

  it('extracts user from userField (dot notation, nested)', async () => {
    const schema = new mongoose.Schema({
      status: String,
      user: {
        name: String,
        email: String,
      },
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderUserDot',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
      userField: 'user.name',
    });
    delete mongoose.connection.models.OrderUserDot;
    const OrderUserDot = mongoose.model('OrderUserDot', schema);
    const LogHistory = getLogHistoryModel('OrderUserDot', true);

    const order = await OrderUserDot.create({
      status: 'pending',
      user: { name: 'Alice', email: 'alice@example.com' },
    });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toBe('Alice');
  });

  it('extracts user from userField (top-level)', async () => {
    const schema = new mongoose.Schema({
      status: String,
      updated_by: String,
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderTopLevel',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
      userField: 'updated_by',
    });
    delete mongoose.connection.models.OrderTopLevel;
    const OrderTopLevel = mongoose.model('OrderTopLevel', schema);
    const LogHistory = getLogHistoryModel('OrderTopLevel', true);

    const order = await OrderTopLevel.create({
      status: 'pending',
      updated_by: 'Bob',
    });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toBe('Bob');
  });

  it('extracts user from context (query hook)', async () => {
    const schema = new mongoose.Schema({
      status: String,
      user: { name: String },
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderContext',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
      userField: 'user',
    });
    delete mongoose.connection.models.OrderContext;
    const OrderContext = mongoose.model('OrderContext', schema);
    const LogHistory = getLogHistoryModel('OrderContext', true);

    const order = await OrderContext.create({ status: 'pending', user: { name: 'DocUser' } });
    await LogHistory.deleteMany({});
    await OrderContext.updateOne(
      { _id: order._id },
      { $set: { status: 'done' } },
      { context: { user: 'ContextUser' } }
    );

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toBe('ContextUser');
  });

  it('falls back to created_by if userField and context missing', async () => {
    const schema = new mongoose.Schema({
      status: String,
      created_by: {
        id: mongoose.Schema.Types.ObjectId,
        name: String,
        role: String,
      },
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderFallbackCreatedBy',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
    });
    delete mongoose.connection.models.OrderFallbackCreatedBy;
    const OrderFallbackCreatedBy = mongoose.model('OrderFallbackCreatedBy', schema);
    const LogHistory = getLogHistoryModel('OrderFallbackCreatedBy', true);

    const order = await OrderFallbackCreatedBy.create({
      status: 'pending',
      created_by: { id: new mongoose.Types.ObjectId(), name: 'Fallback', role: 'admin' },
    });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toEqual({ id: expect.anything(), name: 'Fallback', role: 'admin' });
  });

  it('falls back to updated_by if userField, context, and created_by missing', async () => {
    const schema = new mongoose.Schema({
      status: String,
      updated_by: String,
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderFallbackUpdatedBy',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
    });
    delete mongoose.connection.models.OrderFallbackUpdatedBy;
    const OrderFallbackUpdatedBy = mongoose.model('OrderFallbackUpdatedBy', schema);
    const LogHistory = getLogHistoryModel('OrderFallbackUpdatedBy', true);

    const order = await OrderFallbackUpdatedBy.create({
      status: 'pending',
      updated_by: 'UpdatedFallback',
    });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toBe('UpdatedFallback');
  });

  it('falls back to modified_by if all else missing', async () => {
    const schema = new mongoose.Schema({
      status: String,
      modified_by: String,
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderFallbackModifiedBy',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
    });
    delete mongoose.connection.models.OrderFallbackModifiedBy;
    const OrderFallbackModifiedBy = mongoose.model('OrderFallbackModifiedBy', schema);
    const LogHistory = getLogHistoryModel('OrderFallbackModifiedBy', true);

    const order = await OrderFallbackModifiedBy.create({
      status: 'pending',
      modified_by: 'ModifiedFallback',
    });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toBe('ModifiedFallback');
  });

  it('sets created_by to null if no user info found', async () => {
    const schema = new mongoose.Schema({
      status: String,
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderNoUser',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
    });
    delete mongoose.connection.models.OrderNoUser;
    const OrderNoUser = mongoose.model('OrderNoUser', schema);
    const LogHistory = getLogHistoryModel('OrderNoUser', true);

    const order = await OrderNoUser.create({
      status: 'pending',
    });

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'create' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toBeNull();
  });

  it('context user overrides userField and fallbacks in query hooks', async () => {
    const schema = new mongoose.Schema({
      status: String,
      user: { name: String },
      created_by: { name: String },
    });
    schema.plugin(changeLoggingPlugin, {
      modelName: 'OrderContextOverride',
      trackedFields: [{ value: 'status' }],
      singleCollection: true,
      userField: 'user',
    });
    delete mongoose.connection.models.OrderContextOverride;
    const OrderContextOverride = mongoose.model('OrderContextOverride', schema);
    const LogHistory = getLogHistoryModel('OrderContextOverride', true);

    const order = await OrderContextOverride.create({
      status: 'pending',
      user: { name: 'DocUser' },
      created_by: { name: 'Fallback' },
    });
    await LogHistory.deleteMany({});
    await OrderContextOverride.updateOne(
      { _id: order._id },
      { $set: { status: 'done' } },
      { context: { user: 'ContextWins' } }
    );

    const logs = await LogHistory.find({ model_id: order._id, change_type: 'update' }).lean();
    expect(logs.length).toBe(1);
    expect(logs[0].created_by).toBe('ContextWins');
  });
});
